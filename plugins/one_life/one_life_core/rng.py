"""Seeded draws.

Every random thing in a life is drawn from a generator named by the seed of the life and the purpose of the draw,
for example the fate line, the events of year 12, or the sex. A purpose never shares numbers with another,
and none of them depends on what the player chose, so two lives with the same seed meet the same luck.
"""

import random


def stream(seed: int, *purpose) -> random.Random:
    """A generator for one purpose. A string seed gives the same numbers in every process."""
    return random.Random(f'{seed}|' + '|'.join(str(p) for p in purpose))
