# src/models/simulation.py
# 修改记录:
# 1. 修复第 18 行: dt 未定义 → 改为 step_size
# 2. 修复第 63 行: dt 未定义 → 改为 step_size
# 3. 添加备注: 未来支持动态 dt (根据误差自适应调整步长)

from typing import Dict, List, Any
from .base import VariableType, Variable, TIME_UNIT_SECONDS
from .utils import extract_vars_from_expr
import logging
import math as _math
import ast as _ast

logger = logging.getLogger(__name__)

# 方程函数的全局数学环境（作为 exec 的 globals，提供 sin/cos/max 等）
_EQUATION_GLOBALS: Dict[str, Any] = {
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

# 每步由引擎注入的时间/步长符号（不是模型变量，但方程可以引用）
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
        exec(fn_code, _EQUATION_GLOBALS, local_ns)
    except Exception:
        return None, None

    return local_ns['_fn'], params

class Simulation:
    # Simulation
    def _build_equation_cache(self):
        """加载后第一次 step() 前调用，把方程表达式转换为真正的 Python 函数。
        每步直接调用 fn(*args)，变量走 LOAD_FAST 而非字典查找。
        编译失败时 fn=None，step() 回退到 asteval。
        """
        self._sorted_equations = sorted(
            self.equations.items(),
            key=lambda x: x[1].priority,
            reverse=True
        )
        model_vars = frozenset(self.variables.keys())
        compiled = {}

        for eq_name, equation in self._sorted_equations:
            # 条件
            raw_cond = equation.condition
            if isinstance(raw_cond, str):
                cond_fn, cond_params = _compile_expr_to_fn(raw_cond, model_vars)
            else:
                cond_fn, cond_params = None, None  # 布尔/None，直接用原值

            # dynamics：每个变量对应一个函数
            dyn = {}
            for var_name, expr in equation.dynamics.items():
                if isinstance(expr, str):
                    fn, params = _compile_expr_to_fn(expr, model_vars)
                    dyn[var_name] = (fn, params, expr)   # expr 备用回退
                else:
                    dyn[var_name] = (None, None, expr)   # 数值字面量

            compiled[eq_name] = {
                'cond': (raw_cond, cond_fn, cond_params),
                'dyn':  dyn,
            }
        self._equation_cache = compiled

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

        # 方程中 step/step_size/dt = 声明单位下的步长（作者直觉单位）
        # step 是规范符号；step_size/dt 保留为向后兼容别名
        self.asteval.symtable['step'] = declared_step
        self.asteval.symtable['step_size'] = declared_step
        self.asteval.symtable['dt'] = declared_step
        # 方程中 t/time = 当前时间（声明单位），修复 time 未定义 bug
        self.asteval.symtable['t'] = self.time / unit_sec
        self.asteval.symtable['time'] = self.time / unit_sec
        
        # 更新变量到 asteval 符号表
        for var_name, var in self.variables.items():
            self.asteval.symtable[var_name] = var.value
        
        # 第一次调用时把方程编译为函数（只编译一次）
        if not hasattr(self, '_sorted_equations'):
            self._build_equation_cache()

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

        for eq_name, equation in self._sorted_equations:
            try:
                cache = self._equation_cache[eq_name]

                # 跨步长 import：每条方程的 step 按其来源模块自身的
                # step_size 换算（而非当前运行模型的 step_size），
                # 例如 1 小时模型 import 了"每日衰减 1%"的方程，
                # 该方程的 step = 1小时 / 1天 = 1/24。
                equation_step_sec = getattr(equation, 'step_size_sec', None) or step_size_sec
                equation_step = step_size_sec / equation_step_sec if equation_step_sec else declared_step
                step_sym_vals['step'] = equation_step
                step_sym_vals['step_size'] = equation_step
                step_sym_vals['dt'] = equation_step
                self.asteval.symtable['step'] = equation_step
                self.asteval.symtable['step_size'] = equation_step
                self.asteval.symtable['dt'] = equation_step

                # ── 评估条件 ──────────────────────────────────────────────
                raw_cond, cond_fn, cond_params = cache['cond']
                if cond_fn is not None:
                    try:
                        condition = cond_fn(*[_get_arg(n) for n in cond_params])
                    except Exception as cond_err:
                        logger.error(f"Error in condition for '{eq_name}': {cond_err}")
                        continue
                elif isinstance(raw_cond, str):
                    # 编译失败，回退 asteval
                    try:
                        condition = self.asteval.eval(raw_cond, raise_errors=True)
                    except Exception as cond_err:
                        logger.error(f"Error evaluating condition for equation '{eq_name}': {raw_cond} -> {cond_err}")
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
                            logger.warning(f"Equation '{eq_name}' evaluated to None for variable '{var_name}'")
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
                        logger.error(f"Error evaluating dynamics for equation '{eq_name}', variable '{var_name}': {raw_expr} -> {dyn_err}")
                        continue


            except Exception as e:
                logger.error(f"Unexpected error executing equation '{eq_name}': {e}")
        
        # 新增：执行 post_step 钩子
        for hook in self.hooks.get('post_step', []):
            try:
                hook(self)
            except Exception as e:
                logger.warning(f"Post-step hook failed: {e}")
        
        # 更新步数和时间（self.time 始终以秒计）
        self.current_step += 1
        self.time += step_size_sec
        

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

        # 方程缓存在 reset 时不需要重建（方程本身不变），保留即可
