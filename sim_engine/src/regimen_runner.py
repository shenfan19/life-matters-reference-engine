# -*- coding: utf-8 -*-
# regimen_runner.py — Pulse-mode regimen evaluation
#
# Applies a list of regimen dicts to a model for one simulation step window.
# Both the GUI path (boolean days mask, regimen-level valid_range) and the
# optimizer path (event-level string days, event-level valid_start/end) are
# handled here in one place so the logic is never duplicated.

import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)

_DAY_STR = {'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6}


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
                model.set_variable_value(variable, current + float(ev.get('value', 0)))
                logger.debug(
                    "Regimen fired: %s += %s @ t=%.0fs (%s)",
                    variable, ev.get('value', 0), prev_time, ev.get('mode', ev.get('time', '')),
                )
