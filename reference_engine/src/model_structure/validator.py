# src/models/validator.py
from .base import VariableType, Variable
from .utils import extract_vars_from_expr
from typing import Dict, Set, List
from asteval import Interpreter
import logging

logger = logging.getLogger(__name__)

class Validator:
    def validate_model(self) -> bool:
        # Validates the model's completeness and consistency
        all_errors = []
        unique_missing_vars = set()  # use a set for automatic dedup

        # Check time-unit usage
        time_units = {'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'}
        for eq_name, equation in self.equations.items():
            if isinstance(equation.condition, str):
                vars_in_condition = self.extract_vars_from_expr(equation.condition)
                if 'dt' in vars_in_condition and not (vars_in_condition & time_units):
                    logger.warning(f"Equation {eq_name}: 'dt' used in condition without time unit (e.g., HOUR). Assuming dt in model's native time unit.")
            for var_name, expr in equation.dynamics.items():
                if isinstance(expr, (int, float)):
                    expr = str(expr)
                vars_in_expr = self.extract_vars_from_expr(expr)
                if 'dt' in vars_in_expr and not (vars_in_expr & time_units):
                    logger.warning(f"Equation {eq_name}: 'dt' used in dynamics for {var_name} without time unit (e.g., HOUR). Assuming dt in model's native time unit.")

        # Validate simulator
        if self.simulator:
            sim_step = self.simulator.get('step_size')
            if not isinstance(sim_step, (int, float)) or sim_step <= 0:
                all_errors.append("simulation.step_size is required and must be a positive number (in seconds). Declare step_size: {value, unit} in the simulation block.")
            if 'dt' in self.simulator and (not isinstance(self.simulator['dt'], (int, float)) or self.simulator['dt'] <= 0):
                all_errors.append("simulator.dt must be a positive number.")
            if 'dt_unit' in self.simulator and self.simulator['dt_unit'] not in ['minute', 'hour', 'day', 'week', 'month', 'year']:
                all_errors.append("simulator.dt_unit is invalid.")

        # Validate optimizer (changed: dropped the type restriction, only checks existence)
        if self.optimizer:
            if 'method' not in self.optimizer:
                all_errors.append("optimization is missing method.")
            def _check_opt_var(param, section: str):
                """
                Validates a single optimization-variable entry:
                  - string format: checks directly whether it is in self.variables
                  - dict format:   if maps_to is present, validates the variable it points to exists
                                    (in the format "var_name @ ..."); if maps_to is absent, validates
                                    that the name field itself exists in self.variables
                """
                if isinstance(param, str):
                    if param not in self.variables:
                        all_errors.append(f"optimization.{section}: '{param}' is missing from variables.")
                        unique_missing_vars.add(param)
                elif isinstance(param, dict):
                    maps_to = param.get('maps_to', '')
                    name = param.get('name', '')
                    if maps_to:
                        # Extract the variable name from "var_name @ [t1, t2]" or "var_name @ t"
                        target_var = maps_to.split('@')[0].strip()
                        if target_var and target_var not in self.variables:
                            all_errors.append(
                                f"optimization.{section}: '{name}' maps_to target '{target_var}' is missing from variables."
                            )
                            unique_missing_vars.add(target_var)
                    elif name and name not in self.variables:
                        all_errors.append(f"optimization.{section}: '{name}' is missing from variables.")
                        unique_missing_vars.add(name)

            if 'variables_to_optimize' in self.optimizer:
                for param in self.optimizer['variables_to_optimize']:
                    _check_opt_var(param, 'variables_to_optimize')
            if 'parameters_to_optimize' in self.optimizer:
                for param in self.optimizer['parameters_to_optimize']:
                    _check_opt_var(param, 'parameters_to_optimize')

        def validate_metadata() -> tuple[bool, list[str], list[dict]]:
            errors = []
            is_valid = True
            if self.metadata is None:
                return True, errors, []
            if hasattr(self.metadata, 'name') and not isinstance(self.metadata.name, str):
                errors.append(f"Metadata name must be a string, got {type(self.metadata.name).__name__}")
                is_valid = False
            if hasattr(self.metadata, 'version') and not isinstance(self.metadata.version, str):
                errors.append(f"Metadata version must be a string, got {type(self.metadata.version).__name__}")
                is_valid = False
            if hasattr(self.metadata, 'author') and not isinstance(self.metadata.author, str):
                errors.append(f"Metadata author must be a string, got {type(self.metadata.author).__name__}")
                is_valid = False
            if hasattr(self.metadata, 'description') and not isinstance(self.metadata.description, (str, dict)):
                errors.append(f"Metadata description must be a string or dict, got {type(self.metadata.description).__name__}")
                is_valid = False
            return is_valid, errors, []

        # Validate variables (simplified: checks the overall definition)
        def validate_variables() -> tuple[bool, list[str], list[dict]]:
            errors = []
            missing_vars = []  # moved here, focused on the overall missing set
            is_valid = True
            for var_name, var in self.variables.items():
                if not isinstance(var.description, str):
                    errors.append(f"Variable {var_name} description must be a string, got {type(var.description).__name__}")
                    is_valid = False
                if not isinstance(var.value, (int, float)):
                    errors.append(f"Variable {var_name} value must be a number, got {type(var.value).__name__}")
                    is_valid = False
                if not isinstance(var.type, VariableType):
                    errors.append(f"Variable {var_name} type must be a VariableType, got {type(var.type).__name__}")
                    is_valid = False
                if var.unit is not None and not isinstance(var.unit, str):
                    errors.append(f"Variable {var_name} unit must be a string or None, got {type(var.unit).__name__}")
                    is_valid = False
                if var.bounds is not None:
                    if not isinstance(var.bounds, (list, tuple)) or len(var.bounds) != 2:
                        errors.append(f"Variable {var_name} bounds must be a list or tuple of length 2")
                        is_valid = False
                    elif not all(isinstance(b, (int, float)) for b in var.bounds):
                        errors.append(f"Variable {var_name} bounds must contain numbers, got {var.bounds}")
                        is_valid = False
                    elif var.bounds[0] > var.bounds[1]:
                        errors.append(f"Variable {var_name} bounds invalid: lower bound {var.bounds[0]} > upper bound {var.bounds[1]}")
                        is_valid = False
                    elif not (var.bounds[0] <= var.value <= var.bounds[1]):
                        errors.append(f"Variable {var_name} value {var.value} out of bounds {var.bounds}")
                        is_valid = False
                if not var_name.replace('.', '_').isidentifier():
                    errors.append(f"Variable name {var_name} is not a valid Python identifier")
                    is_valid = False
            return is_valid, errors, missing_vars

        def validate_equations_old_ver_bug() -> tuple[bool, list[str], list[dict]]:
            errors = []
            missing_vars = []
            is_valid = True

            def extract_undefined_variable(error_msg: str) -> str:
                if "name '" in error_msg and "' is not defined" in error_msg:
                    start = error_msg.find("name '") + 6
                    end = error_msg.find("' is not defined")
                    return error_msg[start:end]
                return ""

            def collect_undefined_vars(expr: str, context: str) -> List[dict]:
                undefined_vars = []
                temp_asteval = Interpreter()
                temp_asteval.symtable.update(self.asteval.symtable)
                while True:
                    temp_asteval.error = None
                    try:
                        temp_asteval.eval(expr, raise_errors=False)
                        if temp_asteval.error:
                            error_msg = temp_asteval.error[0].get_error()[1]
                            undefined_var = extract_undefined_variable(error_msg)
                            if undefined_var:
                                undefined_vars.append({
                                    'variable': undefined_var,
                                    'context': context
                                })
                                temp_asteval.symtable[undefined_var] = 0.0
                            else:
                                errors.append(f"{context} invalid: {error_msg}")
                                break
                        else:
                            break
                    except Exception as e:
                        undefined_var = extract_undefined_variable(str(e))
                        if undefined_var:
                            undefined_vars.append({
                                'variable': undefined_var,
                                'context': context
                            })
                            temp_asteval.symtable[undefined_var] = 0.0
                        else:
                            errors.append(f"{context} invalid: {str(e)}")
                            break
                return undefined_vars

            for eq_name, equation in self.equations.items():
                if isinstance(equation.condition, (bool, int, float)):
                    if isinstance(equation.condition, bool):
                        continue
                    expr = str(equation.condition)
                    missing_vars.extend(collect_undefined_vars(
                        expr,
                        f"condition of equation '{eq_name}'"
                    ))
                elif isinstance(equation.condition, str):
                    missing_vars.extend(collect_undefined_vars(
                        equation.condition,
                        f"condition of equation '{eq_name}'"
                    ))
                else:
                    errors.append(f"condition of equation '{eq_name}' invalid: expected bool, number, or string expression, got {type(equation.condition).__name__}")
                    is_valid = False

                # Fix: validate the expression regardless of whether the dynamics key already exists
                for var, expr in equation.dynamics.items():
                    # First check whether the dynamics key exists
                    if var not in self.variables:
                        missing_vars.append({
                            'variable': var,
                            'context': f"dynamics of equation '{eq_name}'"
                        })
                        is_valid = False

                    # Key fix: validate the variables referenced in the expression regardless of whether the key exists
                    if isinstance(expr, (int, float)):
                        expr_str = str(expr)
                        missing_vars.extend(collect_undefined_vars(
                            expr_str,
                            f"dynamics for '{var}' in equation '{eq_name}'"
                        ))
                    elif isinstance(expr, str):
                        missing_vars.extend(collect_undefined_vars(
                            expr,
                            f"dynamics for '{var}' in equation '{eq_name}'"
                        ))
                    else:
                        errors.append(f"dynamics for '{var}' in equation '{eq_name}' invalid: expected number or string expression, got {type(expr).__name__}")
                        is_valid = False

            if missing_vars:
                errors.append("Missing variables:")
                for mv in missing_vars:
                    errors.append(f"  - {mv['variable']}: {mv['context']}")

            return is_valid, errors, missing_vars

        def validate_equations() -> tuple[bool, list[str], list[dict]]:
            """Validates equations, collecting all missing variables"""
            errors = []
            missing_vars = []
            is_valid = True

            # The new approach: extract variables directly via AST, not relying on asteval
            import ast
            import re

            def extract_vars_from_expr(expr: str) -> set:
                """Extracts all variable names from an expression"""
                if not isinstance(expr, str):
                    return set()

                vars_found = set()
                try:
                    # Method 1: use AST (more accurate)
                    tree = ast.parse(expr, mode='eval')
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Name):
                            vars_found.add(node.id)
                except:
                    # Method 2: use a regex (fallback)
                    vars_found = set(re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', expr))

                # Exclude common functions and keywords
                exclude = {'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs',
                        'max', 'min', 'sum', 'pow', 'round', 'floor', 'ceil',
                        'True', 'False', 'None', 'and', 'or', 'not', 'if', 'else',
                        'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR',
                        'step', 'step_size', 'dt', 't', 'time', 'pi', 'e'}

                return vars_found - exclude

            valid_step_units = {'minute', 'hour', 'day'}

            # Iterate over every equation
            for eq_name, equation in self.equations.items():

                # 0. Only validate step_unit when dynamics actually uses a step-size variable
                dyn_uses_step = any(
                    isinstance(expr, str) and bool(re.search(r'\b(step|dt|step_size)\b', expr))
                    for expr in equation.dynamics.values()
                )
                step_unit = getattr(equation, 'step_unit', None)
                if dyn_uses_step:
                    if any(
                        isinstance(expr, str) and bool(re.search(r'\b(dt|step_size)\b', expr))
                        for expr in equation.dynamics.values()
                    ):
                        errors.append(f"equation '{eq_name}''s dynamics uses the deprecated symbol dt/step_size, use step instead.")
                        is_valid = False
                    if not step_unit:
                        errors.append(f"equation '{eq_name}''s dynamics uses a step-size variable but is missing the required step_unit field (minute | hour | day).")
                        is_valid = False
                    elif step_unit not in valid_step_units:
                        errors.append(f"equation '{eq_name}' has step_unit='{step_unit}', which is invalid; it must be minute | hour | day.")
                        is_valid = False

                # 1. Validate condition
                if isinstance(equation.condition, str):
                    vars_in_condition = extract_vars_from_expr(equation.condition)
                    for var in vars_in_condition:
                        if var not in self.variables and var not in self.equations:
                            missing_vars.append({
                                'variable': var,
                                'context': f"condition of equation '{eq_name}'"
                            })
                            is_valid = False

                # 2. Validate dynamics
                for dyn_key, dyn_expr in equation.dynamics.items():
                    # 2a. Check whether the dynamics key (the left-hand side) is defined
                    if dyn_key not in self.variables:
                        missing_vars.append({
                            'variable': dyn_key,
                            'context': f"dynamics key of equation '{eq_name}'"
                        })
                        is_valid = False

                    # 2b. Check the variables used in the dynamics value (the right-hand side)
                    if isinstance(dyn_expr, str):
                        vars_in_expr = extract_vars_from_expr(dyn_expr)
                        for var in vars_in_expr:
                            if var not in self.variables and var not in self.equations:
                                missing_vars.append({
                                    'variable': var,
                                    'context': f"dynamics['{dyn_key}'] in equation '{eq_name}'"
                                })
                                is_valid = False
                    elif isinstance(dyn_expr, (int, float)):
                        # A numeric constant, no check needed
                        pass

            # Add the error info
            if missing_vars:
                errors.append("Missing variables:")
                for mv in missing_vars:
                    errors.append(f"  - {mv['variable']}: {mv['context']}")

            return is_valid, errors, missing_vars

        validators = [
            ('Metadata', validate_metadata),
            ('Variables', validate_variables),
            ('Equations', validate_equations)
        ]
        for section, validator in validators:
            valid, errors, missing_vars = validator()
            for mv in missing_vars:
                unique_missing_vars.add(mv['variable'])  # collect only the variable name
            if errors:
                all_errors.extend([f"{section}: {err}" for err in errors])

        if all_errors:
            raise ValueError(
                f"Model validation failed with {len(all_errors)} errors:\n- " +
                "\n- ".join(all_errors)
            )
        logger.info("Model validation passed")
        return True

    def extract_vars_from_expr(self, expr: str):
        variables = extract_vars_from_expr(expr)
        # Use variables for the subsequent logic
        return variables
