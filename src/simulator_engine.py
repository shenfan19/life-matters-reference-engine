# -*- coding: utf-8 -*-
# 文件名: simulator_engine.py
# 描述: LifeMatters 框架的仿真引擎，负责加载模型、运行仿真、管理仿真状态。
#       本模块通过与 LoaderEngine 交互，执行动态仿真并支持暂停、继续。
#       提供 fitness_func 接口供优化模块调用，支持 ODE 求解器。

import logging
import numpy as np
from typing import Dict, Any, List, Optional, Callable
from scipy.integrate import solve_ivp
from mod_structure import ModStructure
from loader_engine import LoaderEngine

# 初始化模块的日志记录器，用于记录仿真过程中的信息和错误。
logger = logging.getLogger(__name__)

class SimulatorEngine:
    """仿真引擎，负责运行和管理仿真流程，提供黑盒评估接口。"""
    
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

    def run_simulation(self, model_name: str, time_hours: float, folder: Optional[str] = None, 
                      pause_every: int = 0, interactive: bool = False) -> Dict[str, Any]:
        """
        运行仿真主函数。
        :param model_name: 模型名称。
        :param time_hours: 仿真总时间（小时）。
        :param folder: 子文件夹名称。
        :param pause_every: 每隔多少步暂停（0 表示不暂停）。
        :param interactive: 是否启用交互式暂停。
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
        dt = self.current_model.simulator.get('step_size', 3600.0)  # 默认 1 小时
        # 计算总仿真时间（秒）。
        total_time = time_hours * 3600.0
        # 计算总步数。
        total_steps = int(total_time / dt)
        
        # 注册暂停回调（如果启用交互式暂停）。
        if interactive and pause_every > 0:
            self.pause_callback = self._interactive_pause
        
        try:
            # 逐步运行仿真，直到达到指定步数或停止。
            while self.current_step < total_steps and self.running:
                # 执行单步仿真。
                self.current_model.step(dt)
                # 增加步数计数。
                self.current_step += 1
                # 更新仿真时间。
                self.time += dt
                
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
            # 返回仿真结果，包括模型名称、当前状态、步数和时间。
            return {
                "success": True,
                "model_name": self.current_model.metadata.name,
                "state": self.current_model.get_current_state(),
                "steps": self.current_step,
                "time": self.time
            }
        except Exception as e:
            # 记录仿真失败错误。
            logger.error(f"仿真执行失败: {e}")
            # 返回错误信息。
            return {"success": False, "error": str(e)}

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
        dt = self.current_model.simulator.get('step_size', 3600.0)
        # 计算总仿真时间（秒）。
        total_time = time_hours * 3600.0
        # 计算总步数。
        total_steps = int(total_time / dt)
        
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
                    self.current_model.step(dt)
            else:
                # 否则，直接运行指定步数的仿真。
                self.current_model.run_steps(total_steps, dt)
            
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
