"""Counterfactuals: the same life with something decided differently.

A variant keeps the seed. The events keep their times and the fate line keeps its value, so a variant differs from the
original only through what was changed, and the difference in the age of death is the effect of the change under that
one draw of luck.
"""

import copy
from typing import Any, Dict, List

from .compose import normalize_posture
from .life import Env, fit_posture, run_life

MAX_VARIANTS = 5


def _materialize(base: Dict[str, Any]) -> Dict[str, Any]:
    """The record of the base life with every posture and every option written out, including the ones carried over
    or taken by default, so that a patch applies to what really happened."""
    life = copy.deepcopy(base['life'])
    life['postures'] = {str(p['index']): dict(p['posture']) for p in base['phases']}
    for event in base['events']:
        if event.get('option'):
            life['decisions'].setdefault(event['key'], event['option'])
    return life


def _patched(env: Env, base: Dict[str, Any], variant: Dict[str, Any]) -> Dict[str, Any]:
    life = _materialize(base)
    changes_birth = 'card' in variant or 'sex' in variant
    if 'card' in variant:
        life['card'] = variant['card']
    if 'sex' in variant:
        life['sex'] = variant['sex']
    postures = life['postures']
    for key, patch in (variant.get('postures') or {}).items():
        targets = list(postures) if key == 'all' else [str(key)]
        for target in targets:
            if target not in postures:
                raise ValueError(f'The life has no phase {key}')
            postures[target] = normalize_posture(env.catalog['levers'], {**postures[target], **patch})
    life['decisions'].update({str(k): str(v) for k, v in (variant.get('decisions') or {}).items()})
    if changes_birth:
        # The postures were fitted to another card, so they are fitted again to the income of this one.
        life['postures'] = {}
    return life


def compare_lives(env: Env, raw_life: Dict[str, Any], variants: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Runs the life and each variant over the whole span, and sets them side by side."""
    if not variants:
        raise ValueError('Give at least one variant')
    if len(variants) > MAX_VARIANTS:
        raise ValueError(f'At most {MAX_VARIANTS} variants at a time')
    base = run_life(env, raw_life, outlook=False, ghost=True)
    if base['status'] == 'pending':
        raise ValueError('The life is not finished: decide the open choices first')
    out = [_view('base', 'base', base, base)]
    for index, variant in enumerate(variants):
        life = _patched(env, base, variant)
        result = run_life(env, life, outlook=False, ghost=True, check_budget=not variant.get('ignore_budget'), autofill=True)
        out.append(_view(str(variant.get('id') or f'v{index + 1}'), variant.get('label') or '', result, base))
    return {'variants': out}


def _median_age(result: Dict[str, Any]):
    odds = result.get('odds')
    return odds['age_at_survival'].get('0.5') if odds else None


def _view(variant_id: str, label: str, result: Dict[str, Any], base: Dict[str, Any]) -> Dict[str, Any]:
    death = result.get('death')
    base_death = base.get('death')
    view = {
        'id': variant_id, 'label': label, 'life': result['life'], 'status': result['status'],
        'card': result['birth']['card'], 'sex': result['birth']['sex'],
        'death_age': death['age'] if death else None,
        'median_age': _median_age(result),
        'odds': result.get('odds'),
        'savings': result.get('savings'),
        'timeline': [{'age': t['age'], 'survival': t['survival'], 'health': t['health'], 'zone': t['zone']} for t in result['timeline']],
        'sources': result.get('sources'),
        'survival_end': result['timeline'][-1]['survival'] if result['timeline'] else None,
        'health_end': result['timeline'][-1]['health'] if result['timeline'] else None,
    }
    if base_death and death:
        view['death_age_change'] = round(death['age'] - base_death['age'], 2)
    base_median = _median_age(base)
    if base_median is not None and view['median_age'] is not None:
        view['median_age_change'] = round(view['median_age'] - base_median, 1)
    return view
