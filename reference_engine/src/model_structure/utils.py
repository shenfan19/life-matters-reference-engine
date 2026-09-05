# src/models/utils.py
from typing import Dict, Set
import ast
import logging

# Configure logging
logger = logging.getLogger(__name__)

def merge_dicts(base: Dict, override: Dict) -> Dict:
    # Merges two dicts, with override taking precedence over base, supporting nested dicts
    result = base.copy()
    for key, value in override.items():
        if isinstance(value, dict) and key in result and isinstance(result[key], dict):
            result[key] = merge_dicts(result[key], value)
        else:
            result[key] = value
    return result

def extract_vars_from_expr(expr: str) -> Set[str]:
    """Extracts variable names from an expression, supporting complex expressions (e.g. containing and, or, math functions, etc.)."""
    vars = set()
    try:
        tree = ast.parse(expr)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                vars.add(node.id)
    except Exception as e:
        logger.warning(f"Failed to extract vars from expr '{expr}': {e}")
        return set()
    # Exclude built-in symbols and functions
    builtin_symbols = {
        # Time/step-size symbols injected by the engine
        'step', 'step_size', 'dt', 't', 'time',
        # Math functions
        'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'max', 'min', 'round', 'floor', 'ceil',
        # Python keywords
        'True', 'False', 'None', 'and', 'or', 'not', 'if', 'else',
    }
    return vars - builtin_symbols
