# src/models/simulation.py
# 修改记录:
# 1. 修复第 18 行: dt 未定义 → 改为 step_size
# 2. 修复第 63 行: dt 未定义 → 改为 step_size
# 3. 添加备注: 未来支持动态 dt (根据误差自适应调整步长)

from typing import Dict, List, Any
from .base import VariableType, Variable, WINDOW_SECONDS, TIME_UNIT_SECONDS
from .utils import extract_vars_from_expr
import logging
import math as _math
import ast as _ast

logger = logging.getLogger(__name__)

# 公式函数的全局数学环境（作为 exec 的 globals，提供 sin/cos/max 等）
_FORMULA_GLOBALS: Dict[str, Any] = {
    '__builtins__': {},
    'math': _math,
    'sin': _math.sin, 'cos': _math.cos, 'tan': _math.tan,
    'asin': _math.asin, 'acos': _math.acos, 'atan': _math.atan, 'atan2': _math.atan2,
    'exp': _math.exp, 'log': _math.log, 'log10': _math.log10,
    'sqrt': _math.sqrt, 'pow': pow, 'ceil': _math.ceil, 'floor': _math.floor,
    'abs': abs, 'max': max, 'min': min, 'round': round,
    'True': True, 'False': False, 'None': None,
    'pi': _math.pi, 'e': _math.e,
}

# 每步由引擎注入的时间/步长符号（不是模型变量，但公式可以引用）
_STEP_SYMS = frozenset({
    'step', 'step_size', 'dt', 't', 'time',
    'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR',
})


def _compile_expr_to_fn(expr_str: str, model_var_names: frozenset):
    """把表达式字符串编译成 Python 函数，返回 (fn, param_names) 或 (None, None)。
    param_names 是有序的参数名列表，调用时按位置传入当前值。
    """
    try:
        tree = _ast.parse(expr_str, mode='eval')
    except SyntaxError:
        return None, None

    # 提取表达式中引用的所有名字
    all_names = {node.id for node in _ast.walk(tree) if isinstance(node, _ast.Name)}

    # 分成模型变量参数 + 步长符号参数（math 函数在 globals 里，不作参数）
    var_params = sorted(all_names & model_var_names)
    step_params = sorted(all_names & _STEP_SYMS)
    params = var_params + step_params

    param_str = ', '.join(params) if params else ''
    fn_code = f'def _fn({param_str}): return {expr_str}'

    local_ns: Dict = {}
    try:
        exec(fn_code, _FORMULA_GLOBALS, local_ns)
    except Exception:
        return None, None

    return local_ns['_fn'], params

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
                # pulse 模式：累加本步窗口 [self.time, self.time+step_size_sec) 内所有事件值
                target_value = 0.0
                for pt in points:
                    if self.time <= pt.time < self.time + step_size_sec:
                        target_value += pt.value
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

    def _build_formula_cache(self):
        """加载后第一次 step() 前调用，把公式表达式转换为真正的 Python 函数。
        每步直接调用 fn(*args)，变量走 LOAD_FAST 而非字典查找。
        编译失败时 fn=None，step() 回退到 asteval。
        """
        self._sorted_formulas = sorted(
            self.formulas.items(),
            key=lambda x: x[1].priority,
            reverse=True
        )
        model_vars = frozenset(self.variables.keys())
        compiled = {}

        for form_name, formula in self._sorted_formulas:
            # 条件
            raw_cond = formula.condition
            if isinstance(raw_cond, str):
                cond_fn, cond_params = _compile_expr_to_fn(raw_cond, model_vars)
            else:
                cond_fn, cond_params = None, None  # 布尔/None，直接用原值

            # dynamics：每个变量对应一个函数
            dyn = {}
            for var_name, expr in formula.dynamics.items():
                if isinstance(expr, str):
                    fn, params = _compile_expr_to_fn(expr, model_vars)
                    dyn[var_name] = (fn, params, expr)   # expr 备用回退
                else:
                    dyn[var_name] = (None, None, expr)   # 数值字面量

            # formula 字段：单个字符串表达式 → 结果存入 formula_results[form_name]；
            # {var_name: expr} 字典 → 语义同 dynamics，直接写回对应变量（无 step 累积）。
            raw_f = getattr(formula, 'formula', None)
            formula_dyn = {}
            if isinstance(raw_f, str) and raw_f:
                f_fn, f_params = _compile_expr_to_fn(raw_f, model_vars)
            else:
                f_fn, f_params = None, None
                if isinstance(raw_f, dict):
                    for var_name, expr in raw_f.items():
                        if isinstance(expr, str):
                            fn, params = _compile_expr_to_fn(expr, model_vars)
                            formula_dyn[var_name] = (fn, params, expr)
                        else:
                            formula_dyn[var_name] = (None, None, expr)

            compiled[form_name] = {
                'cond':    (raw_cond, cond_fn, cond_params),
                'dyn':     dyn,
                'formula': (raw_f, f_fn, f_params),
                'formula_dyn': formula_dyn,
            }
        self._formula_cache = compiled

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

        # step_size 入参已经是秒（调用方传入 simulator['step_size'] = raw_step * unit_sec）
        unit_sec = TIME_UNIT_SECONDS.get(getattr(self, 'time_unit', 'minute'), 60.0)
        step_size_sec = step_size
        # 声明单位下的步长（作者直觉单位），如 1 day 模型 step=1，1 hour 模型 step=1
        declared_step = step_size_sec / unit_sec if unit_sec else step_size_sec

        # 应用计划表（传入秒步长供 pulse 模式使用）
        self._apply_schedules(step_size_sec)

        # 公式中 step/step_size/dt = 声明单位下的步长（作者直觉单位）
        # step 是规范符号；step_size/dt 保留为向后兼容别名
        self.asteval.symtable['step'] = declared_step
        self.asteval.symtable['step_size'] = declared_step
        self.asteval.symtable['dt'] = declared_step
        # 公式中 t/time = 当前时间（声明单位），修复 time 未定义 bug
        self.asteval.symtable['t'] = self.time / unit_sec
        self.asteval.symtable['time'] = self.time / unit_sec
        
        # 更新变量到 asteval 符号表
        for var_name, var in self.variables.items():
            self.asteval.symtable[var_name] = var.value
        
        # 第一次调用时把公式编译为函数（只编译一次）
        if not hasattr(self, '_sorted_formulas'):
            self._build_formula_cache()

        # 每步注入的时间/步长值（供 _get_arg 查询）
        step_sym_vals = {
            'step': declared_step, 'step_size': declared_step, 'dt': declared_step,
            't': self.time / unit_sec, 'time': self.time / unit_sec,
            'MINUTE': 60.0, 'HOUR': 3600.0, 'DAY': 86400.0,
            'WEEK': 604800.0, 'MONTH': 2592000.0, 'YEAR': 31536000.0,
        }

        def _get_arg(name: str) -> float:
            """按参数名取当前值：优先从模型变量，其次从步长符号。"""
            v = self.variables.get(name)
            if v is not None:
                return v.value
            return step_sym_vals.get(name, 0.0)

        formula_results = {}

        for form_name, formula in self._sorted_formulas:
            try:
                cache = self._formula_cache[form_name]

                # 跨步长 import：每条公式的 step 按其来源模块自身的
                # step_size 换算（而非当前运行模型的 step_size），
                # 例如 1 小时模型 import 了"每日衰减 1%"的公式，
                # 该公式的 step = 1小时 / 1天 = 1/24。
                formula_step_sec = getattr(formula, 'step_size_sec', None) or step_size_sec
                formula_step = step_size_sec / formula_step_sec if formula_step_sec else declared_step
                step_sym_vals['step'] = formula_step
                step_sym_vals['step_size'] = formula_step
                step_sym_vals['dt'] = formula_step
                self.asteval.symtable['step'] = formula_step
                self.asteval.symtable['step_size'] = formula_step
                self.asteval.symtable['dt'] = formula_step

                # ── 评估条件 ──────────────────────────────────────────────
                raw_cond, cond_fn, cond_params = cache['cond']
                if cond_fn is not None:
                    try:
                        condition = cond_fn(*[_get_arg(n) for n in cond_params])
                    except Exception as cond_err:
                        logger.error(f"Error in condition for '{form_name}': {cond_err}")
                        continue
                elif isinstance(raw_cond, str):
                    # 编译失败，回退 asteval
                    try:
                        condition = self.asteval.eval(raw_cond, raise_errors=True)
                    except Exception as cond_err:
                        logger.error(f"Error evaluating condition for formula '{form_name}': {raw_cond} -> {cond_err}")
                        continue
                else:
                    condition = raw_cond if raw_cond is not None else True

                if not condition:
                    continue

                # ── 处理 dynamics ─────────────────────────────────────────
                for var_name, (fn, params, raw_expr) in cache['dyn'].items():
                    try:
                        if fn is not None:
                            new_value = fn(*[_get_arg(n) for n in params])
                        elif isinstance(raw_expr, str):
                            new_value = self.asteval.eval(raw_expr, raise_errors=True)
                        else:
                            new_value = raw_expr  # 数值字面量

                        if new_value is None:
                            logger.warning(f"Formula '{form_name}' evaluated to None for variable '{var_name}'")
                            continue

                        if var_name in self.variables:
                            var = self.variables[var_name]
                            var.value = max(min(new_value,
                                               var.bounds[1] if var.bounds else float('inf')),
                                            var.bounds[0] if var.bounds else float('-inf'))
                            self.asteval.symtable[var_name] = var.value
                            if var_name not in self.variable_history:
                                self.variable_history[var_name] = []
                            self.variable_history[var_name].append(var.value)
                        else:
                            self.asteval.symtable[var_name] = new_value

                    except Exception as dyn_err:
                        logger.error(f"Error evaluating dynamics for formula '{form_name}', variable '{var_name}': {raw_expr} -> {dyn_err}")
                        continue

                # ── 处理 formula 字段中的 {var_name: expr} 字典形式 ────────
                # 语义同 dynamics（直接写回变量），但不参与 formula_results。
                for var_name, (fn, params, raw_expr) in cache.get('formula_dyn', {}).items():
                    try:
                        if fn is not None:
                            new_value = fn(*[_get_arg(n) for n in params])
                        elif isinstance(raw_expr, str):
                            new_value = self.asteval.eval(raw_expr, raise_errors=True)
                        else:
                            new_value = raw_expr  # 数值字面量

                        if new_value is None:
                            logger.warning(f"Formula '{form_name}' evaluated to None for variable '{var_name}'")
                            continue

                        if var_name in self.variables:
                            var = self.variables[var_name]
                            var.value = max(min(new_value,
                                               var.bounds[1] if var.bounds else float('inf')),
                                            var.bounds[0] if var.bounds else float('-inf'))
                            self.asteval.symtable[var_name] = var.value
                            if var_name not in self.variable_history:
                                self.variable_history[var_name] = []
                            self.variable_history[var_name].append(var.value)
                        else:
                            self.asteval.symtable[var_name] = new_value

                    except Exception as form_dyn_err:
                        logger.error(f"Error evaluating formula field for '{form_name}', variable '{var_name}': {raw_expr} -> {form_dyn_err}")
                        continue

                # ── 处理 formula 字段 ─────────────────────────────────────
                raw_f, f_fn, f_params = cache['formula']
                if f_fn is not None:
                    try:
                        formula_results[form_name] = f_fn(*[_get_arg(n) for n in f_params])
                    except Exception as form_err:
                        logger.error(f"Error evaluating formula result for '{form_name}': {form_err}")
                elif isinstance(raw_f, str) and raw_f:
                    try:
                        formula_results[form_name] = self.asteval.eval(raw_f, raise_errors=True)
                    except Exception as form_err:
                        logger.error(f"Error evaluating formula result for '{form_name}': {raw_f} -> {form_err}")

            except Exception as e:
                logger.error(f"Unexpected error executing formula '{form_name}': {e}")
        
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
        """返回指定变量的当前值作为目标函数（越小越好的约定）"""
        if target in self.variables:
            return float(self.variables[target].value)
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

        # 公式缓存在 reset 时不需要重建（公式本身不变），保留即可
