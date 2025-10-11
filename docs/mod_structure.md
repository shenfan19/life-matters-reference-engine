# LifeMatters 模型文件（mods）规则

LifeMatters 是一个模块化框架，支持通过 YAML 文件定义医学和社会学模型，结合仿真（VitalSim）和优化（HealthTuner）功能，支持递归模型导入和多目标优化。

本文档定义了 LifeMatters 项目中模型文件（`mods`，以 YAML 格式存储）的结构和约束规则。这些规则确保模型文件的一致性、可移植性和正确性，适用于加载、验证、仿真和优化过程。

## 文件格式
- **扩展名**：文件必须使用 `.yaml` 扩展名。
- **编码**：文件编码必须为 UTF-8。
- **格式**：文件必须是有效的 YAML 格式。

## 顶级结构
- **包含键**：
  - `metadata`：模型元数据，包含模型信息。
  - `imports`：导入模型列表，支持递归依赖加载。
  - `variables`：变量定义，描述模型的状态、输入或参数。
  - `formulas`：公式定义，描述变量的动态行为或静态指标。
  - `simulator`：仿真参数设置（可选，但 VitalSim 加载时必须存在）。
  - `optimizer`：优化参数设置（可选，但 HealthTuner 加载时必须存在）。
- **示例**：
  ```yaml
  metadata:
    name: diabetes
    version: 1.0.0
    author: LifeMatters
    description: Diabetes model with protein ingestion
  imports: []
  variables: {}
  formulas: {}
  simulator: {}
  optimizer: {}
  ```

## Metadata 规则
- **字段**：
  - `name`：字符串，模型名称（可选，默认为文件名）。
  - `version`：字符串，遵循语义化版本格式（如 `1.0.0`，可选）。
  - `author`：字符串，作者名称（可选）。
  - `description`：字符串，模型描述（可选）。
  - `conflicts`：字符串列表，冲突模型名称（可选，默认为空列表）。
  - `tags`：字符串列表，模型标签（可选，默认为空列表）。
- **示例**：
  ```yaml
  metadata:
    name: metabolism
    version: 2.1.0
    author: Minghui Wu
    description: 基础代谢率、能量消耗和运动影响
    conflicts: []
    tags: [metabolism, energy]
  ```

## Imports 规则
- **结构**：`imports` 是一个字符串列表，指定要导入的模型名称（不含 `.yaml` 扩展名）。
- **加载规则**：
  - **递归加载**：从根模型开始，遍历 `imports` 中的每个模型，并递归读取其 `imports`，构建依赖树。
  - **合并规则**：优先加载叶子模型（无进一步导入的模型），然后逐层向上合并。根模型的内容（`variables`、`formulas`、`simulator`、`optimizer`）覆盖依赖树中下层模型的同名定义。例如，同名变量的值或公式表达式以根模型为准。
  - **约束**：
    - 列表中的模型名称必须存在于 `mods` 目录或指定子目录中。
    - 不得包含自我导入或形成循环依赖（由 `LoaderEngine` 在 Python 中检测，例如使用集合跟踪已访问模型）。
    - 空列表表示无依赖。
- **示例**：
  ```yaml
  imports:
    - nutrition_intake
    - glucose_regulation
  ```

## Variables 规则
- **结构**：`variables` 是一个键值对字典，键为变量名（字符串），值包含以下字段：
  - `description`：字符串，变量描述（可选，默认为空字符串）。
  - `value`：浮点数或整数，初始值（必须）。
  - `type`：字符串，必须为 `input`（外部输入）、`state`（状态变量）或 `parameter`（可优化参数）。
  - `unit`：字符串，单位（可选，默认为 `null`）。
  - `bounds`：浮点数或整数列表 `[min, max]`，变量范围（可选，默认为 `null`）。
- **约束**：
  - 变量名必须是有效的 Python 标识符（仅字母、数字、下划线，不含空格或特殊字符）。
  - `value` 必须是数值类型（整数或浮点数）。
  - 如果定义了 `bounds`，`value` 必须在 `[min, max]` 范围内，且 `min <= max`。
  - 在合并时，根模型的变量定义覆盖导入模型的同名变量。
- **示例**：
  ```yaml
  variables:
    blood_glucose:
      description: Blood glucose level
      value: 100.0
      type: state
      unit: mg/dL
      bounds: [0.0, 500.0]
    protein_intake:
      description: Daily protein intake
      value: 0.0
      type: parameter
      unit: g
      bounds: [0.0, 200.0]
  ```

## Formulas 规则
- **结构**：`formulas` 是一个键值对字典，键为公式名（字符串），值包含以下字段：
  - `description`：字符串，公式描述（可选，默认为空字符串）。
  - `condition`：字符串或布尔值（`true` 或 `false`），公式执行条件（可选，默认为 `true`）。
  - `priority`：整数，公式执行优先级（可选，范围 -100 到 100，默认为 0）。
  - `dynamics`：键值对字典，键为变量名，值为动态表达式（字符串，用于更新状态，可选）。
  - `formula`：字符串，静态公式表达式（用于计算指标而非更新状态，可选）。
- **约束**：
  - 公式名必须是有效的 Python 标识符。
  - `condition` 可以是：
    - 字符串：必须是 `asteval` 支持的表达式（如 `protein_intake > 0`）。
    - 布尔值：`true` 或 `false`（YAML 中的布尔值）。
    - 省略：默认为 `true`。
  - `priority` 必须为整数。
  - `dynamics` 或 `formula` 中的变量名必须在 `variables` 或导入模型中定义。
  - 表达式（`dynamics` 或 `formula`）必须是 `asteval` 支持的合法表达式（如 `blood_glucose + protein_intake * 0.1`）。
  - 每个公式必须包含 `dynamics` 或 `formula` 之一，但不可同时包含两者。
  - 在合并时，根模型的公式定义覆盖导入模型的同名公式。
- **示例**：
  ```yaml
  formulas:
    protein_ingestion:
      description: Protein ingestion affects blood glucose
      condition: true
      priority: -100
      dynamics:
        blood_glucose: blood_glucose + protein_intake * 0.1
    metabolic_efficiency:
      description: 代谢效率指标
      condition: true
      formula: (digestive_efficiency + insulin_sensitivity) / 2 * 100
      priority: 1
  ```

## 时间步长处理
- **定义**：表达式中若使用 `dt`（时间步长），必须显式指定时间尺度，通过除以或乘以以下保留时间单位常量：
  - `SECOND`：1 秒
  - `MINUTE`：60 秒
  - `HOUR`：3600 秒
  - `DAY`：86400 秒
  - `WEEK`：604800 秒
  - `MONTH`：2592000 秒（约 30 天）
  - `YEAR`：31536000 秒（约 365 天）
- **示例**：
  ```yaml
  formulas:
    glucose_decay:
      description: Blood glucose decays hourly
      dynamics:
        blood_glucose: blood_glucose - 0.01 * (dt / HOUR)  # 每小时衰减 0.01
    population_growth:
      description: Population grows yearly
      dynamics:
        population: population + 0.02 * population * (dt / YEAR)  # 每年增长 2%
  ```
- **约束**：
  - 若 `dynamics` 或 `condition` 使用 `dt`，建议（但不强制）结合时间单位常量以明确尺度。未指定单位时，假设 `dt` 以秒为单位。
  - `simulator.dt_unit` 可指定默认时间单位（如 `hour`），与 `dt` 结合使用。
- **兼容性**：
  - 对于不使用时间单位常量的旧模型，假设 `dt` 为秒。`LoaderEngine.validate_model()` 应发出警告，提示迁移。
  - 可提供迁移工具，扫描 `formulas.dynamics` 和 `condition`，自动在 `dt` 后添加 `/ DAY`（或用户指定的默认单位），并保存为新文件。

## Simulator 规则
- **结构**：`simulator` 是一个字典，包含仿真相关参数：
  - `dt`：浮点数，时间步长（必须，正数）。
  - `dt_unit`：字符串，时间单位（可选，支持 `second`、`minute`、`hour`、`day`、`week`、`month`、`year`，默认为 `second`）。
  - `steps`：整数，仿真步数（必须，正整数）。
  - `output_format`：字符串，输出格式（如 `yaml`、`json`，可选，默认为 `yaml`）。
  - `pause_every`：整数，每多少步暂停一次（可选，默认为 `null`）。
  - `hooks`：列表，仿真钩子（如 `post_step` 指定触发函数，可选）。
  - `monitor_conditions`：字符串列表，监控条件（如 `blood_glucose < 70`，可选）。
- **约束**：
  - 当 `VitalSim` 加载模型时，必须存在 `simulator` 字段（否则抛出错误）。
  - 参数值必须符合预期类型（例如，`dt` 为正数，`steps` 为正整数）。
  - `dt_unit` 必须是支持的时间单位之一，若未指定，假设 `dt` 以秒为单位。
  - `hooks` 中的函数名（如 `post_step`）需在运行时环境中定义。
  - 在仿真过程中，`VitalSim` 根据根模型及其 `imports` 中的 `variables` 和 `formulas` 执行，根模型的参数覆盖导入模型。
- **示例**：
  ```yaml
  simulator:
    step_size: 3600
    step_size_unit: hour
    total_time: 8640000
    output_format: yaml
    pause_every: 10
    hooks:
      - post_step: check_metabolic_state
    monitor_conditions:
      - blood_glucose < 70
  ```

## Optimizer 规则
- **结构**：`optimizer` 是一个字典，包含优化相关参数：
  - `method`：字符串，优化方法（如 `grid`、`nsga2`，必须）。
  - `python_envs`：列表，优化任务所需的 Python 包及其版本（可选，格式为 `package_name: ">=version"`）。
  - `targets`：字符串列表，优化目标（如 `min_error`、`max_happiness`，必须，至少一个目标）。
  - `pop_size`：整数，种群大小（可选，默认为工具默认值）。
  - `n_gen`：整数，迭代次数（可选，默认为工具默认值）。
  - `duration`：浮点数，优化持续时间（分钟，可选）。
  - `bounds`：列表，优化参数的范围（格式为 `[[min1, max1], [min2, max2], ...]`，可选）。
  - `variables_to_optimize`：字符串列表，要优化的参数名（必须）。
- **约束**：
  - 当 `HealthTuner` 加载模型时，必须存在 `optimizer` 字段（否则抛出错误）。
  - `method` 必须是支持的优化算法（如 `grid`、`nsga2`）。
  - `python_envs` 中的包名和版本格式必须有效（如 `pymoo: ">=0.6.0"`），若为空则依赖框架核心环境。
  - `targets` 至少包含一个目标，支持多目标优化（如 NSGA-II）。
  - `variables_to_optimize` 中的变量必须在 `variables` 或导入模型中定义，且 `type` 为 `parameter`。
  - 若定义 `bounds`，其长度必须与 `variables_to_optimize` 一致，且每个范围 `[min, max]` 满足 `min <= max`。
  - 在优化过程中，`HealthTuner` 根据根模型及其 `imports` 中的 `variables` 和 `formulas` 执行，根模型的参数覆盖导入模型。
- **示例**：
  ```yaml
  optimizer:
    targets_of_optimization:
      - max_happiness
      - min_health_risk
    variables_to_optimize:
      - sugar_intake
      - exercise_time
    bounds: [[0, 100], [0, 60]]
    method: nsga2
    python_envs:
      - pymoo: ">=0.6.0"
      - matplotlib: ">=3.5.0"
    pop_size: 50
    n_gen: 100
    duration: 60.0
  ```

## 一致性约束
- **唯一性**：所有变量和公式名在模型内（包括导入模型）必须唯一（合并后检查）。
- **变量引用**：`condition`、`dynamics` 和 `formula` 中的变量必须在 `variables` 或导入模型中定义。
- **数值类型**：变量的 `value` 和 `bounds` 必须是数值类型（整数或浮点数）。
- **优先级**：公式 `priority` 必须为整数（-100 到 100）。
- **依赖管理**：在递归加载 `imports` 时，确保无循环依赖，并应用覆盖规则（根模型优先）。
- **工具要求**：`VitalSim` 要求 `simulator` 字段，`HealthTuner` 要求 `optimizer` 字段。
- **合并覆盖**：根模型的 `variables`、`formulas`、`simulator` 和 `optimizer` 字段覆盖导入模型的同名字段。
