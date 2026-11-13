"""Exporters: from the flat model and its bridge description to what a particular game runs.

  lm    the flat model as it is, for the LM Reference Engine or any LM-compatible engine (a backend)
  care  a Care for You condition model, made by the care_export converter from the flat model and a Care recipe
  tp    a fragment for a Teleporter era file: variables and equations in Teleporter's expression subset

Every exporter either produces something the target accepts or reports every reason it cannot.
Nothing is guessed.
"""
import ast
import copy
import math
import os
import re
import sys

import bridge as br

HERE = os.path.dirname(os.path.abspath(__file__))
CARE_EXPORT = os.path.join(os.path.dirname(HERE), 'care_export')

# What Teleporter's expression compiler (js/expr.js) accepts.
TP_FUNCS = {'min', 'max', 'abs', 'exp', 'log', 'sqrt', 'sin', 'cos', 'floor', 'round', 'clamp'}


# ---------------------------------------------------------------- concept lookup

def _vars_of(bridge, concept):
    """Flat variable names that answer to a concept, in any section of the bridge description."""
    if concept in (bridge.get('readouts') or {}):
        return [s['var'] for s in bridge['readouts'][concept]['sources'] if 'var' in s]
    for sect in ('handles', 'context'):
        if concept in (bridge.get(sect) or {}):
            return list(bridge[sect][concept])
    return []


def expand_concepts(obj, bridge, problems, where='recipe'):
    """Replace "@concept" in a recipe. As a value it becomes the variable name; as a key, or as the `input` of a pulse
    item, it expands to one entry per variable. Inside an expression string it must name exactly one variable.
    "@prefix.name" names variable `name` of the member that has that prefix, for what is not a concept."""
    def one(c, w):
        vs = _vars_of(bridge, c)
        if len(vs) != 1:
            problems.append(f'{w}: "@{c}" must answer to exactly one variable here, it answers to {len(vs)}')
            return c
        return vs[0]

    prefixes = set((bridge.get('members') or {}).values())

    def member_var(m, w):
        if m.group(1) not in prefixes:
            problems.append(f'{w}: "@{m.group(1)}.{m.group(2)}": no member has the prefix "{m.group(1)}"')
            return m.group(0)
        return br.q(m.group(1), m.group(2))

    def sub_text(s, w):
        s = re.sub(r'@([a-z][a-z0-9_]*)\.([A-Za-z_]\w*)', lambda m: member_var(m, w), s)
        return re.sub(r'@([a-z][a-z0-9_]*)(?![a-z0-9_.])', lambda m: one(m.group(1), w), s)

    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if isinstance(k, str) and k.startswith('@'):
                vs = _vars_of(bridge, k[1:])
                if not vs:
                    problems.append(f'{where}: "{k}" answers to no variable of this system')
                for name in vs:
                    out[name] = expand_concepts(copy.deepcopy(v), bridge, problems, f'{where}.{k}')
            else:
                out[k] = expand_concepts(v, bridge, problems, f'{where}.{k}')
        return out
    if isinstance(obj, list):
        res = []
        for i, it in enumerate(obj):
            if isinstance(it, dict) and isinstance(it.get('input'), str) and it['input'].startswith('@'):
                vs = _vars_of(bridge, it['input'][1:])
                if not vs:
                    problems.append(f'{where}[{i}]: "{it["input"]}" answers to no variable of this system')
                for name in vs:
                    d = {k: expand_concepts(v, bridge, problems, f'{where}[{i}].{k}') for k, v in it.items()}
                    d['input'] = name
                    res.append(d)
            else:
                res.append(expand_concepts(it, bridge, problems, f'{where}[{i}]'))
        return res
    if isinstance(obj, str):
        return sub_text(obj, where) if '@' in obj else obj
    return obj


# ---------------------------------------------------------------- Care

def _care_convert_module():
    if CARE_EXPORT not in sys.path:
        sys.path.insert(0, CARE_EXPORT)
    import convert as cv
    return cv


def to_care(flat, bridge, recipe):
    """Convert a composed system into a Care model. The recipe is a care_export recipe whose `source` is ignored and in
    which "@concept" may stand for a variable. Rates the members provide for `frailty` and `mood_valence` become the
    model's effects unless the recipe sets them. Returns what care_export.convert returns."""
    cv = _care_convert_module()
    problems = []
    recipe = expand_concepts(copy.deepcopy(recipe), bridge, problems)
    if problems:
        raise br.BridgeError(problems)
    effects = dict(recipe.get('effects') or {})
    rates = bridge.get('rates') or {}
    if 'frailty' not in effects and rates.get('frailty'):
        effects['frailty'] = _combine_terms(rates['frailty'])
    if 'mood' not in effects and rates.get('mood_valence'):
        effects['mood'] = '-(' + _combine_terms(rates['mood_valence']) + ')'
    if effects:
        recipe['effects'] = effects
    try:
        return cv.convert(flat, recipe, f'composed/{bridge.get("system", "system")}')
    except cv.ConvertError as e:
        raise br.BridgeError(e.problems)


def _combine_terms(spec):
    terms = spec['terms']
    joiner = ' * ' if spec['combine'] == 'product' else ' + '
    return joiner.join(f'({t})' for t in terms)


# ---------------------------------------------------------------- Teleporter

class _TpRewriter(ast.NodeTransformer):
    def __init__(self, rename, aux, step_factor, problems, where):
        self.rename, self.aux, self.step_factor, self.problems, self.where = rename, aux, step_factor, problems, where

    def bad(self, msg):
        self.problems.append(f'{self.where}: {msg}')

    def visit_Name(self, node):
        if node.id in self.aux:
            return self.visit(ast.parse(f'({self.aux[node.id]})', mode='eval').body)
        if node.id in self.rename:
            return ast.copy_location(ast.Name(id=self.rename[node.id], ctx=node.ctx), node)
        if node.id == 'step':
            return ast.copy_location(ast.BinOp(left=ast.Name(id='step', ctx=ast.Load()), op=ast.Mult(), right=ast.Constant(self.step_factor)), node)
        if node.id in ('True', 'False'):
            return ast.copy_location(ast.Constant(1 if node.id == 'True' else 0), node)
        if node.id == 'pi':
            return ast.copy_location(ast.Constant(math.pi), node)
        if node.id in ('day',):
            return node                 # Teleporter provides day, step, arrived
        self.bad(f'name "{node.id}" is not declared by the system and not provided by Teleporter')
        return node

    def visit_Constant(self, node):
        if isinstance(node.value, bool):
            return ast.copy_location(ast.Constant(1 if node.value else 0), node)
        if not isinstance(node.value, (int, float)):
            self.bad(f'constant {node.value!r} is not a number')
        return node

    def visit_Call(self, node):
        if not isinstance(node.func, ast.Name) or node.keywords:
            self.bad('only plain function calls without keyword arguments are supported')
            return node
        args = [self.visit(a) for a in node.args]
        n = node.func.id
        call = lambda name, a: ast.Call(func=ast.Name(id=name, ctx=ast.Load()), args=a, keywords=[])
        if n in TP_FUNCS and n != 'clamp':
            out = call(n, args)
        elif n == 'pow' and len(args) == 2:
            out = ast.BinOp(left=args[0], op=ast.Pow(), right=args[1])
        elif n == 'clip' and len(args) == 3:
            out = call('clamp', args)
        elif n == 'ceil' and len(args) == 1:
            out = ast.UnaryOp(op=ast.USub(), operand=call('floor', [ast.UnaryOp(op=ast.USub(), operand=args[0])]))
        elif n == 'log10' and len(args) == 1:
            out = ast.BinOp(left=call('log', args), op=ast.Div(), right=ast.Constant(math.log(10)))
        elif n == 'log2' and len(args) == 1:
            out = ast.BinOp(left=call('log', args), op=ast.Div(), right=ast.Constant(math.log(2)))
        elif n == 'tanh' and len(args) == 1:
            e2 = call('exp', [ast.BinOp(left=ast.Constant(2), op=ast.Mult(), right=args[0])])
            out = ast.BinOp(left=ast.BinOp(left=e2, op=ast.Sub(), right=ast.Constant(1)), op=ast.Div(),
                            right=ast.BinOp(left=copy.deepcopy(e2), op=ast.Add(), right=ast.Constant(1)))
        else:
            self.bad(f'function {n}() with {len(args)} argument(s) is not in the Teleporter expression subset')
            return node
        return ast.copy_location(out, node)

    def visit_BinOp(self, node):
        if isinstance(node.op, ast.FloorDiv):
            inner = ast.BinOp(left=self.visit(node.left), op=ast.Div(), right=self.visit(node.right))
            return ast.Call(func=ast.Name(id='floor', ctx=ast.Load()), args=[inner], keywords=[])
        if not isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)):
            self.bad(f'operator {type(node.op).__name__} is not supported')
        self.generic_visit(node)
        return node

    def generic_visit(self, node):
        if not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp, ast.Name, ast.Call, ast.Constant,
                                 ast.Load, ast.operator, ast.unaryop, ast.boolop, ast.cmpop)):
            self.bad(f'{type(node).__name__} is not supported in an expression')
            return node
        return super().generic_visit(node)


def _inline_aux(aux):
    """Auxiliaries may read each other. Return {name: expression with no auxiliary name left}."""
    done, names = {}, set(aux)
    for _ in range(len(aux) + 1):
        for n, e in aux.items():
            deps = br.names_in(e) & names
            if all(d in done for d in deps):
                done[n] = br.substitute_expr(e, {d: done[d] for d in deps}) if deps else str(e)
        if len(done) == len(aux):
            return done
    raise br.BridgeError(['auxiliary definitions read each other in a cycle'])


def to_tp(flat, bridge, instance='traveler', step_days=0.25):
    """A fragment for a Teleporter era file.

    Names become `<instance>.<name>`. Variables carry `source: lm_model`. The `step` of an equation is rewritten
    to the era's step, which Teleporter counts in days, so an equation written for hours keeps its coefficients.
    Auxiliaries are inlined because Teleporter has none. Returns {'variables', 'equations', 'bridge', 'notes'}."""
    if not re.fullmatch(r'[a-z][a-z0-9_]*', instance):
        raise br.BridgeError(['instance must be lowercase letters, digits and underscore'])
    problems, notes = [], []
    variables = flat.get('variables') or {}
    aux = _inline_aux(flat.get('auxiliary') or {}) if flat.get('auxiliary') else {}
    rename = {n: f'{instance}.{n}' for n in variables}
    out_vars = {}
    for n, v in variables.items():
        v = v or {}
        val = v.get('value', 0)
        if not isinstance(val, (int, float)) or isinstance(val, bool):
            problems.append(f'variable "{n}": value {val!r} is not a number (a distribution cannot run in Teleporter)')
            continue
        d = {'type': v.get('type', 'state'), 'value': val, 'source': 'lm_model'}
        if v.get('unit'):
            d['unit'] = str(v['unit'])
        if v.get('bounds'):
            d['bounds'] = list(v['bounds'])
        if v.get('description'):
            d['note'] = ' '.join(str(v['description']).split())
        out_vars[rename[n]] = d
    out_eqs = {}
    for en, eq in (flat.get('equations') or {}).items():
        unit = str(eq.get('step_unit') or 'hour')
        if unit not in br.STEP_HOURS:
            problems.append(f'equations.{en}: step_unit "{unit}" is not supported')
            continue
        factor = round(24.0 / br.STEP_HOURS[unit], 10)
        e = {'priority': eq.get('priority', 0), 'dynamics': {}}
        if 'condition' in eq and eq['condition'] is not True:
            e['condition'] = _tp_expr(eq['condition'], rename, aux, factor, problems, f'equations.{en}.condition')
        for var, expr in (eq.get('dynamics') or {}).items():
            e['dynamics'][rename[var]] = _tp_expr(expr, rename, aux, factor, problems, f'equations.{en}.{var}')
        if eq.get('description'):
            e['note'] = ' '.join(str(eq['description']).split())
        out_eqs[f'{instance}_{en}'] = e
    if problems:
        raise br.BridgeError(problems)
    for k in out_vars.values():
        if k['type'] == 'state' and 'bounds' not in k:
            notes.append('a state variable without bounds is unbounded in Teleporter')
            break
    b = copy.deepcopy(bridge)
    _rename_bridge(b, rename)
    return {'variables': out_vars, 'equations': out_eqs, 'bridge': b, 'step_days': step_days, 'instance': instance, 'notes': notes}


def _tp_expr(expr, rename, aux, factor, problems, where):
    if isinstance(expr, bool):
        return 'true' if expr else 'false'
    try:
        tree = ast.parse(str(expr).strip(), mode='eval')
    except SyntaxError as e:
        problems.append(f'{where}: not valid expression syntax ({e.msg})')
        return str(expr)
    tree = _TpRewriter(rename, aux, factor, problems, where).visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree)


def _rename_bridge(b, rename):
    for r in (b.get('readouts') or {}).values():
        for s in r['sources']:
            if 'var' in s:
                s['var'] = rename[s['var']]
            else:
                s['expr'] = br.substitute_expr(s['expr'], {k: v.replace('.', '__') for k, v in rename.items()}).replace('__', '.')
    for sect in ('handles', 'context'):
        for c, vs in (b.get(sect) or {}).items():
            b[sect][c] = [rename[v] for v in vs]
    for w in b.get('wires') or []:
        w['from'], w['to'] = rename[w['from']], rename[w['to']]
    for spec in (b.get('rates') or {}).values():
        spec['terms'] = [br.substitute_expr(t, {k: v.replace('.', '__') for k, v in rename.items()}) for t in spec['terms']]
        spec['terms'] = [t.replace('__', '.') for t in spec['terms']]


def merge_into_era(era, fragment):
    """Add a fragment to a parsed Teleporter era file (a dict). Name clashes and a step mismatch are errors."""
    problems = []
    step = ((era.get('simulation') or {}).get('step_size') or {}).get('value')
    if step is None or abs(float(step) - fragment['step_days']) > 1e-12:
        problems.append(f'the era steps by {step} day(s) but the fragment was made for {fragment["step_days"]}')
    for kind in ('variables', 'equations'):
        for name in fragment[kind]:
            if name in (era.get(kind) or {}):
                problems.append(f'{kind}.{name} already exists in the era file')
    if problems:
        raise br.BridgeError(problems)
    era = copy.deepcopy(era)
    era.setdefault('variables', {}).update(copy.deepcopy(fragment['variables']))
    era.setdefault('equations', {}).update(copy.deepcopy(fragment['equations']))
    return era


# ---------------------------------------------------------------- checks

def check_target(flat, target):
    """Problems of the flat model for a target, without writing anything. Returns a list."""
    problems = []
    if target == 'lm':
        return problems
    if target == 'tp':
        try:
            to_tp(flat, {}, 'chk', 0.25)
        except br.BridgeError as e:
            problems += e.problems
        return problems
    if target == 'care':
        cv = _care_convert_module()
        rename = {n: n for n in br.model_names(flat)}
        for en, eq in (flat.get('equations') or {}).items():
            for var, expr in (eq.get('dynamics') or {}).items():
                cv.translate(expr, rename, problems, f'equations.{en}.{var}')
            if 'condition' in eq:
                cv.translate(eq['condition'], rename, problems, f'equations.{en}.condition')
        for n, e in (flat.get('auxiliary') or {}).items():
            cv.translate(e, rename, problems, f'auxiliary.{n}')
        return problems
    return [f'unknown target "{target}"']
