"""What happens when in a life: the phases and the events.

The events of a life are fixed by its seed, its birth card and its pack, and they do not depend on any choice
of the player. A choice can change what an event does, never whether it happens or when.
"""

from typing import Any, Dict, List, Optional

from .rng import stream

WEEKS_PER_YEAR = 52


def pack_phases(catalog: Dict[str, Any], pack: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The phases of a pack. At the start of each one the player sets a posture."""
    config = catalog['config']
    offsets = pack.get('phase_offsets') or config['full_life_phase_offsets']
    factors = pack.get('income_factor') or config['full_life_income_factor']
    years = pack['years']
    phases = []
    for index, start in enumerate(offsets):
        end = offsets[index + 1] if index + 1 < len(offsets) else years
        phases.append({'index': index, 'start_year': start, 'end_year': end,
                       'start_week': start * WEEKS_PER_YEAR, 'income_factor': factors[index]})
    return phases


def _duration(weeks: List[int], u: float) -> int:
    low, high = weeks
    return min(high, low + int(u * (high - low + 1)))


def _instance(source: str, event_id: str, year: int, week: int, spec: Dict[str, Any], u_duration: float, u_outcome: float) -> Dict[str, Any]:
    return {
        'key': f'{year}:{event_id}', 'id': event_id, 'source': source,
        'year': year, 'start_week': year * WEEKS_PER_YEAR + week,
        'title': spec['title'], 'text': spec['text'],
        'effects': spec['effects'], 'weeks': spec['weeks'], 'u_duration': u_duration, 'u_outcome': u_outcome,
        'decision': spec.get('decision'),
    }


def build_events(catalog: Dict[str, Any], pack: Dict[str, Any], card: Dict[str, Any], seed: int, start_age: int) -> List[Dict[str, Any]]:
    """Every event of the run, drawn from the deck for the tags of the card plus the scripted ones of the pack."""
    tags = set(card['tags'])
    out = []
    for year in range(pack['years']):
        age = start_age + year
        for event_id, spec in catalog['events']['events'].items():
            if 'tags_any' in spec and not tags & set(spec['tags_any']):
                continue
            if not spec['age'][0] <= age <= spec['age'][1]:
                continue
            p = spec['p_year']
            for tag, mult in spec.get('tag_mult', {}).items():
                if tag in tags:
                    p *= mult
            r = stream(seed, 'ev', year, event_id)
            if r.random() < p:
                week = r.randrange(WEEKS_PER_YEAR)
                out.append(_instance('deck', event_id, year, week, spec, r.random(), r.random()))
    for spec in pack.get('scripted', []):
        r = stream(seed, 'script', spec['id'])
        out.append(_instance('script', spec['id'], spec['year'], spec['week'], spec, r.random(), r.random()))
    return sorted(out, key=lambda e: (e['start_week'], e['id']))


def resolve_event(event: Dict[str, Any], decisions: Dict[str, str]) -> Dict[str, Any]:
    """What the event does under the option picked, or the default option when none was picked yet.

    An option may carry a mishap, a chance that it goes wrong. Whether it does is read from a number drawn with the
    event, so it is the same in every replay and does not depend on which option is looked at first."""
    decision = event['decision']
    option_id, option = None, None
    if decision:
        option_id = decisions.get(event['key'], decision['default'])
        if option_id not in decision['options']:
            raise ValueError(f'Unknown option "{option_id}" for the event {event["key"]}')
        option = decision['options'][option_id]
    effects = option['effects'] if option else event['effects']
    mishap = (option or {}).get('mishap')
    went_wrong = bool(mishap) and event['u_outcome'] < mishap['p']
    weeks = _duration((option or {}).get('weeks', event['weeks']), event['u_duration'])
    return {'option': option_id, 'effects': effects, 'weeks': weeks,
            'mishap': mishap if went_wrong else None,
            'start_week': event['start_week'], 'end_week': event['start_week'] + weeks}


def decision_points(phases: List[Dict[str, Any]], events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Every moment the player may act, in order: a posture at the start of a phase, an option when an event comes."""
    points = [{'week': p['start_week'], 'order': 0, 'kind': 'posture', 'index': p['index'], 'key': str(p['index'])}
              for p in phases]
    points += [{'week': e['start_week'], 'order': 1, 'kind': 'event', 'index': i, 'key': e['key']}
               for i, e in enumerate(events) if e['decision']]
    return sorted(points, key=lambda pt: (pt['week'], pt['order'], pt['index']))


def first_pending(points: List[Dict[str, Any]], postures: Dict[str, Any], decisions: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """The earliest moment where the player has not acted yet."""
    for point in points:
        done = point['key'] in (postures if point['kind'] == 'posture' else decisions)
        if not done:
            return point
    return None
