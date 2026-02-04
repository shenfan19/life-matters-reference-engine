# LifeMatters 模型文件（mods）规范文档

**版本**: v3.1 (合并版)
**日期**: 2025-02-03
**核心架构**: 统一YAML范式 + 人为分层 + 输入输出规范化

---

## 概述

LifeMatters 是一个模块化框架,支持通过 YAML 文件定义医学和社会学模型,结合仿真（Simulator）和优化（Optimizer）功能,支持递归模型导入和多目标优化。

本文档定义了 LifeMatters 项目中模型文件（`mods`）的结构和约束规则。这些规则确保模型文件的一致性、可移植性和正确性,适用于加载、验证、仿真和优化过程。

---

## 一、核心架构原则

### 1.1 统一范式设计

```
技术层面: 统一的YAML格式 (models & stories)
概念层面: 清晰的分层约定 (职责分离)
实施层面: 工具检测 + 文档规范 (强制执行)
```

**设计理念**:

- **格式统一** ≠ **概念混淆**
- 通过目录、type字段、validator保证分层严谨性
- 允许技术灵活性,禁止架构混乱

### 1.2 整体目录结构

```
lifematters/
├─ models/          (Level 1: 科学模型 - 能力声明)
│  ├─ core/         # 基础模型
│  ├─ medical/      # 医学模型
│  │  ├─ dynamics/      # 动力学方程
│  │  ├─ statistical/   # 统计模型
│  │  └─ diagnostic/    # 诊断判断
│  ├─ interventions/    # 干预措施
│  │  ├─ diet/
│  │  ├─ exercise/
│  │  ├─ pharmacology/  # 药物
│  │  └─ surgery/       # 手术
│  └─ community/    # 用户贡献
│
└─ stories/         (Level 2: 应用故事 - 用途配置)
   ├─ examples/
   │  ├─ research/
   │  └─ game/
   └─ user/
```

---

## 二、文件格式基本要求

### 2.1 格式规范

- **扩展名**: 文件必须使用 `.yaml` 扩展名
- **编码**: 文件编码必须为 UTF-8
- **格式**: 文件必须是有效的 YAML 格式

### 2.2 统一YAML Schema定义

所有YAML文件（models和stories）共享相同的顶层结构:

```yaml
# ============================================
# 通用字段 (所有文件必需)
# ============================================
type: model | story              # 文件类型标记
category: <subcategory>          # 二级分类

metadata:
  name: "<唯一名称>"
  version: "1.0.0"
  author: "<作者>"
  description: "<描述>"
  tags: [tag1, tag2]
  conflicts: []                   # 冲突模型名称(可选)

# ============================================
# 核心内容 (技术统一)
# ============================================
imports:                         # 依赖的其他文件
  - path/to/dependency

variables:                       # 变量定义
  variable_name:
    type: input | state | parameter
    value: <初始值>
    unit: "<单位>"
    bounds: [min, max]
    description: "<描述>"
  
    # 扩展字段
    optimizable: true | false    # 是否可优化
    io_role: input | output | intermediate  # IO语义
    uncertainty: [lower, upper]  # 不确定性区间

formulas:                        # 公式定义
  formula_name:
    description: "<描述>"
    condition: <条件表达式>
    priority: <整数>
    dynamics:
      variable_name: "<更新表达式>"
    formula: "<静态公式表达式>"  # 与dynamics二选一

# ============================================
# 可选字段 (按需启用)
# ============================================
simulator:                       # 仿真配置
  dt: <时间步长>
  dt_unit: <时间单位>
  steps: <仿真步数>
  output_format: <输出格式>
  pause_every: <暂停间隔>
  hooks: [...]
  monitor_conditions: [...]

optimizer:                       # 优化配置
  method: <优化方法>
  targets: [...]
  variables_to_optimize: [...]
  bounds: [...]
  python_envs: [...]
  pop_size: <种群大小>
  n_gen: <迭代次数>
  duration: <持续时间>

# ============================================
# Story特有字段 (仅type=story时有效)
# ============================================
story:                           # 叙事元素
  title: "<故事标题>"
  premise: "<前提设定>"
  protagonist: {...}
  conflict: "<核心冲突>"
  choices: [...]                # 玩家选择
```

---

## 三、Type分类定义

### 3.1 Models (type: model)

```yaml
type: model
category: 
  - dynamics          # 动力学方程
  - statistical       # 统计模型
  - diagnostic        # 诊断判断
  - intervention      # 干预措施
  - pharmacology      # 药理模型
```

**职责**:

- 定义科学规律和可复用组件
- 声明变量能力（optimizable, io_role）
- 不包含具体应用场景

**约束**:

- ✅ 可以 import 其他 models
- ❌ 不能 import stories
- ❌ 不能包含 story 字段
- ❌ 不应包含 optimizer 字段（如包含会触发警告）

### 3.2 Stories (type: story)

```yaml
type: story
category:
  - research_story    # 科研场景
  - game_story        # 游戏场景
  - education_story   # 教育场景
  - clinical_story    # 临床场景
```

**职责**:

- 组合 models 形成完整应用
- 配置优化目标和约束
- 定义用户交互和叙事

**约束**:

- ✅ 可以 import models（推荐）
- ⚠️ 可以 import stories（谨慎使用,用于组合式故事）
- ✅ 可以包含 story 字段
- ✅ 可以包含 optimizer 字段

---

## 四、Metadata 规则

**字段定义**:

- `name`: 字符串,模型名称（可选,默认为文件名）
- `version`: 字符串,遵循语义化版本格式（如 `1.0.0`,可选）
- `author`: 字符串,作者名称（可选）
- `description`: 字符串,模型描述（可选）
- `conflicts`: 字符串列表,冲突模型名称（可选,默认为空列表）
- `tags`: 字符串列表,模型标签（可选,默认为空列表）

**示例**:

```yaml
metadata:
  name: metabolism
  version: 2.1.0
  author: Minghui Wu
  description: 基础代谢率、能量消耗和运动影响
  conflicts: []
  tags: [metabolism, energy]
```

---

## 五、Imports 规则

### 5.1 基本结构

`imports` 是一个字符串列表,指定要导入的模型名称（不含 `.yaml` 扩展名）。

### 5.2 加载规则

- **递归加载**: 从根模型开始,遍历 `imports` 中的每个模型,并递归读取其 `imports`,构建依赖树
- **合并规则**: 优先加载叶子模型（无进一步导入的模型）,然后逐层向上合并。根模型的内容覆盖依赖树中下层模型的同名定义
- **覆盖优先级**: 根模型的 `variables`、`formulas`、`simulator`、`optimizer` 覆盖导入模型的同名定义

### 5.3 约束条件

- 列表中的模型名称必须存在于 `mods` 目录或指定子目录中
- 不得包含自我导入或形成循环依赖（由 `LoaderEngine` 检测）
- 空列表表示无依赖
- **分层约束**:
  - Model不能import Story（强制报错）
  - Story可以import Model（推荐）
  - Story可以import Story（触发警告）

### 5.4 示例

```yaml
imports:
  - nutrition_intake
  - glucose_regulation
```

---

## 六、Variables 规则

### 6.1 基本结构

`variables` 是一个键值对字典,键为变量名（字符串）,值包含以下字段:

**核心字段**:

- `description`: 字符串,变量描述（可选,默认为空字符串）
- `value`: 浮点数或整数,初始值（必须）
- `type`: 字符串,必须为 `input`（外部输入）、`state`（状态变量）或 `parameter`（可优化参数）
- `unit`: 字符串,单位（可选,默认为 `null`）
- `bounds`: 浮点数或整数列表 `[min, max]`,变量范围（可选,默认为 `null`）

**扩展字段**:

- `optimizable`: 布尔值,是否可优化（可选）
- `io_role`: 字符串,IO语义标记（`input` | `output` | `intermediate`,可选）
- `uncertainty`: 浮点数列表 `[lower, upper]`,不确定性区间（可选）

### 6.2 Type vs IO Role 对照表

| type          | io_role          | 含义                   | 示例                   |
| ------------- | ---------------- | ---------------------- | ---------------------- |
| `input`     | `input`        | 外部输入（用户可调）   | 每日碳水摄入、药物剂量 |
| `state`     | `intermediate` | 内部状态（计算中间量） | 血糖浓度、胰岛素水平   |
| `state`     | `output`       | 输出指标（评估结果）   | 健康评分、糖尿病风险   |
| `parameter` | `intermediate` | 模型参数（科学常数）   | 吸收率、代谢率         |

### 6.3 约束条件

- 变量名必须是有效的 Python 标识符（仅字母、数字、下划线,不含空格或特殊字符）
- `value` 必须是数值类型（整数或浮点数）
- 如果定义了 `bounds`,`value` 必须在 `[min, max]` 范围内,且 `min <= max`
- 在合并时,根模型的变量定义覆盖导入模型的同名变量

### 6.4 示例

```yaml
variables:
  blood_glucose:
    description: Blood glucose level
    value: 100.0
    type: state
    unit: mg/dL
    bounds: [0.0, 500.0]
    io_role: intermediate
  
  protein_intake:
    description: Daily protein intake
    value: 0.0
    type: parameter
    unit: g
    bounds: [0.0, 200.0]
    optimizable: true
    io_role: input
```

---

## 七、Formulas 规则

### 7.1 基本结构

`formulas` 是一个键值对字典,键为公式名（字符串）,值包含以下字段:

- `description`: 字符串,公式描述（可选,默认为空字符串）
- `condition`: 字符串或布尔值,公式执行条件（可选,默认为 `true`）
- `priority`: 整数,公式执行优先级（可选,范围 -100 到 100,默认为 0）
- `dynamics`: 键值对字典,键为变量名,值为动态表达式（字符串,用于更新状态,可选）
- `formula`: 字符串,静态公式表达式（用于计算指标而非更新状态,可选）

### 7.2 约束条件

- 公式名必须是有效的 Python 标识符
- `condition` 可以是:
  - 字符串: 必须是 `asteval` 支持的表达式（如 `protein_intake > 0`）
  - 布尔值: `true` 或 `false`（YAML 中的布尔值）
  - 省略: 默认为 `true`
- `priority` 必须为整数（-100 到 100）
- `dynamics` 或 `formula` 中的变量名必须在 `variables` 或导入模型中定义
- 表达式必须是 `asteval` 支持的合法表达式
- **每个公式必须包含 `dynamics` 或 `formula` 之一,但不可同时包含两者**
- 在合并时,根模型的公式定义覆盖导入模型的同名公式

### 7.3 示例

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
    priority: 1
    formula: (digestive_efficiency + insulin_sensitivity) / 2 * 100
```

---

## 八、时间步长处理

### 8.1 时间单位常量

表达式中若使用 `dt`（时间步长）,建议显式指定时间尺度,通过除以或乘以以下保留时间单位常量:

- `SECOND`: 1 秒
- `MINUTE`: 60 秒
- `HOUR`: 3600 秒
- `DAY`: 86400 秒
- `WEEK`: 604800 秒
- `MONTH`: 2592000 秒（约 30 天）
- `YEAR`: 31536000 秒（约 365 年）

### 8.2 示例

```yaml
formulas:
  glucose_decay:
    description: Blood glucose decays hourly
    dynamics:
      blood_glucose: blood_glucose - 0.01 * (dt / HOUR)
    
  population_growth:
    description: Population grows yearly
    dynamics:
      population: population + 0.02 * population * (dt / YEAR)
```

### 8.3 约束与兼容性

- 若 `dynamics` 或 `condition` 使用 `dt`,建议（但不强制）结合时间单位常量以明确尺度
- 未指定单位时,假设 `dt` 以秒为单位
- `simulator.dt_unit` 可指定默认时间单位（如 `hour`）,与 `dt` 结合使用
- 对于不使用时间单位常量的旧模型,`LoaderEngine.validate_model()` 应发出警告,提示迁移

---

## 九、Simulator 规则

### 9.1 基本结构

`simulator` 是一个字典,包含仿真相关参数:

- `dt`: 浮点数,时间步长（必须,正数）
- `dt_unit`: 字符串,时间单位（可选,支持 `second`、`minute`、`hour`、`day`、`week`、`month`、`year`,默认为 `second`）
- `steps`: 整数,仿真步数（必须,正整数）
- `output_format`: 字符串,输出格式（如 `yaml`、`json`,可选,默认为 `yaml`）
- `pause_every`: 整数,每多少步暂停一次（可选,默认为 `null`）
- `hooks`: 列表,仿真钩子（如 `post_step` 指定触发函数,可选）
- `monitor_conditions`: 字符串列表,监控条件（如 `blood_glucose < 70`,可选）

### 9.2 约束条件

- 当 `Simulator` 加载模型时,**必须**存在 `simulator` 字段（否则抛出错误）
- 参数值必须符合预期类型（`dt` 为正数,`steps` 为正整数）
- `dt_unit` 必须是支持的时间单位之一,若未指定,假设 `dt` 以秒为单位
- `hooks` 中的函数名需在运行时环境中定义
- 在仿真过程中,`Simulator` 根据根模型及其 `imports` 中的 `variables` 和 `formulas` 执行

### 9.3 示例

```yaml
simulator:
  dt: 3600
  dt_unit: hour
  steps: 240
  output_format: yaml
  pause_every: 10
  hooks:
    - post_step: check_metabolic_state
  monitor_conditions:
    - blood_glucose < 70
```

---

## 十、Optimizer 规则

### 10.1 基本结构

`optimizer` 是一个字典,包含优化相关参数:

- `method`: 字符串,优化方法（如 `grid`、`nsga2`,必须）
- `python_envs`: 列表,优化任务所需的 Python 包及其版本（可选,格式为 `package_name: ">=version"`）
- `targets`: 字符串列表,优化目标（如 `min_error`、`max_happiness`,必须,至少一个目标）
- `pop_size`: 整数,种群大小（可选,默认为工具默认值）
- `n_gen`: 整数,迭代次数（可选,默认为工具默认值）
- `duration`: 浮点数,优化持续时间（分钟,可选）
- `bounds`: 列表,优化参数的范围（格式为 `[[min1, max1], [min2, max2], ...]`,可选）
- `variables_to_optimize`: 字符串列表,要优化的参数名（必须）

### 10.2 约束条件

- 当 `Optimizer` 加载模型时,**必须**存在 `optimizer` 字段（否则抛出错误）
- `method` 必须是支持的优化算法（如 `grid`、`nsga2`）
- `python_envs` 中的包名和版本格式必须有效,若为空则依赖框架核心环境
- `targets` 至少包含一个目标,支持多目标优化
- `variables_to_optimize` 中的变量必须在 `variables` 或导入模型中定义,且 `type` 为 `parameter` 或 `optimizable: true`
- 若定义 `bounds`,其长度必须与 `variables_to_optimize` 一致,且每个范围 `[min, max]` 满足 `min <= max`
- 在优化过程中,`Optimizer` 根据根模型及其 `imports` 执行

### 10.3 示例

```yaml
optimizer:
  method: nsga2
  targets:
    - max_happiness
    - min_health_risk
  variables_to_optimize:
    - sugar_intake
    - exercise_time
  bounds: [[0, 100], [0, 60]]
  python_envs:
    - pymoo: ">=0.6.0"
    - matplotlib: ">=3.5.0"
  pop_size: 50
  n_gen: 100
  duration: 60.0
```

---

## 十一、一致性约束

### 11.1 唯一性

- 所有变量和公式名在模型内（包括导入模型）必须唯一（合并后检查）

### 11.2 变量引用

- `condition`、`dynamics` 和 `formula` 中的变量必须在 `variables` 或导入模型中定义

### 11.3 数值类型

- 变量的 `value` 和 `bounds` 必须是数值类型（整数或浮点数）

### 11.4 优先级

- 公式 `priority` 必须为整数（-100 到 100）

### 11.5 依赖管理

- 在递归加载 `imports` 时,确保无循环依赖
- 应用覆盖规则（根模型优先）

### 11.6 工具要求

- `Simulator` 要求存在 `simulator` 字段
- `Optimizer` 要求存在 `optimizer` 字段

### 11.7 合并覆盖

- 根模型的 `variables`、`formulas`、`simulator` 和 `optimizer` 字段覆盖导入模型的同名字段

---

## 十二、架构验证机制

### 12.1 验证层次

框架通过三层保护机制确保架构一致性:

1. **目录结构**: 物理隔离 models/ 和 stories/
2. **type字段**: 明确标记文件类型
3. **Validator**: 运行时检查和警告

### 12.2 Validator检查规则

**强制错误（必须修复）**:

- 循环依赖
- Model包含story字段
- Model import Story
- type字段与目录位置不匹配
- 必需字段缺失

**警告（建议修复）**:

- Story import Story（组合式故事需谨慎）
- Model包含optimizer字段
- IO语义不一致（如io_role=input但type=state）

### 12.3 CLI Linter工具

```bash
# 检查所有文件
$ lifematters lint --strict

Validating architecture...

✓ models/medical/glucose_metabolism.yaml
  - type: model
  - imports: 2 models
  - variables: 15 (5 input, 8 state, 2 parameter)

✓ stories/research/diabetes_management.yaml
  - type: story
  - imports: 8 models
  - optimization enabled

✗ models/core/time_system.yaml
  ERROR: Imports story 'stories/calendar.yaml'
  FIX: Remove story import or move file to stories/

⚠ stories/game/match_girl.yaml
  WARNING: Story imports story 'stories/base_game.yaml'
  Consider if composition is necessary.

Summary:
  Files checked: 127
  Errors: 1 (must fix)
  Warnings: 3 (review recommended)
  Circular dependencies: 0
```

---

## 十三、关键决策记录

### 决策1: 采用统一YAML格式

**理由**:

- 技术简洁（一套parser/validator）
- 演化灵活（新类型无需重新设计schema）
- 用户友好（学习一次,到处使用）

**保障措施**:

- 目录结构强制分离
- type字段明确标记
- Validator严格检查
- 文档清晰说明

### 决策2: IO通过variables扩展标记

**理由**:

- 统一变量系统,降低复杂度
- io_role语义清晰,不干扰type
- 灵活组合,支持复杂场景

**优势**:

- 输入输出都是变量,便于optimizer引用
- 扩展字段向后兼容
- 工具可基于io_role生成UI

### 决策3: 允许技术灵活性,禁止架构混乱

**理念**:

- 技术层面: 循环依赖检测,但不强制单向import
- 架构层面: 通过工具警告违反分层的行为
- 创新空间: 用户可探索新用法（如story组合）

**平衡点**:

- 强制: 禁止循环依赖
- 警告: Model import Story
- 提示: Story import Story

---

## 十四、FAQ

### Q1: 为什么不用两套格式分离models和stories?

**A**: 分离格式会导致:

1. 代码复杂度翻倍（两套parser/validator）
2. 学习成本增加（用户要学两套规则）
3. 演化困难（改动牵一发动全身）
4. 不能更好地防止滥用（格式不同但用户仍可能错误使用）

统一格式通过目录、type、validator保证分层,技术成本更低。

### Q2: 如何防止用户在model中写复杂的story逻辑?

**A**: 多层保护:

1. Validator检查: model包含story字段→报错
2. Linter警告: model引用story→警告
3. 文档规范: 明确职责分离
4. 代码审查: 社区贡献强制检查

### Q3: Story可以不包含story字段吗?

**A**: 可以。Story的本质是"组合models形成应用",story字段只是可选的叙事增强。

```yaml
# 最小化story（纯研究配置）
type: story
category: research_story

imports: [...]
optimizer: {...}
# 没有story字段也是合法的
```

### Q4: Model可以有optimizer字段吗?

**A**: 不推荐,但技术上不禁止。

- Model应该声明能力（optimizable: true）
- Story负责配置优化目标和算法
- 如果Model包含optimizer,Validator会警告

### Q5: 如何处理输入的枚举类型（如手术类型）?

**A**: 用整数表示+文档说明

```yaml
surgery_type:
  type: input
  value: 0
  bounds: [0, 2]
  description: "0=无手术, 1=袖状胃切除, 2=胃旁路"
  
  # 可选: 扩展枚举定义
  enum_values:
    0: "none"
    1: "sleeve_gastrectomy"
    2: "gastric_bypass"
```

---

## 附录A: 变量Type速查表

| type          | 含义     | 初始化   | 运行时修改        | 优化器可调 |
| ------------- | -------- | -------- | ----------------- | ---------- |
| `input`     | 外部输入 | 用户设置 | ✅                | ✅ (外环)  |
| `state`     | 内部状态 | 初始值   | ✅ (formulas更新) | ❌         |
| `parameter` | 模型参数 | 固定值   | ❌                | ✅ (内环)  |

---

## 附录B: IO Role速查表

| io_role          | 含义     | 典型type        | 示例         |
| ---------------- | -------- | --------------- | ------------ |
| `input`        | 可控输入 | input           | 每日药物剂量 |
| `intermediate` | 中间计算 | state/parameter | 血药浓度     |
| `output`       | 评估指标 | state           | 健康评分     |

---

## 附录C: 完整文件树示例

```
lifematters/
├─ models/
│  ├─ medical/
│  │  ├─ dynamics/
│  │  │  ├─ glucose_metabolism.yaml
│  │  │  ├─ insulin_system.yaml
│  │  │  └─ body_temperature.yaml
│  │  ├─ diagnostic/
│  │  │  ├─ diabetes_classifier.yaml
│  │  │  └─ risk_assessment.yaml
│  │  └─ assessment/
│  │     ├─ health_score.yaml
│  │     └─ cost_benefit.yaml
│  └─ interventions/
│     ├─ diet/
│     │  └─ meal_input.yaml
│     ├─ exercise/
│     │  └─ exercise_input.yaml
│     ├─ pharmacology/
│     │  ├─ metformin.yaml
│     │  └─ insulin_therapy.yaml
│     └─ surgery/
│        └─ bariatric_surgery.yaml
│
└─ stories/
   ├─ examples/
   │  ├─ research/
   │  │  ├─ comprehensive_diabetes.yaml
   │  │  └─ lifestyle_intervention.yaml
   │  └─ game/
   │     ├─ match_girl.yaml
   │     └─ diabetes_survival.yaml
   └─ user/
      └─ my_studies/
```

---

**文档版本历史**:

- v1.0: 初始基础规范
- v3.0: 统一YAML范式 + 输入输出规范
- v3.1: 合并v1基础描述与v3架构决策（本版本）

**下一步行动**:

1. 实施Phase 1基础框架
2. 开发输入输出Model库
3. 编写Validator和Linter
4. 准备框架论文
