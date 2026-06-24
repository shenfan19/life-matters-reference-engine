# -*- coding: utf-8 -*-
"""Upfront date/time format validation shared by the CLI and GUI run paths.

schedule_runner.py and optimizer_engine.py parse date/time strings deep inside
the per-step hot loop and the decision-variable setup; on a malformed value
both silently fall back to a default (e.g. epoch 1900-01-01, or the whole run
falling back to `total_time`) instead of raising — a typo in `valid_start` or
`time_start` would silently change simulation results, on both the CLI and the
GUI. These functions run once, before a run starts, so a bad value is caught
with one error message instead of two divergent silent fallbacks.
"""

from datetime import date
from typing import Any, Dict, List, Optional


def _check_date_strict(value: Any, field: str) -> None:
    """ISO date, as required by schedule_runner.py's date.fromisoformat() epoch/range checks."""
    if value in (None, ''):
        return
    try:
        date.fromisoformat(str(value))
    except ValueError:
        raise ValueError(f"Invalid date for {field}: '{value}' (expected YYYY-MM-DD)")


def _check_date_loose(value: Any, field: str) -> None:
    """YYYY-MM-DD, tolerating year 0 as an 'ancient date' placeholder — Python's
    date class can't represent year 0, but simulator.start_date/end_date's
    duration calc (loader.py, optimizer_engine.py) explicitly supports it via
    approximate day arithmetic. Month/day are still calendar-checked, using a
    real leap year as a stand-in when year == 0 so '02-29' is accepted.
    """
    if value in (None, ''):
        return
    parts = str(value).split('-')
    if len(parts) != 3:
        raise ValueError(f"Invalid date for {field}: '{value}' (expected YYYY-MM-DD)")
    try:
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        raise ValueError(f"Invalid date for {field}: '{value}' (expected YYYY-MM-DD)")
    if y < 0:
        raise ValueError(f"Invalid date for {field}: '{value}' (expected YYYY-MM-DD)")
    try:
        date(y if y >= 1 else 4, m, d)
    except ValueError:
        raise ValueError(f"Invalid date for {field}: '{value}' (expected YYYY-MM-DD)")


def _check_time(value: Any, field: str) -> None:
    """HH:MM, 00:00-24:00 ('24:00' is the end-of-day marker, ADR 0100)."""
    if value in (None, ''):
        return
    parts = str(value).split(':')
    ok = False
    if len(parts) == 2:
        try:
            h, m = int(parts[0]), int(parts[1])
            ok = (0 <= h < 24 and 0 <= m < 60) or (h == 24 and m == 0)
        except ValueError:
            ok = False
    if not ok:
        raise ValueError(f"Invalid time for {field}: '{value}' (expected HH:MM, 00:00-24:00)")


def validate_simulator_dates(start_date: Optional[str], end_date: Optional[str],
                              context: str = 'simulator') -> None:
    """Validate start_date/end_date format. Both are optional — `total_time`
    is a legitimate alternative to a date range — so missing dates are not
    an error, only malformed-but-present ones are.
    """
    _check_date_loose(start_date, f'{context}.start_date')
    _check_date_loose(end_date, f'{context}.end_date')
    if start_date and end_date:
        sy, sm, sd_ = (int(p) for p in str(start_date).split('-'))
        ey, em, ed_ = (int(p) for p in str(end_date).split('-'))
        if (ey, em, ed_) < (sy, sm, sd_):
            raise ValueError(f"{context}.end_date ({end_date}) is before {context}.start_date ({start_date})")


def validate_schedule_list(schedules: List[Dict], context: str = 'schedule') -> None:
    """Validate every valid_start/valid_end/time_start/time_end in a schedule
    list — the shape consumed by schedule_runner.apply_schedules: schedule-level
    GUI fields (valid_start/valid_end/days_enabled) plus event-level YAML/
    optimizer fields (see model.md 'plans').
    """
    for sched in schedules or []:
        var = sched.get('variable', '?')
        _check_date_strict(sched.get('valid_start'), f"{context}[{var}].valid_start")
        _check_date_strict(sched.get('valid_end'), f"{context}[{var}].valid_end")
        for j, ev in enumerate(sched.get('events') or []):
            ev_ctx = f"{context}[{var}].events[{j}]"
            _check_time(ev.get('time_start'), f'{ev_ctx}.time_start')
            _check_time(ev.get('time_end'), f'{ev_ctx}.time_end')
            _check_date_strict(ev.get('valid_start'), f'{ev_ctx}.valid_start')
            _check_date_strict(ev.get('valid_end'), f'{ev_ctx}.valid_end')


def validate_optimizer_regimens(regimens_def: List[Dict],
                                 context: str = 'optimizer.startpoint.regimens') -> None:
    """Validate time_start/time_end/date_range — both the fixed values and the
    optimize: search-window bounds — on optimizer.startpoint.regimens entries.
    """
    for i, e in enumerate(regimens_def or []):
        e_ctx = f"{context}[{i}]"
        _check_time(e.get('time_start'), f'{e_ctx}.time_start')
        _check_time(e.get('time_end'), f'{e_ctx}.time_end')
        dr = e.get('date_range')
        if isinstance(dr, list) and len(dr) == 2:
            _check_date_strict(dr[0], f'{e_ctx}.date_range[0]')
            _check_date_strict(dr[1], f'{e_ctx}.date_range[1]')

        opt = e.get('optimize') or {}
        for key in ('time_start', 'time_end'):
            window = opt.get(key)
            if isinstance(window, list) and len(window) == 2:
                _check_time(window[0], f'{e_ctx}.optimize.{key}[0]')
                _check_time(window[1], f'{e_ctx}.optimize.{key}[1]')
        date_range_opt = opt.get('date_range')
        if isinstance(date_range_opt, list) and len(date_range_opt) == 2:
            for k, bound in enumerate(date_range_opt):
                if isinstance(bound, list) and len(bound) == 2:
                    _check_date_strict(bound[0], f'{e_ctx}.optimize.date_range[{k}][0]')
                    _check_date_strict(bound[1], f'{e_ctx}.optimize.date_range[{k}][1]')
