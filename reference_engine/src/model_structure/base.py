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
    # reference 在文献内的精确定位（页码/图/表/公式/章节），与 reference 配对使用，可选
    locator: Optional[Any] = None
    # evidence 溯源：非 None 表示该 parameter 的 value 是 Loader 从 evidence 块的原始
    # 文献效应量（OR/HR/RR/Cohen's d 等）自动换算而来，而非建模者直接填入的机制系数。
    # 不新增独立 VariableType，复用 parameter，靠这两个字段做溯源标记。
    evidence_type: Optional[str] = None
    evidence_raw_value: Optional[float] = None

# 定义公式的数据类，包括描述、条件、优先级、动态更新和可选公式。
@dataclass
class Formula:
    description: str
    condition: Any = True
    priority: int = 0
    dynamics: Dict[str, Any] = None
    reference: Optional[Any] = None
    # reference 在文献内的精确定位（页码/图/表/公式/章节），与 reference 配对使用，可选
    locator: Optional[Any] = None
    # 公式显式声明的时间单位（minute | hour | day），用于跨步长 import 换算。
    step_unit: Optional[str] = None
    # 运行时换算后的步长（秒），由 loader 根据 step_unit 计算。
    step_size_sec: Optional[float] = None

    def __post_init__(self):
        if self.dynamics is None:
            self.dynamics = {}

# time_unit 声明值 → 秒数映射（用于 YAML simulator.time_unit 字段）
TIME_UNIT_SECONDS: Dict[str, float] = {
    'minute': 60.0,
    'hour':   3600.0,
    'day':    86400.0,
    'week':   604800.0,
    'month':  2592000.0,
    'year':   31536000.0,
}
