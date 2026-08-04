"""Small string-parsing helpers used by optimizer_engine.py.

Time-window expansion turns an optimize.time_start/time_end "HH:MM~HH:MM"
range into a discrete slot list the optimizer can index into (T2, ADR 0100).
Condition parsing reads a constraint's "<= 100" style string into
(operator, threshold) for _eval_G() in optimizer_eval.py.
"""

import re
from decimal import Decimal
from typing import List, Tuple


def _expand_time_window(window: str, opt_step: str = '1h') -> List[str]:
    """Expand "HH:MM~HH:MM" to discrete slot list at given granularity."""
    start_str, end_str = [s.strip() for s in window.split('~')]
    h0, m0 = map(int, start_str.split(':'))
    h1, m1 = map(int, end_str.split(':'))
    step_min = 15 if opt_step == '15min' else 60
    slots, t, end_t = [], h0 * 60 + m0, h1 * 60 + m1
    while t <= end_t:
        slots.append(f'{t // 60:02d}:{t % 60:02d}')
        t += step_min
    return slots


def _hhmm_to_min(s: str) -> int:
    h, m = map(int, s.split(':'))
    return h * 60 + m


def _shift_time(start: str, width_min: int) -> str:
    """Add width_min minutes to an "HH:MM" time, wrapping past 24:00 to 00:00."""
    t = (_hhmm_to_min(start) + width_min) % 1440
    return f'{t // 60:02d}:{t % 60:02d}'


def _snap_to_step(raw: float, lo: float, hi: float, step: float) -> float:
    """Snap raw to the nearest lo-anchored multiple of step, clamped to [lo, hi] (T1).

    Anchored at lo rather than 0 so the grid stays aligned with the searched range
    even when lo isn't itself a multiple of step (e.g. a [0.9, 1.0] bound). The final
    round() clears binary float noise round(raw/step)*step alone leaves behind for
    steps like 0.1 (1.23 -> 1.2000000000000002 without it).
    """
    k = round((raw - lo) / step)
    stepped = min(hi, max(lo, lo + k * step))
    ndigits = max(0, -Decimal(str(step)).as_tuple().exponent)
    return round(stepped, ndigits)


def _parse_condition(cond: str) -> Tuple[str, float]:
    m = re.match(r'^([<>]=?)\s*(-?\d+(?:\.\d+)?)', cond.strip())
    if m:
        return m.group(1), float(m.group(2))
    return ('<=', 0.0)
