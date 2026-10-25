"""Loads the data files of the plugin and checks them.

Everything a life is made of lives in data/*.yaml: the birth cards, the levers, the events, the packs and the
names of the parts of the risk of death. This module reads them once and refuses a catalog that contradicts
itself, so that a typo in a card shows up at load time and not as a wrong life.
"""

from pathlib import Path
from typing import Any, Dict, List

import yaml

DATA_DIR = Path(__file__).resolve().parent.parent / 'data'
FILES = ('config', 'cards', 'levers', 'events', 'packs', 'risk_groups', 'labels')

WORLDS = ('history', 'modern')
EFFECT_OPS = ('set', 'add', 'mul')
BIRTH_MODES = ('draw', 'fixed')
LANGS = ('en', 'zh')
SPEND_LEVELS = 3
WORK_LEVELS = 3

_cache: Dict[str, Any] = {}


def load_catalog() -> Dict[str, Any]:
    """Returns the catalog, re-read when any data file changed. Raises ValueError listing every problem found."""
    stamp = tuple((DATA_DIR / f'{name}.yaml').stat().st_mtime_ns for name in FILES)
    if _cache.get('stamp') == stamp:
        return _cache['catalog']
    catalog = {}
    for name in FILES:
        with open(DATA_DIR / f'{name}.yaml', 'r', encoding='utf-8') as f:
            catalog[name] = yaml.safe_load(f)
    errors = validate_catalog(catalog)
    if errors:
        raise ValueError('The one_life data files are inconsistent:\n- ' + '\n- '.join(errors))
    _cache['stamp'] = stamp
    _cache['catalog'] = catalog
    return catalog


def _is_text(value: Any) -> bool:
    return isinstance(value, dict) and all(isinstance(value.get(lang), str) and value[lang] for lang in LANGS)


def _check_text(errors: List[str], where: str, value: Any) -> None:
    if not _is_text(value):
        errors.append(f'{where}: needs a non-empty text for each of {", ".join(LANGS)}')


def _check_effects(errors: List[str], where: str, effects: Any) -> None:
    if not isinstance(effects, dict) or not effects:
        errors.append(f'{where}: effects must be a non-empty map')
        return
    for var, op in effects.items():
        if not isinstance(op, dict) or len(op) != 1 or next(iter(op)) not in EFFECT_OPS:
            errors.append(f'{where}: effect on {var} must be exactly one of {", ".join(EFFECT_OPS)}')
        elif not isinstance(next(iter(op.values())), (int, float)):
            errors.append(f'{where}: effect on {var} needs a number')


def _check_event(errors: List[str], where: str, event: Dict[str, Any], scripted: bool) -> None:
    _check_text(errors, f'{where}.title', event.get('title'))
    _check_text(errors, f'{where}.text', event.get('text'))
    _check_effects(errors, f'{where}.effects', event.get('effects'))
    if scripted:
        for field in ('year', 'week'):
            if not isinstance(event.get(field), int) or event[field] < 0:
                errors.append(f'{where}: {field} must be a non-negative integer')
        if isinstance(event.get('week'), int) and event['week'] >= 52:
            errors.append(f'{where}: week must be below 52')
    else:
        p = event.get('p_year')
        if not isinstance(p, (int, float)) or not 0 <= p <= 1:
            errors.append(f'{where}: p_year must be between 0 and 1')
        age = event.get('age')
        if not (isinstance(age, list) and len(age) == 2 and age[0] <= age[1]):
            errors.append(f'{where}: age must be a [low, high] pair')
    weeks = event.get('weeks')
    if not (isinstance(weeks, list) and len(weeks) == 2 and 1 <= weeks[0] <= weeks[1]):
        errors.append(f'{where}: weeks must be a [low, high] pair of positive numbers')
    decision = event.get('decision')
    if decision is not None:
        options = decision.get('options') if isinstance(decision, dict) else None
        if not isinstance(options, dict) or len(options) < 2:
            errors.append(f'{where}: a decision needs at least two options')
            return
        if decision.get('default') not in options:
            errors.append(f'{where}: the default option is not among the options')
        for option_id, option in options.items():
            _check_text(errors, f'{where}.options.{option_id}.title', option.get('title'))
            _check_text(errors, f'{where}.options.{option_id}.text', option.get('text'))
            _check_effects(errors, f'{where}.options.{option_id}.effects', option.get('effects'))
            if 'weeks' in option and not (isinstance(option['weeks'], list) and len(option['weeks']) == 2 and 1 <= option['weeks'][0] <= option['weeks'][1]):
                errors.append(f'{where}.options.{option_id}.weeks must be a [low, high] pair of positive numbers')
            mishap = option.get('mishap')
            if mishap is not None:
                if not isinstance(mishap.get('p'), (int, float)) or not 0 < mishap['p'] < 1:
                    errors.append(f'{where}.options.{option_id}.mishap.p must be between 0 and 1')
                _check_text(errors, f'{where}.options.{option_id}.mishap.title', mishap.get('title'))
                _check_text(errors, f'{where}.options.{option_id}.mishap.text', mishap.get('text'))
                _check_effects(errors, f'{where}.options.{option_id}.mishap.effects', mishap.get('effects'))


def validate_catalog(catalog: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    levers, cards, events, packs = catalog['levers'], catalog['cards']['cards'], catalog['events']['events'], catalog['packs']['packs']

    for name, lever in levers['spend'].items():
        _check_text(errors, f'levers.spend.{name}.title', lever.get('title'))
        _check_text(errors, f'levers.spend.{name}.text', lever.get('text'))
        for var, effect in lever.get('effects', {}).items():
            if not isinstance(effect.get('to'), (int, float)):
                errors.append(f'levers.spend.{name}.effects.{var}: needs a numeric target `to`')
    profiles = levers['work']['profiles']
    for name, profile in profiles.items():
        for key in ('aerobic_mul', 'injury_add', 'stress_add', 'sleep_add'):
            if not (isinstance(profile.get(key), list) and len(profile[key]) == WORK_LEVELS):
                errors.append(f'levers.work.profiles.{name}.{key}: needs {WORK_LEVELS} values')
    if len(levers['work']['levels']) != WORK_LEVELS:
        errors.append(f'levers.work.levels: needs {WORK_LEVELS} entries')
    posture = levers['default_posture']
    if set(posture) != set(levers['spend']) | {'work'}:
        errors.append('levers.default_posture: must name the work lever and every spend lever')

    for card_id, card in cards.items():
        where = f'cards.{card_id}'
        if card.get('world') not in WORLDS:
            errors.append(f'{where}: world must be one of {", ".join(WORLDS)}')
        if not isinstance(card.get('weight'), (int, float)) or card['weight'] < 0:
            errors.append(f'{where}: weight must be a non-negative number')
        if not isinstance(card.get('survive_to_adult'), (int, float)) or not 0 <= card['survive_to_adult'] <= 1:
            errors.append(f'{where}: survive_to_adult must be between 0 and 1')
        if card.get('work_profile') not in profiles:
            errors.append(f'{where}: work_profile is not defined in levers.yaml')
        income = card.get('income')
        if not (isinstance(income, list) and len(income) == WORK_LEVELS and all(isinstance(v, int) and v >= 0 for v in income)):
            errors.append(f'{where}: income needs {WORK_LEVELS} non-negative integers')
        _check_text(errors, f'{where}.title', card.get('title'))
        _check_text(errors, f'{where}.story', card.get('story'))
        for section in ('baseline', 'limit'):
            for var, value in (card.get(section) or {}).items():
                if not isinstance(value, (int, float)):
                    errors.append(f'{where}.{section}.{var}: needs a number')
        if not isinstance(card.get('tags'), list):
            errors.append(f'{where}: tags must be a list')

    for event_id, event in events.items():
        _check_event(errors, f'events.{event_id}', event, scripted=False)

    for pack_id, pack in packs.items():
        where = f'packs.{pack_id}'
        _check_text(errors, f'{where}.title', pack.get('title'))
        _check_text(errors, f'{where}.text', pack.get('text'))
        if pack.get('birth') not in BIRTH_MODES:
            errors.append(f'{where}: birth must be one of {", ".join(BIRTH_MODES)}')
        if pack.get('birth') == 'fixed' and pack.get('card') not in cards:
            errors.append(f'{where}: the fixed card is not in cards.yaml')
        if not isinstance(pack.get('years'), int) or pack['years'] < 1:
            errors.append(f'{where}: years must be a positive integer')
        offsets = pack.get('phase_offsets')
        if offsets is not None:
            if not (isinstance(offsets, list) and offsets and offsets[0] == 0 and offsets == sorted(set(offsets))):
                errors.append(f'{where}: phase_offsets must start at 0 and increase')
            elif isinstance(pack.get('years'), int) and offsets[-1] >= pack['years']:
                errors.append(f'{where}: the last phase starts after the run ends')
            factor = pack.get('income_factor')
            if factor is not None and len(factor) != len(offsets):
                errors.append(f'{where}: income_factor needs one entry per phase')
        seen = set()
        for index, scripted in enumerate(pack.get('scripted', [])):
            sid = scripted.get('id')
            if sid in seen:
                errors.append(f'{where}.scripted: duplicate id {sid}')
            seen.add(sid)
            _check_event(errors, f'{where}.scripted[{index}]', scripted, scripted=True)
            if isinstance(scripted.get('year'), int) and isinstance(pack.get('years'), int) and scripted['year'] >= pack['years']:
                errors.append(f'{where}.scripted[{index}]: happens after the run ends')

    config = catalog['config']
    if not isinstance(config.get('solver'), str):
        errors.append('config: solver must name a solver of the engine')
    offsets = config['full_life_phase_offsets']
    if len(config['full_life_income_factor']) != len(offsets):
        errors.append('config: full_life_income_factor needs one entry per phase')
    bands = config.get('child_death_age_bands', [])
    if not bands or abs(sum(b[2] for b in bands) - 1.0) > 1e-9:
        errors.append('config: child_death_age_bands must be [from, to, share] triples whose shares add to 1')
    return errors
