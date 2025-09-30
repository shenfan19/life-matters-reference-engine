# -*- coding: utf-8 -*-
# 文件名: optimizer_engine.py
# 描述: LifeMatters 框架的优化引擎，负责模型参数优化，支持实时调整和输入变量建议。
#       通过与 ModStructure 交互，执行目标函数优化，并提供钩子和回调机制以支持动态调整。

import logging
import numpy as np
from typing import Dict, Any, List, Callable
from mod_structure import ModStructure, VariableType

# 初始化模块的日志记录器，用于记录优化过程中的信息和错误。
logger = logging.getLogger(__name__)

class OptimizerEngine:
    """优化引擎，负责参数优化，支持钩子实时调整和建议。"""
    
    def __init__(self, model: ModStructure, target: str = 'min_error'):
        # 初始化优化引擎，设置模型和优化目标。
        self.model = model
        self.target = target
        # 记录优化迭代次数。
        self.iteration = 0
        # 存储优化历史，包括每次迭代的参数和目标值。
        self.history = []
        # 初始化调整回调函数，默认为 None。
        self.adjustment_callback: Optional[Callable[[ModStructure], Dict[str, Any]]] = None  # 新增：调整回调

    def objective(self, params: np.ndarray) -> float:
        """目标函数，评估参数组合（支持单步或全步）。"""
        # 重置模型的仿真状态。
        self.model.reset_simulation()
        # 设置模型的参数。
        self.model.set_parameters(params.tolist())
        # 运行 60 步仿真，步长为 1.0（步数可配置）。
        self.model.run_steps(60, 1.0)  # 可配置步数
        # 获取目标函数值。
        value = self.model.get_objective(self.target)
        # 增加迭代计数。
        self.iteration += 1
        # 记录当前迭代的参数和目标值。
        self.history.append({'iteration': self.iteration, 'params': params.tolist(), 'value': value})
        # 返回目标函数值。
        return value

    def compute_adjustment(self, state: Dict[str, Any]) -> List[float]:
        """基于当前状态计算调整（实时版本，使用简单网格搜索）。"""
        # 获取模型中可控制的变量。
        controllable_vars = self.model.get_controllable_variables()
        num_vars = len(controllable_vars)
        # 如果没有可控制变量，返回空列表。
        if num_vars == 0:
            return []
        # 获取每个变量的边界，若无边界则使用默认值 [0, 1]。
        bounds = [(var.bounds[0] if var.bounds else 0, var.bounds[1] if var.bounds else 1) for var in controllable_vars.values()]
        from scipy.optimize import brute
        def partial_objective(params):
            # 模拟单步影响
            # 设置参数并执行单步仿真。
            self.model.set_parameters(params)
            self.model.step(1.0)  # 单步评估
            # 返回目标函数值。
            return self.model.get_objective(self.target)
        # 使用低分辨率网格搜索（Ns=3）快速计算最优参数。
        result = brute(partial_objective, ranges=bounds, Ns=3, full_output=False)  # 低分辨率快速搜索
        # 返回调整后的参数列表。
        return result.tolist()

    def suggest_inputs(self, state: Dict[str, Any], target: str = 'min_error') -> Dict[str, float]:
        """生成 input 变量建议（优先 input 类型）。"""
        suggestions = {}
        # 筛选类型为 INPUT 的可控制变量。
        input_vars = {name: var for name, var in self.model.get_controllable_variables().items() if var.type == VariableType.INPUT}
        # 如果存在输入变量，计算调整建议。
        if input_vars:
            # 获取当前状态的输入变量值。
            params = [state[name]['value'] for name in input_vars.keys()]
            # 计算调整后的参数，仅保留输入变量部分。
            adjusted = self.compute_adjustment(state)[:len(input_vars)]  # 仅取 input 部分
            # 将调整后的值分配给对应的输入变量。
            for i, name in enumerate(input_vars.keys()):
                suggestions[name] = adjusted[i] if i < len(adjusted) else params[i]
        # 返回输入变量的建议值字典。
        return suggestions

    def adjustment_hook(self, model: ModStructure) -> None:
        """post_step 钩子：获取状态，调整 parameter 和 input。"""
        # 如果未注册调整回调，直接返回。
        if not self.adjustment_callback:
            return
        # 获取模型当前状态。
        state = model.get_current_state()
        # 调用调整回调函数获取调整建议。
        adjustments = self.adjustment_callback(model)  # 可自定义回调
        # 应用调整，设置变量的新值。
        for var_name, value in adjustments.items():
            model.set_variable_value(var_name, value)
        # 记录调整日志。
        logger.info(f"Optimizer adjusted variables: {adjustments}")

    def register_adjustment(self, callback: Callable[[ModStructure], Dict[str, Any]]) -> None:
        """注册调整回调（例如，lambda model: {'param1': new_value}）。"""
        # 设置调整回调函数。
        self.adjustment_callback = callback

    def optimize(self, initial_params: List[float], bounds: List[tuple], method: str = 'scipy-grid') -> Dict[str, Any]:
        """原有全仿真优化方法（不变）。"""
        try:
            # 如果使用 scipy-grid 方法，执行网格搜索优化。
            if method == 'scipy-grid':
                from scipy.optimize import brute
                # 使用网格搜索（Ns=10）优化目标函数。
                result = brute(self.objective, ranges=bounds, Ns=10, full_output=True)
                # 返回优化成功的参数和目标值。
                return {'success': True, 'params': result[0].tolist(), 'value': float(result[1])}
            else:
                # 如果方法不支持，记录错误并返回失败信息。
                logger.error(f"Unsupported optimization method: {method}")
                return {'success': False, 'error': f"Unsupported method: {method}"}
        except Exception as e:
            # 如果优化过程中发生异常，记录错误并返回失败信息。
            logger.error(f"Optimization failed: {e}")
            return {'success': False, 'error': str(e)}