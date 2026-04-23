# src/models/utils.py
from typing import Dict, Set
import ast
import logging

# 配置日志
logger = logging.getLogger(__name__)

def merge_dicts(base: Dict, override: Dict) -> Dict:
    # 合并字典，override 覆盖 base，支持嵌套字典
    result = base.copy()
    for key, value in override.items():
        if isinstance(value, dict) and key in result and isinstance(result[key], dict):
            result[key] = merge_dicts(result[key], value)
        else:
            result[key] = value
    return result

def extract_vars_from_expr(expr: str) -> Set[str]:
    """从表达式中提取变量名，支持复杂表达式（如包含 and, or, 数学函数等）。"""
    vars = set()
    try:
        tree = ast.parse(expr)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                vars.add(node.id)
    except Exception as e:
        logger.warning(f"Failed to extract vars from expr '{expr}': {e}")
        return set()
    # 排除内置符号和函数
    builtin_symbols = {'dt', 'time', 'sin', 'cos', 'max', 'min', 'abs', 'True', 'False', 'and', 'or', 'not'}
    return vars - builtin_symbols
