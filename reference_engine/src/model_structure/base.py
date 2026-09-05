# -*- coding: utf-8 -*-
# src/models/base.py
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from enum import Enum

# A dataclass for model metadata, including name, version, author, description, conflicts, and tags.
@dataclass
class ModelMetadata:
    name: str
    version: str
    author: str
    description: Any
    conflicts: List[str] = None
    tags: List[str] = None

    def __post_init__(self):
        if self.conflicts is None:
            self.conflicts = []
        if self.tags is None:
            self.tags = []

# An enum of variable types: state, input, and parameter.
class VariableType(Enum):
    state = 'state'
    input = 'input'
    parameter = 'parameter'

# A dataclass for a variable, including description, value, type, unit, and bounds.
@dataclass
class Variable:
    description: str
    value: float
    type: VariableType
    unit: Optional[str] = None
    bounds: Optional[List[float]] = None
    reference: Optional[Any] = None
    # An exact locator within the reference (page/figure/table/equation/section), paired with reference, optional
    locator: Optional[Any] = None
    # Evidence provenance: non-None means this parameter's value was automatically converted by the Loader
    # from a raw literature effect size in an evidence block (OR/HR/RR/Cohen's d, etc.), rather than a
    # mechanistic coefficient the modeler entered directly. No separate VariableType is added for this;
    # it reuses parameter, with these two fields carrying the provenance marker.
    evidence_type: Optional[str] = None
    evidence_raw_value: Optional[float] = None

# A dataclass for an equation, including description, condition, priority, dynamics update, and an optional equation.
@dataclass
class Equation:
    description: str
    condition: Any = True
    priority: int = 0
    dynamics: Dict[str, Any] = None
    reference: Optional[Any] = None
    # An exact locator within the reference (page/figure/table/equation/section), paired with reference, optional
    locator: Optional[Any] = None
    # The time unit the equation explicitly declares (minute | hour | day), used for cross-step-size import conversion.
    step_unit: Optional[str] = None
    # The runtime-converted step size (in seconds), computed by the loader from step_unit.
    step_size_sec: Optional[float] = None

    def __post_init__(self):
        if self.dynamics is None:
            self.dynamics = {}

# A mapping from a declared time_unit value to a number of seconds (used for the YAML simulator.time_unit field)
TIME_UNIT_SECONDS: Dict[str, float] = {
    'minute': 60.0,
    'hour':   3600.0,
    'day':    86400.0,
    'week':   604800.0,
    'month':  2592000.0,
    'year':   31536000.0,
}
