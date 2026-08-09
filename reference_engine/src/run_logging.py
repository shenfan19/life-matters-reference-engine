# -*- coding: utf-8 -*-
"""Sim run log content — shared by the CLI (`reference_engine.run_simulation*`)
and GUI (`session_manager.start_session`/`batch_steps`) paths.

Mirrors how `optimizer_engine.run_optimizer()`'s `log_cb` already works: the
content (what to say) lives here once; each caller supplies its own sink
(`log_cb: Callable[[str], None]`) — CLI passes `logger.info`, GUI wraps each
line into a timestamped `{'t', 'msg'}` entry for the session log panel.
Before this module existed, this content was only built inside
session_manager.py, so the CLI log never had it (see ADR 0119).
"""

import math
from typing import Any, Callable, Dict, List

LogCb = Callable[[str], None]


def fmt_step(step_sec: float) -> str:
    """Convert step size in seconds to a human-readable string."""
    if step_sec >= 86400 and step_sec % 86400 == 0:
        n = int(step_sec / 86400)
        return f"{n} day{'s' if n != 1 else ''}"
    if step_sec >= 3600 and step_sec % 3600 == 0:
        n = int(step_sec / 3600)
        return f"{n} hour{'s' if n != 1 else ''}"
    return f"{int(step_sec / 60)} min"


def build_initial_logs(model, model_name: str, total_steps: int, step_size: float,
                        output_variables: List[str], output_warnings: List[str],
                        schedule_vars: List[str], n_runs: int, session_seed: int,
                        log_cb: LogCb) -> None:
    """Emit the run header: model size, imports, time span, outputs, schedules, MC seed."""
    n_vars = len(model.variables)
    n_equations = len(model.equations) if hasattr(model, 'equations') else 0
    log_cb(f"Model: {model_name} ({n_vars} vars, {n_equations} equations)")

    prov_imports = (model.provenance or {}).get('imports', [])
    if prov_imports:
        log_cb(f"Imports: {', '.join(prov_imports)}")

    start_date = str(model.simulator.get('start_date', ''))
    log_cb(f"Sim: start={start_date}, step={fmt_step(step_size)}, {total_steps} steps")

    out_labels = output_variables[:8]
    suffix = f" (+{len(output_variables) - 8} more)" if len(output_variables) > 8 else ""
    log_cb(f"Outputs ({len(output_variables)}): {', '.join(out_labels)}{suffix}")

    for w in output_warnings:
        log_cb(f"⚠ {w}")

    if schedule_vars:
        log_cb(f"Regimens: {', '.join(schedule_vars)}")

    if n_runs > 1:
        log_cb(f"MC: {n_runs} runs, seed {session_seed}")


def check_value_warnings(model, outputs: List[Dict], output_variables: List[str],
                          warned: set, log_cb: LogCb) -> None:
    """Emit NaN/Inf and out-of-bounds warnings, once per variable.

    `outputs` is the row-dict list returned by schedule_runner.advance_steps —
    the same shape on both the CLI and GUI paths (ADR 0113).
    """
    for out_row in outputs:
        for var_name in output_variables:
            if var_name in warned:
                continue
            val = out_row.get(var_name)
            if val is None:
                continue
            var_obj = model.variables.get(var_name)
            if var_obj is None:
                continue
            if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                log_cb(f"⚠ NaN/Inf in '{var_name}' at step {out_row['step']}")
                warned.add(var_name)
            elif var_obj.bounds and len(var_obj.bounds) == 2:
                lo, hi = var_obj.bounds
                if val < lo or val > hi:
                    log_cb(f"⚠ Bounds: '{var_name}'={val:.4g} ∉ [{lo}, {hi}] at step {out_row['step']}")
                    warned.add(var_name)


def log_completion(elapsed: float, current_step: int, hits: Dict[str, int],
                    log_cb: LogCb, run_suffix: str = '') -> None:
    """Emit 'Done in Xs — N steps[ × M runs]' + schedule-hit counts.

    `hits` is {input_variable: number_of_nonzero_rows}, pre-computed by the
    caller since the CLI and GUI accumulate rows in different shapes.
    """
    log_cb(f"Done in {elapsed:.1f}s — {current_step} steps{run_suffix}")
    hit_parts = [f"{v}={n}" for v, n in hits.items() if n > 0]
    if hit_parts:
        log_cb(f"Schedule hits: {', '.join(hit_parts)}")


def input_variable_names(model, output_variables: List[str]) -> List[str]:
    """`type: input` variables among `output_variables` (the ones schedules drive)."""
    return [
        v for v in output_variables
        if model.variables.get(v) and model.variables[v].type.value == 'input'
    ]


def input_variable_hits(model, output_variables: List[str], rows: List[Dict]) -> Dict[str, int]:
    """Count, per `type: input` variable, how many rows had a nonzero value.

    One-shot version for callers (the GUI) that keep the full row history in
    memory already.
    """
    return {v: sum(1 for d in rows if d.get(v, 0) != 0) for v in input_variable_names(model, output_variables)}


def accumulate_hits(rows: List[Dict], input_var_names: List[str], hits: Dict[str, int]) -> None:
    """Add this chunk's nonzero-row counts to `hits` in place.

    For callers (the CLI) that process rows in chunks and don't keep the full
    row history, so the per-variable count has to be accumulated as rows come in.
    """
    for row in rows:
        for v in input_var_names:
            if row.get(v, 0) != 0:
                hits[v] = hits.get(v, 0) + 1
