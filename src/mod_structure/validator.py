# src/models/validator.py
from .base import VariableType, Variable
from .utils import extract_vars_from_expr
from typing import Dict, Set, List
from asteval import Interpreter
import os
import yaml
import logging

logger = logging.getLogger(__name__)

class Validator:
    def validate_model(self, output_dir: str = None) -> bool:
        # 验证模型的完整性和一致性
        all_errors = []
        all_missing_vars = []

        # 检查时间单位使用
        time_units = {'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'}
        for form_name, formula in self.formulas.items():
            if isinstance(formula.condition, str):
                vars_in_condition = self.extract_vars_from_expr(formula.condition)
                if 'dt' in vars_in_condition and not (vars_in_condition & time_units):
                    logger.warning(f"Formula {form_name}: 'dt' used in condition without time unit (e.g., HOUR). Assuming dt in seconds.")
            for var_name, expr in formula.dynamics.items():
                if isinstance(expr, (int, float)):
                    expr = str(expr)
                vars_in_expr = self.extract_vars_from_expr(expr)
                if 'dt' in vars_in_expr and not (vars_in_expr & time_units):
                    logger.warning(f"Formula {form_name}: 'dt' used in dynamics for {var_name} without time unit (e.g., HOUR). Assuming dt in seconds.")

        # 验证 simulator
        if self.simulator:
            if 'dt' in self.simulator and (not isinstance(self.simulator['dt'], (int, float)) or self.simulator['dt'] <= 0):
                all_errors.append("simulator.dt 必须为正数。")
            if 'dt_unit' in self.simulator and self.simulator['dt_unit'] not in ['second', 'minute', 'hour', 'day', 'week', 'month', 'year']:
                all_errors.append("simulator.dt_unit 无效。")

        # 验证 optimizer
        if self.optimizer:
            if 'method' not in self.optimizer:
                all_errors.append("optimizer 缺少 method。")
            if 'parameters_to_optimize' in self.optimizer:
                for param in self.optimizer['parameters_to_optimize']:
                    if param not in self.variables:
                        all_missing_vars.append({'variable': param, 'context': 'optimizer.parameters_to_optimize'})
                    elif self.variables[param].type != VariableType.parameter:
                        all_errors.append(f"optimizer.parameters_to_optimize 中的 {param} 非 parameter 类型。")
            if 'targets_to_optimize' in self.optimizer:
                for target in self.optimizer['targets_to_optimize']:
                    if target not in self.variables:
                        all_missing_vars.append({'variable': target, 'context': 'optimizer.targets'})
            if 'python_envs' in self.optimizer:
                for env in self.optimizer['python_envs']:
                    if not isinstance(env, str) or ':' not in env:
                        all_errors.append("optimizer.python_envs 格式无效 (e.g., 'pymoo: >=0.6.0')。")

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
            if hasattr(self.metadata, 'description') and not isinstance(self.metadata.description, str):
                errors.append(f"Metadata description must be a string, got {type(self.metadata.description).__name__}")
                is_valid = False
            return is_valid, errors, []

        # 验证变量（简化：检查整体定义）
        def validate_variables() -> tuple[bool, list[str], list[dict]]:
            errors = []
            missing_vars = []  # 移动到此处，聚焦整体缺失
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

        def validate_formulas() -> tuple[bool, list[str], list[dict]]:
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

            for form_name, formula in self.formulas.items():
                if isinstance(formula.condition, (bool, int, float)):
                    if isinstance(formula.condition, bool):
                        continue
                    expr = str(formula.condition)
                    missing_vars.extend(collect_undefined_vars(
                        expr,
                        f"condition of formula '{form_name}'"
                    ))
                elif isinstance(formula.condition, str):
                    missing_vars.extend(collect_undefined_vars(
                        formula.condition,
                        f"condition of formula '{form_name}'"
                    ))
                else:
                    errors.append(f"condition of formula '{form_name}' invalid: expected bool, number, or string expression, got {type(formula.condition).__name__}")
                    is_valid = False
                
                for var, expr in formula.dynamics.items():
                    if var not in self.variables:
                        missing_vars.append({
                            'variable': var,
                            'context': f"dynamics of formula '{form_name}'"
                        })
                        is_valid = False
                    else:
                        if isinstance(expr, (int, float)):
                            expr_str = str(expr)
                            missing_vars.extend(collect_undefined_vars(
                                expr_str,
                                f"dynamics for '{var}' in formula '{form_name}'"
                            ))
                        elif isinstance(expr, str):
                            missing_vars.extend(collect_undefined_vars(
                                expr,
                                f"dynamics for '{var}' in formula '{form_name}'"
                            ))
                        else:
                            errors.append(f"dynamics for '{var}' in formula '{form_name}' invalid: expected number or string expression, got {type(expr).__name__}")
                            is_valid = False
            
            if missing_vars:
                errors.append("Missing variables:")
                for mv in missing_vars:
                    errors.append(f"  - {mv['variable']}: {mv['context']}")
            
            return is_valid, errors, missing_vars

        validators = [
            ('Metadata', validate_metadata),
            ('Variables', validate_variables),
            ('Formulas', validate_formulas)
        ]
        for section, validator in validators:
            valid, errors, missing_vars = validator()
            all_missing_vars.extend(missing_vars)
            if errors:
                all_errors.extend([f"{section}: {err}" for err in errors])

        if all_errors:
            mod_name = self.current_filename or (self.metadata.name if self.metadata and hasattr(self.metadata, 'name') else 'unknown')
            # 修改：使用output_dir（由loader_engine.py传入）或mods目录，生成patch文件
            # 修改后
            patch_dir = output_dir if output_dir else os.path.join(self.mods_directory, "patch")
            os.makedirs(patch_dir, exist_ok=True)
            patch_file = os.path.join(patch_dir, f"{mod_name}_patch.yaml")
            patch_data = {
                'variables': {
                    mv['variable']: {
                        'description': f'Placeholder for {mv["variable"]}',
                        'value': 0.0,
                        'type': 'state',
                        'unit': 'unknown',
                        'bounds': [0, 100]
                    } for mv in all_missing_vars
                }
            }
            try:
                with open(patch_file, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(patch_data, f, sort_keys=False, allow_unicode=True)
                patch_message = f"Please define the missing variables in your YAML file or use the generated '{patch_file}' alongside your original model."
            except Exception as e:
                logger.warning(f"Failed to generate patch file {patch_file}: {e}")
                patch_message = "Please define the missing variables in your YAML file."

            raise ValueError(
                f"Model validation failed with {len(all_errors)} errors:\n- " + "\n- ".join(all_errors) + 
                f"\n\n{patch_message}"
            )
        logger.info("Model validation passed")
        return True

    def extract_vars_from_expr(self, expr: str):
        variables = extract_vars_from_expr(expr)
        # 使用 variables 进行后续逻辑
        return variables
        