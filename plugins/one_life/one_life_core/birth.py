"""The birth draw: which card, which sex, and whether childhood is survived.

This is the lookup layer of the plugin. The body model starts at 18, so what happens before is one chance
per card, set by hand in cards.yaml, plus an age at death drawn from the bands of config.yaml.
"""

from typing import Any, Dict, Optional

from .rng import stream


def eligible_cards(catalog: Dict[str, Any], world: str) -> Dict[str, Dict[str, Any]]:
    """The cards a random draw can pick: not reserved for a pack, with a positive weight, in the chosen world."""
    cards = catalog['cards']['cards']
    return {cid: card for cid, card in cards.items()
            if not card['pack_only'] and card['weight'] > 0 and (world == 'all' or card['world'] == world)}


def draw_card(catalog: Dict[str, Any], seed: int, world: str) -> str:
    pool = eligible_cards(catalog, world)
    if not pool:
        raise ValueError(f'No birth card in the world "{world}"')
    ids = list(pool)
    total = sum(pool[cid]['weight'] for cid in ids)
    pick = stream(seed, 'card').random() * total
    for cid in ids:
        pick -= pool[cid]['weight']
        if pick < 0:
            return cid
    return ids[-1]


def draw_sex(seed: int) -> str:
    return 'f' if stream(seed, 'sex').random() < 0.5 else 'm'


def child_outcome(catalog: Dict[str, Any], card: Dict[str, Any], seed: int) -> Dict[str, Any]:
    """Whether the child reaches the age where the body model starts, and if not, the age at death."""
    survived = stream(seed, 'child').random() < card['survive_to_adult']
    if survived:
        return {'survived': True, 'chance': card['survive_to_adult']}
    r = stream(seed, 'child_age')
    pick, bands = r.random(), catalog['config']['child_death_age_bands']
    for low, high, share in bands:
        pick -= share
        if pick < 0:
            return {'survived': False, 'chance': card['survive_to_adult'], 'age_at_death': round(low + r.random() * (high - low), 2)}
    low, high, _ = bands[-1]
    return {'survived': False, 'chance': card['survive_to_adult'], 'age_at_death': round(high, 2)}


def draw_birth(catalog: Dict[str, Any], seed: int, world: str, card_id: Optional[str], sex: Optional[str]) -> Dict[str, Any]:
    """The birth of a life. A given card or sex is used as it is, and the rest is drawn from the seed."""
    cards = catalog['cards']['cards']
    if card_id is None:
        card_id = draw_card(catalog, seed, world)
    elif card_id not in cards:
        raise ValueError(f'Unknown birth card: {card_id}')
    return {
        'card_id': card_id,
        'sex': sex if sex in ('f', 'm') else draw_sex(seed),
        'child': child_outcome(catalog, cards[card_id], seed),
    }
