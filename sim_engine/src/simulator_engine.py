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

# 初始化模块的日志记录器，用于记录仿真过程中的信息和错误。
logger = logging.getLogger(__name__)

class SimulatorEngine(SessionManagerMixin):
    """仿真引擎，负责运行和管理仿真流程，提供黑盒评估接口，支持 CLI 和 GUI。"""
    VALID_OUTPUT_TYPES = {'input', 'parameter', 'state'}
    
    def __init__(self, models_directory: str = "models", language: str = "en"):
        """
        初始化仿真引擎。
        :param models_directory: 模型目录路径。
        :param language: 语言设置（如 "en", "zhhans"）。
        """
        # 初始化 LoaderEngine 以加载模型，指定模型目录和语言。
        self.loader = LoaderEngine(models_directory, language)
        # 初始化当前模型为 None。
        self.current_model: Optional[ModelStructure] = None
        # 初始化当前仿真步数。
        self.current_step = 0
        # 初始化仿真时间（秒）。
        self.time = 0.0
        # 初始化仿真运行状态。
        self.running = False
        # 初始化暂停回调函数（用于交互式暂停）。
        self.pause_callback: Optional[Callable[[], None]] = None

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
                      pause_every: int = 0, interactive: bool = False, 
                      output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        运行仿真主函数（CLI 使用）。
        :param model_name: 模型名称。
        :param time_hours: 仿真总时间（小时）。
        :param folder: 子文件夹名称。
        :param pause_every: 每隔多少步暂停（0 表示不暂停）。
        :param interactive: 是否启用交互式暂停。
        :param output_path: CSV 输出文件路径（可选）。
        :return: 仿真结果字典。
        """
        # 如果指定了模型名称但加载失败，返回错误信息。
        if model_name and not self.load_models([model_name], folder):
            return {"success": False, "error": f"无法加载模型：{model_name}"}
        # 如果当前未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        
        # 设置仿真运行状态为 True。
        self.running = True
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

        # 注册暂停回调（如果启用交互式暂停）。
        if interactive and pause_every > 0:
            self.pause_callback = self._interactive_pause

        # 从 schedule_entries 构建 schedule list（支持 time_start/time_end, pulse/sustained）
        start_date = self.current_model.simulator.get('start_date', '')
        raw_entries = getattr(self.current_model, 'schedule_entries', [])
        schedules = precompute_sustained_divisors(
            list(raw_entries), step_size, total_steps, start_date
        ) if raw_entries else []

        try:
            # 逐步运行仿真，直到达到指定步数或停止。每个 chunk 调用共用核心
            # advance_steps（CLI 与 GUI batch_steps 共用同一份循环体，见 ADR 0113），
            # chunk 大小取 pause_every（不开交互暂停时一次跑到底）。
            chunk_size = pause_every if pause_every > 0 else total_steps
            while self.current_step < total_steps and self.running:
                n = min(chunk_size, total_steps - self.current_step)
                rows, self.current_step, self.time = advance_steps(
                    self.current_model, schedules, step_size, n,
                    self.current_step, self.time, output_variables, start_date,
                )
                for row in rows:
                    csv_data.append([row['step'], row['time']] + [row[v] for v in output_variables])

                # 检查是否需要暂停。
                if pause_every > 0 and self.current_step % pause_every == 0:
                    if self.pause_callback:
                        # 调用暂停回调函数。
                        self.pause_callback()
                    if not self.running:
                        # 如果用户选择停止，跳出循环。
                        break

            # 设置仿真运行状态为 False。
            self.running = False
            
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
                          output_path_fn: Optional[Callable[[int], Optional[str]]] = None) -> Dict[str, Any]:
        """
        运行 n_runs 次仿真（Monte Carlo，CLI 使用），对应 GUI 的 sim_runs>1 路径
        （session_manager.py 的 batch_steps 多 run 分支）。每个 run 用同一个
        master seed（derive_seed_list）派生的独立种子采样分布参数，n_runs==1
        时不采样（ADR 0045 确定性模式），与 run_simulation 行为一致。
        :param output_path_fn: 可选回调 (run_idx) -> CSV 路径；未提供时不写 CSV。
        :return: {"success", "model_name", "session_seed", "runs": [...], "error"?}
        """
        if model_name and not self.load_models([model_name], folder):
            return {"success": False, "error": f"无法加载模型：{model_name}"}
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}

        base_model = self.current_model
        try:
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
                                  n_runs: int = 1, seed: Optional[int] = None) -> Dict[str, Any]:
        """
        对 simulation.plans 中的每一个 plan 各跑一遍仿真（CLI 使用）。
        每个 plan 在独立加载的模型副本上运行（互不影响初始状态）。
        :param output_path_fn: 可选回调 (plan_id, plan_index) -> CSV 路径；
            未提供时不写 CSV，仅返回结果。
        :param n_runs: >1 时每个 plan 改为调用 run_simulation_mc（每个 run 一个
            `__run{i}` 后缀的 CSV），= 1 时行为与之前完全一致。
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
                result = self.run_simulation(None, time_hours, output_path=output_path)
            else:
                def _run_path_fn(run_idx: int, _base=output_path) -> Optional[str]:
                    if not _base:
                        return None
                    base = Path(_base)
                    return str(base.with_name(f'{base.stem}__run{run_idx}{base.suffix}'))
                result = self.run_simulation_mc(None, time_hours, n_runs=n_runs, seed=seed,
                                                output_path_fn=_run_path_fn)

            results.append({"plan_id": plan_id, "result": result})
            if not result.get("success"):
                return {"success": False, "error": result.get("error"), "plans": results}

        return {"success": True, "plans": results}

    # GUI session methods (start_session / batch_steps / pause_session /
    # resume_session / reset_session / export_session_csv / get_session_info)
    # are provided by SessionManagerMixin — no duplication needed here.

    # ==================== 模型克隆 / 分布参数工具 ====================
    # clone_model(), collect_param_distributions(), apply_parameter_sampling() → mc_utils.py

    def _interactive_pause(self):
        """
        交互式暂停处理函数，允许用户通过 CLI 输入控制仿真。
        """
        # 显示当前仿真状态。
        print(f"\n[暂停] 当前步数: {self.current_step}, 时间: {self.time/3600:.2f} 小时")
        # 显示部分变量状态。
        state = self.current_model.get_current_state()
        for var_name, var_info in list(state.items())[:5]:  # 仅显示前 5 个变量
            print(f"  {var_name}: {var_info['value']:.4f} {var_info.get('unit', '')}")
        
        # 提示用户输入命令。
        user_input = input("输入命令 (continue/stop/adjust): ").strip().lower()
        
        # 处理用户命令。
        if user_input == 'stop':
            # 停止仿真。
            self.running = False
            print("[停止] 仿真已终止。")
        elif user_input == 'adjust':
            # 调整变量值。
            var_name = input("输入变量名: ").strip()
            try:
                # 获取新值。
                new_value = float(input(f"输入 {var_name} 的新值: ").strip())
                # 设置变量值。
                self.current_model.set_variable_value(var_name, new_value)
                print(f"[调整] {var_name} 已设置为 {new_value}")
            except (ValueError, KeyError) as e:
                # 处理输入错误。
                print(f"[错误] 无效输入: {e}")
        else:
            # 继续仿真。
            print("[继续] 仿真继续运行。")
