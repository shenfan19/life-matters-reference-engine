"""Convert an LM model into a Care for You disease model.

The conversion has three inputs: the LM model (a standalone YAML file), a recipe (the part a person
has to decide: which Care needs the disease drives, what the care actions do to the model, what is
shown to the player), and the engine's expression subset. It has two outputs: a Care model file and,
optionally, a Care condition template. Everything mechanical is done here, everything judgemental is
in the recipe, and nothing is guessed: a name, expression or setting that cannot be carried over is
reported as an error and the model is not written.

The Care side runs the same equations in the browser (see the Care for You repository, file
frontend/src/backend/lm.js). The reference evaluator at the bottom of this file, `simulate`, follows the
same stepping rules, so a converted model can be run and compared here without Care.
"""
import ast
import copy
import datetime
import math
import os
import re

import yaml

PLUGIN_VERSION = '0.1.0'

# Names the Care engine provides to every expression. Anything else must be a name of the model.
CARE_ENV = {
    'step', 'hour', 'asleep', 'awake', 'age', 'health', 'inpatient', 'is_human', 'is_animal', 'is_plant',
    'mood_now', 'need_max', 'mood_offset', 'frailty_vuln',
}
CARE_ENV_PREFIXES = ('n_', 'speed_', 'has_')
CARE_FUNCS = {'min', 'max', 'abs', 'exp', 'log', 'sqrt', 'pow', 'floor', 'tanh', 'sin', 'cos'}
CONSTANTS = {'True', 'False', 'pi'}
STEP_UNITS = {'second': 1 / 3600, 'minute': 1 / 60, 'hour': 1.0, 'day': 24.0}   # hours per unit
DAYS = {'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6}


class ConvertError(Exception):
    """The model or the recipe cannot be converted. `problems` lists every reason found."""

    def __init__(self, problems):
        self.problems = list(problems)
        super().__init__('; '.join(self.problems))


# ---------------------------------------------------------------- expressions

class _Rewriter(ast.NodeTransformer):
    """Renames model names, rewrites a few calls into the Care subset, and records what cannot be carried."""

    def __init__(self, rename, problems, where, step_factor=None):
        self.rename, self.problems, self.where, self.step_factor = rename, problems, where, step_factor
        self.used = set()

    def bad(self, what):
        self.problems.append(f'{self.where}: {what}')

    def visit_Name(self, node):
        if node.id in self.rename:
            self.used.add(node.id)
            return ast.copy_location(ast.Name(id=self.rename[node.id], ctx=node.ctx), node)
        if node.id == 'step' and self.step_factor is not None:
            return ast.copy_location(ast.BinOp(left=ast.Name(id='step', ctx=ast.Load()), op=ast.Mult(), right=ast.Constant(self.step_factor)), node)
        if node.id == 'pi':
            return ast.copy_location(ast.Constant(math.pi), node)
        if node.id in CARE_ENV or node.id.startswith(CARE_ENV_PREFIXES) or node.id in CONSTANTS:
            return node
        self.bad(f'name "{node.id}" is not a variable, parameter or auxiliary of the model and not provided by Care')
        return node

    def visit_Constant(self, node):
        if isinstance(node.value, (int, float, bool)):
            return node
        self.bad(f'constant {node.value!r} is not a number')
        return node

    def visit_Call(self, node):
        func = node.func
        if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id in ('np', 'numpy', 'math'):
            func = ast.Name(id=func.attr, ctx=ast.Load())
        if not isinstance(func, ast.Name):
            self.bad('only plain function calls are supported')
            return node
        if node.keywords:
            self.bad(f'keyword arguments in {func.id}() are not supported')
            return node
        args = [self.visit(a) for a in node.args]
        name = func.id
        call = lambda n, a: ast.Call(func=ast.Name(id=n, ctx=ast.Load()), args=a, keywords=[])
        if name in CARE_FUNCS:
            out = call(name, args)
        elif name == 'round' and len(args) == 1:
            out = call('floor', [ast.BinOp(left=args[0], op=ast.Add(), right=ast.Constant(0.5))])
        elif name == 'clip' and len(args) == 3:
            out = call('min', [call('max', [args[0], args[1]]), args[2]])
        elif name == 'ceil' and len(args) == 1:
            out = ast.UnaryOp(op=ast.USub(), operand=call('floor', [ast.UnaryOp(op=ast.USub(), operand=args[0])]))
        elif name == 'log10' and len(args) == 1:
            out = ast.BinOp(left=call('log', [args[0]]), op=ast.Div(), right=ast.Constant(math.log(10)))
        elif name == 'log2' and len(args) == 1:
            out = ast.BinOp(left=call('log', [args[0]]), op=ast.Div(), right=ast.Constant(math.log(2)))
        else:
            self.bad(f'function {name}() with {len(args)} argument(s) is not in the Care expression subset')
            return node
        return ast.copy_location(out, node)

    def visit_BinOp(self, node):
        if isinstance(node.op, ast.FloorDiv):
            node = ast.BinOp(left=self.visit(node.left), op=ast.Div(), right=self.visit(node.right))
            return ast.Call(func=ast.Name(id='floor', ctx=ast.Load()), args=[node], keywords=[])
        if not isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)):
            self.bad(f'operator {type(node.op).__name__} is not supported')
        self.generic_visit(node)
        return node

    def visit_Compare(self, node):
        if not all(isinstance(o, (ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq)) for o in node.ops):
            self.bad('only < <= > >= == != comparisons are supported')
        self.generic_visit(node)
        return node

    def generic_visit(self, node):
        if not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp, ast.Name, ast.Call, ast.Constant,
                                 ast.Load, ast.operator, ast.unaryop, ast.boolop, ast.cmpop)):
            self.bad(f'{type(node).__name__} is not supported in an expression')
            return node
        return super().generic_visit(node)


def translate(expr, rename, problems, where, step_factor=None):
    """Return (care_expression, set_of_model_names_used). Problems are appended, never raised."""
    if isinstance(expr, bool):
        return ('True' if expr else 'False'), set()
    text = str(expr).strip()
    if not text:
        problems.append(f'{where}: empty expression')
        return '0', set()
    try:
        tree = ast.parse(text, mode='eval')
    except SyntaxError as e:
        problems.append(f'{where}: not valid expression syntax ({e.msg}): {text}')
        return text, set()
    rw = _Rewriter(rename, problems, where, step_factor)
    tree = rw.visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree), rw.used


# ---------------------------------------------------------------- the model

def _hhmm(s, default=None):
    if s is None:
        return default
    m = re.fullmatch(r'\s*(\d{1,2}):(\d{2})\s*', str(s))
    if not m:
        raise ConvertError([f'time "{s}" is not HH:MM'])
    return int(m.group(1)) + int(m.group(2)) / 60


def _step_minutes(model):
    st = (model.get('simulation') or {}).get('step_size') or {}
    try:
        return float(st.get('value', 1)) * STEP_UNITS[str(st.get('unit', 'hour'))] * 60
    except (KeyError, TypeError, ValueError):
        return 60.0


def _schedule(model, recipe, name, rename, step_min, problems):
    """Daily schedule entries for one input variable, from the model's own default plan."""
    plans = (model.get('simulation') or {}).get('plans') or []
    plan = next((p for p in plans if p.get('id') == 'default'), plans[0] if plans else None)
    out = []
    for r in (plan or {}).get('regimens') or []:
        if r.get('variable') != name:
            continue
        start = _hhmm(r.get('time_start'), None)
        end = _hhmm(r.get('time_end'), None)
        if start is None and end is None:
            start, end = 0.0, 24.0
        elif start is None:
            start = 0.0
        if end is None or end == start:
            minutes = step_min          # a start without an end is a one-step pulse in LM
        else:
            minutes = ((end - start) % 24 or 24) * 60
        days = r.get('days')
        entry = {'var': rename[name], 'hour': round(start, 4), 'minutes': round(minutes, 4), 'value': float(r.get('value', 0))}
        if r.get('delivery') == 'level':
            entry['delivery'] = 'level'
        if isinstance(days, list) and days:
            nums = sorted({DAYS[str(d).lower()[:3]] for d in days if str(d).lower()[:3] in DAYS})
            if len(nums) < 7:
                entry['days'] = nums
        win = recipe.get('window_minutes')
        if win:
            entry['minutes'] = float(win)
        out.append(entry)
    return out


def convert(model, recipe, source_path=''):
    """Convert one LM model dict with one recipe dict. Returns {'model': dict, 'condition': dict|None, 'report': dict}."""
    problems, warnings = [], []
    if model.get('imports'):
        problems.append('the model imports other models; convert a standalone model')
    prefix = str(recipe.get('prefix') or '')
    if not re.fullmatch(r'[a-z][a-z0-9]{1,8}', prefix):
        problems.append('recipe.prefix must be 2 to 9 lowercase letters or digits')
    cond = recipe.get('condition') or {}
    cid = str(cond.get('id') or '')
    if not re.fullmatch(r'[a-z][a-z0-9_]{1,30}', cid):
        problems.append('recipe.condition.id is required (lowercase, digits, underscore)')
    if problems:
        raise ConvertError(problems)

    md = model.get('metadata') or {}
    variables = model.get('variables') or {}
    params, states, inputs = {}, {}, {}
    for k, v in variables.items():
        t = (v or {}).get('type', 'state')
        if t == 'parameter':
            params[k] = v
        elif t == 'input':
            inputs[k] = v
        elif t == 'state':
            states[k] = v
    for k, v in (model.get('parameters') or {}).items():
        params[k] = {'value': v}
    aux = model.get('auxiliary') or {}
    rename = {k: f'{prefix}_{k}' for k in [*params, *states, *inputs, *aux]}
    care_names = set(rename.values())

    out = {'metadata': {}, 'parameters': {}, 'variables': {}, 'auxiliary': {}, 'equations': {}, 'drives': {}, 'care': {}}

    # parameters, state variables, inputs
    for k, v in params.items():
        out['parameters'][rename[k]] = float(v.get('value', 0))
    for k, v in states.items():
        d = {'description': str(v.get('description', '')).strip(), 'value': float(v.get('value', 0)), 'unit': str(v.get('unit', '')), 'type': 'state'}
        if v.get('bounds'):
            d['bounds'] = [float(v['bounds'][0]), float(v['bounds'][1])]
        out['variables'][rename[k]] = d
    for k, v in inputs.items():
        out['variables'][rename[k]] = {'description': str(v.get('description', '')).strip(), 'value': float(v.get('value', 0)), 'unit': str(v.get('unit', '')), 'type': 'input'}

    # auxiliary and equations
    for k, e in aux.items():
        out['auxiliary'][rename[k]] = translate(e, rename, problems, f'auxiliary.{k}')[0]
    step_scale = {str(k): float(v) for k, v in (recipe.get('step_scale') or {}).items()}
    sim_unit = str(((model.get('simulation') or {}).get('step_size') or {}).get('unit') or 'hour')
    eqs_out, unit_of_first = {}, None
    for name, eq in (model.get('equations') or {}).items():
        unit = str(eq.get('step_unit') or sim_unit)
        if unit not in STEP_UNITS:
            problems.append(f'equations.{name}: step_unit "{unit}" is not supported')
            continue
        cond_expr = eq.get('condition', True)
        if cond_expr is False or str(cond_expr).strip().lower() == 'false':
            warnings.append(f'equations.{name}: condition is false, equation left out')
            continue
        d = {'description': ' '.join(str(eq.get('description', '')).split()), 'step_unit': unit, 'priority': eq.get('priority', 0), 'dynamics': {}}
        if not (cond_expr is True or str(cond_expr).strip().lower() == 'true'):
            d['condition'] = translate(cond_expr, rename, problems, f'equations.{name}.condition')[0]
        for var, expr in (eq.get('dynamics') or {}).items():
            if var not in states:
                problems.append(f'equations.{name}: updates "{var}", which is not a state variable')
                continue
            d['dynamics'][rename[var]] = translate(expr, rename, problems, f'equations.{name}.{var}')[0]
        eqs_out[f'{prefix}_{name}'] = d
        unit_of_first = unit_of_first or unit
    out['equations'] = eqs_out
    unknown = set(step_scale) - set(model.get('equations') or {})
    if unknown:
        problems.append(f'recipe.step_scale names equations the model does not have: {sorted(unknown)}')

    # the cadence the model was written for
    step_min = _step_minutes(model)
    out['care']['fixed_step_minutes'] = round(step_min, 6)
    if step_scale:
        out['care']['step_scale'] = {f'{prefix}_{k}': v for k, v in step_scale.items()}

    # schedules and pulses
    schedule = []
    in_rec = recipe.get('inputs') or {}
    for name in inputs:
        spec = in_rec.get(name)
        if spec is None:
            warnings.append(f'input "{name}" has no entry in recipe.inputs, so nothing feeds it')
            continue
        if spec == 'ignore' or (isinstance(spec, dict) and spec.get('schedule') in (None, 'ignore')):
            continue
        if spec == 'schedule' or (isinstance(spec, dict) and spec.get('schedule') == 'auto'):
            entries = _schedule(model, spec if isinstance(spec, dict) else {}, name, rename, step_min, problems)
            if not entries:
                warnings.append(f'input "{name}": the default plan has no regimen, so the schedule is empty')
            schedule += entries
        else:
            problems.append(f'recipe.inputs.{name}: use "ignore", "schedule" or {{schedule: auto, window_minutes: n}}')
    if schedule:
        out['care']['schedule'] = schedule
    pulses = {}
    for key, items in (recipe.get('pulses') or {}).items():
        lst = []
        for it in items:
            var = it.get('input') or it.get('state')
            if var not in rename or (var not in inputs and var not in states):
                problems.append(f'recipe.pulses.{key}: "{var}" is not an input or state of the model')
                continue
            if 'input' in it:
                lst.append({'var': rename[var], 'total': float(it['total']), 'minutes': float(it.get('minutes', step_min))})
                if it.get('delivery') == 'level':
                    lst[-1]['delivery'] = 'level'
            else:
                lst.append({'var': rename[var], 'add': float(it['add'])})
        pulses[key] = lst
    if pulses:
        out['care']['pulses'] = pulses

    # needs the disease drives
    for need, spec in (recipe.get('needs') or {}).items():
        kind = spec.get('kind')
        if kind == 'monitor':
            sig = spec.get('signal')
            if sig not in rename:
                problems.append(f'recipe.needs.{need}: signal "{sig}" is not a name of the model')
                continue
            var = f'{prefix}_need_{need}'
            lo, hi = float(spec['lo']), float(spec['hi'])
            out['variables'][var] = {'description': f'How much the person needs a {need} check, 0 to 1. Generated.', 'value': float(spec.get('start', 0.2)), 'unit': 'fraction', 'type': 'state', 'bounds': [0.0, 1.0]}
            gain = float(spec.get('gain', 1.5))
            out['equations'][f'{prefix}_need_{need}'] = {
                'description': f'Need {need} grows at a base rate and faster while the signal is above its comfortable level. Generated.',
                'step_unit': 'hour', 'priority': 1,
                'dynamics': {var: f'{var} + step * {float(spec.get("rate", 0.05))} * speed_{need} * (1.0 + {gain} * min(1.0, max(0.0, ({rename[sig]} - {lo}) / {hi - lo}))) * (1.0 - 0.7 * asleep)'},
            }
            out['drives'][need] = {'state': var, 'lo': 0.0, 'hi': 1.0, 'kinds': ['human']}
        elif kind == 'direct':
            st = spec.get('state')
            if st not in states:
                problems.append(f'recipe.needs.{need}: "{st}" is not a state variable')
                continue
            out['drives'][need] = {'state': rename[st], 'lo': float(spec['lo']), 'hi': float(spec['hi']), 'kinds': ['human']}
        else:
            problems.append(f'recipe.needs.{need}: kind must be monitor or direct')

    # presets, readouts, effects, story
    presets = {}
    for pname, spec in (recipe.get('presets') or {}).items():
        d = {}
        for part in ('params', 'state'):
            if spec.get(part):
                d[part] = {}
                for k, v in spec[part].items():
                    if k not in rename or (part == 'params' and k not in params) or (part == 'state' and k not in states):
                        problems.append(f'recipe.presets.{pname}.{part}: "{k}" is not a {"parameter" if part == "params" else "state variable"} of the model')
                        continue
                    d[part][rename[k]] = float(v)
        presets[pname] = d
    if presets:
        out['care']['presets'] = presets
        out['care']['default_preset'] = recipe.get('default_preset') or next(iter(presets))
    readouts = []
    for r in recipe.get('readouts') or []:
        d = {k: v for k, v in r.items() if k != 'value'}
        d['value'], _ = translate(r['value'], rename, problems, f'recipe.readouts.{r.get("id")}')
        readouts.append(d)
    if readouts:
        out['care']['readouts'] = readouts
    effects = {}
    for k, expr in (recipe.get('effects') or {}).items():
        effects[k] = translate(expr, rename, problems, f'recipe.effects.{k}')[0]
    if effects:
        out['care']['effects'] = effects
    if recipe.get('story'):
        out['care']['story'] = recipe['story']

    if problems:
        raise ConvertError(problems)

    # metadata last, so a failed conversion leaves nothing half written
    name = f'cond_{cid}_lm' if not recipe.get('model_name') else str(recipe['model_name'])
    out['metadata'] = {
        'name': name, 'version': str(recipe.get('version', '1.0')), 'lm_format_version': str(md.get('lm_format_version', '1.0')),
        'condition': cid,
        'source': f'Converted from the LM model "{md.get("name", os.path.basename(source_path))}" by the care_export plugin {PLUGIN_VERSION}. Equations, parameters and state variables are the source model\'s, renamed with the prefix "{prefix}_". Needs, readouts, actions and presets come from the recipe.',
        'generated': True,
        'description': {k: ' '.join(str(v).split()) for k, v in (md.get('description') or {}).items()} or {'problem': '', 'method': '', 'limitations': ''},
        'ratings': copy.deepcopy(md.get('ratings')) if md.get('ratings') else {},
    }
    if cond.get('supersedes'):
        out['metadata']['supersedes'] = cond['supersedes']
    if md.get('reviewed') is not None:
        out['metadata']['source_reviewed'] = str(md['reviewed'])
    if source_path:
        out['metadata']['source_path'] = source_path.replace('\\', '/')
    if not out['equations']:
        raise ConvertError(['the model has no equation left after conversion'])
    for k in [k for k, v in out.items() if v in ({}, [])]:
        del out[k]

    condition = None
    if cond.get('template'):
        condition = copy.deepcopy(cond['template'])
        condition['id'] = cid
        condition.setdefault('label', cond.get('label', cid))
    report = {
        'condition': cid, 'model_name': name, 'prefix': prefix, 'warnings': warnings,
        'counts': {'parameters': len(out.get('parameters', {})), 'state_variables': len([v for v in out['variables'].values() if v['type'] == 'state']),
                   'inputs': len(inputs), 'equations': len(out['equations']), 'schedule_entries': len(schedule), 'readouts': len(readouts)},
        'drives': sorted(out.get('drives', {})), 'care_names': len(care_names),
    }
    return {'model': out, 'condition': condition, 'report': report}


# ---------------------------------------------------------------- group

def convert_group(items):
    """Convert several (model, recipe, source_path) together and check that they can live in one Care game."""
    results, problems = [], []
    for model, recipe, path in items:
        results.append(convert(model, recipe, path))
    seen_prefix, seen_cond, drives = {}, {}, {}
    for r in results:
        rep = r['report']
        for table, key, what in ((seen_prefix, rep['prefix'], 'prefix'), (seen_cond, rep['condition'], 'condition')):
            if key in table:
                problems.append(f'two recipes use the same {what} "{key}"')
            table[key] = rep['model_name']
        for need in rep['drives']:
            if need in drives:
                rep['warnings'].append(f'need "{need}" is also driven by {drives[need]}; Care gives it to the first model that claims it')
            drives.setdefault(need, rep['model_name'])
    if problems:
        raise ConvertError(problems)
    return results


# ---------------------------------------------------------------- reference evaluation

_FUNCS = {'min': min, 'max': max, 'abs': abs, 'exp': math.exp, 'log': math.log, 'sqrt': math.sqrt, 'pow': math.pow,
          'floor': math.floor, 'tanh': math.tanh, 'sin': math.sin, 'cos': math.cos}


def _compile(expr):
    return compile(ast.parse(str(expr), mode='eval'), '<care-model>', 'eval')


def _snap(f):
    return 1.0 if abs(f - 1) < 1e-9 else (0.0 if f < 1e-9 else f)


def _num(x):
    return float(x) if not isinstance(x, bool) else float(x)


def _py_eval(code, env):
    return eval(code, {'__builtins__': {}}, env)


def simulate(model, hours, outputs=None, start_hour=0.0, weekday=1, pulses=None, preset=None, record_every_min=60.0):
    """Run a converted model the way the Care engine does, for people who want to see numbers without Care.

    `pulses` is a list of (hour_from_start, key). Returns {'t': [...], name: [...]}.
    The model runs on its own fixed step (care.fixed_step_minutes); inputs are spread over the steps of
    a window as LM does; equations run once per step in descending priority; conditions gate equations;
    state bounds clip after each update. Needs and drives are not simulated: signals that depend on
    them (n_*, speed_*) read as 0 and 1.
    """
    care = model.get('care') or {}
    F = float(care.get('fixed_step_minutes', 60)) / 60.0
    params = dict(model.get('parameters') or {})
    state = {k: float(v['value']) for k, v in model['variables'].items() if v['type'] == 'state'}
    bounds = {k: tuple(v.get('bounds') or (-1e18, 1e18)) for k, v in model['variables'].items() if v['type'] == 'state'}
    inputs = {k: float(v['value']) for k, v in model['variables'].items() if v['type'] == 'input'}
    if preset and care.get('presets', {}).get(preset):
        params.update(care['presets'][preset].get('params', {}))
        state.update(care['presets'][preset].get('state', {}))
    aux = [(k, _compile(e)) for k, e in (model.get('auxiliary') or {}).items()]
    scale = care.get('step_scale') or {}
    eqs = []
    for name, eq in model['equations'].items():
        cond = _compile(eq['condition']) if 'condition' in eq else None
        for var, expr in eq['dynamics'].items():
            eqs.append((float(eq.get('priority', 0)), name, var, _compile(expr), cond, STEP_UNITS[eq.get('step_unit', 'hour')]))
    eqs.sort(key=lambda x: -x[0])
    windows = []
    pend = sorted(pulses or [])
    t, n = 0.0, int(round(hours / F))
    rec = {'t': []}
    names = outputs or list(state)
    for nme in names:
        rec[nme] = []
    next_rec = record_every_min
    for _ in range(n):
        hour = (start_hour + t) % 24
        env = _SafeEnv({**_FUNCS, **params, **state, **inputs, 'step': F, 'hour': hour, 'asleep': 0.0, 'awake': 1.0, 'age': 30.0, 'health': 1.0, 'inpatient': 0.0,
                        'is_human': 1.0, 'is_animal': 0.0, 'is_plant': 0.0, 'mood_now': 0.5, 'need_max': 0.0, 'mood_offset': 0.0, 'frailty_vuln': 1.0})
        for s in care.get('schedule') or []:
            days = s.get('days')
            if days is not None and ((weekday + int((start_hour + t) // 24)) % 7) not in days:
                continue
            w = s['minutes'] / 60.0
            f = _snap(max(max(0.0, min(hour + F, s['hour'] + k + w) - max(hour, s['hour'] + k)) for k in (-24, 0, 24)) / F)
            if f > 0:
                per = s['value'] - inputs[s['var']] if s.get('delivery') == 'level' else s['value'] / max(1.0, w / F)
                env[s['var']] = env[s['var']] + per * f
        while pend and pend[0][0] <= t + 1e-9:
            _, key = pend.pop(0)
            for it in (care.get('pulses') or {}).get(key, []):
                if 'add' in it:
                    lo, hi = bounds[it['var']]
                    state[it['var']] = min(hi, max(lo, state[it['var']] + it['add']))
                    env[it['var']] = state[it['var']]
                else:
                    w = it['minutes'] / 60.0
                    windows.append((it['var'], it['total'] - inputs[it['var']] if it.get('delivery') == 'level' else it['total'] / max(1.0, w / F), t, t + w))
        for var, per, a, b in windows:
            f = _snap(max(0.0, min(t + F, b) - max(t, a)) / F)
            if f > 0:
                env[var] = env[var] + per * f
        windows = [w for w in windows if w[3] > t]
        for k, code in aux:
            env[k] = _py_eval(code, env)
        for _p, name, var, code, cond, unit in eqs:
            env['step'] = F / unit * float(scale.get(name, 1.0))
            if cond is not None and not _py_eval(cond, env):
                continue
            x = _py_eval(code, env)
            lo, hi = bounds[var]
            x = min(hi, max(lo, x))
            state[var] = x
            env[var] = x
        t += F
        if t * 60 >= next_rec - 1e-9:
            rec['t'].append(t)
            for nme in names:
                rec[nme].append(state.get(nme, env.get(nme)))
            next_rec += record_every_min
    return rec


class _SafeEnv(dict):
    """Reads of n_*, speed_* and has_* that the model needs but the preview does not simulate give neutral values."""

    def __missing__(self, key):
        if key.startswith('speed_'):
            return 1.0
        if key.startswith(('n_', 'has_')):
            return 0.0
        raise KeyError(key)


def load_yaml(path):
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f)


def dump_yaml(obj):
    return yaml.safe_dump(obj, allow_unicode=True, sort_keys=False, width=1000, default_flow_style=None)
