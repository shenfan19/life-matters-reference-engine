# -*- coding: utf-8 -*-
# src/models/base.py
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from enum import Enum

# 定义模型元数据的数据类，包括名称、版本、作者、描述、冲突和标签。
@dataclass
class ModelMetadata:
    name: str
    version: str
    author: str
    description: str
    conflicts: List[str] = None
    tags: List[str] = None

    def __post_init__(self):
        if self.conflicts is None:
            self.conflicts = []
        if self.tags is None:
            self.tags = []

# 定义变量类型的枚举，包括状态、输入和参数。
class VariableType(Enum):
    state = 'state'
    input = 'input'
    parameter = 'parameter'

# 定义变量的数据类，包括描述、值、类型、单位和边界。
@dataclass
class Variable:
    description: str
    value: float
    type: VariableType
    unit: Optional[str] = None
    bounds: Optional[List[float]] = None

# 定义公式的数据类，包括描述、条件、优先级、动态更新和可选公式。
@dataclass
class Formula:
    description: str
    condition: Any = True
    priority: int = 0
    dynamics: Dict[str, Any] = None
    formula: Optional[str] = None

    def __post_init__(self):
        if self.dynamics is None:
            self.dynamics = {}

# 定义时刻点的数据类
@dataclass
class SchedulePoint:
    time: float  # 时间点（按 asteval 符号表单位计算，通常是秒）
    value: float # 对应的值

# 定义输入变量的计划表
@dataclass
class InputSchedule:
    variable: str
    points: List[SchedulePoint]
    interpolation: str = 'step' # 'step' (阶梯) or 'linear' (线性插值)
