# -*- coding: utf-8 -*-
# 文件名: simulator_engine.py (扩展版)
# 描述: LifeMatters 框架的仿真引擎，负责加载模型、运行仿真、管理仿真状态。
#       扩展功能：支持 GUI 会话管理、批量执行、CSV 输入
#       同时保持原有 CLI 功能完全兼容

import logging
import numpy as np
import csv
import os
import re
import uuid
from typing import Dict, Any, List, Optional, Callable, Tuple
from scipy.integrate import solve_ivp
from .model_structure import ModelStructure
from .model_structure.base import Variable, InputSchedule, SchedulePoint, Accumulator, TIME_UNIT_SECONDS
from .loader_engine import LoaderEngine

# 初始化模块的日志记录器，用于记录仿真过程中的信息和错误。
logger = logging.getLogger(__name__)

class SimulatorEngine:
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
        # 初始化 ODE 求解器选项。
        self.ode_solver = 'RK45'  # 默认使用 Runge-Kutta 4-5 阶方法
        self.ode_rtol = 1e-3  # 相对容差
        self.ode_atol = 1e-6  # 绝对容差
        
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
        
        try:
            # 逐步运行仿真，直到达到指定步数或停止。
            while self.current_step < total_steps and self.running:
                # 执行单步仿真。
                self.current_model.step(step_size)
                # 增加步数计数。
                self.current_step += 1
                # 更新仿真时间。
                self.time += step_size
                
                # 收集当前步的数据
                row = [self.current_step, self.time]
                for var_name in output_variables:
                    row.append(self.current_model.variables[var_name].value)
                csv_data.append(row)
                
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

    # ==================== 新增：GUI 会话管理功能 ====================

    @staticmethod
    def _apply_regimens(model, regimens: list, prev_time: float, next_time: float,
                        sim_start_date: str = ''):
        """在 [prev_time, next_time) 窗口内触发 Regimen 事件，pulse 语义累加写入模型变量。

        时间约定：
          - prev_time / next_time 单位为秒（仿真已流逝时间）
          - 事件时刻 "HH:MM" 以每日周期判断（模 86400）
          - days [Mon..Sun] 支持两种格式：
              regimen 级 boolean mask（GUI 路径）
              event 级 string list，如 ['Mon','Wed']（optimizer 路径）
          - valid_range 以 sim_start_date + 天数偏移与起止日期比较

        Pulse 语义：每步开始先将所有受控变量归零，再累加本步命中的事件值。
        这与 _apply_schedules 的 pulse 模式完全一致，消除了"最后赋值覆盖"问题。
        optimizer 路径直接调用本函数（传入 list 格式），无需独立实现。
        """
        from datetime import date, timedelta

        _DAY_STR = {'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6}

        try:
            _EPOCH = date.fromisoformat(sim_start_date) if sim_start_date else date(1900, 1, 1)
        except ValueError:
            _EPOCH = date(1900, 1, 1)

        prev_day_idx = int(prev_time / 86400)
        prev_sec_of_day = prev_time % 86400
        next_sec_of_day = next_time % 86400
        day_boundary_crossed = int(next_time / 86400) > prev_day_idx
        dow = prev_day_idx % 7  # 0=Mon … 6=Sun

        # ── Pulse 重置：所有受控变量本步归零 ──────────────────────────────
        for reg in regimens:
            var = reg.get('variable', '')
            if var in model.variables:
                model.set_variable_value(var, 0.0)

        # ── 累加命中事件 ───────────────────────────────────────────────────
        for reg in regimens:
            variable = reg.get('variable', '')
            if variable not in model.variables:
                continue

            # 有效期检查（regimen 级）
            if reg.get('valid_range_enabled'):
                sim_date = _EPOCH + timedelta(days=prev_day_idx)
                vs, ve = reg.get('valid_start', ''), reg.get('valid_end', '')
                try:
                    if vs and sim_date < date.fromisoformat(vs):
                        continue
                    if ve and sim_date > date.fromisoformat(ve):
                        continue
                except ValueError:
                    pass

            # 执行日检查（regimen 级 boolean mask，GUI 路径）
            if reg.get('days_enabled'):
                days_mask = reg.get('days', [True] * 7)
                if not (days_mask[dow] if dow < len(days_mask) else True):
                    continue

            for ev in reg.get('events', []):
                # 执行日检查（event 级 string list，optimizer 路径）
                ev_days = ev.get('days', [])
                if ev_days:
                    allowed = {_DAY_STR[d.lower()[:3]] for d in ev_days if d.lower()[:3] in _DAY_STR}
                    if dow not in allowed:
                        continue

                time_str = ev.get('time', '08:00')
                try:
                    hh, mm = map(int, time_str.split(':'))
                except Exception:
                    continue
                ev_sec = hh * 3600 + mm * 60

                fires = (ev_sec >= prev_sec_of_day or ev_sec < next_sec_of_day) \
                    if day_boundary_crossed else (prev_sec_of_day <= ev_sec < next_sec_of_day)

                if fires:
                    current = model.variables[variable].value
                    model.set_variable_value(variable, current + float(ev.get('value', 0)))
                    logger.debug(f"Regimen 触发: {variable}+={ev.get('value',0)} @ t={prev_time:.0f}s ({time_str})")

    def start_session(self, model_name: str, time_hours: float, folder: Optional[str] = None,
                     step_size: Optional[float] = None, input_params: Optional[Dict[str, float]] = None,
                     regimens: Optional[List[Dict]] = None,
                     sim_runs: int = 1) -> Dict[str, Any]:
        """
        开始一个新的仿真会话（GUI 使用）。
        :param model_name: 模型名称。
        :param time_hours: 仿真总时间（小时）。
        :param folder: 子文件夹名称。
        :param step_size: 时间步长（秒），如果为 None 则使用模型默认值。
        :param input_params: 初始输入参数（可选）。
        :param regimens: Regimen K×4 计划表（可选）。
        :param sim_runs: Monte Carlo 运行条数（默认 1=单条）。
        :return: 会话信息字典。
        """
        try:
            # 加载模型（作为所有 run 的基础模型）
            if not self.load_models([model_name], folder):
                return {"success": False, "error": f"无法加载模型：{model_name}"}

            base_model = self.current_model

            # 收集含分布的 parameter 变量，并将 value 设置为均值
            param_distributions = self._collect_param_distributions(base_model)
            base_model.param_distributions = param_distributions

            # 应用输入参数
            if input_params:
                for var_name, value in input_params.items():
                    if var_name in base_model.variables:
                        base_model.set_variable_value(var_name, value)

            # GUI Working State Layer（ADR 0074）：
            # 有 GUI regimen 的变量写入 manual_overrides，使 _apply_schedules 跳过它们，
            # 确保 GUI 值优先级高于 YAML schedule。
            if regimens:
                for reg in regimens:
                    var = reg.get('variable', '')
                    if var in base_model.variables:
                        base_model.manual_overrides[var] = 'gui'

            # 生成会话 ID 和种子列表（T4）
            session_id = str(uuid.uuid4())
            session_seed = int(np.random.randint(0, 2**31))
            master_rng = np.random.default_rng(session_seed)
            n_runs = max(1, int(sim_runs))
            seed_list = [int(master_rng.integers(0, 2**31)) for _ in range(n_runs)]

            # 获取配置
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

            # 为每条 run 创建独立模型副本并应用分布采样
            runs = []
            for run_idx in range(n_runs):
                # run 0 直接用 base_model；其余 run 用手动克隆（不用 deepcopy）
                run_model = base_model if run_idx == 0 else self._clone_model(base_model)

                if param_distributions:
                    run_rng = np.random.default_rng(seed_list[run_idx])
                    self._apply_parameter_sampling(run_model, param_distributions, rng=run_rng)

                runs.append({
                    'run_idx': run_idx,
                    'seed': seed_list[run_idx],
                    'model': run_model,
                    'current_step': 0,
                    'time': 0.0,
                    'data': [],
                    'completed': False,
                })

            # 创建会话
            self.sessions[session_id] = {
                'model': runs[0]['model'],      # 兼容旧代码
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
                'sim_start_date': str(base_model.simulator.get('start_date', '')),
            }

            logger.info(f"会话已创建: {session_id}, 模型: {model_name}, 总步数: {total_steps}, runs: {n_runs}, seed: {session_seed}")

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
                }
            }

        except Exception as e:
            logger.error(f"创建会话失败: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    def batch_steps(self, session_id: str, steps: int = 10,
                   input_changes: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        """
        批量执行多步仿真（GUI 使用）。支持单条（sim_runs=1）和 Monte Carlo 多条运行。
        :param session_id: 会话 ID。
        :param steps: 要执行的步数。
        :param input_changes: 动态修改的输入参数（可选）。
        :return: 执行结果字典，多条时额外包含 outputs_per_run。
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

            # ── 单条路径（兼容原有逻辑）──────────────────────────────────────
            if sim_runs == 1 or not runs:
                model = session['model']

                if input_changes:
                    for var_name, value in input_changes.items():
                        if var_name in model.variables:
                            model.set_variable_value(var_name, value)
                            # 不写入 manual_overrides：YAML schedule 优先；
                            # 用户值作为初始值，schedule 会在 step() 中按时序覆盖

                outputs = []
                remaining = session['total_steps'] - session['current_step']
                actual_steps = min(steps, remaining)

                # step_size 是秒；step() 期望原生时间单位，需要先除以 unit_sec
                _unit_sec = TIME_UNIT_SECONDS.get(getattr(model, 'time_unit', 'second'), 1.0)
                _native_step = step_size / _unit_sec

                for i in range(actual_steps):
                    prev_time = session['time']
                    next_time = prev_time + step_size
                    self._apply_regimens(model, session['regimens'], prev_time, next_time,
                                         sim_start_date=sim_start_date)
                    model.step(_native_step)
                    session['current_step'] += 1
                    session['time'] += step_size

                    output_data = {'step': session['current_step'], 'time': session['time']}
                    for var_name in output_variables:
                        output_data[var_name] = model.variables[var_name].value
                    outputs.append(output_data)
                    session['data'].append(output_data)

                completed = session['current_step'] >= session['total_steps']
                progress = (session['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0

                logger.info(f"单条批量执行: session={session_id}, steps={actual_steps}, total={session['current_step']}/{session['total_steps']}")

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
                    }
                }

            # ── 多条路径（Monte Carlo）─────────────────────────────────────────
            all_run_outputs: List[List[Dict]] = []

            for run in runs:
                if run['completed']:
                    all_run_outputs.append([])
                    continue

                run_model = run['model']
                run_outputs: List[Dict] = []

                if input_changes:
                    for var_name, value in input_changes.items():
                        if var_name in run_model.variables:
                            run_model.set_variable_value(var_name, value)

                remaining = session['total_steps'] - run['current_step']
                actual_steps = min(steps, remaining)

                # 转换 step_size（秒）→ 原生时间单位
                _unit_sec = TIME_UNIT_SECONDS.get(getattr(run_model, 'time_unit', 'second'), 1.0)
                _native_step = step_size / _unit_sec

                for i in range(actual_steps):
                    prev_time = run['time']
                    next_time = prev_time + step_size
                    self._apply_regimens(run_model, session['regimens'], prev_time, next_time,
                                         sim_start_date=sim_start_date)
                    run_model.step(_native_step)
                    run['current_step'] += 1
                    run['time'] += step_size

                    output_data = {'step': run['current_step'], 'time': run['time']}
                    for var_name in output_variables:
                        output_data[var_name] = run_model.variables[var_name].value
                    run_outputs.append(output_data)
                    run['data'].append(output_data)

                if run['current_step'] >= session['total_steps']:
                    run['completed'] = True

                all_run_outputs.append(run_outputs)

            # 计算均值轨迹（向后兼容）
            n_steps = max((len(ro) for ro in all_run_outputs), default=0)
            mean_outputs: List[Dict] = []
            for step_i in range(n_steps):
                base = {}
                valid_runs = [ro for ro in all_run_outputs if step_i < len(ro)]
                if not valid_runs:
                    continue
                base['step'] = valid_runs[0][step_i]['step']
                base['time'] = valid_runs[0][step_i]['time']
                for var_name in output_variables:
                    vals = [ro[step_i].get(var_name, 0.0) for ro in valid_runs]
                    base[var_name] = float(np.mean(vals))
                mean_outputs.append(base)

            # 用 run 0 的进度代表会话级别进度
            run0 = runs[0]
            session['current_step'] = run0['current_step']
            session['time'] = run0['time']
            session['model'] = run0['model']
            for pt in mean_outputs:
                session['data'].append(pt)

            completed = all(r['completed'] for r in runs)
            progress = (run0['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0

            logger.info(f"多条批量执行: session={session_id}, steps={n_steps}, runs={sim_runs}, progress={progress:.1f}%")

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
                }
            }

        except Exception as e:
            logger.error(f"批量执行失败: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    def pause_session(self, session_id: str) -> Dict[str, Any]:
        """
        暂停指定会话（GUI 使用）。
        :param session_id: 会话 ID。
        :return: 操作结果。
        """
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            
            self.sessions[session_id]['running'] = False
            logger.info(f"会话已暂停: {session_id}")
            
            return {"success": True, "message": "会话已暂停"}
        
        except Exception as e:
            logger.error(f"暂停会话失败: {e}")
            return {"success": False, "error": str(e)}
    
    def resume_session(self, session_id: str) -> Dict[str, Any]:
        """
        继续指定会话（GUI 使用）。
        :param session_id: 会话 ID。
        :return: 操作结果。
        """
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            
            self.sessions[session_id]['running'] = True
            logger.info(f"会话已继续: {session_id}")
            
            return {"success": True, "message": "会话已继续"}
        
        except Exception as e:
            logger.error(f"继续会话失败: {e}")
            return {"success": False, "error": str(e)}
    
    def reset_session(self, session_id: str) -> Dict[str, Any]:
        """
        重置指定会话（GUI 使用）。
        :param session_id: 会话 ID。
        :return: 操作结果。
        """
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            
            session = self.sessions[session_id]
            model = session['model']
            
            # 重置模型状态
            model.reset_simulation()
            
            # 重置会话状态
            session['current_step'] = 0
            session['time'] = 0.0
            session['running'] = True
            session['data'] = []
            
            logger.info(f"会话已重置: {session_id}")
            
            return {
                "success": True,
                "message": "会话已重置",
                "initial_state": model.get_current_state()
            }
        
        except Exception as e:
            logger.error(f"重置会话失败: {e}")
            return {"success": False, "error": str(e)}
    
    def export_session_csv(self, session_id: str, output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        导出会话数据到 CSV（GUI 使用）。
        :param session_id: 会话 ID。
        :param output_path: 输出文件路径（可选）。
        :return: 操作结果。
        """
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            
            session = self.sessions[session_id]
            data = session['data']
            
            if not data:
                return {"success": False, "error": "没有数据可导出"}
            
            # 确定输出路径
            if not output_path:
                output_dir = os.path.join(self.loader.models_directory, "output")
                os.makedirs(output_dir, exist_ok=True)
                output_path = os.path.join(output_dir, f"{session['model_name']}_session_{session_id[:8]}.csv")
            
            # 写入 CSV
            headers = list(data[0].keys())
            with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=headers)
                writer.writeheader()
                writer.writerows(data)
            
            logger.info(f"会话数据已导出: {output_path}")
            
            return {
                "success": True,
                "csv_path": output_path,
                "rows": len(data)
            }
        
        except Exception as e:
            logger.error(f"导出 CSV 失败: {e}")
            return {"success": False, "error": str(e)}
    
    def get_session_info(self, session_id: str) -> Dict[str, Any]:
        """
        获取会话信息（GUI 使用）。
        :param session_id: 会话 ID。
        :return: 会话信息字典。
        """
        try:
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            
            session = self.sessions[session_id]
            
            return {
                "success": True,
                "data": {
                    "session_id": session_id,
                    "model_name": session['model_name'],
                    "folder": session.get('folder'),
                    "current_step": session['current_step'],
                    "total_steps": session['total_steps'],
                    "progress": (session['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0,
                    "running": session['running'],
                    "completed": session['current_step'] >= session['total_steps'],
                    "data_points": len(session['data']),
                    "outputs": session['data'],
                    "outputs_per_run": [run.get('data', []) for run in session.get('runs', [])] or [session['data']],
                    "output_variables": session.get('output_variables', []),
                    "warnings": session.get('output_warnings', []),
                    "sim_runs": session.get('sim_runs', 1),
                    "session_seed": session.get('session_seed', 0),
                }
            }
        
        except Exception as e:
            logger.error(f"获取会话信息失败: {e}")
            return {"success": False, "error": str(e)}

    # ==================== 新增：CSV 输入功能 ====================
    
    def load_csv_inputs(self, csv_path: str) -> List[Dict[str, float]]:
        """
        从 CSV 文件加载输入序列（CLI 使用）。
        CSV 格式: time,var1,var2,...
        :param csv_path: CSV 文件路径。
        :return: 输入序列列表。
        """
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                data = []
                for row in reader:
                    # 转换数值
                    converted = {}
                    for key, value in row.items():
                        try:
                            converted[key] = float(value)
                        except ValueError:
                            converted[key] = value
                    data.append(converted)
                
                logger.info(f"从 CSV 加载了 {len(data)} 个输入时间点")
                return data
        
        except Exception as e:
            logger.error(f"读取输入 CSV 失败: {e}")
            return []
    
    def run_with_csv_inputs(self, model_name: str, csv_input_path: str, folder: Optional[str] = None,
                           output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        使用 CSV 输入序列运行仿真（CLI 使用）。
        :param model_name: 模型名称。
        :param csv_input_path: CSV 输入文件路径。
        :param folder: 子文件夹名称。
        :param output_path: CSV 输出文件路径（可选）。
        :return: 仿真结果字典。
        """
        try:
            # 加载模型
            if not self.load_models([model_name], folder):
                return {"success": False, "error": f"无法加载模型：{model_name}"}
            
            # 加载输入序列
            input_sequence = self.load_csv_inputs(csv_input_path)
            if not input_sequence:
                return {"success": False, "error": "无法加载输入 CSV"}
            
            # 获取输出变量
            output_variables, output_warnings = self._resolve_output_variables(self.current_model)
            
            # 准备数据存储
            csv_data = []
            csv_headers = ['step', 'time'] + output_variables
            
            # 按序列执行
            for idx, input_point in enumerate(input_sequence):
                # 应用输入（除了 time 字段）
                for var_name, value in input_point.items():
                    if var_name != 'time' and var_name in self.current_model.variables:
                        self.current_model.set_variable_value(var_name, value)
                
                # 如果不是第一个点，执行到这个时间点
                if idx > 0:
                    prev_time = input_sequence[idx - 1]['time']
                    curr_time = input_point['time']
                    dt = curr_time - prev_time
                    
                    if dt > 0:
                        self.current_model.step(dt)
                
                # 收集输出数据
                row = [idx + 1, input_point['time']]
                for var_name in output_variables:
                    row.append(self.current_model.variables[var_name].value)
                
                csv_data.append(row)
            
            # 写入 CSV 文件
            csv_output_path = output_path
            if not csv_output_path:
                output_dir = os.path.join(self.loader.models_directory, "output")
                os.makedirs(output_dir, exist_ok=True)
                csv_output_path = os.path.join(output_dir, f"{self.current_model.metadata.name}_csv_input.csv")
            
            with open(csv_output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(csv_headers)
                writer.writerows(csv_data)
            
            return {
                "success": True,
                "model_name": self.current_model.metadata.name,
                "state": self.current_model.get_current_state(),
                "steps": len(csv_data),
                "csv_output": csv_output_path,
                "output_variables": output_variables,
                "warnings": output_warnings,
            }
        
        except Exception as e:
            logger.error(f"CSV 输入仿真失败: {e}")
            return {"success": False, "error": str(e)}

    # ==================== 原有功能（保持不变）====================
    
    def fitness_func(self, parameters: Optional[List[float]] = None, 
                    inputs_sequence: Optional[List[Dict[str, float]]] = None,
                    time_hours: float = 720.0) -> float:
        """
        黑盒评估接口，供优化模块调用。
        :param parameters: 参数值列表（用于 full_params 模式）。
        :param inputs_sequence: 输入序列列表（用于 full_inputs 模式）。
        :param time_hours: 仿真时长（小时）。
        :return: 适应度值（metrics float）。
        """
        # 如果未加载模型，返回无穷大（最差适应度）。
        if not self.current_model:
            logger.error("fitness_func: 未加载模型")
            return float('inf')
        
        # 重置仿真状态到初始值。
        self.current_model.reset_simulation()
        
        # 如果提供了参数，设置模型参数。
        if parameters is not None:
            self.current_model.set_parameters(parameters)
        
        # 从模型的 simulator 配置中获取时间步长（秒）。
        step_size = self.current_model.simulator.get('step_size', 3600.0)
        # 计算总仿真时间（秒）。
        total_time = time_hours * 3600.0
        # 计算总步数。
        total_steps = int(total_time / step_size)
        
        try:
            # 如果提供了输入序列，按序列执行仿真。
            if inputs_sequence is not None:
                # 遍历输入序列的每一步。
                for step_idx in range(min(len(inputs_sequence), total_steps)):
                    # 获取当前步的输入值。
                    step_inputs = inputs_sequence[step_idx]
                    # 应用输入值到模型。
                    for var_name, value in step_inputs.items():
                        self.current_model.set_variable_value(var_name, value)
                    # 执行单步仿真。
                    self.current_model.step(step_size)
            else:
                # 否则，直接运行指定步数的仿真。
                self.current_model.run_steps(total_steps, step_size)
            
            # 从模型的 optimizer 配置中获取目标函数。
            target = self.current_model.optimizer.get('targets', ['min_error'])[0]
            # 计算并返回目标函数值（适应度）。
            return self.current_model.get_objective(target)
        
        except Exception as e:
            # 记录评估失败错误。
            logger.error(f"fitness_func 评估失败: {e}")
            # 返回无穷大（最差适应度）。
            return float('inf')

    def solve_ode(self, t_span: tuple, y0: np.ndarray, params: Optional[List[float]] = None) -> Dict[str, Any]:
        """
        使用 SciPy solve_ivp 求解 ODE 系统。
        :param t_span: 时间范围 (t_start, t_end)。
        :param y0: 初始状态向量。
        :param params: 参数值列表。
        :return: ODE 求解结果字典。
        """
        # 如果未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        
        # 如果提供了参数，设置模型参数。
        if params is not None:
            self.current_model.set_parameters(params)
        
        # 定义 ODE 右侧函数（dy/dt）。
        def ode_rhs(t, y):
            """
            ODE 右侧函数，从 formulas 构建。
            :param t: 当前时间。
            :param y: 当前状态向量。
            :return: 状态导数向量。
            """
            # 将状态向量映射回模型变量。
            state_vars = list(self.current_model.variables.keys())
            for i, var_name in enumerate(state_vars):
                self.current_model.set_variable_value(var_name, y[i])
            
            # 初始化导数向量。
            dydt = np.zeros_like(y)
            
            # 按优先级排序公式。
            sorted_formulas = sorted(self.current_model.formulas.items(), 
                                   key=lambda x: x[1].priority, reverse=True)
            
            # 执行每个公式，计算导数。
            for form_name, formula in sorted_formulas:
                # 评估公式条件。
                condition = formula.condition
                if isinstance(condition, str):
                    condition = self.current_model.asteval.eval(formula.condition, raise_errors=False)
                
                # 如果条件满足，应用公式。
                if condition:
                    for var_name, expr in formula.dynamics.items():
                        # 计算变量的新值。
                        new_value = self.current_model.asteval.eval(expr)
                        # 获取变量在状态向量中的索引。
                        var_idx = state_vars.index(var_name)
                        # 计算导数（假设 expr 表示增量）。
                        dydt[var_idx] = (new_value - y[var_idx])
            
            # 返回导数向量。
            return dydt
        
        try:
            # 调用 SciPy solve_ivp 求解 ODE。
            solution = solve_ivp(
                ode_rhs, 
                t_span, 
                y0, 
                method=self.ode_solver,
                rtol=self.ode_rtol,
                atol=self.ode_atol
            )
            
            # 返回求解结果。
            return {
                "success": True,
                "t": solution.t,
                "y": solution.y,
                "message": solution.message
            }
        except Exception as e:
            # 记录 ODE 求解失败错误。
            logger.error(f"ODE 求解失败: {e}")
            # 返回错误信息。
            return {"success": False, "error": str(e)}

    # ==================== 模型克隆（MC多条运行用）====================

    @staticmethod
    def _clone_model(base: ModelStructure) -> ModelStructure:
        """
        为 Monte Carlo 多条运行创建模型的独立副本。
        不使用 deepcopy（BabelLanguageManager 含文件句柄，不可 pickle），
        而是手动复制只读数据，让 asteval / lang_manager 各自全新初始化。
        """
        fresh = ModelStructure(
            models_directory=base.models_directory,
            language='en',
        )

        # 只读元数据（共享引用即可）
        fresh.metadata         = base.metadata
        fresh.formulas         = base.formulas          # 公式只读，可共享
        fresh.simulator        = dict(base.simulator)
        fresh.optimizer        = dict(base.optimizer)
        fresh.time_unit        = base.time_unit
        fresh.current_filename = base.current_filename
        fresh.models_directory = base.models_directory

        # 每条 run 需要独立的 variable 实例（含当前值）
        fresh.variables = {
            name: Variable(
                description=var.description,
                value=var.value,        # 基础模型应用 input_params 后的值
                type=var.type,
                unit=var.unit,
                bounds=list(var.bounds) if var.bounds else None,
            )
            for name, var in base.variables.items()
        }

        # schedule 的 points 列表在仿真中只读，可共享；但 InputSchedule 本身需独立
        fresh.schedules = {
            name: InputSchedule(
                variable=sched.variable,
                points=sched.points,            # points 列表只读，共享
                interpolation=sched.interpolation,
            )
            for name, sched in base.schedules.items()
        }

        # accumulator 有运行时可变状态，需独立且重置
        fresh.accumulators = {
            name: Accumulator(
                variable=acc.variable,
                source=acc.source,
                window=acc.window,
                operation=acc.operation,
                unit=acc.unit,
                description=acc.description,
                running_sum=0.0,
                window_start_time=0.0,
            )
            for name, acc in base.accumulators.items()
        }

        # 重置运行时状态（manual_overrides 从 base 继承，保留 GUI Working State 设置）
        fresh.variable_history = {n: [v.value] for n, v in fresh.variables.items()}
        fresh.manual_overrides = dict(getattr(base, 'manual_overrides', {}))
        fresh.current_step     = 0
        fresh.time             = 0.0

        # 将变量值注入全新的 asteval 符号表
        fresh._initialize_asteval()

        # 继承分布表达式字典（loader 解析的原始字符串，MC 采样用）
        fresh._param_dist_raw    = getattr(base, '_param_dist_raw', {})
        fresh.param_distributions = getattr(base, 'param_distributions', {})

        return fresh

    # ==================== 分布参数工具 ====================

    @staticmethod
    def _parse_distribution(value) -> Optional[tuple]:
        """解析分布表达式字符串，如 'normal(70,5)'。返回 (dist_type, (p1,p2)) 或 None。"""
        if not isinstance(value, str):
            return None
        m = re.match(
            r'\s*(normal|uniform|lognormal)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*$',
            value.strip()
        )
        if m:
            try:
                return m.group(1), (float(m.group(2)), float(m.group(3)))
            except ValueError:
                return None
        return None

    @staticmethod
    def _get_mean_value(value) -> float:
        """返回分布表达式的均值（第一参数），或直接返回数值。"""
        parsed = SimulatorEngine._parse_distribution(value)
        if parsed:
            return parsed[1][0]
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(value)
        except Exception:
            return 0.0

    @staticmethod
    def _sample_value(value, rng: np.random.Generator) -> float:
        """用 rng 从分布字符串采样，或直接返回数值。"""
        parsed = SimulatorEngine._parse_distribution(value)
        if parsed:
            dist_type, (p1, p2) = parsed
            if dist_type == 'normal':
                return float(rng.normal(p1, p2))
            elif dist_type == 'uniform':
                return float(rng.uniform(p1, p2))
            elif dist_type == 'lognormal':
                return float(rng.lognormal(p1, p2))
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(value)
        except Exception:
            return 0.0

    @staticmethod
    def _apply_parameter_sampling(model, param_distributions: dict, rng=None):
        """
        对模型中所有含分布的 parameter 变量应用采样（MC）或取均值（确定性）。
        :param param_distributions: {var_name: value_str} 含分布的参数字典
        :param rng: 如果为 None 则取均值（确定性），否则用 rng 采样（MC）
        """
        for var_name, value_str in param_distributions.items():
            if var_name not in model.variables:
                continue
            val = (SimulatorEngine._sample_value(value_str, rng)
                   if rng is not None
                   else SimulatorEngine._get_mean_value(value_str))
            model.variables[var_name].value = val
            model.asteval.symtable[var_name] = val

    @staticmethod
    def _collect_param_distributions(model) -> dict:
        """
        收集所有含分布表达式的 parameter 变量，返回 {var_name: dist_str}。

        优先从 model._param_dist_raw（loader 阶段解析并存储的原始字符串）读取；
        兜底仍扫描 Variable.value（兼容直接构造的模型）。
        loader 已将分布字符串的 value 替换为均值，无需再次转换。
        """
        dist_map = {}

        # 来源 1：loader 存储的原始分布字符串
        raw = getattr(model, '_param_dist_raw', {})
        for var_name, dist_str in raw.items():
            if var_name in model.variables:
                dist_map[var_name] = dist_str

        # 来源 2：Variable.value 仍是字符串（直接构造或旧版 loader）
        for var_name, var in model.variables.items():
            if var_name in dist_map:
                continue
            if var.type.value == 'parameter' and isinstance(var.value, str):
                if SimulatorEngine._parse_distribution(var.value) is not None:
                    dist_map[var_name] = var.value
                    mean_val = SimulatorEngine._get_mean_value(var.value)
                    var.value = mean_val
                    model.asteval.symtable[var_name] = mean_val

        return dist_map

    def fitness_func_with_seed(self, parameters: Optional[List[float]] = None,
                               seed: Optional[int] = None,
                               time_hours: float = 720.0) -> float:
        """
        带随机种子的黑盒评估：对含分布的 parameter 变量进行 MC 采样后运行仿真。
        用于优化器的 N_inner 多次评估。
        """
        if not self.current_model:
            logger.error("fitness_func_with_seed: 未加载模型")
            return float('inf')

        self.current_model.reset_simulation()

        # 从分布采样
        param_distributions = getattr(self.current_model, 'param_distributions', {})
        if param_distributions:
            rng = np.random.default_rng(seed) if seed is not None else None
            self._apply_parameter_sampling(self.current_model, param_distributions, rng=rng)

        if parameters is not None:
            self.current_model.set_parameters(parameters)

        step_size = self.current_model.simulator.get('step_size', 3600.0)
        total_steps = int(time_hours * 3600.0 / step_size)

        try:
            self.current_model.run_steps(total_steps, step_size)
            target = self.current_model.optimizer.get('targets', ['min_error'])[0]
            return self.current_model.get_objective(target)
        except Exception as e:
            logger.error(f"fitness_func_with_seed 评估失败: {e}")
            return float('inf')

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

    def get_state(self) -> Dict[str, Any]:
        """
        获取当前仿真状态。
        :return: 状态字典。
        """
        # 如果未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        # 返回当前模型的状态。
        return {"success": True, "state": self.current_model.get_current_state()}

    def pause_simulation(self):
        """暂停仿真。"""
        # 设置仿真运行状态为 False，暂停仿真。
        self.running = False
        # 记录暂停日志。
        logger.info("仿真已暂停")

    def resume_simulation(self, time_hours: float = 1.0):
        """
        继续仿真。
        :param time_hours: 继续运行的时间（小时）。
        :return: 仿真结果字典。
        """
        # 如果未加载模型，返回错误信息。
        if not self.current_model:
            return {"success": False, "error": "未加载模型"}
        # 调用 run_simulation 继续仿真。
        return self.run_simulation(
            model_name=None,  # 已加载模型，无需重新加载
            time_hours=time_hours
        )
