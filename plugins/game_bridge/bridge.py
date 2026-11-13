"""Core of the game bridge: concepts, bridge files, systems, composition.

Everything here is independent of any game and of the engine. It needs only PyYAML. The input is a
set of LM models plus a bridge file next to each of them; the output is one flat LM model and a
small description of which variable answers to which concept. A game, whether it runs the equations
in a browser or asks a backend engine, only has to read those two files.

Terms
  concept   a named, game-neutral quantity from the vocabulary (library/concepts.yaml)
  bridge    the file `<model>.bridge.yaml` that says which variable of a model provides or requires a concept
  system    a request: which concepts the game wants to read, which handles the game will write, and
            how to choose between models that offer the same concept
  flat      a standalone LM 1.0 model made by composing the chosen models, renamed so names never clash
"""
import ast
import copy
import math
import os
import re

import yaml

BRIDGE_VERSION = 1
SYSTEM_VERSION = 1
STEP_HOURS = {'second': 1 / 3600, 'minute': 1 / 60, 'hour': 1.0, 'day': 24.0, 'week': 168.0}
ROLES = ('readout', 'handle', 'context')
COMBINE_VAR = ('replace', 'max')
COMBINE_RATE = ('sum_rate', 'product')
NAMESPACES = ('own', 'shared')
HANDLE_MODES = ('level', 'total')
LEVEL_BAND = 1000.0          # priority band per dependency level, see compose()
MAX_MEMBER_PRIORITY = 100.0
# Names that every LM expression may use without declaring them.
LM_BUILTINS = {'step', 't', 'time', 'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'True', 'False'}
LM_FUNCS = {'min', 'max', 'abs', 'exp', 'log', 'sqrt', 'pow', 'floor', 'tanh', 'sin', 'cos', 'round', 'clip', 'ceil', 'log10', 'log2'}


class BridgeError(Exception):
    """Something cannot be bridged. `problems` lists every reason that was found."""

    def __init__(self, problems):
        self.problems = list(problems) if not isinstance(problems, str) else [problems]
        super().__init__('; '.join(self.problems))


def load_yaml(path):
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f)


def dump_yaml(obj):
    return yaml.safe_dump(obj, allow_unicode=True, sort_keys=False, width=1000, default_flow_style=None)


# ---------------------------------------------------------------- expressions

def names_in(expr):
    """Names an expression reads, without function names."""
    if isinstance(expr, bool):
        return set()
    tree = ast.parse(str(expr).strip(), mode='eval')
    called = {n.func.id for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)} - called


def rename_expr(expr, rename, where, problems):
    """Rename the names of an expression. A name that is not in `rename` and not a builtin is left as it is and returned in `foreign`."""
    if isinstance(expr, bool):
        return expr, set()
    text = str(expr).strip()
    try:
        tree = ast.parse(text, mode='eval')
    except SyntaxError as e:
        problems.append(f'{where}: not valid expression syntax ({e.msg}): {text}')
        return text, set()
    foreign = set()

    class R(ast.NodeTransformer):
        def visit_Call(self, node):
            node.args = [self.visit(a) for a in node.args]
            return node

        def visit_Name(self, node):
            if node.id in rename:
                return ast.copy_location(ast.Name(id=rename[node.id], ctx=node.ctx), node)
            if node.id not in LM_BUILTINS and node.id not in LM_FUNCS:
                foreign.add(node.id)
            return node

    tree = R().visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree), foreign


def substitute_expr(expr, mapping):
    """Replace names by expressions (strings). Used for the placeholder `x` in conversions and for inlining auxiliaries."""
    tree = ast.parse(str(expr).strip(), mode='eval')

    class S(ast.NodeTransformer):
        def visit_Name(self, node):
            if node.id in mapping:
                sub = ast.parse(f'({mapping[node.id]})', mode='eval').body
                return ast.copy_location(sub, node)
            return node

    tree = S().visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree)


# ---------------------------------------------------------------- vocabulary and bridges

class Vocabulary:
    def __init__(self, data):
        self.concepts = dict((data or {}).get('concepts') or {})
        self.version = (data or {}).get('vocabulary_version')
        problems = []
        if not isinstance(self.version, int) or isinstance(self.version, bool) or self.version < 1:
            problems.append('vocabulary_version must be a whole number of 1 or more')
        for cid, c in self.concepts.items():
            if not re.fullmatch(r'[a-z][a-z0-9_]*', cid):
                problems.append(f'concept "{cid}": the id must be lowercase letters, digits and underscore')
            if c.get('role') not in ROLES:
                problems.append(f'concept "{cid}": role must be one of {ROLES}')
            if c.get('combine', 'replace') not in COMBINE_VAR:
                problems.append(f'concept "{cid}": combine must be one of {COMBINE_VAR}')
            if c.get('rate_combine', 'sum_rate') not in COMBINE_RATE:
                problems.append(f'concept "{cid}": rate_combine must be one of {COMBINE_RATE}')
            if c.get('role') == 'handle' and c.get('mode') not in HANDLE_MODES:
                problems.append(f'concept "{cid}": a handle needs mode, one of {HANDLE_MODES}')
            if c.get('role') != 'handle' and 'mode' in c:
                problems.append(f'concept "{cid}": mode belongs to handles only')
        if problems:
            raise BridgeError(problems)

    def role(self, cid):
        return self.concepts[cid]['role']

    def mode(self, cid):
        """How a write to a handle is meant: level or total."""
        return self.concepts[cid]['mode']

    def combine(self, cid):
        """How several models that each give the concept a variable are joined: replace (only one allowed) or max."""
        return self.concepts[cid].get('combine', 'replace')

    def rate_combine(self, cid):
        """How the rates that several models give the concept are joined: sum_rate or product."""
        return self.concepts[cid].get('rate_combine', 'sum_rate')


class Library:
    """Models, bridge files and the vocabulary found under three kinds of folder."""

    def __init__(self, models_dir, bridge_dirs=(), vocabulary=None):
        self.models_dir = models_dir
        self.bridge_dirs = list(bridge_dirs)
        self.vocab = vocabulary
        self._bridges = None

    def model_path(self, key):
        p = os.path.join(self.models_dir, str(key).replace('\\', '/') + '.yaml')
        return p if os.path.isfile(p) else None

    def load_model(self, key):
        p = self.model_path(key)
        if not p:
            raise BridgeError([f'model "{key}" not found under {self.models_dir}'])
        return load_yaml(p)

    def bridges(self):
        """All bridge files, as {model_key: bridge_dict}. Two files for one model are an error."""
        if self._bridges is None:
            found, problems = {}, []
            for root in self.bridge_dirs:
                for dirpath, _dirs, files in os.walk(root):
                    for fn in sorted(files):
                        if not fn.endswith('.bridge.yaml'):
                            continue
                        b = load_yaml(os.path.join(dirpath, fn)) or {}
                        key = b.get('model')
                        if not key:
                            problems.append(f'{fn}: "model" is missing')
                            continue
                        if key in found:
                            problems.append(f'two bridge files for model "{key}"')
                        b['_file'] = os.path.join(dirpath, fn)
                        found[key] = b
            if problems:
                raise BridgeError(problems)
            self._bridges = found
        return self._bridges


def model_names(model):
    """The names a model declares: states, inputs, parameters and auxiliaries, with their kind."""
    out = {}
    for k, v in (model.get('variables') or {}).items():
        out[k] = (v or {}).get('type', 'state')
    for k in (model.get('parameters') or {}):
        out.setdefault(k, 'parameter')
    for k in (model.get('auxiliary') or {}):
        out[k] = 'auxiliary'
    return out


def check_bridge(bridge, model, vocab):
    """Problems of one bridge file against its model and the vocabulary. An empty list means it is consistent."""
    problems = []
    who = bridge.get('model', '?')
    if bridge.get('bridge_version') != BRIDGE_VERSION:
        problems.append(f'{who}: bridge_version must be {BRIDGE_VERSION}')
    names = model_names(model)
    if bridge.get('namespace', 'own') not in NAMESPACES:
        problems.append(f'{who}: namespace must be one of {NAMESPACES}')
    for section in ('provides', 'requires'):
        for cid, spec in (bridge.get(section) or {}).items():
            if cid not in vocab.concepts:
                problems.append(f'{who}: {section} "{cid}" is not in the vocabulary')
                continue
            role = vocab.role(cid)
            spec = spec or {}
            if section == 'provides':
                if sum(k in spec for k in ('var', 'rate', 'expr')) != 1:
                    problems.append(f'{who}: provides "{cid}" needs exactly one of var, expr and rate')
                if 'var' in spec:
                    if spec['var'] not in names:
                        problems.append(f'{who}: provides "{cid}": variable "{spec["var"]}" is not declared')
                if 'var' in spec or 'expr' in spec:
                    sc = spec.get('scale')
                    if role == 'readout' and not (isinstance(sc, list) and len(sc) == 2 and sc[0] != sc[1]):
                        problems.append(f'{who}: provides "{cid}": a readout needs scale [lo, hi] with lo different from hi (hi below lo reverses it)')
                    if role != 'readout' and 'expr' in spec:
                        problems.append(f'{who}: provides "{cid}" with expr, but expressions apply to readouts only')
                if 'expr' in spec:
                    try:
                        unknown = names_in(spec['expr']) - set(names) - LM_BUILTINS
                        if unknown:
                            problems.append(f'{who}: provides "{cid}": expr reads unknown names {sorted(unknown)}')
                    except SyntaxError as e:
                        problems.append(f'{who}: provides "{cid}": expr is not valid syntax ({e.msg})')
                if 'rate' in spec:
                    if role != 'readout':
                        problems.append(f'{who}: provides "{cid}" with rate, but rates apply to readouts only')
                    try:
                        unknown = names_in(spec['rate']) - set(names) - LM_BUILTINS
                        if unknown:
                            problems.append(f'{who}: provides "{cid}": rate reads unknown names {sorted(unknown)}')
                    except SyntaxError as e:
                        problems.append(f'{who}: provides "{cid}": rate is not valid syntax ({e.msg})')
            else:
                if role == 'readout':
                    pass            # a model may read a readout another model provides
                var = spec.get('var')
                if not var:
                    problems.append(f'{who}: requires "{cid}" needs var')
                elif var in names and names[var] not in ('input', 'state'):
                    problems.append(f'{who}: requires "{cid}": variable "{var}" is a {names[var]}, it must be an input or state')
                if 'convert' in spec:
                    try:
                        if 'x' not in names_in(spec['convert']):
                            problems.append(f'{who}: requires "{cid}": convert must use x')
                    except SyntaxError as e:
                        problems.append(f'{who}: requires "{cid}": convert is not valid syntax ({e.msg})')
    return problems


def check_library(lib):
    """Check every bridge file against its model. Returns {model_key: [problems]} for the ones with problems."""
    out = {}
    for key, b in lib.bridges().items():
        p = lib.model_path(key)
        if not p:
            out[key] = [f'{key}: model not found under {lib.models_dir}']
            continue
        probs = check_bridge(b, load_yaml(p), lib.vocab)
        if probs:
            out[key] = probs
    return out


# ---------------------------------------------------------------- resolution

def _rating_score(model, field='confidence'):
    r = ((model.get('metadata') or {}).get('ratings') or {}).get(field)
    if r is None:
        return 0.0
    m = re.match(r'\s*(-?\d+(?:\.\d+)?)', str(r))
    return float(m.group(1)) if m else 0.0


def resolve(system, lib):
    """Choose the models of a system. Returns a plan dict; raises BridgeError listing every unsatisfied need."""
    if system.get('system_version') != SYSTEM_VERSION:
        raise BridgeError([f'system_version must be {SYSTEM_VERSION}'])
    vocab, bridges = lib.vocab, dict(lib.bridges())
    problems, choices = [], []
    # models joined into the shared namespace without a bridge file of their own: they provide and require no concept
    for key in system.get('shared_models') or []:
        if key in bridges:
            problems.append(f'shared_models: "{key}" has a bridge file, list it in include_models or by tag instead')
        elif not lib.model_path(key):
            problems.append(f'shared_models: model "{key}" not found under {lib.models_dir}')
        else:
            bridges[key] = {'bridge_version': BRIDGE_VERSION, 'model': key, 'namespace': 'shared', 'provides': {}, 'requires': {}, 'tags': [], '_implicit': True}
    goal = list(system.get('goal') or [])
    supply = set(system.get('supply_from_game') or [])
    pins = dict(system.get('pins') or {})
    policy = system.get('policy') or {}
    for cid in [*goal, *supply, *pins]:
        if cid not in vocab.concepts:
            problems.append(f'"{cid}" is not in the vocabulary')
    for cid in supply:
        if cid in vocab.concepts and vocab.role(cid) == 'readout':
            problems.append(f'supply_from_game lists "{cid}", which is a readout, not a handle or context')
    if problems:
        raise BridgeError(problems)

    models_cache = {}

    def model_of(key):
        if key not in models_cache:
            models_cache[key] = lib.load_model(key)
        return models_cache[key]

    def providers(cid):
        out = []
        for key, b in bridges.items():
            if cid in (b.get('provides') or {}):
                out.append(key)
        return out

    included = []

    def include(key, why):
        if key not in included:
            included.append(key)
            choices.append({'model': key, 'why': why})

    # a pin names the model for a concept; the model must provide it and becomes a member
    for cid, key in pins.items():
        if key not in bridges:
            problems.append(f'pin for "{cid}": "{key}" has no bridge file')
        elif cid not in (bridges[key].get('provides') or {}):
            problems.append(f'pin for "{cid}" names "{key}", which does not provide it')
    if problems:
        raise BridgeError(problems)
    for cid, key in pins.items():
        include(key, f'pinned for "{cid}"')
    # members that the system names by tag
    tags = set(system.get('include_tags') or [])
    for key, b in bridges.items():
        if tags & set(b.get('tags') or []):
            include(key, f'tag {sorted(tags & set(b.get("tags") or []))}')
    for key in system.get('include_models') or []:
        if key not in bridges:
            problems.append(f'include_models: "{key}" has no bridge file')
        else:
            include(key, 'listed in include_models')
    for key in system.get('shared_models') or []:
        if key in bridges and bridges[key].get('_implicit'):
            include(key, 'listed in shared_models')

    def pick(cid, cands):
        if cid in pins:
            if pins[cid] not in cands:
                raise BridgeError([f'pin for "{cid}" names "{pins[cid]}", which does not provide it'])
            return pins[cid], 'pinned'
        floor = (policy.get('min_ratings') or {})
        ok = []
        for k in cands:
            if k in (policy.get('exclude') or []):
                continue
            m = model_of(k)
            if all(_rating_score(m, f) >= float(v) for f, v in floor.items()):
                ok.append(k)
        if not ok:
            raise BridgeError([f'concept "{cid}": no provider is left after policy.exclude and policy.min_ratings; candidates {cands}'])
        if len(ok) == 1:
            return ok[0], 'only candidate'
        scored = sorted(ok, key=lambda k: -_rating_score(model_of(k), 'confidence'))
        top = [k for k in scored if _rating_score(model_of(k), 'confidence') == _rating_score(model_of(scored[0]), 'confidence')]
        if len(top) > 1:
            raise BridgeError([f'concept "{cid}": {len(top)} providers tie on confidence ({top}); add a pin'])
        return scored[0], 'highest confidence'

    def provider_in(cid):
        return [k for k in included if cid in (bridges[k].get('provides') or {})]

    # goals first, then the requirements of every included model, until nothing new appears
    work, seen = [('goal', c) for c in goal], set()
    for k in list(included):
        work += [(k, c) for c in (bridges[k].get('requires') or {})]
    while work:
        origin, cid = work.pop(0)
        if (origin, cid) in seen:
            continue
        seen.add((origin, cid))
        role = vocab.role(cid)
        if origin == 'goal':
            if provider_in(cid):
                continue
            cands = providers(cid)
            if not cands:
                problems.append(f'goal "{cid}": no model provides it')
                continue
            try:
                key, why = pick(cid, cands)
            except BridgeError as e:
                problems += e.problems
                continue
            include(key, f'provides goal "{cid}", {why}')
            work += [(key, c) for c in (bridges[key].get('requires') or {})]
            continue
        if cid in supply:
            continue
        if provider_in(cid):
            continue
        optional = (bridges[origin]['requires'][cid] or {}).get('optional', False)
        cands = providers(cid)
        if not cands:
            if not optional:
                problems.append(f'{origin} requires "{cid}": no model provides it and the game does not supply it')
            continue
        try:
            key, why = pick(cid, cands)
        except BridgeError as e:
            problems += [f'{origin} requires "{cid}": {p}' for p in e.problems]
            continue
        include(key, f'provides "{cid}" required by {origin}, {why}')
        work += [(key, c) for c in (bridges[key].get('requires') or {})]
    if problems:
        raise BridgeError(problems)

    # who feeds whom
    feeds = []         # (provider_key, consumer_key, concept)
    for ck in included:
        for cid in bridges[ck].get('requires') or {}:
            if cid in supply:
                continue
            for pk in provider_in(cid):
                if pk == ck:
                    continue
                feeds.append((pk, ck, cid))
    # depth: a consumer sits at level 0, a provider one level above everything it feeds
    if _has_cycle(included, feeds):
        raise BridgeError(['the chosen models feed each other in a cycle: ' + ', '.join(f'{p} -> {c} ({x})' for p, c, x in feeds)])
    level = {k: 0 for k in included}
    for _ in range(len(included)):
        for pk, ck, _c in feeds:
            level[pk] = max(level[pk], level[ck] + 1)

    # readout providers: combine rule must be satisfiable
    for cid in goal:
        provs = [k for k in provider_in(cid) if {'var', 'expr'} & set(bridges[k]['provides'][cid] or {})]
        comb = vocab.combine(cid)
        if comb == 'replace' and len(provs) > 1:
            problems.append(f'concept "{cid}" combines by replace, but {provs} all provide it; pin one')
    if problems:
        raise BridgeError(problems)
    return {'system': system.get('id', 'system'), 'members': included, 'feeds': feeds, 'level': level, 'choices': choices,
            'goal': goal, 'supply': sorted(supply), 'bridges': bridges, 'step_size': system.get('step_size'),
            'dates': [system.get('start_date'), system.get('end_date')]}


def _has_cycle(nodes, feeds):
    adj = {n: [] for n in nodes}
    for p, c, _ in feeds:
        adj[p].append(c)
    state = {}

    def dfs(n):
        state[n] = 1
        for m in adj[n]:
            if state.get(m) == 1 or (m not in state and dfs(m)):
                return True
        state[n] = 2
        return False

    return any(n not in state and dfs(n) for n in nodes)


# ---------------------------------------------------------------- composition

def _prefix_for(key, taken):
    base = re.sub(r'_(20\d\d|v\d+)$', '', os.path.basename(key))
    base = re.sub(r'[^a-z0-9]+', '_', base.lower()).strip('_') or 'm'
    p, i = base, 2
    while p in taken:
        p, i = f'{base}{i}', i + 1
    return p


def compose(plan, lib, prefixes=None):
    """Make one flat LM model out of the planned members.

    Returns {'model': dict, 'bridge': dict, 'report': dict}. The flat model uses only LM 1.0 blocks.
    Rules:
      - every name of every member gets the member's prefix, so nothing clashes;
      - an input that another member provides is redeclared as a state and a wire equation sets it from the provider;
      - wire equations get a priority between the provider's band and the consumer's band, so a consumer
        reads the provider's value of the same step (no lag), see LEVEL_BAND;
      - an input that nobody provides stays an input, and is listed as a handle of the concept.
    """
    vocab, bridges = lib.vocab, plan.get('bridges') or lib.bridges()
    problems, warnings = [], []
    members = plan['members']
    shared = [k for k in members if bridges[k].get('namespace') == 'shared']
    taken, pre = set(), {}
    for k in members:
        explicit = (prefixes or {}).get(k)
        if k in shared:
            pre[k] = ''                 # a shared member keeps its names, so that the components of one body read each other by name
            continue
        pre[k] = explicit if explicit is not None else ('' if len(members) == 1 else _prefix_for(k, taken))
        taken.add(pre[k])
    flat = {'metadata': {}, 'variables': {}, 'equations': {}}
    aux_out, foreign_all = {}, {}
    names_of, models = {}, {}
    for k in members:
        m = models[k] = lib.load_model(k)
        if m.get('imports'):
            problems.append(f'{k}: the model imports other models; compose standalone models, or add the imported ones as members')
        names_of[k] = model_names(m)
        pr = [e.get('priority', 0) for e in (m.get('equations') or {}).values()]
        if pr and k not in shared and (max(pr) > MAX_MEMBER_PRIORITY or min(pr) < -MAX_MEMBER_PRIORITY):
            problems.append(f'{k}: equation priorities must stay within +-{MAX_MEMBER_PRIORITY:g} so the bands of the dependency levels do not overlap')
    shared_names = {}
    for k in shared:
        for n, kind in names_of[k].items():
            if n in shared_names and shared_names[n][0] != k:
                problems.append(f'{k} and {shared_names[n][0]} both declare "{n}" in the shared namespace; compose does not choose between them')
            shared_names[n] = (k, kind)
    if problems:
        raise BridgeError(problems)

    # what each member requires of whom
    wired = {}                  # (consumer, var) -> (provider, provider_var, convert)
    handles = {}                # concept -> [flat var names]
    for ck in members:
        req = bridges[ck].get('requires') or {}
        for cid, spec in req.items():
            spec = spec or {}
            var = spec['var']
            provs = [pk for pk in members if pk != ck and cid in (bridges[pk].get('provides') or {}) and 'var' in (bridges[pk]['provides'][cid] or {})]
            if cid not in plan['supply'] and not provs and any(pk != ck and 'expr' in ((bridges[pk].get('provides') or {}).get(cid) or {}) for pk in members):
                problems.append(f'{ck} requires "{cid}", which a member provides by an expression only; an expression cannot be wired into another model')
                continue
            if cid in plan['supply'] or not provs:
                handles.setdefault(cid, []).append(q(pre[ck], var))
                continue
            if len(provs) > 1:
                problems.append(f'{ck} requires "{cid}" and {provs} all provide it; compose cannot choose, pin one')
                continue
            pk = provs[0]
            if ck in shared or pk in shared:
                problems.append(f'{ck} requires "{cid}" from {pk}, and one of them is in the shared namespace; shared components read each other by name and are not wired by concept')
                continue
            wired[(ck, var)] = (pk, bridges[pk]['provides'][cid]['var'], spec.get('convert'))
    if problems:
        raise BridgeError(problems)

    for k in members:
        m, p = models[k], pre[k]
        rename = {n: q(p, n) for n in names_of[k]}
        # a required variable that the model reads but does not declare becomes an input
        declared_extra = {}
        for cid, spec in (bridges[k].get('requires') or {}).items():
            var = (spec or {})['var']
            if var not in rename:
                rename[var] = q(p, var)
                declared_extra[var] = {'type': 'input', 'value': float((spec or {}).get('default', 0)), 'unit': (spec or {}).get('unit', ''),
                                       'description': f'Required for the concept "{cid}"; not declared by the source model.'}
        for n, v in (m.get('variables') or {}).items():
            d = copy.deepcopy(v or {})
            if (k, n) in wired:
                d['type'] = 'state'
                d.setdefault('description', '')
                d['description'] = (str(d['description']).strip() + ' Wired from another model by the bridge.').strip()
            flat['variables'][rename[n]] = d
        for n, d in declared_extra.items():
            flat['variables'][rename[n]] = d
        for n, v in (m.get('parameters') or {}).items():
            flat['variables'].setdefault(rename[n], {'type': 'parameter', 'value': v})
        for n, e in (m.get('auxiliary') or {}).items():
            aux_out[rename[n]], fo = rename_expr(e, rename, f'{k}.auxiliary.{n}', problems)
            foreign_all.setdefault(k, set()).update(fo)
        for en, eq in (m.get('equations') or {}).items():
            d = {kk: copy.deepcopy(vv) for kk, vv in eq.items() if kk not in ('dynamics', 'condition', 'priority')}
            d['priority'] = float(eq.get('priority', 0)) + LEVEL_BAND * plan['level'][k]
            if 'condition' in eq:
                d['condition'], fo = rename_expr(eq['condition'], rename, f'{k}.equations.{en}.condition', problems)
                foreign_all.setdefault(k, set()).update(fo)
            d['dynamics'] = {}
            for var, expr in (eq.get('dynamics') or {}).items():
                if var not in rename and k in shared and var in shared_names:
                    rename = {**rename, var: var}       # a hook: this component updates a variable another shared component declares
                if var not in rename:
                    problems.append(f'{k}.equations.{en}: updates "{var}", which the model does not declare')
                    continue
                d['dynamics'][rename[var]], fo = rename_expr(expr, rename, f'{k}.equations.{en}.{var}', problems)
                foreign_all.setdefault(k, set()).update(fo)
            if q(p, en) in flat['equations']:
                problems.append(f'{k}.equations.{en}: an equation of this name is already in the flat model; shared members need distinct equation names')
            flat['equations'][q(p, en)] = d
    # wire equations
    for (ck, var), (pk, pvar, conv) in wired.items():
        src = q(pre[pk], pvar)
        expr = substitute_expr(conv, {'x': src}) if conv else src
        unit = 'hour'
        flat['equations'][f'wire_{q(pre[ck], var)}'] = {
            'description': f'Wire: {q(pre[ck], var)} follows {src}. Generated by the game bridge.',
            'step_unit': unit, 'priority': LEVEL_BAND * plan['level'][ck] + LEVEL_BAND / 2,
            'dynamics': {q(pre[ck], var): expr}}
    if aux_out:
        flat['auxiliary'] = aux_out
    # names that are read but declared nowhere stay foreign: report them, they are the model's own business
    for k, fo in foreign_all.items():
        fo = {n for n in fo if q(pre[k], n) not in flat['variables']}
        if fo:
            warnings.append(f'{k}: reads names declared nowhere: {sorted(fo)}')
    if problems:
        raise BridgeError(problems)

    # simulation block: the finest step, plans of the members for the inputs that stay inputs
    steps_h = []
    for k in members:
        st = (models[k].get('simulation') or {}).get('step_size') or {}
        steps_h.append(float(st.get('value', 1)) * STEP_HOURS.get(str(st.get('unit', 'hour')), 1.0))
    fine = min(steps_h) if steps_h else 1.0
    chosen = plan.get('step_size')
    if chosen:
        fine = float(chosen.get('value', 1)) * STEP_HOURS.get(str(chosen.get('unit', 'hour')), 1.0)
    sim = {'step_size': {'value': _nice(fine * 60), 'unit': 'minute'}}
    first_sim = next((models[k].get('simulation') for k in members if (models[k].get('simulation') or {}).get('start_date')), None) or {}
    for key, given in zip(('start_date', 'end_date'), plan.get('dates') or [None, None]):
        if given or first_sim.get(key):
            sim[key] = str(given) if given else first_sim[key]
    if chosen and not (sim.get('start_date') and sim.get('end_date')):
        sim.setdefault('start_date', '2026-01-01')
        sim.setdefault('end_date', '2027-01-01')
    regimens = []
    for k in members:
        for plan_ in (models[k].get('simulation') or {}).get('plans') or []:
            if plan_.get('id') != 'default':
                continue
            for r in plan_.get('regimens') or []:
                if (k, r.get('variable')) in wired:
                    warnings.append(f'{k}: the default regimen for "{r.get("variable")}" is dropped, the variable is wired')
                    continue
                if r.get('variable') in names_of[k] or r.get('variable') in {s.get('var') for s in (bridges[k].get('requires') or {}).values() if s}:
                    r2 = copy.deepcopy(r)
                    r2['variable'] = q(pre[k], r["variable"])
                    regimens.append(r2)
    if regimens:
        sim['plans'] = [{'id': 'default', 'label': 'Default plan of the member models', 'regimens': regimens}]
    flat['simulation'] = sim

    # metadata
    ratings = {}
    for k in members:
        for f, v in ((models[k].get('metadata') or {}).get('ratings') or {}).items():
            s = _rating_score({'metadata': {'ratings': {f: v}}}, f)
            if f not in ratings or s < ratings[f][0]:
                ratings[f] = (s, str(v))
    reviewed = [str((models[k].get('metadata') or {}).get('reviewed')) for k in members if (models[k].get('metadata') or {}).get('reviewed') is not None]
    unreviewed = [r for r in reviewed if not r.lower().startswith('true')]
    flat['metadata'] = {
        'name': plan['system'], 'version': '1.0', 'lm_format_version': '1.0', 'generated': True,
        'source': 'Composed by the game bridge from: ' + ', '.join(f'{k} as "{pre[k]}"' for k in members),
        'description': {'problem': f'System "{plan["system"]}" composed from {len(members)} model(s).',
                        'method': 'Member models renamed with a prefix and joined by wire equations; see bridge.members and bridge.wires.',
                        'limitations': 'Inherits every limitation of its members. Ratings are the lowest of the members.'},
        'ratings': {f: v[1] for f, v in ratings.items()},
    }
    if unreviewed:
        flat['metadata']['reviewed'] = ' | '.join(unreviewed)
    if len(members) == 1:
        flat['metadata']['description'] = copy.deepcopy((models[members[0]].get('metadata') or {}).get('description') or flat['metadata']['description'])

    # bridge description for the game
    br = {'bridge_version': BRIDGE_VERSION, 'system': plan['system'], 'vocabulary_version': vocab.version,
          'step_minutes': _nice(fine * 60), 'readouts': {}, 'handles': {}, 'modes': {}, 'context': {}, 'rates': {},
          'members': {k: pre[k] for k in members},
          'wires': [{'from': q(pre[pk], pv), 'to': q(pre[ck], v)} for (ck, v), (pk, pv, _c) in wired.items()]}
    for cid in plan['goal']:
        srcs = []
        for k in members:
            sp = (bridges[k].get('provides') or {}).get(cid)
            if sp and 'var' in sp:
                lo, hi = sp.get('scale', [0, 1])
                srcs.append({'var': q(pre[k], sp["var"]), 'lo': lo, 'hi': hi})
            elif sp and 'expr' in sp:
                lo, hi = sp['scale']
                text, _ = rename_expr(sp['expr'], {n: q(pre[k], n) for n in names_of[k]}, f'{k}.provides.{cid}', problems)
                srcs.append({'expr': text, 'lo': lo, 'hi': hi})
        if srcs:
            br['readouts'][cid] = {'combine': vocab.combine(cid), 'sources': srcs}
    for k in members:
        for cid, sp in (bridges[k].get('provides') or {}).items():
            if sp and 'rate' in sp:
                expr, _ = rename_expr(sp['rate'], {n: q(pre[k], n) for n in names_of[k]}, f'{k}.provides.{cid}', problems)
                br['rates'].setdefault(cid, {'combine': vocab.rate_combine(cid), 'terms': []})['terms'].append(expr)
    for cid, vs in handles.items():
        if vocab.role(cid) == 'context':
            br['context'][cid] = vs
        else:
            br['handles'][cid] = vs
            br['modes'][cid] = vocab.mode(cid)
    if problems:
        raise BridgeError(problems)
    for sect in ('readouts', 'handles', 'modes', 'context', 'rates'):
        if not br[sect]:
            del br[sect]
    report = {'system': plan['system'], 'members': {k: pre[k] for k in members}, 'choices': plan['choices'],
              'wires': br['wires'], 'warnings': warnings, 'levels': plan['level'],
              'counts': {'variables': len(flat['variables']), 'equations': len(flat['equations'])}}
    return {'model': flat, 'bridge': br, 'report': report}


_RT_FUNCS = {'min': min, 'max': max, 'abs': abs, 'exp': math.exp, 'log': math.log, 'sqrt': math.sqrt, 'pow': math.pow,
             'floor': math.floor, 'tanh': math.tanh, 'sin': math.sin, 'cos': math.cos}


def read_concepts(bridge, state):
    """Reference for a game runtime: the value 0 to 1 of every readout concept, from a dict of flat variable values.
    A source maps its variable linearly from [lo, hi] to [0, 1] and clips; several sources join by the concept's combine."""
    out = {}
    env = {**_RT_FUNCS, **state}
    for cid, spec in (bridge.get('readouts') or {}).items():
        vals = []
        for s in spec['sources']:
            x = state[s['var']] if 'var' in s else eval(s['expr'], {'__builtins__': {}}, env)
            vals.append(min(1.0, max(0.0, (x - s['lo']) / (s['hi'] - s['lo']))))
        out[cid] = max(vals)
    return out


def read_rates(bridge, state):
    """Reference for a game runtime: the summed (or multiplied) rate that members give each concept, per unit of the rate's own time."""
    out = {}
    env = {**_RT_FUNCS, **state}
    for cid, spec in (bridge.get('rates') or {}).items():
        vals = [eval(t, {'__builtins__': {}}, env) for t in spec['terms']]
        out[cid] = math.prod(vals) if spec['combine'] == 'product' else sum(vals)
    return out


def q(prefix, name):
    """A name under a prefix. An empty prefix leaves the name as it is."""
    return f'{prefix}_{name}' if prefix else name


def _nice(x):
    r = round(x, 6)
    return int(r) if r == int(r) else r


def compose_system(system, lib, prefixes=None):
    return compose(resolve(system, lib), lib, prefixes)
