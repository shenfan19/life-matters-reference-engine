# src/models/simulation.py
# Change log:
# 1. Fixed line 18: dt was undefined -> changed to step_size
# 2. Fixed line 63: dt was undefined -> changed to step_size
# 3. Added a note: future support for a dynamic dt (adaptive step size based on error)

from typing import Dict, List, Any
from .base import VariableType, Variable, TIME_UNIT_SECONDS
from .utils import extract_vars_from_expr
import logging
import math as _math
import ast as _ast

logger = logging.getLogger(__name__)

# The global math environment for equation functions (used as exec's globals, providing sin/cos/max, etc.)
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

# The time/step-size symbols injected by the engine every step (not model variables, but equations can reference them)
_STEP_SYMS = frozenset({
    'step', 'step_size', 'dt', 't', 'time',
    'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR',
})


def _compile_expr_to_fn(expr_str: str, model_var_names: frozenset):
    """Compiles an expression string into a Python function, returning (fn, param_names) or (None, None).
    param_names is an ordered list of parameter names; the current values are passed positionally at call time.
    """
    try:
        tree = _ast.parse(expr_str, mode='eval')
    except SyntaxError:
        return None, None

    # Extract all names referenced in the expression
    all_names = {node.id for node in _ast.walk(tree) if isinstance(node, _ast.Name)}

    # Split into model-variable parameters + step-size-symbol parameters (math functions are in globals, not parameters)
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
        """Called before the first step() after loading, converting equation expressions into real Python functions.
        Every step calls fn(*args) directly, with variables going through LOAD_FAST rather than a dict lookup.
        On a compilation failure fn=None, and step() falls back to asteval.
        """
        self._sorted_equations = sorted(
            self.equations.items(),
            key=lambda x: x[1].priority,
            reverse=True
        )
        model_vars = frozenset(self.variables.keys())
        compiled = {}

        for eq_name, equation in self._sorted_equations:
            # The condition
            raw_cond = equation.condition
            if isinstance(raw_cond, str):
                cond_fn, cond_params = _compile_expr_to_fn(raw_cond, model_vars)
            else:
                cond_fn, cond_params = None, None  # a bool/None, used directly

            # dynamics: one function per variable
            dyn = {}
            for var_name, expr in equation.dynamics.items():
                if isinstance(expr, str):
                    fn, params = _compile_expr_to_fn(expr, model_vars)
                    dyn[var_name] = (fn, params, expr)   # expr kept as a fallback
                else:
                    dyn[var_name] = (None, None, expr)   # a numeric literal

            compiled[eq_name] = {
                'cond': (raw_cond, cond_fn, cond_params),
                'dyn':  dyn,
            }
        self._equation_cache = compiled

    def step(self, step_size: float = 1.0):
        """
        Executes a single simulation step
        :param step_size: the time step size (in seconds) - TODO: future support for a dynamic dt (adaptive step size)
        """
        # Run the pre_step hooks
        for hook in self.hooks.get('pre_step', []):
            try:
                hook(self)
            except Exception as e:
                logger.warning(f"Pre-step hook failed: {e}")

        # The step_size argument is already in seconds (the caller passes in simulator['step_size'] = raw_step * unit_sec)
        unit_sec = TIME_UNIT_SECONDS.get(getattr(self, 'time_unit', 'minute'), 60.0)
        step_size_sec = step_size
        # The step size in the declared unit (the author's intuitive unit), e.g. step=1 for a 1-day model, step=1 for a 1-hour model
        declared_step = step_size_sec / unit_sec if unit_sec else step_size_sec

        # In an equation, step/step_size/dt = the step size in the declared unit (the author's intuitive unit)
        # step is the canonical symbol; step_size/dt are kept as backward-compatible aliases
        self.asteval.symtable['step'] = declared_step
        self.asteval.symtable['step_size'] = declared_step
        self.asteval.symtable['dt'] = declared_step
        # In an equation, t/time = the current time (in the declared unit); fixes the previously-undefined time bug
        self.asteval.symtable['t'] = self.time / unit_sec
        self.asteval.symtable['time'] = self.time / unit_sec

        # Update variables into the asteval symbol table
        for var_name, var in self.variables.items():
            self.asteval.symtable[var_name] = var.value

        # On the first call, compile the equations into functions (compiled only once)
        if not hasattr(self, '_sorted_equations'):
            self._build_equation_cache()

        # The time/step-size values injected each step (for _get_arg to look up)
        step_sym_vals = {
            'step': declared_step, 'step_size': declared_step, 'dt': declared_step,
            't': self.time / unit_sec, 'time': self.time / unit_sec,
            'MINUTE': 60.0, 'HOUR': 3600.0, 'DAY': 86400.0,
            'WEEK': 604800.0, 'MONTH': 2592000.0, 'YEAR': 31536000.0,
        }

        def _get_arg(name: str) -> float:
            """Gets the current value by parameter name: model variables first, then step-size symbols."""
            v = self.variables.get(name)
            if v is not None:
                return v.value
            return step_sym_vals.get(name, 0.0)

        for eq_name, equation in self._sorted_equations:
            try:
                cache = self._equation_cache[eq_name]

                # Cross-step-size import: each equation's step is converted according to its own
                # source module's step_size (not the currently running model's step_size) —
                # for example, a 1-hour model imports an equation for "a 1% daily decay",
                # and that equation's step = 1 hour / 1 day = 1/24.
                equation_step_sec = getattr(equation, 'step_size_sec', None) or step_size_sec
                equation_step = step_size_sec / equation_step_sec if equation_step_sec else declared_step
                step_sym_vals['step'] = equation_step
                step_sym_vals['step_size'] = equation_step
                step_sym_vals['dt'] = equation_step
                self.asteval.symtable['step'] = equation_step
                self.asteval.symtable['step_size'] = equation_step
                self.asteval.symtable['dt'] = equation_step

                # ── Evaluate the condition ──────────────────────────────────
                raw_cond, cond_fn, cond_params = cache['cond']
                if cond_fn is not None:
                    try:
                        condition = cond_fn(*[_get_arg(n) for n in cond_params])
                    except Exception as cond_err:
                        logger.error(f"Error in condition for '{eq_name}': {cond_err}")
                        continue
                elif isinstance(raw_cond, str):
                    # Compilation failed, fall back to asteval
                    try:
                        condition = self.asteval.eval(raw_cond, raise_errors=True)
                    except Exception as cond_err:
                        logger.error(f"Error evaluating condition for equation '{eq_name}': {raw_cond} -> {cond_err}")
                        continue
                else:
                    condition = raw_cond if raw_cond is not None else True

                if not condition:
                    continue

                # ── Process dynamics ─────────────────────────────────────────
                for var_name, (fn, params, raw_expr) in cache['dyn'].items():
                    try:
                        if fn is not None:
                            new_value = fn(*[_get_arg(n) for n in params])
                        elif isinstance(raw_expr, str):
                            new_value = self.asteval.eval(raw_expr, raise_errors=True)
                        else:
                            new_value = raw_expr  # a numeric literal

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

        # Run the post_step hooks
        for hook in self.hooks.get('post_step', []):
            try:
                hook(self)
            except Exception as e:
                logger.warning(f"Post-step hook failed: {e}")

        # Update the step count and time (self.time is always in seconds)
        self.current_step += 1
        self.time += step_size_sec


    def run_steps(self, steps: int, step_size: float = 1.0):
        """Runs the simulation for the given number of steps"""
        for _ in range(steps):
            self.step(step_size)  # fix: pass the step_size argument through

    def set_variable_value(self, var_name: str, value: float):
        """Sets a variable's value, applying its bounds constraint"""
        if var_name in self.variables:
            var = self.variables[var_name]
            # Apply the bounds constraint
            var.value = max(min(value, var.bounds[1] if var.bounds else float('inf')),
                           var.bounds[0] if var.bounds else float('-inf'))
            self.asteval.symtable[var_name] = var.value
            self.variable_history[var_name].append(var.value)
        else:
            logger.error(f"Variable {var_name} not found")

    def get_current_state(self) -> Dict[str, Any]:
        """Gets the current variable state"""
        return {name: {"value": var.value, "unit": var.unit, "description": var.description, "type": var.type.value}
                for name, var in self.variables.items()}

    def get_controllable_variables(self) -> Dict[str, Variable]:
        """Gets the controllable variables (input and parameter types)"""
        return {name: var for name, var in self.variables.items()
                if var.type in [VariableType.input, VariableType.PARAMETER]}

    def set_parameters(self, params: List[float]):
        """Sets parameter values"""
        controllable_vars = self.get_controllable_variables()
        for i, (var_name, var) in enumerate(controllable_vars.items()):
            if i < len(params):
                self.set_variable_value(var_name, params[i])

    def get_objective(self, target: str) -> float:
        """Returns the current value of the given variable as the objective function (by convention, smaller is better)"""
        if target in self.variables:
            return float(self.variables[target].value)
        return float('inf')

    def reset_simulation(self):
        """Resets the simulation state to its initial values"""
        for var_name, var in self.variables.items():
            if var_name in self.variable_history and self.variable_history[var_name]:
                var.value = self.variable_history[var_name][0]
                self.asteval.symtable[var_name] = var.value

        self.current_step = 0
        self.time = 0.0

        # Reset history (keeping the initial value)
        for var_name in self.variable_history:
            if self.variable_history[var_name]:
                initial_value = self.variable_history[var_name][0]
                self.variable_history[var_name] = [initial_value]

        # The equation cache doesn't need to be rebuilt on reset (the equations themselves don't change), keep it as-is
