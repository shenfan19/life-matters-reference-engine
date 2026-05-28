# -*- coding: utf-8 -*-
# mc_utils.py — Monte Carlo distribution utilities and model cloning
#
# Handles:
#   - Parsing distribution expressions ("normal(μ, σ)", "uniform(a, b)", "lognormal(μ, σ)")
#   - Sampling / mean-value evaluation
#   - Collecting parameter distributions from a loaded model
#   - Cloning a ModelStructure for independent MC runs (avoids deepcopy of
#     BabelLanguageManager which contains file handles)

import re
import logging
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)


# ── Distribution expression parsing ───────────────────────────────────────────

_DIST_RE = re.compile(
    r'\s*(normal|uniform|lognormal)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*$'
)


def parse_distribution(value) -> Optional[tuple]:
    """Return (dist_type, (p1, p2)) for a distribution string, else None."""
    if not isinstance(value, str):
        return None
    m = _DIST_RE.match(value.strip())
    if m:
        try:
            return m.group(1), (float(m.group(2)), float(m.group(3)))
        except ValueError:
            return None
    return None


def get_mean_value(value) -> float:
    """Return the mean (first parameter) of a distribution expression, or the numeric value."""
    parsed = parse_distribution(value)
    if parsed:
        return parsed[1][0]
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0


def sample_value(value, rng: np.random.Generator) -> float:
    """Sample from a distribution string using rng, or return the numeric value."""
    parsed = parse_distribution(value)
    if parsed:
        dist_type, (p1, p2) = parsed
        if dist_type == 'normal':
            return float(rng.normal(p1, p2))
        elif dist_type == 'uniform':
            return float(rng.uniform(p1, p2))
        elif dist_type == 'lognormal':
            return float(rng.lognormal(p1, p2))
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0


# ── Model-level MC helpers ─────────────────────────────────────────────────────

def collect_param_distributions(model) -> dict:
    """Return {var_name: dist_str} for all parameter variables with distribution values.

    Prefers model._param_dist_raw (set by the loader) over re-scanning Variable.value,
    but falls back to the latter for models constructed directly without the loader.
    """
    dist_map = {}

    # Primary source: loader-stored raw distribution strings
    for var_name, dist_str in getattr(model, '_param_dist_raw', {}).items():
        if var_name in model.variables:
            dist_map[var_name] = dist_str

    # Fallback: Variable.value is still a string (direct construction or old loader)
    for var_name, var in model.variables.items():
        if var_name in dist_map:
            continue
        if var.type.value == 'parameter' and isinstance(var.value, str):
            if parse_distribution(var.value) is not None:
                dist_map[var_name] = var.value
                mean_val = get_mean_value(var.value)
                var.value = mean_val
                model.asteval.symtable[var_name] = mean_val

    return dist_map


def apply_parameter_sampling(model, param_distributions: dict, rng=None) -> None:
    """Apply MC sampling (or deterministic mean) to all distribution parameters.

    rng=None → deterministic: set each parameter to its distribution mean.
    rng=<Generator> → stochastic: sample independently for this run.
    """
    for var_name, value_str in param_distributions.items():
        if var_name not in model.variables:
            continue
        val = (
            sample_value(value_str, rng)
            if rng is not None
            else get_mean_value(value_str)
        )
        model.variables[var_name].value = val
        model.asteval.symtable[var_name] = val


def clone_model(base):
    """Create an independent copy of a ModelStructure for one MC run.

    Does not use deepcopy because BabelLanguageManager contains file handles
    that cannot be pickled. Only mutable runtime state is duplicated; read-only
    metadata and formulas are shared by reference.
    """
    from .model_structure import ModelStructure
    from .model_structure.base import Variable, InputSchedule, Accumulator

    fresh = ModelStructure(
        models_directory=base.models_directory,
        language='en',
    )

    # Read-only metadata — shared references are safe
    fresh.metadata         = base.metadata
    fresh.formulas         = base.formulas
    fresh.simulator        = dict(base.simulator)
    fresh.optimizer        = dict(base.optimizer)
    fresh.time_unit        = base.time_unit
    fresh.current_filename = base.current_filename
    fresh.models_directory = base.models_directory

    # Each run needs its own variable instances (independent current values)
    fresh.variables = {
        name: Variable(
            description=var.description,
            value=var.value,
            type=var.type,
            unit=var.unit,
            bounds=list(var.bounds) if var.bounds else None,
        )
        for name, var in base.variables.items()
    }

    # Schedule points are read-only during simulation — safe to share
    fresh.schedules = {
        name: InputSchedule(
            variable=sched.variable,
            points=sched.points,
            interpolation=sched.interpolation,
        )
        for name, sched in base.schedules.items()
    }

    # Accumulators have mutable runtime state — must be independent and reset
    fresh.accumulators = {
        name: Accumulator(
            variable=acc.variable,
            source=acc.source,
            window=acc.window,
            operation=acc.operation,
            unit=acc.unit,
            description=acc.description,
            running_sum=0.0,
            window_start_time=0.0,
        )
        for name, acc in base.accumulators.items()
    }

    # Reset runtime state; inherit manual_overrides from base (GUI Working State)
    fresh.variable_history = {n: [v.value] for n, v in fresh.variables.items()}
    fresh.manual_overrides = dict(getattr(base, 'manual_overrides', {}))
    fresh.current_step     = 0
    fresh.time             = 0.0

    # Inject variable values into a fresh asteval symbol table
    fresh._initialize_asteval()

    # Inherit distribution metadata for subsequent MC sampling
    fresh._param_dist_raw     = getattr(base, '_param_dist_raw', {})
    fresh.param_distributions = getattr(base, 'param_distributions', {})

    return fresh
