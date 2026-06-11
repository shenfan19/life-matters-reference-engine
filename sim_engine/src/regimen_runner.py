# -*- coding: utf-8 -*-
# regimen_runner.py — Pulse-mode regimen evaluation
#
# Applies a list of regimen dicts to a model for one simulation step window.
# Both the GUI path (boolean days mask, regimen-level valid_range) and the
# optimizer path (event-level string days, event-level valid_start/end) are
# handled here in one place so the logic is never duplicated.

import logging
import math
from datetime import date, timedelta

logger = logging.getLogger(__name__)

_DAY_STR = {'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6}


def _time_range_day_seconds(time_range) -> float:
    """Seconds-per-day covered by a `time_range: ["HH:MM","HH:MM"]` window.

    No/invalid time_range = full day (86400s). A window where end <= start
    wraps past midnight (or, if equal, covers the full day) — same convention
    as the `fires` check in apply_regimens.
    """
    if not time_range:
        return 86400.0
    try:
        t0h, t0m = map(int, time_range[0].split(':'))
        t1h, t1m = map(int, time_range[1].split(':'))
    except Exception:
        return 86400.0
    t0_sec, t1_sec = t0h * 3600 + t0m * 60, t1h * 3600 + t1m * 60
    if t1_sec > t0_sec:
        return float(t1_sec - t0_sec)
    return float(86400 - t0_sec + t1_sec)


def _n_active_days(ev: dict, reg: dict, sim_start_date: str, total_steps: int,
                    step_size_sec: float) -> int:
    """Number of calendar days the sustained event is active on.

    Date span = event/regimen valid_range if set, else the whole simulation
    span (derived from total_steps * step_size_sec). Within that span, only
    days matching the `days` filter (event-level string list, opt path, or
    regimen-level boolean mask, GUI path) count.
    """
    try:
        epoch = date.fromisoformat(sim_start_date) if sim_start_date else date(1900, 1, 1)
    except ValueError:
        epoch = date(1900, 1, 1)

    vs = ev.get('valid_start') or (reg.get('valid_start') if reg.get('valid_range_enabled') else None)
    ve = ev.get('valid_end') or (reg.get('valid_end') if reg.get('valid_range_enabled') else None)
    span_start = epoch
    span_days = max(1, math.ceil(total_steps * step_size_sec / 86400.0))
    if vs and ve:
        try:
            d0, d1 = date.fromisoformat(vs), date.fromisoformat(ve)
            span_start, span_days = d0, max(1, (d1 - d0).days + 1)
        except ValueError:
            pass

    days_mask = None
    ev_days = ev.get('days')
    if ev_days:
        days_mask = {_DAY_STR[d.lower()[:3]] for d in ev_days if d.lower()[:3] in _DAY_STR}
    elif reg.get('days_enabled'):
        mask = reg.get('days', [True] * 7)
        days_mask = {i for i in range(7) if i < len(mask) and mask[i]}

    if not days_mask or len(days_mask) == 7:
        return span_days
    count = sum(1 for i in range(span_days) if (span_start + timedelta(days=i)).weekday() in days_mask)
    return max(count, 1)


def precompute_sustained_divisors(regimens: list, step_size_sec: float, total_steps: int,
                                   sim_start_date: str = '') -> list:
    """Annotate `mode: sustained` events with `_n_steps` (ADR 0099).

    `value` for sustained entries is the total over the entire active window;
    apply_regimens divides by `_n_steps` each firing step so the cumulative
    contribution equals `value` regardless of step_size (pulse, with implicit
    `_n_steps == 1`, is the special case of the same rule).

    Returns a new list; does not mutate the input regimens/events.
    """
    out = []
    for reg in regimens:
        events = reg.get('events', [])
        if not events:
            out.append(reg)
            continue
        new_events = []
        changed = False
        for ev in events:
            if ev.get('mode') == 'sustained':
                day_sec = _time_range_day_seconds(ev.get('time_range'))
                n_active_days = _n_active_days(ev, reg, sim_start_date, total_steps, step_size_sec)
                window_sec = n_active_days * day_sec
                ev = dict(ev)
                ev['_n_steps'] = max(1, round(window_sec / step_size_sec))
                changed = True
            new_events.append(ev)
        out.append({**reg, 'events': new_events} if changed else reg)
    return out


def apply_regimens(model, regimens: list, prev_time: float, next_time: float,
                   sim_start_date: str = '') -> None:
    """Apply regimen events that fall in [prev_time, next_time) to the model.

    Time convention:
      - prev_time / next_time are seconds of elapsed simulation time.
      - Event times ("HH:MM") are evaluated modulo 86400 (daily cycle).
      - days filter accepts two formats:
          GUI path  — regimen-level boolean mask [Mon…Sun]
          Opt path  — event-level string list like ["Mon", "Wed"]
      - valid_range is checked against sim_start_date + day offset.

    Pulse semantics: all controlled variables are zeroed at the start of each
    step, then every firing event accumulates its value. This matches the
    _apply_schedules pulse mode exactly.

    Sustained semantics (event['mode'] == 'sustained'): the event fires on
    every step that matches its days/date_range filters, instead of only the
    single step matching `time`. An optional `time_range: ["HH:MM", "HH:MM"]`
    restricts firing to a time-of-day window within each matching day. This
    lets sub-day-step models (step_size: hour/minute) represent a "sustained
    intensity" input over a multi-step window without one schedule entry per
    step.

    `value` for sustained events is the TOTAL over the active window, not a
    per-step amount (ADR 0099): each firing step adds `value / _n_steps`,
    where `_n_steps` is precomputed by `precompute_sustained_divisors()` and
    stashed on the event as `_n_steps`. This keeps the cumulative
    contribution equal to `value` regardless of step_size — pulse events
    (`_n_steps` absent, treated as 1) are the same rule's special case.
    """
    try:
        epoch = date.fromisoformat(sim_start_date) if sim_start_date else date(1900, 1, 1)
    except ValueError:
        epoch = date(1900, 1, 1)

    prev_day_idx = int(prev_time / 86400)
    prev_sec_of_day = prev_time % 86400
    next_sec_of_day = next_time % 86400
    day_boundary_crossed = int(next_time / 86400) > prev_day_idx
    dow = prev_day_idx % 7  # 0=Mon … 6=Sun

    # ── Pulse reset: zero all controlled variables for this step ──────────────
    for reg in regimens:
        var = reg.get('variable', '')
        if var in model.variables:
            model.set_variable_value(var, 0.0)

    # ── Accumulate firing events ───────────────────────────────────────────────
    for reg in regimens:
        variable = reg.get('variable', '')
        if variable not in model.variables:
            continue

        # Regimen-level valid_range check (GUI path)
        if reg.get('valid_range_enabled'):
            sim_date = epoch + timedelta(days=prev_day_idx)
            vs, ve = reg.get('valid_start', ''), reg.get('valid_end', '')
            try:
                if vs and sim_date < date.fromisoformat(vs):
                    continue
                if ve and sim_date > date.fromisoformat(ve):
                    continue
            except ValueError:
                pass

        # Regimen-level day filter — boolean mask (GUI path)
        if reg.get('days_enabled'):
            days_mask = reg.get('days', [True] * 7)
            if not (days_mask[dow] if dow < len(days_mask) else True):
                continue

        for ev in reg.get('events', []):
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

            if ev.get('mode') == 'sustained':
                time_range = ev.get('time_range')
                if time_range:
                    try:
                        t0h, t0m = map(int, time_range[0].split(':'))
                        t1h, t1m = map(int, time_range[1].split(':'))
                    except Exception:
                        continue
                    t0_sec, t1_sec = t0h * 3600 + t0m * 60, t1h * 3600 + t1m * 60
                    # Split the step interval and the time_range window into
                    # non-wrapping [start, end) ranges (each may wrap past
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
                    fires = True
            else:
                time_str = ev.get('time', '08:00')
                try:
                    hh, mm = map(int, time_str.split(':'))
                except Exception:
                    continue
                ev_sec = hh * 3600 + mm * 60

                fires = (
                    (ev_sec >= prev_sec_of_day or ev_sec < next_sec_of_day)
                    if day_boundary_crossed
                    else (prev_sec_of_day <= ev_sec < next_sec_of_day)
                )

            if fires:
                current = model.variables[variable].value
                n_steps = ev.get('_n_steps', 1) if ev.get('mode') == 'sustained' else 1
                delta = float(ev.get('value', 0)) / n_steps
                model.set_variable_value(variable, current + delta)
                logger.debug(
                    "Regimen fired: %s += %s @ t=%.0fs (%s)",
                    variable, delta, prev_time, ev.get('mode', ev.get('time', '')),
                )
