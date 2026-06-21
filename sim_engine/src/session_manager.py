# -*- coding: utf-8 -*-
# session_manager.py — GUI session management mixin for SimulatorEngine
#
# All GUI-path session CRUD lives here so simulator_engine.py stays focused on
# model loading, CLI simulation, and the fitness/ODE interfaces.
# Used as a mixin: class SimulatorEngine(SessionManagerMixin): ...

import csv
import logging
import math
import os
from time import time as _time
from typing import Any, Dict, List, Optional

import numpy as np

from .schedule_runner import advance_steps, precompute_sustained_divisors
from .mc_utils import collect_param_distributions, apply_parameter_sampling, clone_model, derive_seed_list

logger = logging.getLogger(__name__)


def _make_log(msg: str) -> Dict[str, Any]:
    return {'t': _time(), 'msg': msg}


def _fmt_step(step_sec: float) -> str:
    """Convert step size in seconds to a human-readable string."""
    if step_sec >= 86400 and step_sec % 86400 == 0:
        n = int(step_sec / 86400)
        return f"{n} day{'s' if n != 1 else ''}"
    if step_sec >= 3600 and step_sec % 3600 == 0:
        n = int(step_sec / 3600)
        return f"{n} hour{'s' if n != 1 else ''}"
    return f"{int(step_sec / 60)} min"


def _check_value_warnings(session: Dict[str, Any], model, outputs: List[Dict],
                           output_variables: List[str]) -> None:
    """Append NaN/Inf and out-of-bounds warnings (once per variable) to session['logs'].

    Shared by batch_steps()'s single-run and Monte Carlo paths, which otherwise
    each kept their own copy of this check against the same `model`/`outputs` shape.
    """
    warned = session['warned_vars']
    for out_row in outputs:
        for var_name in output_variables:
            if var_name in warned:
                continue
            val = out_row.get(var_name)
            if val is None:
                continue
            var_obj = model.variables.get(var_name)
            if var_obj is None:
                continue
            if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                session['logs'].append(_make_log(
                    f"⚠ NaN/Inf in '{var_name}' at step {out_row['step']}"
                ))
                warned.add(var_name)
            elif var_obj.bounds and len(var_obj.bounds) == 2:
                lo, hi = var_obj.bounds
                if val < lo or val > hi:
                    session['logs'].append(_make_log(
                        f"⚠ Bounds: '{var_name}'={val:.4g} ∉ [{lo}, {hi}] at step {out_row['step']}"
                    ))
                    warned.add(var_name)


def _log_completion(session: Dict[str, Any], model, current_step: int,
                     output_variables: List[str], run_suffix: str = '') -> None:
    """Append the 'Done in Xs — N steps[ × M runs]' + schedule-hits log lines.

    Shared by batch_steps()'s single-run and Monte Carlo paths.
    """
    elapsed = _time() - session.get('start_time', _time())
    session['logs'].append(_make_log(f"Done in {elapsed:.1f}s — {current_step} steps{run_suffix}"))
    input_var_names = [
        v for v in output_variables
        if model.variables.get(v) and model.variables[v].type.value == 'input'
    ]
    if input_var_names:
        hits = {v: sum(1 for d in session['data'] if d.get(v, 0) != 0) for v in input_var_names}
        hit_parts = [f"{v}={n}" for v, n in hits.items() if n > 0]
        if hit_parts:
            session['logs'].append(_make_log(f"Schedule hits: {', '.join(hit_parts)}"))


class SessionManagerMixin:
    """Mixin that provides GUI session CRUD on top of SimulatorEngine.

    Requires the host class to expose:
      self.sessions: Dict[str, Any]
      self.loader: LoaderEngine
      self.current_model: ModelStructure | None
      self.load_models(names, folder) -> bool
      self._resolve_output_variables(model) -> (List[str], List[str])
    """

    # ── session start ──────────────────────────────────────────────────────────

    def start_session(
        self,
        model_name: str,
        time_hours: float,
        folder: Optional[str] = None,
        step_size: Optional[float] = None,
        input_params: Optional[Dict[str, float]] = None,
        regimens: Optional[List[Dict]] = None,
        sim_runs: int = 1,
        seed: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Start a new simulation session (GUI path).

        Creates an independent model copy for each MC run, applies parameter
        sampling, and returns the session ID.
        """
        try:
            if not self.load_models([model_name], folder):
                return {"success": False, "error": f"无法加载模型：{model_name}"}

            base_model = self.current_model

            # Collect distribution parameters and set values to means
            param_distributions = collect_param_distributions(base_model)
            base_model.param_distributions = param_distributions

            # Apply initial input overrides
            if input_params:
                for var_name, value in input_params.items():
                    if var_name in base_model.variables:
                        base_model.set_variable_value(var_name, value)

            # Session ID and per-run seed list
            import uuid
            session_id = str(uuid.uuid4())
            session_seed = int(seed) if seed is not None else int(np.random.randint(0, 2**31))
            n_runs = max(1, int(sim_runs))
            seed_list = derive_seed_list(session_seed, n_runs)

            if step_size is None:
                step_size = base_model.simulator.get('step_size', 3600.0)

            total_time = time_hours * 3600.0
            total_steps = int(total_time / step_size)
            output_variables, output_warnings = self._resolve_output_variables(base_model)
            input_variables = [
                name for name, var in base_model.variables.items()
                if var.type.value == 'input'
            ]
            capture_variables = output_variables + [v for v in input_variables if v not in output_variables]

            # Independent model copy + sampling for each run.
            # n_runs == 1: deterministic mode (ADR 0045) — leave distribution
            # parameters at the loader-assigned mean, do not sample.
            runs = []
            for run_idx in range(n_runs):
                run_model = base_model if run_idx == 0 else clone_model(base_model)
                if param_distributions and n_runs > 1:
                    run_rng = np.random.default_rng(seed_list[run_idx])
                    apply_parameter_sampling(run_model, param_distributions, rng=run_rng)
                runs.append({
                    'run_idx': run_idx,
                    'seed': seed_list[run_idx],
                    'model': run_model,
                    'current_step': 0,
                    'time': 0.0,
                    'data': [],
                    'completed': False,
                })

            # ── build initial log ──────────────────────────────────────────────
            initial_logs: List[Dict] = []
            n_vars = len(base_model.variables)
            n_formulas = len(base_model.formulas) if hasattr(base_model, 'formulas') else 0
            initial_logs.append(_make_log(
                f"Model: {model_name} ({n_vars} vars, {n_formulas} formulas)"
            ))
            prov_imports = (base_model.provenance or {}).get('imports', [])
            if prov_imports:
                initial_logs.append(_make_log(f"Imports: {', '.join(prov_imports)}"))
            start_date = str(base_model.simulator.get('start_date', ''))
            step_label = _fmt_step(step_size)
            initial_logs.append(_make_log(
                f"Sim: start={start_date}, step={step_label}, {total_steps} steps"
            ))
            out_labels = output_variables[:8]
            suffix = f" (+{len(output_variables) - 8} more)" if len(output_variables) > 8 else ""
            initial_logs.append(_make_log(f"Outputs ({len(output_variables)}): {', '.join(out_labels)}{suffix}"))
            if output_warnings:
                for w in output_warnings:
                    initial_logs.append(_make_log(f"⚠ {w}"))
            regimen_vars = [r.get('variable', '') for r in (regimens or []) if r.get('variable')]
            if regimen_vars:
                initial_logs.append(_make_log(f"Regimens: {', '.join(regimen_vars)}"))
            if n_runs > 1:
                initial_logs.append(_make_log(f"MC: {n_runs} runs, seed {session_seed}"))
            # ──────────────────────────────────────────────────────────────────

            # ADR 0099: precompute sustained-mode value/_n_steps divisors once
            regimens = precompute_sustained_divisors(regimens or [], step_size, total_steps, start_date)

            self.sessions[session_id] = {
                'model': runs[0]['model'],
                'model_name': model_name,
                'folder': folder,
                'step_size': step_size,
                'total_time': total_time,
                'total_steps': total_steps,
                'current_step': 0,
                'time': 0.0,
                'running': True,
                'output_variables': capture_variables,
                'output_warnings': output_warnings,
                'data': [],
                'regimens': regimens or [],
                'sim_runs': n_runs,
                'session_seed': session_seed,
                'seed_list': seed_list,
                'runs': runs,
                'param_distributions': param_distributions,
                'input_params': input_params or {},
                'sim_start_date': start_date,
                'logs': initial_logs,
                'warned_vars': set(),
                'start_time': _time(),
            }

            logger.info(
                "会话已创建: %s, 模型: %s, 总步数: %d, runs: %d, seed: %d",
                session_id, model_name, total_steps, n_runs, session_seed,
            )

            return {
                "success": True,
                "data": {
                    "session_id": session_id,
                    "model_name": model_name,
                    "initial_state": runs[0]['model'].get_current_state(),
                    "step_size": step_size,
                    "total_time": total_time,
                    "total_steps": total_steps,
                    "output_variables": capture_variables,
                    "requested_output_variables": output_variables,
                    "warnings": output_warnings,
                    "sim_runs": n_runs,
                    "session_seed": session_seed,
                    "logs": initial_logs,
                },
            }

        except Exception as e:
            logger.error("创建会话失败: %s", e, exc_info=True)
            return {"success": False, "error": str(e)}

    # ── batch step execution ───────────────────────────────────────────────────

    def batch_steps(
        self,
        session_id: str,
        steps: int = 10,
        input_changes: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """Execute multiple simulation steps (GUI path).

        Supports both single-run and Monte Carlo multi-run modes.
        Multi-run returns per-run outputs plus a mean trajectory.
        """
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}

            session = self.sessions[session_id]
            if not session['running']:
                return {"success": False, "error": "会话已暂停"}

            step_size = session['step_size']
            output_variables = session['output_variables']
            sim_runs = session.get('sim_runs', 1)
            runs = session.get('runs', [])
            sim_start_date = session.get('sim_start_date', '')

            # ── single-run path ────────────────────────────────────────────────
            if sim_runs == 1 or not runs:
                model = session['model']
                if input_changes:
                    for var_name, value in input_changes.items():
                        if var_name in model.variables:
                            model.set_variable_value(var_name, value)

                actual_steps = min(steps, session['total_steps'] - session['current_step'])

                outputs, session['current_step'], session['time'] = advance_steps(
                    model, session['regimens'], step_size, actual_steps,
                    session['current_step'], session['time'], output_variables, sim_start_date,
                )
                session['data'].extend(outputs)

                completed = session['current_step'] >= session['total_steps']
                progress = (session['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0

                _check_value_warnings(session, model, outputs, output_variables)
                if completed:
                    _log_completion(session, model, session['current_step'], output_variables)

                logger.info(
                    "单条批量执行: session=%s, steps=%d, total=%d/%d",
                    session_id, actual_steps, session['current_step'], session['total_steps'],
                )
                return {
                    "success": True,
                    "data": {
                        "session_id": session_id,
                        "current_step": session['current_step'],
                        "progress": round(progress, 2),
                        "final_state": model.get_current_state(),
                        "outputs": outputs,
                        "outputs_per_run": [outputs],
                        "sim_runs": 1,
                        "session_seed": session.get('session_seed', 0),
                        "completed": completed,
                        "steps_executed": len(outputs),
                        "logs": list(session['logs']),
                    },
                }

            # ── Monte Carlo multi-run path ─────────────────────────────────────
            all_run_outputs: List[List[Dict]] = []

            for run in runs:
                if run['completed']:
                    all_run_outputs.append([])
                    continue

                run_model = run['model']

                if input_changes:
                    for var_name, value in input_changes.items():
                        if var_name in run_model.variables:
                            run_model.set_variable_value(var_name, value)

                actual_steps = min(steps, session['total_steps'] - run['current_step'])

                run_outputs, run['current_step'], run['time'] = advance_steps(
                    run_model, session['regimens'], step_size, actual_steps,
                    run['current_step'], run['time'], output_variables, sim_start_date,
                )
                run['data'].extend(run_outputs)

                if run['current_step'] >= session['total_steps']:
                    run['completed'] = True

                all_run_outputs.append(run_outputs)

            # Mean trajectory for backward compatibility
            n_steps = max((len(ro) for ro in all_run_outputs), default=0)
            mean_outputs: List[Dict] = []
            for step_i in range(n_steps):
                valid_runs = [ro for ro in all_run_outputs if step_i < len(ro)]
                if not valid_runs:
                    continue
                base: Dict[str, Any] = {
                    'step': valid_runs[0][step_i]['step'],
                    'time': valid_runs[0][step_i]['time'],
                }
                for var_name in output_variables:
                    vals = [ro[step_i].get(var_name, 0.0) for ro in valid_runs]
                    base[var_name] = float(np.mean(vals))
                mean_outputs.append(base)

            # Sync session-level progress to run-0
            run0 = runs[0]
            session['current_step'] = run0['current_step']
            session['time'] = run0['time']
            session['model'] = run0['model']
            session['data'].extend(mean_outputs)

            completed = all(r['completed'] for r in runs)
            progress = (run0['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0

            run0_outputs = all_run_outputs[0] if all_run_outputs else []
            run0_model = runs[0]['model']
            _check_value_warnings(session, run0_model, run0_outputs, output_variables)
            if completed:
                _log_completion(session, run0_model, run0['current_step'], output_variables,
                                 run_suffix=f" × {sim_runs} runs")

            logger.info(
                "多条批量执行: session=%s, steps=%d, runs=%d, progress=%.1f%%",
                session_id, n_steps, sim_runs, progress,
            )
            return {
                "success": True,
                "data": {
                    "session_id": session_id,
                    "current_step": run0['current_step'],
                    "progress": round(progress, 2),
                    "final_state": run0['model'].get_current_state(),
                    "outputs": mean_outputs,
                    "outputs_per_run": all_run_outputs,
                    "sim_runs": sim_runs,
                    "session_seed": session.get('session_seed', 0),
                    "completed": completed,
                    "steps_executed": n_steps,
                    "logs": list(session['logs']),
                },
            }

        except Exception as e:
            logger.error("批量执行失败: %s", e, exc_info=True)
            return {"success": False, "error": str(e)}

    # ── session control ────────────────────────────────────────────────────────

    def pause_session(self, session_id: str) -> Dict[str, Any]:
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            self.sessions[session_id]['running'] = False
            logger.info("会话已暂停: %s", session_id)
            return {"success": True, "message": "会话已暂停"}
        except Exception as e:
            logger.error("暂停会话失败: %s", e)
            return {"success": False, "error": str(e)}

    def resume_session(self, session_id: str) -> Dict[str, Any]:
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            self.sessions[session_id]['running'] = True
            logger.info("会话已继续: %s", session_id)
            return {"success": True, "message": "会话已继续"}
        except Exception as e:
            logger.error("继续会话失败: %s", e)
            return {"success": False, "error": str(e)}

    def reset_session(self, session_id: str) -> Dict[str, Any]:
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            session = self.sessions[session_id]
            model = session['model']
            model.reset_simulation()
            session.update({'current_step': 0, 'time': 0.0, 'running': True, 'data': []})
            logger.info("会话已重置: %s", session_id)
            return {"success": True, "message": "会话已重置", "initial_state": model.get_current_state()}
        except Exception as e:
            logger.error("重置会话失败: %s", e)
            return {"success": False, "error": str(e)}

    # ── data export ────────────────────────────────────────────────────────────

    def export_session_csv(self, session_id: str, output_path: Optional[str] = None) -> Dict[str, Any]:
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            session = self.sessions[session_id]
            data = session['data']
            if not data:
                return {"success": False, "error": "没有数据可导出"}
            if not output_path:
                output_dir = os.path.join(self.loader.models_directory, "output")
                os.makedirs(output_dir, exist_ok=True)
                output_path = os.path.join(output_dir, f"{session['model_name']}_session_{session_id[:8]}.csv")
            headers = list(data[0].keys())
            with open(output_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=headers)
                writer.writeheader()
                writer.writerows(data)
            logger.info("会话数据已导出: %s", output_path)
            return {"success": True, "csv_path": output_path, "rows": len(data)}
        except Exception as e:
            logger.error("导出 CSV 失败: %s", e)
            return {"success": False, "error": str(e)}

    # ── session info ───────────────────────────────────────────────────────────

    def get_session_info(self, session_id: str) -> Dict[str, Any]:
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            session = self.sessions[session_id]
            total = session['total_steps']
            current = session['current_step']
            return {
                "success": True,
                "data": {
                    "session_id": session_id,
                    "model_name": session['model_name'],
                    "folder": session.get('folder'),
                    "current_step": current,
                    "total_steps": total,
                    "progress": (current / total) * 100 if total > 0 else 0,
                    "running": session['running'],
                    "completed": current >= total,
                    "data_points": len(session['data']),
                    "outputs": session['data'],
                    "outputs_per_run": [run.get('data', []) for run in session.get('runs', [])] or [session['data']],
                    "output_variables": session.get('output_variables', []),
                    "warnings": session.get('output_warnings', []),
                    "sim_runs": session.get('sim_runs', 1),
                    "session_seed": session.get('session_seed', 0),
                },
            }
        except Exception as e:
            logger.error("获取会话信息失败: %s", e)
            return {"success": False, "error": str(e)}
