# -*- coding: utf-8 -*-
# 文件名: simulator_engine.py (扩展版)
# 描述: LifeMatters 框架的仿真引擎，负责加载模型、运行仿真、管理仿真状态。
#       扩展功能：支持 GUI 会话管理、批量执行、CSV 输入
#       同时保持原有 CLI 功能完全兼容

import logging
import numpy as np
import csv
import os
import uuid
from typing import Dict, Any, List, Optional, Callable
from scipy.integrate import solve_ivp
from .mod_structure import ModStructure
from .loader_engine import LoaderEngine

# 初始化模块的日志记录器，用于记录仿真过程中的信息和错误。
logger = logging.getLogger(__name__)

class SimulatorEngine:
    """仿真引擎，负责运行和管理仿真流程，提供黑盒评估接口，支持 CLI 和 GUI。"""
    
    def __init__(self, mods_directory: str = "mods", language: str = "en"):
        """
        初始化仿真引擎。
        :param mods_directory: 模型目录路径。
        :param language: 语言设置（如 "en", "zhhans"）。
        """
        # 初始化 LoaderEngine 以加载模型，指定模型目录和语言。
        self.loader = LoaderEngine(mods_directory, language)
        # 初始化当前模型为 None。
        self.current_model: Optional[ModStructure] = None
        # 初始化当前仿真步数。
        self.current_step = 0
        # 初始化仿真时间（秒）。from mod_structure import ModStructure, ModelMetadata
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

    def load_models(self, model_names: List[str], folder: Optional[str] = None) -> bool:
        """
        加载指定名称的模型。
        :param model_names: 模型名称列表（取第一个）。
        :param folder: 子文件夹名称。
        :return: 加载是否成功。
        """
        # 使用 LoaderEngine 的 fetch 方法加载第一个模型。
        self.current_model = self.loader.fetch(model_names[0], folder)
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
        output_variables = self.current_model.simulator.get('output_variables', [])
        
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
                    if var_name in self.current_model.variables:
                        row.append(self.current_model.variables[var_name].value)
                    else:
                        row.append(0.0)  # 变量不存在时填充 0
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
                # 默认输出到 mods/output/ 目录
                output_dir = os.path.join(self.loader.mods_directory, "output")
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
                "output_variables": output_variables
            }
        except Exception as e:
            # 记录仿真失败错误。
            logger.error(f"仿真执行失败: {e}")
            # 返回错误信息。
            return {"success": False, "error": str(e)}

    # ==================== 新增：GUI 会话管理功能 ====================

    @staticmethod
    def _apply_regimens(model, regimens: list, prev_time: float, next_time: float):
        """在 [prev_time, next_time) 窗口内触发 Regimen 事件，将 value 写入模型变量。

        时间约定：
          - prev_time / next_time 单位为秒（仿真已流逝时间）
          - 事件时刻 "HH:mm" 以每日周期判断（模 86400）
          - days [Mon..Sun] 以 int(prev_time/86400) % 7 判断星期
          - valid_range 以天数偏移 int(day) 与起止日期解析后比较
        """
        from datetime import date, timedelta, datetime

        # 仿真起始日（固定为 1900-01-01，仅用于相对比较）
        _EPOCH = date(1900, 1, 1)

        prev_day_idx = int(prev_time / 86400)
        prev_sec_of_day = prev_time % 86400
        next_sec_of_day = next_time % 86400
        day_boundary_crossed = int(next_time / 86400) > prev_day_idx

        for reg in regimens:
            variable = reg.get('variable', '')
            if variable not in model.variables:
                continue

            # 有效期检查
            if reg.get('valid_range_enabled'):
                sim_date = _EPOCH + timedelta(days=prev_day_idx)
                vs, ve = reg.get('valid_start', ''), reg.get('valid_end', '')
                try:
                    if vs and sim_date < date.fromisoformat(vs):
                        continue
                    if ve and sim_date > date.fromisoformat(ve):
                        continue
                except ValueError:
                    pass  # 日期格式错误则忽略限制

            # 执行日检查（0=Mon … 6=Sun）
            if reg.get('days_enabled'):
                dow = prev_day_idx % 7
                days_mask = reg.get('days', [True]*7)
                if not (days_mask[dow] if dow < len(days_mask) else True):
                    continue

            for ev in reg.get('events', []):
                time_str = ev.get('time', '08:00')
                try:
                    hh, mm = map(int, time_str.split(':'))
                except Exception:
                    continue
                ev_sec = hh * 3600 + mm * 60

                # 事件是否落在当前步的时间窗口内
                fires = False
                if day_boundary_crossed:
                    # 跨天：两段均检查
                    fires = ev_sec >= prev_sec_of_day or ev_sec < next_sec_of_day
                else:
                    fires = prev_sec_of_day <= ev_sec < next_sec_of_day

                if fires:
                    value = float(ev.get('value', 0))
                    model.set_variable_value(variable, value)
                    logger.debug(f"Regimen 触发: {variable}={value} @ t={prev_time:.0f}s (事件时刻 {time_str})")

    def start_session(self, model_name: str, time_hours: float, folder: Optional[str] = None,
                     step_size: Optional[float] = None, input_params: Optional[Dict[str, float]] = None,
                     regimens: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """
        开始一个新的仿真会话（GUI 使用）。
        :param model_name: 模型名称。
        :param time_hours: 仿真总时间（小时）。
        :param folder: 子文件夹名称。
        :param step_size: 时间步长（秒），如果为 None 则使用模型默认值。
        :param input_params: 初始输入参数（可选）。
        :return: 会话信息字典。
        """
        try:
            # 加载模型
            if not self.load_models([model_name], folder):
                return {"success": False, "error": f"无法加载模型：{model_name}"}
            
            # 应用输入参数
            if input_params:
                for var_name, value in input_params.items():
                    if var_name in self.current_model.variables:
                        self.current_model.set_variable_value(var_name, value)
            
            # 生成会话 ID
            session_id = str(uuid.uuid4())
            
            # 获取配置
            if step_size is None:
                step_size = self.current_model.simulator.get('step_size', 3600.0)
            
            total_time = time_hours * 3600.0
            total_steps = int(total_time / step_size)
            output_variables = self.current_model.simulator.get('output_variables', [])
            input_variables = [
                name for name, var in self.current_model.variables.items()
                if var.type.value == 'input'
            ]
            capture_variables = output_variables + [v for v in input_variables if v not in output_variables]
            
            # 创建会话
            self.sessions[session_id] = {
                'model': self.current_model,
                'model_name': model_name,
                'folder': folder,
                'step_size': step_size,
                'total_time': total_time,
                'total_steps': total_steps,
                'current_step': 0,
                'time': 0.0,
                'running': True,
                'output_variables': capture_variables,
                'data': [],  # 存储仿真数据
                'regimens': regimens or [],  # Regimen K×4 计划表
            }
            
            logger.info(f"会话已创建: {session_id}, 模型: {model_name}, 总步数: {total_steps}")
            
            return {
                "success": True,
                "data": {
                    "session_id": session_id,
                    "model_name": model_name,
                    "initial_state": self.current_model.get_current_state(),
                    "step_size": step_size,
                    "total_time": total_time,
                    "total_steps": total_steps,
                    "output_variables": output_variables
                }
            }
        
        except Exception as e:
            logger.error(f"创建会话失败: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    def batch_steps(self, session_id: str, steps: int = 10, 
                   input_changes: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        """
        批量执行多步仿真（GUI 使用）。
        :param session_id: 会话 ID。
        :param steps: 要执行的步数。
        :param input_changes: 动态修改的输入参数（可选）。
        :return: 执行结果字典。
        """
        try:
            # 检查会话是否存在
            if session_id not in self.sessions:
                return {"success": False, "error": f"会话不存在: {session_id}"}
            
            session = self.sessions[session_id]
            
            # 检查会话是否已暂停
            if not session['running']:
                return {"success": False, "error": "会话已暂停"}
            
            model = session['model']
            step_size = session['step_size']
            output_variables = session['output_variables']
            
            # 应用输入变化
            if input_changes:
                for var_name, value in input_changes.items():
                    if var_name in model.variables:
                        model.set_variable_value(var_name, value)
                        # 记录为手动覆盖，防止被计划表自动覆盖
                        model.manual_overrides[var_name] = value
                        logger.info(f"手动覆盖输入: {var_name} = {value}")
            
            # 批量执行
            outputs = []
            remaining_steps = session['total_steps'] - session['current_step']
            actual_steps = min(steps, remaining_steps)
            
            for i in range(actual_steps):
                # 应用 Regimen 计划（时刻触发）
                prev_time = session['time']
                next_time = prev_time + step_size
                self._apply_regimens(model, session['regimens'], prev_time, next_time)

                # 执行单步
                model.step(step_size)
                session['current_step'] += 1
                session['time'] += step_size
                
                # 收集输出数据
                output_data = {
                    'step': session['current_step'],
                    'time': session['time']
                }
                
                for var_name in output_variables:
                    if var_name in model.variables:
                        output_data[var_name] = model.variables[var_name].value
                    else:
                        output_data[var_name] = 0.0
                
                outputs.append(output_data)
                session['data'].append(output_data)
            
            # 检查是否完成
            completed = session['current_step'] >= session['total_steps']
            progress = (session['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0
            
            logger.info(f"批量执行完成: session={session_id}, steps={actual_steps}/{steps}, total={session['current_step']}/{session['total_steps']}")
            
            return {
                "success": True,
                "data": {
                    "session_id": session_id,
                    "current_step": session['current_step'],
                    "progress": round(progress, 2),
                    "final_state": model.get_current_state(),
                    "outputs": outputs,
                    "completed": completed,
                    "steps_executed": len(outputs)
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
                output_dir = os.path.join(self.loader.mods_directory, "output")
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
                "session_id": session_id,
                "model_name": session['model_name'],
                "current_step": session['current_step'],
                "total_steps": session['total_steps'],
                "progress": (session['current_step'] / session['total_steps']) * 100,
                "running": session['running'],
                "data_points": len(session['data'])
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
            output_variables = self.current_model.simulator.get('output_variables', [])
            
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
                    if var_name in self.current_model.variables:
                        row.append(self.current_model.variables[var_name].value)
                    else:
                        row.append(0.0)
                
                csv_data.append(row)
            
            # 写入 CSV 文件
            csv_output_path = output_path
            if not csv_output_path:
                output_dir = os.path.join(self.loader.mods_directory, "output")
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
                "output_variables": output_variables
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