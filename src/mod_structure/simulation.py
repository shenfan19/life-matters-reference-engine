# src/models/simulation.py
# 修改记录:
# 1. 修复第 18 行: dt 未定义 → 改为 step_size
# 2. 修复第 63 行: dt 未定义 → 改为 step_size
# 3. 添加备注: 未来支持动态 dt (根据误差自适应调整步长)

from typing import Dict, List, Any
from .base import VariableType, Variable
from .utils import extract_vars_from_expr
import logging

logger = logging.getLogger(__name__)

class Simulation:
    # Simulation
    def step(self, step_size: float = 1.0):
        """
        执行单步仿真
        :param step_size: 时间步长(秒) - TODO: 未来支持动态 dt (自适应步长)
        """
        # 新增：执行 pre_step 钩子
        for hook in self.hooks.get('pre_step', []):
            try:
                hook(self)
            except Exception as e:
                logger.warning(f"Pre-step hook failed: {e}")
        
        # 修复: 设置时间步长到 asteval 符号表 (原代码 dt 未定义)
        self.asteval.symtable['dt'] = step_size  # 兼容旧代码
        self.asteval.symtable['step_size'] = step_size  # 新变量名
        
        # 更新变量到 asteval 符号表
        for var_name, var in self.variables.items():
            self.asteval.symtable[var_name] = var.value
        
        # 按优先级排序公式
        sorted_formulas = sorted(self.formulas.items(), key=lambda x: x[1].priority, reverse=True)
        
        # 存储公式结果
        formula_results = {}  # 存储 formula 字段的结果
        
        # 执行每个公式
        for form_name, formula in sorted_formulas:
            try:
                condition = formula.condition
                if isinstance(condition, str):
                    condition = self.asteval.eval(formula.condition, raise_errors=False)
                    if self.asteval.error:
                        raise ValueError(f"Error evaluating condition for formula {form_name}: {self.asteval.error[0].get_error()[1]}")
                
                if condition:
                    # 处理 dynamics
                    for var_name, expr in formula.dynamics.items():
                        new_value = self.asteval.eval(expr)
                        if var_name in self.variables:
                            var = self.variables[var_name]
                            # 应用边界约束
                            var.value = max(min(new_value, var.bounds[1] if var.bounds else float('inf')), 
                                        var.bounds[0] if var.bounds else float('-inf'))
                            self.asteval.symtable[var_name] = var.value
                            self.variable_history[var_name].append(var.value)
                    
                    # 处理 formula
                    if hasattr(formula, 'formula') and formula.formula:
                        result = self.asteval.eval(formula.formula, raise_errors=False)
                        if self.asteval.error:
                            raise ValueError(f"Error evaluating formula for {form_name}: {self.asteval.error[0].get_error()[1]}")
                        formula_results[form_name] = result
            except Exception as e:
                logger.error(f"Error executing formula {form_name}: {e}")
                raise
        
        # 新增：执行 post_step 钩子
        for hook in self.hooks.get('post_step', []):
            try:
                hook(self)
            except Exception as e:
                logger.warning(f"Post-step hook failed: {e}")
        
        # 更新步数和时间
        self.current_step += 1
        self.time += step_size  # 修复: 原代码使用 dt (未定义)
        
        # 返回公式结果
        return formula_results

    def run_steps(self, steps: int, step_size: float = 1.0):
        """运行指定步数的仿真"""
        for _ in range(steps):
            self.step(step_size)  # 修复: 传递 step_size 参数

    def set_variable_value(self, var_name: str, value: float):
        """设置变量值，并应用边界约束"""
        if var_name in self.variables:
            var = self.variables[var_name]
            # 应用边界约束
            var.value = max(min(value, var.bounds[1] if var.bounds else float('inf')), 
                           var.bounds[0] if var.bounds else float('-inf'))
            self.asteval.symtable[var_name] = var.value
            self.variable_history[var_name].append(var.value)
        else:
            logger.error(f"Variable {var_name} not found")

    def get_current_state(self) -> Dict[str, Any]:
        """获取当前变量状态"""
        return {name: {"value": var.value, "unit": var.unit, "description": var.description, "type": var.type.value} 
                for name, var in self.variables.items()}

    def get_controllable_variables(self) -> Dict[str, Variable]:
        """获取可控制变量（输入和参数类型）"""
        return {name: var for name, var in self.variables.items() 
                if var.type in [VariableType.input, VariableType.PARAMETER]}

    def set_parameters(self, params: List[float]):
        """设置参数值"""
        controllable_vars = self.get_controllable_variables()
        for i, (var_name, var) in enumerate(controllable_vars.items()):
            if i < len(params):
                self.set_variable_value(var_name, params[i])

    def get_objective(self, target: str) -> float:
        """获取目标函数值，根据目标类型计算"""
        state = self.get_current_state()
        if target == 'min_error':
            target_values = {'blood_glucose': 100}
            return sum((state.get(k, {'value': 0})['value'] - v) ** 2 for k, v in target_values.items())
        elif target == 'max_lifespan':
            return -len(self.variable_history[list(self.variables.keys())[0]])
        return float('inf')

    def reset_simulation(self):
        """重置仿真状态到初始值"""
        for var_name, var in self.variables.items():
            if var_name in self.variable_history and self.variable_history[var_name]:
                var.value = self.variable_history[var_name][0]
                self.asteval.symtable[var_name] = var.value
        
        self.current_step = 0
        self.time = 0.0
        
        # 重置历史记录（保留初始值）
        for var_name in self.variable_history:
            if self.variable_history[var_name]:
                initial_value = self.variable_history[var_name][0]
                self.variable_history[var_name] = [initial_value]
