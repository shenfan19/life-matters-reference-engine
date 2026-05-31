# src/models/validator.py
from .base import VariableType, Variable
from .utils import extract_vars_from_expr
from typing import Dict, Set, List
from asteval import Interpreter
import logging

logger = logging.getLogger(__name__)

class Validator:
    def validate_model(self) -> bool:
        # 验证模型的完整性和一致性
        all_errors = []
        unique_missing_vars = set()  # 用set自动去重

        # 检查时间单位使用
        time_units = {'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'}
        for form_name, formula in self.formulas.items():
            if isinstance(formula.condition, str):
                vars_in_condition = self.extract_vars_from_expr(formula.condition)
                if 'dt' in vars_in_condition and not (vars_in_condition & time_units):
                    logger.warning(f"Formula {form_name}: 'dt' used in condition without time unit (e.g., HOUR). Assuming dt in model's native time unit.")
            for var_name, expr in formula.dynamics.items():
                if isinstance(expr, (int, float)):
                    expr = str(expr)
                vars_in_expr = self.extract_vars_from_expr(expr)
                if 'dt' in vars_in_expr and not (vars_in_expr & time_units):
                    logger.warning(f"Formula {form_name}: 'dt' used in dynamics for {var_name} without time unit (e.g., HOUR). Assuming dt in model's native time unit.")

        # 验证 simulator
        if self.simulator:
            if 'dt' in self.simulator and (not isinstance(self.simulator['dt'], (int, float)) or self.simulator['dt'] <= 0):
                all_errors.append("simulator.dt 必须为正数。")
            if 'dt_unit' in self.simulator and self.simulator['dt_unit'] not in ['minute', 'hour', 'day', 'week', 'month', 'year']:
                all_errors.append("simulator.dt_unit 无效。")

        # 验证 optimizer（修改部分：去除类型限制，仅检查存在）
        if self.optimizer:
            if 'method' not in self.optimizer:
                all_errors.append("optimizer 缺少 method。")
            def _check_opt_var(param, section: str):
                """
                验证单个优化变量条目：
                  - 字符串格式: 直接检查是否在 self.variables
                  - 字典格式:   有 maps_to 则验证其指向的变量存在（格式 "var_name @ ..."）；
                                无 maps_to 则验证 name 字段本身存在于 self.variables
                """
                if isinstance(param, str):
                    if param not in self.variables:
                        all_errors.append(f"optimizer.{section}: '{param}' is missing from variables.")
                        unique_missing_vars.add(param)
                elif isinstance(param, dict):
                    maps_to = param.get('maps_to', '')
                    name = param.get('name', '')
                    if maps_to:
                        # 提取 "var_name @ [t1, t2]" 或 "var_name @ t" 中的变量名
                        target_var = maps_to.split('@')[0].strip()
                        if target_var and target_var not in self.variables:
                            all_errors.append(
                                f"optimizer.{section}: '{name}' maps_to target '{target_var}' is missing from variables."
                            )
                            unique_missing_vars.add(target_var)
                    elif name and name not in self.variables:
                        all_errors.append(f"optimizer.{section}: '{name}' is missing from variables.")
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

        def validate_formulas_old_ver_bug() -> tuple[bool, list[str], list[dict]]:
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
                
                # 🔧 修复：无论 dynamics 的 key 是否存在，都要验证表达式
                for var, expr in formula.dynamics.items():
                    # 首先检查 dynamics 的 key 是否存在
                    if var not in self.variables:
                        missing_vars.append({
                            'variable': var,
                            'context': f"dynamics of formula '{form_name}'"
                        })
                        is_valid = False
                    
                    # 🔧 关键修复：无论 key 是否存在，都要验证表达式中引用的变量
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

        def validate_formulas() -> tuple[bool, list[str], list[dict]]:
            """验证公式,收集所有缺失的变量"""
            errors = []
            missing_vars = []
            is_valid = True
            
            # 🔥 新方法: 使用 AST 直接提取变量,不依赖 asteval
            import ast
            import re
            
            def extract_vars_from_expr(expr: str) -> set:
                """从表达式中提取所有变量名"""
                if not isinstance(expr, str):
                    return set()
                
                vars_found = set()
                try:
                    # 方法1: 使用 AST (更准确)
                    tree = ast.parse(expr, mode='eval')
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Name):
                            vars_found.add(node.id)
                except:
                    # 方法2: 使用正则表达式 (备用)
                    vars_found = set(re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', expr))
                
                # 排除常见的函数和关键字
                exclude = {'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs',
                        'max', 'min', 'sum', 'pow', 'round', 'floor', 'ceil',
                        'True', 'False', 'None', 'and', 'or', 'not', 'if', 'else',
                        'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR',
                        'step', 'step_size', 'dt', 't', 'time', 'pi', 'e'}
                
                return vars_found - exclude
            
            # 遍历所有公式
            for form_name, formula in self.formulas.items():
                
                # 1. 验证 condition
                if isinstance(formula.condition, str):
                    vars_in_condition = extract_vars_from_expr(formula.condition)
                    for var in vars_in_condition:
                        if var not in self.variables and var not in self.formulas:
                            missing_vars.append({
                                'variable': var,
                                'context': f"condition of formula '{form_name}'"
                            })
                            is_valid = False
                
                # 2. 验证 dynamics
                for dyn_key, dyn_expr in formula.dynamics.items():
                    # 2a. 检查 dynamics 的 key (左边) 是否定义
                    if dyn_key not in self.variables:
                        missing_vars.append({
                            'variable': dyn_key,
                            'context': f"dynamics key of formula '{form_name}'"
                        })
                        is_valid = False
                    
                    # 2b. 检查 dynamics 的 value (右边) 中使用的变量
                    if isinstance(dyn_expr, str):
                        vars_in_expr = extract_vars_from_expr(dyn_expr)
                        for var in vars_in_expr:
                            if var not in self.variables and var not in self.formulas:
                                missing_vars.append({
                                    'variable': var,
                                    'context': f"dynamics['{dyn_key}'] in formula '{form_name}'"
                                })
                                is_valid = False
                    elif isinstance(dyn_expr, (int, float)):
                        # 数字常量,无需检查
                        pass
                
                # 3. 验证 formula 字段 (如果有)
                if hasattr(formula, 'formula') and formula.formula:
                    if isinstance(formula.formula, str):
                        vars_in_formula = extract_vars_from_expr(formula.formula)
                        for var in vars_in_formula:
                            if var not in self.variables and var not in self.formulas:
                                missing_vars.append({
                                    'variable': var,
                                    'context': f"formula field of '{form_name}'"
                                })
                                is_valid = False
            
            # 添加错误信息
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
            for mv in missing_vars:
                unique_missing_vars.add(mv['variable'])  # 只收集变量名
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
        # 使用 variables 进行后续逻辑
        return variables
