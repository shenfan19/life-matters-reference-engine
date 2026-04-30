# src/models/simulation.py
# 修改记录:
# 1. 修复第 18 行: dt 未定义 → 改为 step_size
# 2. 修复第 63 行: dt 未定义 → 改为 step_size
# 3. 添加备注: 未来支持动态 dt (根据误差自适应调整步长)

from typing import Dict, List, Any
from .base import VariableType, Variable, WINDOW_SECONDS, TIME_UNIT_SECONDS
from .utils import extract_vars_from_expr
import logging

logger = logging.getLogger(__name__)

class Simulation:
    # Simulation
    def _apply_schedules(self, step_size_sec: float = 0.0):
        """
        应用计划表，根据当前仿真时间 self.time 更新变量值。
        step_size_sec: 当前步长（秒），供 pulse 模式使用。
        """
        manual_overrides = getattr(self, 'manual_overrides', {})

        for var_name, schedule in getattr(self, 'schedules', {}).items():
            if var_name in manual_overrides:
                continue

            if not schedule.points:
                continue

            points = schedule.points

            if schedule.interpolation == 'pulse':
                # pulse 模式：仅在事件时间落入本步窗口 [self.time, self.time+step_size_sec) 时生效，其余步为 0
                target_value = 0.0
                for pt in points:
                    if self.time <= pt.time < self.time + step_size_sec:
                        target_value = pt.value
                        break
            else:
                # step / linear 模式（保持向后兼容）
                # 首点之前和末点之后均返回 0，不做 hold
                if self.time < points[0].time or self.time >= points[-1].time:
                    target_value = 0.0
                else:
                    target_value = 0.0
                    for i in range(len(points) - 1):
                        p1 = points[i]
                        p2 = points[i + 1]
                        if p1.time <= self.time < p2.time:
                            if schedule.interpolation == 'linear':
                                t_ratio = (self.time - p1.time) / (p2.time - p1.time)
                                target_value = p1.value + t_ratio * (p2.value - p1.value)
                            else:
                                target_value = p1.value
                            break

            self.set_variable_value(var_name, target_value)

    def _update_accumulators(self, step_size: float):
        """
        更新所有累积器：每步累积来源变量值，在窗口边界处输出结果并重置。

        积分公式：contribution = source_val * (step_size / 86400)
        这给出"每日积分"单位，使得：
          - 日求和 = 每日值本身
          - 周求和 = 7 × 每日值
          - 周均值 = 每日值（相当于日均值）
        """
        for acc_name, acc in getattr(self, 'accumulators', {}).items():
            window_sec = WINDOW_SECONDS.get(acc.window)
            if window_sec is None:
                continue

            source_var = self.variables.get(acc.source)
            if source_var is None:
                logger.warning(f"累积器 '{acc_name}' 的来源变量 '{acc.source}' 不存在，跳过")
                continue

            # 累积本步贡献（归一化为每日积分单位）
            acc.running_sum += source_var.value * (step_size / 86400.0)

            # 检测窗口边界：检查步进前后所在的窗口编号是否改变
            current_window = int(self.time / window_sec)
            next_window    = int((self.time + step_size) / window_sec)

            if next_window != current_window:
                # 到达窗口边界 — 计算并写入输出变量
                if acc.operation == 'sum':
                    result = acc.running_sum
                else:  # 'mean'
                    days_in_window = window_sec / 86400.0
                    result = acc.running_sum / days_in_window if days_in_window > 0 else 0.0

                if acc_name in self.variables:
                    self.set_variable_value(acc_name, result)
                    logger.debug(
                        f"累积器 '{acc_name}' 窗口完成 (t={self.time:.0f}s): "
                        f"{result:.4f} [{acc.operation}/{acc.window}]"
                    )

                # 重置累积状态
                acc.running_sum = 0.0
                acc.window_start_time = self.time + step_size

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

        # 将 step_size（time_unit 单位）转换为秒，供内部时钟和 accumulator 使用
        unit_sec = TIME_UNIT_SECONDS.get(getattr(self, 'time_unit', 'second'), 1.0)
        step_size_sec = step_size * unit_sec

        # 应用计划表（传入秒步长供 pulse 模式使用）
        self._apply_schedules(step_size_sec)

        # 公式中 step/step_size/dt = 声明单位下的步长（作者直觉单位）
        # step 是规范符号；step_size/dt 保留为向后兼容别名
        self.asteval.symtable['step'] = step_size
        self.asteval.symtable['step_size'] = step_size
        self.asteval.symtable['dt'] = step_size
        # 公式中 t/time = 当前时间（声明单位），修复 time 未定义 bug
        self.asteval.symtable['t'] = self.time / unit_sec
        self.asteval.symtable['time'] = self.time / unit_sec
        
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
                # 评估条件
                condition = formula.condition
                if isinstance(condition, str):
                    try:
                        condition = self.asteval.eval(formula.condition, raise_errors=True)
                    except Exception as cond_err:
                        logger.error(f"Error evaluating condition for formula '{form_name}': {formula.condition} -> {cond_err}")
                        continue # 跳过逻辑错误的公式
                
                if condition:
                    # 处理 dynamics
                    for var_name, expr in formula.dynamics.items():
                        try:
                            new_value = self.asteval.eval(expr, raise_errors=True)
                            if new_value is None:
                                logger.warning(f"Formula '{form_name}' evaluated to None for variable '{var_name}' with expression: {expr}")
                                continue

                            if var_name in self.variables:
                                var = self.variables[var_name]
                                # 应用边界约束
                                var.value = max(min(new_value, var.bounds[1] if var.bounds else float('inf')), 
                                            var.bounds[0] if var.bounds else float('-inf'))
                                self.asteval.symtable[var_name] = var.value
                                
                                # 确保 variable_history 已初始化
                                if var_name not in self.variable_history:
                                    self.variable_history[var_name] = []
                                self.variable_history[var_name].append(var.value)
                            else:
                                # 临时变量更新到符号表
                                self.asteval.symtable[var_name] = new_value
                                
                        except Exception as dyn_err:
                            logger.error(f"Error evaluating dynamics for formula '{form_name}', variable '{var_name}': {expr} -> {dyn_err}")
                            continue

                    # 处理 formula
                    if hasattr(formula, 'formula') and formula.formula:
                        try:
                            result = self.asteval.eval(formula.formula, raise_errors=True)
                            formula_results[form_name] = result
                        except Exception as form_err:
                            logger.error(f"Error evaluating formula result for '{form_name}': {formula.formula} -> {form_err}")
            except Exception as e:
                logger.error(f"Unexpected error executing formula '{form_name}': {e}")
                # 不中断整个仿真，只记录错误
        
        # 新增：执行 post_step 钩子
        for hook in self.hooks.get('post_step', []):
            try:
                hook(self)
            except Exception as e:
                logger.warning(f"Post-step hook failed: {e}")
        
        # 更新累积器（在时间推进前；传入秒，保证 WINDOW_SECONDS 归一化正确）
        self._update_accumulators(step_size_sec)

        # 更新步数和时间（self.time 始终以秒计）
        self.current_step += 1
        self.time += step_size_sec
        
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

        # 重置累积器运行状态
        for acc in getattr(self, 'accumulators', {}).values():
            acc.running_sum = 0.0
            acc.window_start_time = 0.0
