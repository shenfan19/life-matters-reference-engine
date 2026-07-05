# -*- coding: utf-8 -*-
# session_manager.py — GUI session management mixin for ReferenceEngine
#
# All GUI-path session CRUD lives here so reference_engine.py stays focused on
# model loading, CLI simulation, and the fitness/ODE interfaces.
# Used as a mixin: class ReferenceEngine(SessionManagerMixin): ...

import csv
import logging
import os
from time import time as _time
from typing import Any, Dict, List, Optional

import numpy as np

from .schedule_runner import advance_steps, precompute_sustained_divisors
from .mc_utils import collect_param_distributions, apply_parameter_sampling, clone_model, derive_seed_list
from .validation import validate_simulator_dates, validate_schedule_list
from . import run_logging

logger = logging.getLogger(__name__)


def _make_log(msg: str) -> Dict[str, Any]:
    return {'t': _time(), 'msg': msg}


def _check_value_warnings(session: Dict[str, Any], model, outputs: List[Dict],
                           output_variables: List[str]) -> None:
    """Append NaN/Inf and out-of-bounds warnings to session['logs'] (GUI sink for run_logging)."""
    run_logging.check_value_warnings(
        model, outputs, output_variables, session['warned_vars'],
        log_cb=lambda msg: session['logs'].append(_make_log(msg)),
    )


def _log_completion(session: Dict[str, Any], model, current_step: int,
                     output_variables: List[str], run_suffix: str = '') -> None:
    """Append the 'Done in Xs — N steps[ × M runs]' + schedule-hits log lines (GUI sink)."""
    elapsed = _time() - session.get('start_time', _time())
    hits = run_logging.input_variable_hits(model, output_variables, session['data'])
    run_logging.log_completion(
        elapsed, current_step, hits, run_suffix=run_suffix,
        log_cb=lambda msg: session['logs'].append(_make_log(msg)),
    )


class SessionManagerMixin:
    """Mixin that provides GUI session CRUD on top of ReferenceEngine.

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
                return {"success": False, "error": self.loader.last_error or f"无法加载模型：{model_name}"}

            base_model = self.current_model

            validate_simulator_dates(
                base_model.simulator.get('start_date'),
                base_model.simulator.get('end_date'),
            )
            validate_schedule_list(regimens or [])

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

            # ── build initial log (shared content, GUI sink — run_logging.py) ──
            initial_logs: List[Dict] = []
            start_date = str(base_model.simulator.get('start_date', ''))
            schedule_vars = [r.get('variable', '') for r in (regimens or []) if r.get('variable')]
            run_logging.build_initial_logs(
                base_model, model_name, total_steps, step_size,
                output_variables, output_warnings, schedule_vars, n_runs, session_seed,
                log_cb=lambda msg: initial_logs.append(_make_log(msg)),
            )
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
                from datetime import datetime
                from .paths import OUTPUT_DIR
                model_stem = os.path.basename(session['model_name'])
                output_dir = os.path.join(str(OUTPUT_DIR), model_stem)
                os.makedirs(output_dir, exist_ok=True)
                ts = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                output_path = os.path.join(output_dir, f"{model_stem}_{ts}_sim.csv")
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
