# -*- coding: utf-8 -*-
# schedule_runner.py — Sustained schedule evaluation (pulse is its N_steps=1 case)
#
# Applies a list of schedule dicts to a model for one simulation step window.
# Both the GUI path (boolean days mask, schedule-level valid_range) and the
# optimizer path (event-level string days, event-level valid_start/end) are
# handled here in one place so the logic is never duplicated.
#
# Every event is a `[time_start, time_end)` interval (ADR 0100), resolved by
# `resolve_time_interval` (ADR 0127 default rule): both omitted → full day
# (a day-rate input, no natural instant); `time_start` given, `time_end`
# omitted → single-step pulse (`time_end = time_start`, N_steps=1); both
# given → the explicit window as written. There is no separately-named
# "pulse mode" — a single step is just a narrow sustained window.

import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)

_DAY_STR = {'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6}


def resolve_time_interval(entry: dict):
    """Resolve an entry's `[time_start, time_end)` interval, filling in the
    default an author left unwritten (ADR 0127 — input variables are all
    sustained; there is no separate pulse mode, only window width):

    - Neither `time_start` nor `time_end` given: full day, `("00:00", "24:00")`
      — a day-rate input (e.g. a daily total) has no natural instant to pick,
      so the default is "spread across the whole day", not an arbitrary
      convention time.
    - `time_start` given, `time_end` omitted: `time_end = time_start`
      (single-step window, `N_steps=1` — numerically identical to the old
      "pulse" behavior, ADR 0099's special case).
    - Both given: used as written (explicit sustained window).
    """
    raw_start = entry.get('time_start')
    raw_end = entry.get('time_end')
    if raw_start is None and raw_end is None:
        return '00:00', '24:00'
    if raw_start is None:
        raw_start = '00:00'
    return str(raw_start), str(raw_end) if raw_end is not None else str(raw_start)


def _time_range_day_seconds(time_start: str, time_end: str) -> float:
    """Seconds-per-day covered by a `[time_start, time_end)` window.

    Invalid input = full day (86400s). A window where end <= start wraps past
    midnight (or, if equal, covers the full day) — same convention as the
    `fires` check in apply_schedules.
    """
    try:
        t0h, t0m = map(int, time_start.split(':'))
        t1h, t1m = map(int, time_end.split(':'))
    except Exception:
        return 86400.0
    t0_sec, t1_sec = t0h * 3600 + t0m * 60, t1h * 3600 + t1m * 60
    if t1_sec > t0_sec:
        return float(t1_sec - t0_sec)
    return float(86400 - t0_sec + t1_sec)


def precompute_sustained_divisors(schedules: list, step_size_sec: float) -> list:
    """Annotate sustained-interval events with `_n_steps` (ADR 0131, supersedes 0099/0126§3).

    An event is a multi-step window when its `[time_start, time_end)` interval
    (resolved by `resolve_time_interval`, ADR 0100/0127) is non-empty
    (`time_start != time_end`); single-step events (`time_start == time_end`)
    are left untouched and default to `_n_steps == 1` in apply_schedules.

    `value` for sustained entries is the total over ONE occurrence of the
    window (a single matching day), not over the whole `date_range`/`days`
    recurrence span: `_n_steps` is just the window's own duration divided by
    step_size, independent of how many calendar days the event recurs on.
    `days`/`date_range`/`valid_start`/`valid_end` are pure firing filters
    (ADR 0131) — they no longer feed into this divisor. apply_schedules
    divides by `_n_steps` each firing step so every matching day independently
    delivers the full `value`, regardless of step_size (pulse is the
    `_n_steps == 1` special case of the same rule).

    Returns a new list; does not mutate the input schedules/events.
    """
    out = []
    for sched in schedules:
        events = sched.get('events', [])
        if not events:
            out.append(sched)
            continue
        new_events = []
        changed = False
        for ev in events:
            time_start, time_end = resolve_time_interval(ev)
            if time_start != time_end:
                day_sec = _time_range_day_seconds(time_start, time_end)
                ev = dict(ev)
                ev['_n_steps'] = max(1, round(day_sec / step_size_sec))
                changed = True
            new_events.append(ev)
        out.append({**sched, 'events': new_events} if changed else sched)
    return out


def apply_schedules(model, schedules: list, prev_time: float, next_time: float,
                     sim_start_date: str = '') -> None:
    """Apply schedule events that fall in [prev_time, next_time) to the model.

    Time convention:
      - prev_time / next_time are seconds of elapsed simulation time.
      - Event times ("HH:MM") are evaluated modulo 86400 (daily cycle).
      - days filter accepts two formats:
          GUI path  — schedule-level boolean mask [Mon…Sun]
          Opt path  — event-level string list like ["Mon", "Wed"]
      - valid_range is checked against sim_start_date + day offset.

    Reset-then-accumulate semantics: all controlled variables are zeroed at
    the start of each step, then every firing event accumulates its value.

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
    for sched in schedules:
        var = sched.get('variable', '')
        if var in model.variables:
            model.variables[var].value = 0.0

    # ── Accumulate firing events ───────────────────────────────────────────────
    for sched in schedules:
        variable = sched.get('variable', '')
        if variable not in model.variables:
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
                current = model.variables[variable].value
                raw_value = float(ev.get('value', 0))
                if ev.get('delivery') == 'level':
                    delta = raw_value
                else:
                    delta = raw_value / ev.get('_n_steps', 1)
                model.set_variable_value(variable, current + delta)
                logger.debug(
                    "Schedule fired: %s += %s @ t=%.0fs (%s~%s)",
                    variable, delta, prev_time, time_start, time_end,
                )


def advance_steps(model, schedules: list, step_size: float, n_steps: int,
                   start_step: int, start_time: float, output_variables: list,
                   sim_start_date: str = '') -> tuple:
    """Run `model` forward by `n_steps` (apply_schedules → model.step()).

    The single step-execution core shared by the CLI (`run_simulation`, one
    call covering the whole run) and the GUI (`batch_steps`, called once per
    polling batch, and once per Monte Carlo run) — previously each kept its
    own copy of this loop body, which only stayed in sync by coincidence.

    `start_step`/`start_time` let the caller resume across multiple calls
    (the GUI polls in batches); a single CLI run just passes 0/0.0 once.

    Returns (rows, end_step, end_time) where each row is
    {'step', 'time', **{var: value for var in output_variables}}.
    """
    rows = []
    step = start_step
    time = start_time
    for _ in range(n_steps):
        prev_time = time
        next_time = prev_time + step_size
        if schedules:
            apply_schedules(model, schedules, prev_time, next_time, sim_start_date=sim_start_date)
        model.step(step_size)
        step += 1
        time = next_time

        row = {'step': step, 'time': time}
        for var_name in output_variables:
            row[var_name] = model.variables[var_name].value
        rows.append(row)

    return rows, step, time
