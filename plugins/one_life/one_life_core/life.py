"""Runs one life from its record.

A life is a record: a seed, a pack, the world to draw the birth from, and what the player decided so far. Running
it is a pure function of that record, so the plugin keeps nothing between calls, the same record always gives the same
life, and a counterfactual is the same record with one decision changed.

Death is one number. The fate line `u` is drawn once from the seed, and the person dies in the first week where the
chance of being alive, given by the body model, falls to `u` or below. A different decision changes the curve and
not the line, so two lives of one seed differ only through what was decided.

The player must not see what has not happened yet. Up to the first moment that waits for a decision the run is the
life. Past it the run is an outlook with no further events, and it ends there.
"""

from typing import Any, Callable, Dict, List, Optional, Tuple

from . import attribution
from .birth import draw_birth
from .compose import (apply_effects, missing_variables, normalize_posture, phase_income, posture_cost,
                      posture_values, spend_level_values)
from .rng import stream
from .schedule import (WEEKS_PER_YEAR, build_events, decision_points, first_pending, pack_phases, resolve_event)

WORLDS = ('all', 'history', 'modern')
YEAR = 365.25 / 7.0
TIMELINE_FIELDS = (
    ('health', 'health_score'), ('sbp', 'systolic_bp'),
    ('crp', 'crp'), ('hb', 'hemoglobin'), ('glucose', 'fasting_glucose'), ('vo2', 'vo2max_rel'),
    ('fev1', 'fev1_pct'), ('scurvy', 'scurvy_index'), ('wound', 'wound_burden'),
    ('infection', 'infection_load'), ('fatigue', 'fatigue_index'),
)
ENVIRONMENT_FIELDS = ('water_safety', 'crowding', 'vector_exposure', 'medical_era', 'vitamin_c_mg', 'diet_quality',
                      'injury_exposure', 'aerobic_min', 'sleep_hours', 'stress_load')
PROBABILITY_AGES = (30, 40, 50, 60, 70, 80, 90)
QUANTILES = (0.75, 0.5, 0.25)


class Env:
    """What a run needs from outside: the catalog, the input defaults of the body model, the risk splitter and a way
    to start a body. The tests give a stand-in body, the plugin gives the engine."""

    def __init__(self, catalog: Dict[str, Any], defaults: Dict[str, Dict[str, Any]], splitter: Optional[attribution.RiskSplitter],
                 start_body: Callable[[Dict[str, float], int], Any]):
        self.catalog = catalog
        self.defaults = defaults
        self.splitter = splitter
        self.start_body = start_body
        missing = missing_variables(catalog, defaults)
        if missing:
            raise ValueError('The body model has no input named: ' + ', '.join(missing))


def normalize_life(catalog: Dict[str, Any], raw: Dict[str, Any]) -> Dict[str, Any]:
    """The record of a life with everything checked. Raises ValueError for anything the page could not have sent."""
    if not isinstance(raw, dict):
        raise ValueError('A life must be an object')
    seed = raw.get('seed')
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2 ** 31:
        raise ValueError('seed must be an integer between 0 and 2147483647')
    pack = raw.get('pack') or 'full_life'
    if pack not in catalog['packs']['packs']:
        raise ValueError(f'Unknown pack: {pack}')
    world = raw.get('world') or 'all'
    if world not in WORLDS:
        raise ValueError(f'world must be one of {", ".join(WORLDS)}')
    card = raw.get('card')
    if card is not None and card not in catalog['cards']['cards']:
        raise ValueError(f'Unknown birth card: {card}')
    sex = raw.get('sex')
    if sex not in (None, 'f', 'm'):
        raise ValueError('sex must be "f", "m" or empty')
    postures = {}
    for key, posture in (raw.get('postures') or {}).items():
        if not str(key).isdigit():
            raise ValueError(f'Bad phase index: {key}')
        postures[str(int(key))] = normalize_posture(catalog['levers'], posture)
    decisions = {str(k): str(v) for k, v in (raw.get('decisions') or {}).items()}
    return {'seed': seed, 'pack': pack, 'world': world, 'card': card, 'sex': sex, 'postures': postures, 'decisions': decisions}


def fit_posture(levers: Dict[str, Any], card: Dict[str, Any], posture: Dict[str, int], factor: float) -> Dict[str, int]:
    """Lowers the highest spend levers one level at a time until the posture fits the income of the phase."""
    fitted = dict(posture)
    income = phase_income(card, fitted, factor)
    spend = list(levers['spend'])
    while posture_cost(levers, fitted) > income:
        top = max(reversed(spend), key=lambda name: fitted[name])
        fitted[top] -= 1
    return fitted


def _phase_postures(env: Env, life: Dict[str, Any], card: Dict[str, Any], phases: List[Dict[str, Any]],
                    check_budget: bool) -> List[Dict[str, Any]]:
    """The posture of every phase: the one the player set, or the previous one carried over until they set it."""
    levers = env.catalog['levers']
    unknown = set(life['postures']) - {str(p['index']) for p in phases}
    if unknown:
        raise ValueError('This pack has no phase ' + ', '.join(sorted(unknown)))
    resolved, previous = [], dict(levers['default_posture'])
    for phase in phases:
        key = str(phase['index'])
        decided = key in life['postures']
        if decided:
            posture = life['postures'][key]
            if check_budget and posture_cost(levers, posture) > phase_income(card, posture, phase['income_factor']):
                raise ValueError(f'Phase {phase["index"]} spends more livelihood points than it brings')
        else:
            posture = fit_posture(levers, card, previous, phase['income_factor'])
        income = phase_income(card, posture, phase['income_factor'])
        resolved.append({'index': phase['index'], 'decided': decided, 'posture': posture,
                         'cost': posture_cost(levers, posture), 'income': income})
        previous = posture
    return resolved


def _breakpoints(env: Env, total_weeks: int, phases: List[Dict[str, Any]], resolved_events: List[Dict[str, Any]]) -> List[int]:
    chunk = env.catalog['config']['chunk_weeks']
    points = set(range(0, total_weeks, chunk)) | {total_weeks}
    points |= {p['start_week'] for p in phases if p['start_week'] < total_weeks}
    for r in resolved_events:
        points |= {w for w in (r['start_week'], r['end_week']) if 0 <= w <= total_weeks}
    return sorted(points)


def _interpolate_age(ages: List[float], survival: List[float], level: float) -> Optional[float]:
    """The age where the chance of being alive first falls to the level, or None if it never does."""
    for i, s in enumerate(survival):
        if s <= level:
            if i == 0:
                return ages[0]
            s0, s1 = survival[i - 1], s
            frac = 0.0 if s0 == s1 else (s0 - level) / (s0 - s1)
            return ages[i - 1] + frac * (ages[i] - ages[i - 1])
    return None


def _survival_at(ages: List[float], survival: List[float], age: float) -> Optional[float]:
    if not ages or age > ages[-1] or age < ages[0]:
        return None
    for i, a in enumerate(ages):
        if a >= age:
            return survival[i]
    return None


def _odds(ages: List[float], survival: List[float]) -> Dict[str, Any]:
    quantile_ages = {}
    for q in QUANTILES:
        value = _interpolate_age(ages, survival, q)
        quantile_ages[str(q)] = None if value is None else round(value, 1)
    alive = {}
    for age in PROBABILITY_AGES:
        value = _survival_at(ages, survival, age)
        if value is not None:
            alive[str(age)] = round(value, 4)
    return {'age_at_survival': quantile_ages, 'alive_at_age': alive}


def _accumulate(segments: List[Dict[str, Any]], start_week: int, end_week: int) -> List[Dict[str, Any]]:
    """The risk accumulated between two weeks, named and ranked."""
    parts = []
    for seg in segments:
        low, high = max(seg['a'], start_week), min(seg['b'], end_week)
        if high > low and seg['split']:
            parts.append(((high - low) / YEAR, seg['split']))
    return attribution.rank(attribution.merge_weighted(parts)) if parts else []


def _summaries(items: List[Dict[str, Any]], limit: int = 8) -> List[Dict[str, Any]]:
    out = []
    for row in items:
        if abs(row['share']) < 0.005:
            continue
        out.append({'section': row['section'], 'name': row['name'], 'hazard': round(row['hazard'], 5), 'share': round(row['share'], 4)})
    return out[:limit]


def _round(value: Any, digits: int = 3) -> Any:
    return round(value, digits) if isinstance(value, float) else value


def _posture_preview(env: Env, card: Dict[str, Any], phase: Dict[str, Any], carried: Dict[str, int]) -> Dict[str, Any]:
    levers = env.catalog['levers']
    spend = {name: {var: [round(v, 3) for v in values] for var, values in spend_level_values(card, env.defaults, lever).items()}
             for name, lever in levers['spend'].items()}
    return {'income_by_work': [phase_income(card, {'work': w}, phase['income_factor']) for w in range(3)],
            'spend_values': spend, 'carried': carried}


def _event_view(event: Dict[str, Any], resolved: Dict[str, Any], decided: bool, start_age: int) -> Dict[str, Any]:
    decision = event['decision']
    view = {'key': event['key'], 'id': event['id'], 'source': event['source'], 'age': round(start_age + event['start_week'] / YEAR, 2),
            'week': event['start_week'], 'weeks': resolved['weeks'], 'title': event['title'], 'text': event['text'],
            'option': resolved['option'], 'decided': decided or not decision,
            'mishap': {'title': resolved['mishap']['title'], 'text': resolved['mishap']['text']} if resolved['mishap'] else None}
    if decision:
        view['options'] = [{'id': oid, 'title': o['title'], 'text': o['text']} for oid, o in decision['options'].items()]
        view['default'] = decision['default']
    return view


def run_life(env: Env, raw_life: Dict[str, Any], outlook: bool = True, ghost: bool = True, check_budget: bool = True,
             autofill: bool = False) -> Dict[str, Any]:
    """Runs the record up to the first moment that waits for the player, or to the end of the life.

    `outlook` keeps stepping the body past that moment without further events, and `ghost` keeps stepping it past the
    death, so that the chance of being alive can be read over the whole span. Both cost time and a comparison of
    many lives may turn them off. `autofill` takes the carried posture and the default option wherever the player has
    not decided, so that the life never waits, which is what a comparison of variants needs."""
    catalog = env.catalog
    config, levers = catalog['config'], catalog['levers']
    life = normalize_life(catalog, raw_life)
    seed, pack = life['seed'], catalog['packs']['packs'][life['pack']]
    card_id = pack['card'] if pack['birth'] == 'fixed' else life['card']
    birth = draw_birth(catalog, seed, life['world'], card_id, life['sex'])
    card = catalog['cards']['cards'][birth['card_id']]
    start_age = pack.get('start_age', config['adult_start_age'])
    result: Dict[str, Any] = {
        'life': life,
        'birth': {'card': birth['card_id'], 'sex': birth['sex'], 'child': birth['child'], 'start_age': start_age,
                  'levers_effective': {name: any(abs(v[-1] - v[0]) > 1e-9 for v in spend_level_values(card, env.defaults, lever).values())
                                       for name, lever in levers['spend'].items()},
                  'environment': {var: {'value': _round(float(card['baseline'].get(var, env.defaults[var]['value']))),
                                        'limit': card['limit'].get(var)} for var in ENVIRONMENT_FIELDS}},
    }
    if not birth['child']['survived']:
        result.update(status='child_death', death={'age': birth['child']['age_at_death'], 'child': True},
                      timeline=[], events=[], phases=[], pending=None, odds=None)
        return result

    phases = pack_phases(catalog, pack)
    events = build_events(catalog, pack, card, seed, start_age)
    resolved_events = [resolve_event(e, life['decisions']) for e in events]
    postures = _phase_postures(env, life, card, phases, check_budget)
    points = decision_points(phases, events)
    pending_point = None if autofill else first_pending(points, life['postures'], life['decisions'])
    cut = pending_point['week'] if pending_point else None
    total_weeks = pack['years'] * WEEKS_PER_YEAR

    phase_views = [{'index': p['index'], 'start_age': start_age + p['start_year'], 'end_age': start_age + p['end_year'],
                    **postures[p['index']]} for p in phases]
    result['phases'] = phase_views

    if cut == 0:
        result.update(status='pending', timeline=[], events=[], death=None, odds=None,
                      pending=_pending_view(env, card, phases, events, postures, pending_point, start_age))
        return result

    sex_female = 1.0 if birth['sex'] == 'f' else 0.0
    body = env.start_body({'sex_female': sex_female, 'age_years': float(start_age)}, total_weeks + 1)
    u = stream(seed, 'fate').random()
    try:
        run = _simulate(env, body, card, phases, postures, events, resolved_events, total_weeks, cut, u, outlook, ghost)
    finally:
        body.close()

    death_week = run['death_week']
    lived_until = death_week if death_week is not None else (cut if cut is not None else total_weeks)
    revealed = [i for i, e in enumerate(events) if e['start_week'] <= lived_until and (cut is None or e['start_week'] < cut)]
    result['events'] = [_event_view(events[i], resolved_events[i], events[i]['key'] in life['decisions'], start_age) for i in revealed]
    result['timeline'] = run['timeline']
    result['lived_until_week'] = lived_until
    result['odds'] = _odds(run['ages'], run['survival']) if run['ages'] else None
    result['odds_basis'] = ('outlook' if death_week is None and cut is not None else 'ghost' if death_week is not None else 'life')
    sources = {'life': _summaries(_accumulate(run['segments'], 0, lived_until))}
    savings = sum(max(0, p['income'] - p['cost']) for p, ph in zip(postures, phases) if ph['start_week'] <= lived_until)
    result['savings'] = savings

    if death_week is not None:
        sources['final'] = _summaries(_accumulate(run['segments'], max(0, death_week - 2 * WEEKS_PER_YEAR), death_week))
        result['status'] = 'ended'
        result['pending'] = None
        result['death'] = {'age': round(run['death_age'], 2), 'week': death_week, 'fate': round(u, 5),
                           'state': run['death_state']}
        result['sources'] = sources
    elif cut is not None:
        result['status'] = 'pending'
        result['death'] = None
        result['pending'] = _pending_view(env, card, phases, events, postures, pending_point, start_age)
        result['sources'] = sources
    else:
        result['status'] = 'completed'
        result['pending'] = None
        result['death'] = None
        result['sources'] = sources
    return result


def _pending_view(env: Env, card: Dict[str, Any], phases: List[Dict[str, Any]], events: List[Dict[str, Any]],
                  postures: List[Dict[str, Any]], point: Dict[str, Any], start_age: int) -> Dict[str, Any]:
    age = round(start_age + point['week'] / YEAR, 2)
    if point['kind'] == 'posture':
        phase = phases[point['index']]
        return {'kind': 'posture', 'age': age, 'week': point['week'], 'phase': point['index'],
                **_posture_preview(env, card, phase, postures[point['index']]['posture'])}
    event = events[point['index']]
    return {'kind': 'event', 'age': age, 'week': point['week'], 'key': event['key'], 'title': event['title'], 'text': event['text'],
            'default': event['decision']['default'],
            'options': [{'id': oid, 'title': o['title'], 'text': o['text'], 'effects': o['effects'], 'weeks': o.get('weeks', event['weeks']),
                         'mishap': ({'p': o['mishap']['p'], 'title': o['mishap']['title']} if o.get('mishap') else None)}
                        for oid, o in event['decision']['options'].items()]}


def _simulate(env: Env, body: Any, card: Dict[str, Any], phases: List[Dict[str, Any]], postures: List[Dict[str, Any]],
              events: List[Dict[str, Any]], resolved_events: List[Dict[str, Any]], total_weeks: int,
              cut: Optional[int], u: float, outlook: bool, ghost: bool) -> Dict[str, Any]:
    """Steps the body through the life in stretches of constant inputs."""
    config = env.catalog['config']
    stop = min(config['stop_survival'], u / 2)
    breakpoints = _breakpoints(env, total_weeks, phases, resolved_events)
    ages: List[float] = []
    survival: List[float] = []
    segments: List[Dict[str, Any]] = []
    timeline: List[Dict[str, Any]] = []
    death_week: Optional[int] = None
    death_age = 0.0
    death_state: Dict[str, Any] = {}

    for a, b in zip(breakpoints, breakpoints[1:]):
        in_outlook = cut is not None and a >= cut and death_week is None
        if in_outlook and not outlook:
            break
        if death_week is not None and not ghost:
            break
        phase = max((p for p in phases if p['start_week'] <= a), key=lambda p: p['start_week'])
        values = posture_values(env.catalog, card, env.defaults, postures[phase['index']]['posture'])
        for event, resolved in zip(events, resolved_events):
            if resolved['start_week'] <= a < resolved['end_week'] and not (in_outlook and event['start_week'] >= cut):
                values = apply_effects(values, resolved['effects'], env.defaults)
                if resolved['mishap']:
                    values = apply_effects(values, resolved['mishap']['effects'], env.defaults)
        rows, state = body.advance(b - a, values)
        for i, row in enumerate(rows):
            week = a + i + 1
            ages.append(row['age_years'])
            survival.append(row['survival_prob'])
            if death_week is None and not in_outlook and row['survival_prob'] <= u:
                death_week, death_age = week, row['age_years']
                death_state = {name: _round(row.get(name)) for name in (field for _, field in TIMELINE_FIELDS)}
        segments.append({'a': a, 'b': b, 'split': env.splitter.split(state) if env.splitter else None})
        if b % WEEKS_PER_YEAR == 0 or b == total_weeks:
            point = {'age': round(state['age_years'], 2), 'week': b, 'survival': round(state['survival_prob'], 5),
                     'hazard': round(state['annual_hazard'], 5), 'zone': 'outlook' if (in_outlook or (death_week is not None and b > death_week)) else 'life'}
            for key, field in TIMELINE_FIELDS:
                point[key] = _round(state.get(field), 3)
            timeline.append(point)
        if rows[-1]['survival_prob'] < stop:
            break
    return {'ages': ages, 'survival': survival, 'segments': segments, 'timeline': timeline,
            'death_week': death_week, 'death_age': death_age, 'death_state': death_state}
