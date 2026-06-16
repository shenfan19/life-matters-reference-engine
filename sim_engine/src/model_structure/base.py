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
    description: Any
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
    reference: Optional[Any] = None

# 定义公式的数据类，包括描述、条件、优先级、动态更新和可选公式。
@dataclass
class Formula:
    description: str
    condition: Any = True
    priority: int = 0
    dynamics: Dict[str, Any] = None
    formula: Optional[str] = None
    reference: Optional[Any] = None
    # 公式显式声明的时间单位（minute | hour | day），用于跨步长 import 换算。
    step_unit: Optional[str] = None
    # 运行时换算后的步长（秒），由 loader 根据 step_unit 计算。
    step_size_sec: Optional[float] = None

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

# 窗口类型 → 秒数映射
WINDOW_SECONDS: Dict[str, float] = {
    'day':   86400.0,
    'week':  604800.0,
    'month': 2592000.0,
    'year':  31536000.0,
}

# time_unit 声明值 → 秒数映射（用于 YAML simulator.time_unit 字段）
TIME_UNIT_SECONDS: Dict[str, float] = {
    'minute': 60.0,
    'hour':   3600.0,
    'day':    86400.0,
    'week':   604800.0,
    'month':  2592000.0,
    'year':   31536000.0,
}

# 定义累积器数据类：按窗口（天/周/月）对来源变量进行积分/求均值
@dataclass
class Accumulator:
    variable: str           # 输出变量名（写入此变量）
    source: str             # 来源变量名
    window: str             # 窗口类型: 'day', 'week', 'month'
    operation: str = 'sum'  # 操作: 'sum' 或 'mean'
    unit: Optional[str] = None
    description: str = ''
    # 运行时状态（由引擎管理，不来自 YAML）
    running_sum: float = 0.0
    window_start_time: float = 0.0
