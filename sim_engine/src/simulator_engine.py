# -*- coding: utf-8 -*-
# simulator_engine.py — model loading, CLI simulation (single/MC/all-plans).
# GUI session management → session_manager.py (SessionManagerMixin)
# Pulse schedule execution → schedule_runner.py
# MC distribution utilities + model cloning → mc_utils.py

import logging
import numpy as np
import csv
import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable, Tuple
from .model_structure import ModelStructure
from .loader_engine import LoaderEngine
from .session_manager import SessionManagerMixin
from .mc_utils import apply_parameter_sampling, collect_param_distributions, clone_model, derive_seed_list
from .schedule_runner import advance_steps, precompute_sustained_divisors
from .validation import validate_simulator_dates, validate_schedule_list
from . import run_logging
from time import time as _time

# 初始化模块的日志记录器，用于记录仿真过程中的信息和错误。
logger = logging.getLogger(__name__)

class SimulatorEngine(SessionManagerMixin):
    """仿真引擎，负责运行和管理仿真流程，提供黑盒评估接口，支持 CLI 和 GUI。"""
    VALID_OUTPUT_TYPES = {'input', 'parameter', 'state'}
    
    def __init__(self, models_directory: str = "models"):
        """
        初始化仿真引擎。
        :param models_directory: 模型目录路径。
        """
        # 初始化 LoaderEngine 以加载模型，指定模型目录。
        self.loader = LoaderEngine(models_directory)
        # 初始化当前模型为 None。
        self.current_model: Optional[ModelStructure] = None
        # 初始化当前仿真步数。
        self.current_step = 0
        # 初始化仿真时间（秒）。
        self.time = 0.0

        # ✅ 新增：GUI 会话管理
        self.sessions: Dict[str, Dict[str, Any]] = {}  # session_id -> session_data

    def _resolve_output_variables(self, model: ModelStructure) -> Tuple[List[str], List[str]]:
        sim = model.simulator or {}
        raw_vars = sim.get('output_variables')
        raw_types = sim.get('output_types')
        vars_selected = isinstance(raw_vars, list) and len(raw_vars) > 0
        types_selected = isinstance(raw_types, list) and len(raw_types) > 0
        warnings: List[str] = []
        output_variables: List[str] = []

        def add_var(name: str) -> None:
            if name not in output_variables:
                output_variables.append(name)

        if not vars_selected and not types_selected:
            return list(model.variables.keys()), warnings

        if vars_selected:
            for var_name in raw_vars:
                var_name = str(var_name)
                if var_name in model.variables:
                    add_var(var_name)
                else:
                    warnings.append(f"output_variables 中的变量不存在，已跳过: {var_name}")

        if types_selected:
            selected_types = {str(t) for t in raw_types}
            invalid_types = sorted(selected_types - self.VALID_OUTPUT_TYPES)
            if invalid_types:
                warnings.append(f"output_types 包含未知类型，已忽略: {', '.join(invalid_types)}")
            selected_types &= self.VALID_OUTPUT_TYPES
            for name, var in model.variables.items():
                var_type = var.type.value if hasattr(var.type, 'value') else str(var.type)
                if var_type in selected_types:
                    add_var(name)

        return output_variables, warnings

    def load_models(self, model_names: List[str], folder: Optional[str] = None) -> bool:
        """
        加载指定名称的模型。
        :param model_names: 模型名称列表（取第一个）。
        :param folder: 子文件夹名称。
        :return: 加载是否成功。
        """
        # 使用 LoaderEngine 的 fetch 方法加载第一个模型。
        self.current_model = self.loader.fetch(model_names[0], folder, use_cache=False)
        # 返回加载是否成功的布尔值。
        return self.current_model is not None

    # ==================== 原有 CLI 功能（保持兼容）====================
    
    def run_simulation(self, model_name: str, time_hours: float, folder: Optional[str] = None,
                      output_path: Optional[str] = None,
                      log_cb: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        """
        运行仿真主函数（CLI 使用）。
        :param model_name: 模型名称。
        :param time_hours: 仿真总时间（小时）。
        :param folder: 子文件夹名称。
        :param output_path: CSV 输出文件路径（可选）。
        :param log_cb: 可选回调，接收运行信息文本行（模型大小/输出变量/告警/耗时统计），
            与 GUI 的 session 日志面板（session_manager.py）共用 run_logging.py 的内容生成
            逻辑，只是落地渠道不同（ADR 0119）。未提供时不产生这些信息（向后兼容）。
        :return: 仿真结果字典。
        """
        # 如果指定了模型名称但加载失败，返回错误信息。
        if model_name and not self.load_models([model_name], folder):
            return {"success": False, "error": f"无法加载模型：{model_name}"}
        # 如果当前未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}

        # 前置校验日期/时间字段格式，避免格式错误被深层逻辑悄悄回退为默认值
        # （CLI 与 GUI 共用 validation.py，报错信息一致）。
        try:
            validate_simulator_dates(
                self.current_model.simulator.get('start_date'),
                self.current_model.simulator.get('end_date'),
            )
            validate_schedule_list(getattr(self.current_model, 'schedule_entries', []))
        except ValueError as e:
            logger.error(f"输入校验失败: {e}")
            return {"success": False, "error": str(e)}

        # 重置仿真步数和时间。
        self.current_step = 0
        self.time = 0.0
        
        # 从模型的 simulator 配置中获取时间步长（秒）。
        step_size = self.current_model.simulator.get('step_size', 3600.0)  # 默认 1 小时
        # 计算总仿真时间（秒）。
        total_time = time_hours * 3600.0
        # 计算总步数。
        total_steps = int(total_time / step_size)

        # 获取需要输出的变量列表
        output_variables, output_warnings = self._resolve_output_variables(self.current_model)

        # 准备 CSV 数据存储
        csv_data = []
        csv_headers = ['step', 'time'] + output_variables

        # 从 schedule_entries 构建 schedule list（支持 time_start/time_end, pulse/sustained）
        start_date = self.current_model.simulator.get('start_date', '')
        raw_entries = getattr(self.current_model, 'schedule_entries', [])
        schedules = precompute_sustained_divisors(
            list(raw_entries), step_size, total_steps, start_date
        ) if raw_entries else []

        if log_cb:
            schedule_vars = [s.get('variable', '') for s in raw_entries if s.get('variable')]
            run_logging.build_initial_logs(
                self.current_model, model_name or self.current_model.metadata.name,
                total_steps, step_size, output_variables, output_warnings,
                schedule_vars, n_runs=1, session_seed=0, log_cb=log_cb,
            )
        input_var_names = run_logging.input_variable_names(self.current_model, output_variables)
        hits: Dict[str, int] = {}
        warned: set = set()
        run_start_time = _time()

        try:
            # 运行仿真，共用核心 advance_steps（CLI 与 GUI batch_steps 共用同一份循环体，见 ADR 0113）。
            rows, self.current_step, self.time = advance_steps(
                self.current_model, schedules, step_size, total_steps,
                self.current_step, self.time, output_variables, start_date,
            )
            for row in rows:
                csv_data.append([row['step'], row['time']] + [row[v] for v in output_variables])
            if log_cb:
                run_logging.check_value_warnings(self.current_model, rows, output_variables, warned, log_cb)
                run_logging.accumulate_hits(rows, input_var_names, hits)

            # 写入 CSV 文件
            csv_output_path = output_path
            if not csv_output_path:
                # 默认输出到 models/output/ 目录
                output_dir = os.path.join(self.loader.models_directory, "output")
                os.makedirs(output_dir, exist_ok=True)
                csv_output_path = os.path.join(output_dir, f"{self.current_model.metadata.name}_simulation.csv")
            
            with open(csv_output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(csv_headers)
                writer.writerows(csv_data)

            if log_cb:
                run_logging.log_completion(_time() - run_start_time, self.current_step, hits, log_cb)

            # 返回仿真结果，包括模型名称、当前状态、步数、时间和 CSV 路径。
            return {
                "success": True,
                "model_name": self.current_model.metadata.name,
                "state": self.current_model.get_current_state(),
                "steps": self.current_step,
                "time": self.time,
                "csv_output": csv_output_path,
                "output_variables": output_variables,
                "warnings": output_warnings,
            }
        except Exception as e:
            # 记录仿真失败错误。
            logger.error(f"仿真执行失败: {e}")
            # 返回错误信息。
            return {"success": False, "error": str(e)}

    def run_simulation_mc(self, model_name: Optional[str], time_hours: float,
                          folder: Optional[str] = None, n_runs: int = 1,
                          seed: Optional[int] = None,
                          output_path_fn: Optional[Callable[[int], Optional[str]]] = None,
                          log_cb: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        """
        运行 n_runs 次仿真（Monte Carlo，CLI 使用），对应 GUI 的 sim_runs>1 路径
        （session_manager.py 的 batch_steps 多 run 分支）。每个 run 用同一个
        master seed（derive_seed_list）派生的独立种子采样分布参数，n_runs==1
        时不采样（ADR 0045 确定性模式），与 run_simulation 行为一致。
        :param output_path_fn: 可选回调 (run_idx) -> CSV 路径；未提供时不写 CSV。
        :param log_cb: 同 run_simulation() 的 log_cb（ADR 0119）；只对 run 0 输出告警/
            完成统计，与 GUI batch_steps 的多 run 分支取 run0 为代表一致。
        :return: {"success", "model_name", "session_seed", "runs": [...], "error"?}
        """
        if model_name and not self.load_models([model_name], folder):
            return {"success": False, "error": f"无法加载模型：{model_name}"}
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}

        base_model = self.current_model
        try:
            validate_simulator_dates(
                base_model.simulator.get('start_date'),
                base_model.simulator.get('end_date'),
            )
            validate_schedule_list(getattr(base_model, 'schedule_entries', []))

            param_distributions = collect_param_distributions(base_model)
            base_model.param_distributions = param_distributions

            step_size = base_model.simulator.get('step_size', 3600.0)
            total_steps = int((time_hours * 3600.0) / step_size)
            output_variables, output_warnings = self._resolve_output_variables(base_model)

            start_date = base_model.simulator.get('start_date', '')
            raw_entries = getattr(base_model, 'schedule_entries', [])
            schedules = precompute_sustained_divisors(
                list(raw_entries), step_size, total_steps, start_date
            ) if raw_entries else []

            n_runs = max(1, int(n_runs))
            session_seed = int(seed) if seed is not None else int(np.random.randint(0, 2**31))
            seed_list = derive_seed_list(session_seed, n_runs)

            if log_cb:
                schedule_vars = [s.get('variable', '') for s in raw_entries if s.get('variable')]
                run_logging.build_initial_logs(
                    base_model, model_name or base_model.metadata.name,
                    total_steps, step_size, output_variables, output_warnings,
                    schedule_vars, n_runs, session_seed, log_cb=log_cb,
                )
            run_start_time = _time()

            # Clone + sample every run model from the still-pristine base_model
            # BEFORE advancing any of them (matches start_session's ordering) —
            # advancing run 0 in-place first would mutate base_model and make
            # later clones start from run 0's end state instead of the initial one.
            run_models = []
            for run_idx in range(n_runs):
                run_model = base_model if run_idx == 0 else clone_model(base_model)
                if param_distributions and n_runs > 1:
                    run_rng = np.random.default_rng(seed_list[run_idx])
                    apply_parameter_sampling(run_model, param_distributions, rng=run_rng)
                run_models.append(run_model)

            run_results = []
            for run_idx, run_model in enumerate(run_models):
                rows, end_step, end_time = advance_steps(
                    run_model, schedules, step_size, total_steps,
                    0, 0.0, output_variables, start_date,
                )

                csv_output_path = output_path_fn(run_idx) if output_path_fn else None
                if csv_output_path:
                    with open(csv_output_path, 'w', newline='', encoding='utf-8') as csvfile:
                        writer = csv.writer(csvfile)
                        writer.writerow(['step', 'time'] + output_variables)
                        for row in rows:
                            writer.writerow([row['step'], row['time']] + [row[v] for v in output_variables])

                if log_cb and run_idx == 0:
                    run_logging.check_value_warnings(run_model, rows, output_variables, set(), log_cb)
                    hits = run_logging.input_variable_hits(run_model, output_variables, rows)
                    run_suffix = f" × {n_runs} runs" if n_runs > 1 else ''
                    run_logging.log_completion(_time() - run_start_time, end_step, hits, log_cb, run_suffix)

                run_results.append({
                    "run_idx": run_idx,
                    "seed": seed_list[run_idx],
                    "steps": end_step,
                    "time": end_time,
                    "csv_output": csv_output_path,
                    "state": run_model.get_current_state(),
                })

            return {
                "success": True,
                "model_name": base_model.metadata.name,
                "session_seed": session_seed,
                "runs": run_results,
                "output_variables": output_variables,
                "warnings": output_warnings,
            }
        except Exception as e:
            logger.error(f"MC 仿真执行失败: {e}")
            return {"success": False, "error": str(e)}

    def run_simulation_all_plans(self, model_name: str, time_hours: float, folder: Optional[str] = None,
                                  output_path_fn: Optional[Callable[[str, int], str]] = None,
                                  n_runs: int = 1, seed: Optional[int] = None,
                                  log_cb: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        """
        对 simulation.plans 中的每一个 plan 各跑一遍仿真（CLI 使用）。
        每个 plan 在独立加载的模型副本上运行（互不影响初始状态）。
        :param output_path_fn: 可选回调 (plan_id, plan_index) -> CSV 路径；
            未提供时不写 CSV，仅返回结果。
        :param n_runs: >1 时每个 plan 改为调用 run_simulation_mc（每个 run 一个
            `__run{i}` 后缀的 CSV），= 1 时行为与之前完全一致。
        :param log_cb: 转发给 run_simulation()/run_simulation_mc()（ADR 0119）。
        :return: {"success": bool, "plans": [{"plan_id", "result"}], "error"?}
        """
        if not self.load_models([model_name], folder):
            return {"success": False, "error": f"无法加载模型：{model_name}"}

        # 模型未定义 simulation.plans 时，按单个 "default" plan 运行
        # （即不应用任何 schedules，与不带 --all-plans 的普通仿真一致）。
        plan_ids = list(self.current_model.plans.keys()) or ["default"]

        n_runs = max(1, int(n_runs))
        results = []
        for i, plan_id in enumerate(plan_ids):
            output_path = output_path_fn(plan_id, i) if output_path_fn else None
            self.current_model = self.loader.fetch(model_name, folder, use_cache=False)
            self.current_model.schedule_entries = self.current_model.plans.get(plan_id, [])

            if n_runs == 1:
                result = self.run_simulation(None, time_hours, output_path=output_path, log_cb=log_cb)
            else:
                def _run_path_fn(run_idx: int, _base=output_path) -> Optional[str]:
                    if not _base:
                        return None
                    base = Path(_base)
                    return str(base.with_name(f'{base.stem}__run{run_idx}{base.suffix}'))
                result = self.run_simulation_mc(None, time_hours, n_runs=n_runs, seed=seed,
                                                output_path_fn=_run_path_fn, log_cb=log_cb)

            results.append({"plan_id": plan_id, "result": result})
            if not result.get("success"):
                return {"success": False, "error": result.get("error"), "plans": results}

        return {"success": True, "plans": results}

    # GUI session methods (start_session / batch_steps / pause_session /
    # resume_session / reset_session / export_session_csv / get_session_info)
    # are provided by SessionManagerMixin — no duplication needed here.

    # ==================== 模型克隆 / 分布参数工具 ====================
    # clone_model(), collect_param_distributions(), apply_parameter_sampling() → mc_utils.py
