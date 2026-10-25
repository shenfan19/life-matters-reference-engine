"""Turns a birth card, a posture and the running events into the inputs of the body model.

Nothing here simulates. Given what the player set and what is happening, it returns the value of every input
that the plugin touches, so that the same call always gives the same inputs and the lever table in the page can
be shown without running the body model.
"""

from typing import Any, Dict, List, Optional

from .catalog import SPEND_LEVELS, WORK_LEVELS

# Inputs the work lever moves, besides the ones named by the card.
WORK_INPUTS = ('aerobic_min', 'injury_exposure', 'stress_load', 'sleep_hours')

BOUNDS = {'sleep_hours': (3.0, 12.0)}
UNIT_BOUNDS = {'score': (0.0, 1.0), 'fraction': (0.0, 1.0)}


def clamp(var: str, value: float, unit: Optional[str]) -> float:
    low, high = BOUNDS.get(var) or UNIT_BOUNDS.get(unit) or (0.0, None)
    value = max(low, value)
    return value if high is None else min(high, value)


def normalize_posture(levers: Dict[str, Any], posture: Optional[Dict[str, Any]]) -> Dict[str, int]:
    """A posture with every lever present and every level an integer in range. Raises ValueError otherwise."""
    result = dict(levers['default_posture'])
    for name, level in (posture or {}).items():
        if name not in result:
            raise ValueError(f'Unknown lever: {name}')
        if isinstance(level, bool) or not isinstance(level, (int, float)) or int(level) != level:
            raise ValueError(f'Lever {name} needs a whole number')
        top = (WORK_LEVELS if name == 'work' else SPEND_LEVELS + 1) - 1
        if not 0 <= level <= top:
            raise ValueError(f'Lever {name} must be between 0 and {top}')
        result[name] = int(level)
    return result


def posture_cost(levers: Dict[str, Any], posture: Dict[str, int]) -> int:
    return sum(posture[name] for name in levers['spend'])


def phase_income(card: Dict[str, Any], posture: Dict[str, int], factor: float) -> int:
    """Livelihood points a phase brings: the card's income for the chosen work level, scaled by the phase."""
    return int(round(card['income'][posture['work']] * factor))


def _toward(base: float, target: float, limit: Optional[float]) -> float:
    """The value a lever reaches at its top level: the target, held by the card's limit, never worse than the base."""
    if target >= base:
        if limit is not None:
            target = min(target, limit)
        return max(target, base)
    if limit is not None:
        target = max(target, limit)
    return min(target, base)


def card_values(card: Dict[str, Any], defaults: Dict[str, Dict[str, Any]], variables: List[str]) -> Dict[str, float]:
    """The card's value for each variable: its baseline if it sets one, else the model default."""
    return {var: float(card['baseline'].get(var, defaults[var]['value'])) for var in variables}


def spend_level_values(card: Dict[str, Any], defaults: Dict[str, Dict[str, Any]], lever: Dict[str, Any]) -> Dict[str, List[float]]:
    """For one spend lever, the value of each of its inputs at levels 0 to 3."""
    base = card_values(card, defaults, list(lever['effects']))
    out = {}
    for var, effect in lever['effects'].items():
        top = _toward(base[var], float(effect['to']), card['limit'].get(var))
        out[var] = [base[var] + (top - base[var]) * level / SPEND_LEVELS for level in range(SPEND_LEVELS + 1)]
    return out


def touched_variables(catalog: Dict[str, Any], card: Dict[str, Any]) -> List[str]:
    names = list(card['baseline']) + list(WORK_INPUTS)
    for lever in catalog['levers']['spend'].values():
        names += list(lever['effects'])
    return list(dict.fromkeys(names))


def _effect_variables(catalog: Dict[str, Any]) -> set:
    """Every input named by an event of the deck, a scripted event of a pack, or one of their options."""
    specs = list(catalog['events']['events'].values())
    for pack in catalog['packs']['packs'].values():
        specs += pack.get('scripted', [])
    names = set()
    for spec in specs:
        names |= set(spec['effects'])
        for option in (spec.get('decision') or {}).get('options', {}).values():
            names |= set(option['effects']) | set((option.get('mishap') or {}).get('effects', {}))
    return names


def used_variables(catalog: Dict[str, Any]) -> set:
    """Every input of the body model that the data files name."""
    names = set(WORK_INPUTS) | _effect_variables(catalog)
    for lever in catalog['levers']['spend'].values():
        names |= set(lever['effects'])
    for card in catalog['cards']['cards'].values():
        names |= set(card['baseline'])
    return names


def missing_variables(catalog: Dict[str, Any], defaults: Dict[str, Dict[str, Any]]) -> List[str]:
    """Inputs named by the data files that the body model does not have."""
    return sorted(n for n in used_variables(catalog) if n not in defaults)


def posture_values(catalog: Dict[str, Any], card: Dict[str, Any], defaults: Dict[str, Dict[str, Any]],
                   posture: Dict[str, int]) -> Dict[str, float]:
    """The inputs under a posture: the card's values, moved by the spend levers, then by the kind of work."""
    levers = catalog['levers']
    values = card_values(card, defaults, touched_variables(catalog, card))
    for name, lever in levers['spend'].items():
        level = posture[name]
        if level:
            for var, by_level in spend_level_values(card, defaults, lever).items():
                values[var] = by_level[level]
    profile = levers['work']['profiles'][card['work_profile']]
    w = posture['work']
    values['aerobic_min'] *= profile['aerobic_mul'][w]
    for var, key in (('injury_exposure', 'injury_add'), ('stress_load', 'stress_add'), ('sleep_hours', 'sleep_add')):
        values[var] += profile[key][w]
    return {var: clamp(var, v, defaults[var].get('unit')) for var, v in values.items()}


def apply_effects(values: Dict[str, float], effects: Dict[str, Dict[str, float]],
                  defaults: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    """Applies the effects of one event to a copy of the inputs."""
    out = dict(values)
    for var, op in effects.items():
        current = out.get(var, float(defaults[var]['value']))
        (kind, amount), = op.items()
        if kind == 'set':
            current = amount
        elif kind == 'add':
            current += amount
        else:
            current *= amount
        out[var] = clamp(var, float(current), defaults[var].get('unit'))
    return out
