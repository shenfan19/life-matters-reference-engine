"""Splits the yearly risk of death of the body model into named parts.

The body model writes the risk as `age term * exp(lifestyle log ratio) + disease term`. The plugin does not copy
those formulas. It reads the three expressions out of the loaded model, cuts the lifestyle log ratio and the
disease term into their additive terms, and evaluates each term on the state of the body. A term is named by the
first variable it reads that risk_groups.yaml lists, so a changed coefficient in the model moves the numbers and
does not break the names.

The lifestyle part is shared among its terms in proportion to their share of the log ratio. That is an
allocation convention, not a causal decomposition, and the page says so.
"""

import ast
import math
from typing import Any, Dict, List, Optional, Tuple

ALLOWED_CALLS = {'exp': math.exp, 'log': math.log, 'max': max, 'min': min, 'abs': abs, 'sqrt': math.sqrt, 'pow': pow}
ALLOWED_NODES = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Call, ast.Load,
                 ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.USub, ast.UAdd)


class UnsupportedExpression(ValueError):
    pass


def _check(node: ast.AST) -> None:
    for sub in ast.walk(node):
        if not isinstance(sub, ALLOWED_NODES):
            raise UnsupportedExpression(f'Unsupported syntax in a risk expression: {type(sub).__name__}')
        if isinstance(sub, ast.Call) and not (isinstance(sub.func, ast.Name) and sub.func.id in ALLOWED_CALLS and not sub.keywords):
            raise UnsupportedExpression('Unsupported call in a risk expression')


def _names_in_order(node: ast.AST) -> List[str]:
    names = [n for n in ast.walk(node) if isinstance(n, ast.Name) and n.id not in ALLOWED_CALLS]
    return [n.id for n in sorted(names, key=lambda n: n.col_offset)]


def _add_terms(node: ast.AST, sign: float = 1.0) -> List[Tuple[float, ast.AST]]:
    """The additive terms of an expression with their signs."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _add_terms(node.left, sign) + _add_terms(node.right, sign)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Sub):
        return _add_terms(node.left, sign) + _add_terms(node.right, -sign)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return _add_terms(node.operand, -sign)
    return [(sign, node)]


def _split(node: ast.AST, listed: set, sign: float = 1.0) -> List[Tuple[float, ast.AST, ast.AST]]:
    """Additive terms as (sign, node to evaluate, node to name). A product of a factor and a sum is spread over the
    sum when only the sum reads listed variables, so that `(1 - 0.8 * medical_era) * (a + b)` gives the terms
    `factor * a` and `factor * b`, each named by its own burden."""
    out = []
    for s, term in _add_terms(node, sign):
        if isinstance(term, ast.BinOp) and isinstance(term.op, ast.Mult):
            left_listed = bool(set(_names_in_order(term.left)) & listed)
            right_listed = bool(set(_names_in_order(term.right)) & listed)
            if right_listed and not left_listed:
                out += [(ts, ast.BinOp(left=term.left, op=ast.Mult(), right=tn), tl) for ts, tn, tl in _split(term.right, listed, s)]
                continue
            if left_listed and not right_listed:
                out += [(ts, ast.BinOp(left=tn, op=ast.Mult(), right=term.right), tl) for ts, tn, tl in _split(term.left, listed, s)]
                continue
        out.append((s, term, term))
    return out


def _compile(node: ast.AST):
    expression = ast.Expression(body=node)
    ast.fix_missing_locations(expression)
    return compile(expression, '<risk term>', 'eval')


def _evaluate(code, env: Dict[str, float]) -> float:
    return float(eval(code, {'__builtins__': {}}, {**ALLOWED_CALLS, **env}))  # noqa: S307 - nodes were checked against a whitelist


class RiskSplitter:
    """Names the parts of the risk of death on a state of the body model."""

    def __init__(self, equations: Dict[str, Dict[str, Any]], groups: Dict[str, Any]):
        self.groups = groups
        self.available = False
        expressions = {}
        for equation in equations.values():
            for target, expr in (equation.get('dynamics') or {}).items():
                if target in ('annual_hazard', 'mortality_lnhr', 'disease_hazard'):
                    expressions[target] = expr
        if len(expressions) < 3:
            return
        parsed = {name: ast.parse(expr, mode='eval').body for name, expr in expressions.items()}
        for node in parsed.values():
            _check(node)
        self._annual = _compile(parsed['annual_hazard'])
        lifestyle_listed = set(groups['lifestyle'])
        disease_listed = set(groups['disease'])
        self._lifestyle = [(s, _compile(n), self._name(l, groups['lifestyle'], lifestyle_listed))
                           for s, n, l in _split(parsed['mortality_lnhr'], lifestyle_listed)]
        self._disease = [(s, _compile(n), self._name(l, groups['disease'], disease_listed))
                         for s, n, l in _split(parsed['disease_hazard'], disease_listed)]
        self.available = True

    @staticmethod
    def _name(label_node: ast.AST, table: Dict[str, Any], listed: set) -> str:
        names = _names_in_order(label_node)
        if not names:
            return 'constant'
        for name in names:
            if name in listed:
                return table[name]['group']
        return names[0]

    def group_titles(self) -> Dict[str, Dict[str, str]]:
        titles = {'age': self.groups['age']['title'], 'constant': self.groups['constant']['title']}
        for table in (self.groups['lifestyle'], self.groups['disease']):
            for entry in table.values():
                titles[entry['group']] = entry['title']
        return titles

    def split(self, state: Dict[str, float]) -> Optional[Dict[str, Any]]:
        """The yearly risk split into the age part, the lifestyle parts and the disease parts, on this state."""
        if not self.available:
            return None
        env = dict(state)
        age_only = _evaluate(self._annual, {**env, 'mortality_lnhr': 0.0, 'disease_hazard': 0.0})
        with_lifestyle = _evaluate(self._annual, {**env, 'disease_hazard': 0.0})
        lifestyle_terms = [(s * _evaluate(code, env), name) for s, code, name in self._lifestyle]
        log_ratio = sum(t for t, _ in lifestyle_terms)
        excess = with_lifestyle - age_only
        lifestyle: Dict[str, float] = {}
        if abs(log_ratio) > 1e-12:
            for term, name in lifestyle_terms:
                lifestyle[name] = lifestyle.get(name, 0.0) + excess * term / log_ratio
        disease: Dict[str, float] = {}
        for s, code, name in self._disease:
            disease[name] = disease.get(name, 0.0) + s * _evaluate(code, env)
        return {'age': age_only, 'lifestyle': lifestyle, 'disease': disease,
                'total': age_only + sum(lifestyle.values()) + sum(disease.values())}


def merge_weighted(parts: List[Tuple[float, Dict[str, Any]]]) -> Dict[str, Dict[str, float]]:
    """Adds up splits weighted by their length in years, giving the hazard accumulated over a stretch of life."""
    out: Dict[str, Dict[str, float]] = {'age': {'age': 0.0}, 'lifestyle': {}, 'disease': {}}
    for years, split in parts:
        out['age']['age'] += years * split['age']
        for section in ('lifestyle', 'disease'):
            for name, value in split[section].items():
                out[section][name] = out[section].get(name, 0.0) + years * value
    return out


def rank(accumulated: Dict[str, Dict[str, float]]) -> List[Dict[str, Any]]:
    """Flat list of parts with their share of the positive hazard, largest first. Protective parts get a negative
    share of the same total, so that they can be shown beside the harmful ones."""
    rows = [{'section': section, 'name': name, 'hazard': value}
            for section, table in accumulated.items() for name, value in table.items()]
    total = sum(r['hazard'] for r in rows if r['hazard'] > 0) or 1.0
    for row in rows:
        row['share'] = row['hazard'] / total
    return sorted(rows, key=lambda r: -r['hazard'])
