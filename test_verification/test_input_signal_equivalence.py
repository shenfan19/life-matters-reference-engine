"""The input signal reader was rewritten to read the schedules once (InputSignal). This pins it to the
step-by-step implementation it replaced, which is kept below unchanged as the reference, on random schedules."""

import logging
import random
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, List

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reference_engine.src.schedule_runner import (  # noqa: E402
    InputSignal, _DAY_STR, compute_inputs, precompute_sustained_divisors, resolve_time_interval,
)

logger = logging.getLogger(__name__)


def legacy_compute_inputs(schedules: list, prev_time: float, next_time: float,
                   sim_start_date: str = '') -> Dict[str, List[float]]:
    """The input signal of the step window [prev_time, next_time): what every controlled variable receives.

    Pure: it reads the schedules and the clock and touches no model, so any solver can ask for the
    same signal. Returns {variable: [contribution, ...]}, one entry for every variable named by a
    schedule (an empty list = nothing fires, the variable is off for this step) and one contribution
    per firing event, in schedule order. The meaning of the signal is fixed here, once, for all solvers.

    Time convention:
      - prev_time / next_time are seconds of elapsed simulation time.
      - Event times ("HH:MM") are evaluated modulo 86400 (daily cycle).
      - days filter accepts two formats:
          GUI path  — schedule-level boolean mask [Mon…Sun]
          Opt path  — event-level string list like ["Mon", "Wed"]
      - valid_range is checked against sim_start_date + day offset.

    Reset-then-accumulate semantics: every controlled variable starts the step at zero (an empty
    contribution list) and every firing event adds its contribution (see `apply_inputs`).

    Each event's `[time_start, time_end)` interval is resolved by
    `resolve_time_interval` (ADR 0100/0127):

      - `time_start == time_end` (single-step window): fires once, at the
        single step whose `[prev_time, next_time)` covers that instant.
      - `time_start != time_end` (multi-step window, incl. "00:00"~"24:00" =
        full day): fires on every step overlapping the window, instead of
        only a single instant. This lets sub-day-step models (step_size:
        hour/minute) represent a "sustained intensity" input over a
        multi-step window without one schedule entry per step.

    `value`'s meaning depends on `delivery` (ADR 0132, default `'total'`):

      - `'total'` (default): `value` is the total over ONE occurrence of the
        window (a single matching day), not a per-step amount and not a total
        across every day the event recurs on (ADR 0131, supersedes 0099/0126§3):
        each firing step adds `value / _n_steps`, where `_n_steps` is
        precomputed by `precompute_sustained_divisors()`. This keeps each
        matching day's cumulative contribution equal to `value` regardless of
        step_size — a single-step window (`_n_steps` absent, treated as 1) is
        the same rule's special case.
      - `'level'`: `value` is a constant level held during the window (e.g. a
        sleep-hours setting, a training-intensity dial) — each firing step
        adds `value` directly, un-divided. Use this when the input is read
        downstream as an instantaneous reading (compared to a baseline,
        multiplied as a modifier) rather than accumulated as a dose; `'total'`
        would make that reading scale inversely with step_size (ADR 0132).

    `days`/`valid_start`/`valid_end` only gate *which* days fire under either
    `delivery` mode; they do not change how much a firing day delivers.
    """
    try:
        epoch = date.fromisoformat(sim_start_date) if sim_start_date else date(1900, 1, 1)
    except ValueError:
        epoch = date(1900, 1, 1)

    prev_day_idx = int(prev_time / 86400)
    prev_sec_of_day = prev_time % 86400
    next_sec_of_day = next_time % 86400
    day_boundary_crossed = int(next_time / 86400) > prev_day_idx
    dow = (epoch + timedelta(days=prev_day_idx)).weekday()  # 0=Mon … 6=Sun, aligned to sim_start_date's real calendar weekday

    # ── Pulse reset: zero all controlled variables for this step ──────────────
    # Bypasses set_variable_value's bounds clamp: the reset-to-zero "off" state
    # is a transient bookkeeping value, not a physical reading, so it must not
    # be pulled up to bounds[0] when bounds[0] > 0 (e.g. an input variable
    # whose valid range is [0.3, 2.0]) — doing so silently inflates every
    # firing event's effective value by bounds[0].
    signal: Dict[str, List[float]] = {}
    for sched in schedules:
        var = sched.get('variable', '')
        if var:
            signal.setdefault(var, [])

    # ── Accumulate firing events ───────────────────────────────────────────────
    for sched in schedules:
        variable = sched.get('variable', '')
        if not variable:
            continue

        # Schedule-level valid_range check (GUI path)
        if sched.get('valid_range_enabled'):
            sim_date = epoch + timedelta(days=prev_day_idx)
            vs, ve = sched.get('valid_start', ''), sched.get('valid_end', '')
            try:
                if vs and sim_date < date.fromisoformat(vs):
                    continue
                if ve and sim_date > date.fromisoformat(ve):
                    continue
            except ValueError:
                pass

        # Schedule-level day filter — boolean mask (GUI path)
        if sched.get('days_enabled'):
            days_mask = sched.get('days', [True] * 7)
            if not (days_mask[dow] if dow < len(days_mask) else True):
                continue

        for ev in sched.get('events', []):
            # Event-level day filter — string list (optimizer path: T3)
            ev_days = ev.get('days', [])
            if ev_days:
                allowed = {_DAY_STR[d.lower()[:3]] for d in ev_days if d.lower()[:3] in _DAY_STR}
                if dow not in allowed:
                    continue

            # Event-level date-range check (optimizer path: T4)
            ev_valid_start = ev.get('valid_start', '')
            ev_valid_end   = ev.get('valid_end', '')
            if ev_valid_start or ev_valid_end:
                sim_date = epoch + timedelta(days=prev_day_idx)
                try:
                    if ev_valid_start and sim_date < date.fromisoformat(ev_valid_start):
                        continue
                    if ev_valid_end and sim_date > date.fromisoformat(ev_valid_end):
                        continue
                except ValueError:
                    pass

            time_start, time_end = resolve_time_interval(ev)
            if time_start != time_end:
                # Sustained: fires whenever the step interval overlaps the
                # daily [time_start, time_end) window.
                try:
                    t0h, t0m = map(int, time_start.split(':'))
                    t1h, t1m = map(int, time_end.split(':'))
                except Exception:
                    continue
                t0_sec, t1_sec = t0h * 3600 + t0m * 60, t1h * 3600 + t1m * 60
                # Split the step interval and the [time_start, time_end) window
                # into non-wrapping [start, end) ranges (each may wrap past
                # midnight independently of the other), then test overlap.
                step_ranges = (
                    [(prev_sec_of_day, 86400), (0, next_sec_of_day)]
                    if day_boundary_crossed
                    else [(prev_sec_of_day, next_sec_of_day)]
                )
                win_ranges = (
                    [(t0_sec, 86400), (0, t1_sec)]
                    if t0_sec >= t1_sec
                    else [(t0_sec, t1_sec)]
                )
                fires = any(
                    a0 < b1 and b0 < a1
                    for a0, a1 in step_ranges
                    for b0, b1 in win_ranges
                )
            else:
                # Pulse: fires once, at the instant time_start.
                try:
                    hh, mm = map(int, time_start.split(':'))
                except Exception:
                    continue
                ev_sec = hh * 3600 + mm * 60

                fires = (
                    (ev_sec >= prev_sec_of_day or ev_sec < next_sec_of_day)
                    if day_boundary_crossed
                    else (prev_sec_of_day <= ev_sec < next_sec_of_day)
                )

            if fires:
                raw_value = float(ev.get('value', 0))
                if ev.get('delivery') == 'level':
                    delta = raw_value
                else:
                    delta = raw_value / ev.get('_n_steps', 1)
                signal[variable].append(delta)
                logger.debug(
                    "Schedule fired: %s += %s @ t=%.0fs (%s~%s)",
                    variable, delta, prev_time, time_start, time_end,
                )
    return signal


def _random_schedules(rng):
    names = ['a', 'b', 'c']
    scheds = []
    for _ in range(rng.randint(1, 4)):
        events = []
        for _ in range(rng.randint(0, 4)):
            ev = {'value': round(rng.uniform(-2, 5), 2)}
            kind = rng.choice(['pulse', 'window', 'day', 'bad'])

            def hhmm():
                return f"{rng.randint(0, 23):02d}:{rng.choice([0, 15, 30, 45]):02d}"

            if kind == 'pulse':
                ev['time_start'] = hhmm()
            elif kind == 'window':
                ev['time_start'], ev['time_end'] = hhmm(), hhmm()
            elif kind == 'bad':
                ev['time_start'] = rng.choice(['xx', '8', '25:99', '08:00:00'])
            if rng.random() < 0.3:
                ev['days'] = rng.sample(['Mon', 'tue', 'Wednesday', 'fri', 'sun', 'zzz'], rng.randint(1, 3))
            if rng.random() < 0.3:
                ev['valid_start'] = rng.choice(['2026-01-03', '2026-01-08', 'bad', ''])
                ev['valid_end'] = rng.choice(['2026-01-10', '2026-01-05', 'bad', ''])
            if rng.random() < 0.3:
                ev['delivery'] = 'level'
            events.append(ev)
        sched = {'variable': rng.choice(names + ['', 'ghost']), 'events': events}
        if rng.random() < 0.3:
            sched['days_enabled'] = True
            sched['days'] = [rng.random() < 0.6 for _ in range(rng.choice([7, 7, 3]))]
        if rng.random() < 0.3:
            sched['valid_range_enabled'] = True
            sched['valid_start'] = rng.choice(['2026-01-02', '', 'bad'])
            sched['valid_end'] = rng.choice(['2026-01-09', '', 'bad'])
        scheds.append(sched)
    return scheds


@pytest.mark.parametrize('seed', range(60))
@pytest.mark.parametrize('step_size', [900.0, 3600.0, 86400.0, 40000.0])
def test_input_signal_matches_the_step_by_step_implementation(seed, step_size):
    rng = random.Random(seed)
    schedules = precompute_sustained_divisors(_random_schedules(rng), step_size)
    start = rng.choice(['', '2026-01-01', '2026-01-04', 'not-a-date'])
    reader = InputSignal(schedules, start)
    n = int(14 * 86400 / step_size)
    for k in range(n):
        prev, nxt = k * step_size, (k + 1) * step_size
        expected = legacy_compute_inputs(schedules, prev, nxt, start)
        assert reader.at(prev, nxt) == expected, (seed, k)
        assert compute_inputs(schedules, prev, nxt, start) == expected
