# 模型设计

> 面向建模者的完整 YAML 格式规范。引擎实现细节见 `sim_impl.md`。

## 变量类型（4 种）

| 类型 | 引擎读取 | 建模者填入 | 用途 | 优化归属 |
|------|---------|----------|------|---------|
| `state` | `value`（随时间更新） | 初始值 | 随时间演化的状态变量 | — |
| `input` | `value`（用户可调） | 控制量 | 用户干预量（行为、剂量） | **外环 opt（Simulator）** |
| `parameter` | `value`（不变；MC 模式每 run 采样一次） | 动力学系数或分布表达式 | 直接进公式的机制系数（PK速率、方程斜率、Bergman p1/p2/p3 等）；值由内环 opt 对文献数据拟合后确定。`value` 可写为 `normal(μ, σ)` 等分布形式，表示个体间差异；确定性模式取均值，MC 模式每 run 采样一次。 | **内环 opt（Modeller，待实现）** |
| `evidence` | `_effective`（**Loader 自动换算**） | **原始文献值** | 文献直接给出的效应量（OR/HR/RR/Cohen's d 等）；Loader 换算后供公式引用。**永不参与任何优化。** | — |

> **`probability_constant` 已退役**：发病率、病死率等概率值统一用 `evidence` 下的 `type: ir` 表示。现有 YAML 中的 `probability_params:` 节仍可解析，Loader 会自动映射。

**`parameter` vs `evidence` 的判断准则：**
- 文献给你一个直接可进公式的数（但来自数学拟合而非直接测量，如 Bergman 模型系数）→ `parameter`（交由 Modeller 内环优化校准）
- 文献给你原始统计效应量（OR=1.65、HR=0.82、d=0.68、ke=0.198 h⁻¹）→ `evidence`（Loader 自动换算）

**`input` 变量的单位规范（事件量 vs 速率量）：**

LM 引擎以 pulse 模式执行 input 变量：schedule 触发时写入值，其余步为 0。`unit` 字段应反映每次触发时值的物理意义，分两类：

| 类型 | 含义 | 单位示例 | 典型场景 |
|------|------|---------|---------|
| **事件量**（per-event amount） | 每次给药/执行的离散量，schedule 触发频率由 `days` 控制，不体现在单位里 | `mg`、`g`、`sessions`、`次` | 药物剂量、单次运动场次 |
| **速率量**（rate）| 持续进行中的速率，每步 pulse 是"当前速率的快照"，公式须 `× step` 积分 | `kcal/day`、`g/kg/day`、`kg/week`、`支/day` | 热量缺口、蛋白质日摄入率、减重速率、吸烟频率 |

判断准则：若公式中所有用到该变量的参数单位与 `/day`（或 `/week`）一致，则为速率量；若有参数以裸单位（如 `1/mg`、`μmol/L per mg`）乘以该变量，则为事件量，应去掉时间分母。

> 示例：`thiazide_dose`（HCTZ 晨服剂量）的 `unit` 应为 `mg`，不是 `mg/day`——
> 因为公式里 `gamma_T [1/mg] × thiazide_dose` 要求无时间分母；
> 而 `caloric_deficit` 的 `unit` 保持 `kcal/day`，因为它代表持续的热量亏缺速率。

**evidence 的 8 种子类型：**

| `type` | 效应量 | Loader 换算 | 必填辅助字段 |
|--------|--------|-----------|------------|
| `rr` | 相对风险 RR | `effective = value` | — |
| `or` | 比值比 OR | `effective = OR / ((1−p₀) + p₀×OR)` | `baseline_prevalence` |
| `hr` | 风险比 HR | `effective = baseline_ir × HR` | `baseline_ref`（同节 ir 变量名） |
| `ard` | 绝对风险差 | `effective = value` | — |
| `cohens_d` | 效应量 Cohen's d | `effective = d × population_sd` | `population_sd` |
| `ir` | 发病率 / 死亡率 | `effective = value` | — |
| `beta` | 回归系数 | `effective = value` | — |
| `pk` | PK/PD 参数 | `effective = value` | — |

---

## 医学证据类型与变量映射

`evidence` 变量由 Loader 在加载阶段自动换算，Simulator 只见换算后的 `_effective` 值。
`evidence` 子类型的完整换算逻辑见上方**变量类型表**，YAML 示例见下方 Schema，决策背景见 `decisions/0040`。

患病率（Prevalence）直接设为对应 `state` 变量的初始 `value`，不需要单独的 `evidence` 变量。

---

## 完整 YAML Schema

```yaml
category: physiological | socio_economic | environmental | risk | simple

metadata:
  name: "唯一标识符"
  version: "1.0.0"
  author: "作者或团队"
  description:
    brief: "一行说明模型是什么、服务哪个案例。"
    need: "为什么需要这个模型。"
    problem: "要表达的关键冲突或机制难点。"
    method: "模型结构、时间步长、核心状态和输入。"
    simulation: "默认仿真如何运行，以及主要输出。"
    optimization: "如果有优化，说明目标、约束和决策变量。"
    result: "已有结果或预期结果。"
    conclusion: "已有结论或期望结论。"
    limitations: "当前限制、参数缺口和非适用范围。"
  tags: [tag1, tag2]
  references: ["Author et al. (Year) Title. Journal."]
  step_size:           # 必填：模型时钟分辨率
    value: 1           # canonical 步长，建议保持 1
    unit: minute       # second | minute | hour | day；决定公式中 step 的含义

imports:
  - published/paper2/ckd_protein_a4_p2   # 从 models/ 根出发，不写 .yaml
  - ./local_component                   # 或从当前 YAML 文件出发的相对路径

variables:
  var_name:
    type: input | state | parameter
    value: 0.0                    # 静态值；或对 parameter 写分布：normal(μ, σ) | uniform(a, b) | lognormal(μ, σ)
    description: "说明（用于报告）"  # value 为分布时，在此说明分布来源与 σ 含义
    unit: "unit"
    bounds: [min, max]
    optimizable: true | false
    io_role: input | output | intermediate    # UI 与 IO 语义
    reference: "文献来源"

  # parameter 示例：静态值 vs 分布值
  aspirin_elimination:
    type: parameter
    value: 0.198                  # 静态（确定性模式）
    description: "消除速率常数 ke = ln2 / t½，t½ = 3.5h"
    unit: 1/hour
    reference: "Rowland & Tozer 2011"

  food_absorption_rate:
    type: parameter
    value: normal(0.8, 0.1)      # MC 模式每 run 采样；确定性模式取均值 0.8
    description: "食物吸收效率，个体间差异服从正态分布（σ=0.1 来自 Donnelly 2009 人群数据）"
    unit: fraction
    reference: "Donnelly et al. 2009"

evidence:
  # 文献直接来源的效应量：建模者填原始文献值，Loader 自动换算为 _effective
  # type 取值: rr | or | hr | ard | cohens_d | ir | beta | pk
  smoking_lung_cancer_rr:
    type: rr
    value: 14.0
    reference: "Doll & Hill (1950) BMJ"

  combat_death_rate:
    type: ir
    value: 0.008
    unit: prob/day
    reference: "Prior 1992"

  obesity_diabetes_or:
    type: or
    value: 1.65
    baseline_prevalence: 0.23     # 必填：对照组患病率 p₀

  chemo_mortality_hr:
    type: hr
    value: 0.82
    baseline_ref: chemotherapy_baseline_ir   # 必填：同节内 ir 变量名

  exercise_fev1_effect:
    type: cohens_d
    value: 0.68
    population_sd: 0.5            # 必填：参考人群 SD，单位与 unit 一致
    unit: L

  statin_cvd_ard:
    type: ard
    value: 0.012
    unit: prob/year

  age_bp_beta:
    type: beta
    value: 0.45
    unit: mmHg/year

  aspirin_elimination:
    type: pk
    value: 0.198
    unit: 1/hour

formulas:
  formula_name:
    condition: "expression"       # 条件满足时才执行
    priority: 0                   # 执行顺序（-100 到 100，小值先执行）
    dynamics:                     # 动力学更新（dt 驱动），与 formula 二选一
      var: "expression"
    formula: "expression"         # 静态指标计算（不依赖 dt）
    description: "说明"
    reference: "文献来源"

simulation:
  start_date: "YYYY-MM-DD"        # 仿真起始日
  end_date:   "YYYY-MM-DD"        # 仿真结束日（含）
  # step / step_unit 已移至 metadata.step_size，此处不再声明
  output_variables: [var1, var2]   # 可选；指定按名字输出的变量
  output_types: [input, state]     # 可选；input | parameter | state，按类型输出变量
  schedules:                      # 可选；扁平列表，每条对应一个 input 变量的时间事件
    - variable: var_name          # 必须是 variables 中 type: input 的变量
      time: "HH:MM"               # 24 小时制，触发时刻
      value: 1.5                  # 触发时写入变量的值（pulse 模式：其他步自动为 0）
      days: [Mon, Wed, Fri]       # 可选；三字母缩写 Mon–Sun；缺席 = 每天
      date_range: "YYYY-MM-DD ~ YYYY-MM-DD"  # 可选；条目仅在此区间生效；缺席 = 全程
      label: "说明"               # 可选；GUI 展示用
```

### `metadata.description`

`description` 支持两种写法：

```yaml
metadata:
  description: "一段简短说明。"
```

或结构化写法：

```yaml
metadata:
  description:
    brief: "模型一句话简介。"
    problem: "关键问题。"
    method: "建模方法。"
    result: "已有结果或预期结果。"
```

结构化写法推荐使用英文键名。字段不固定，GUI 会按 YAML 中的字段顺序显示所有非空字段；没有写的字段不会显示，也不会占用空白。推荐字段为 `brief`、`need`、`problem`、`method`、`simulation`、`optimization`、`result`、`conclusion`、`limitations`。作者可以按模型需要增加其他字段，例如 `cohort`、`scope`、`assumption`、`usage`。

科学依据、文献解释、机制公式、时间尺度和建模假设也放在 `description` 内，但应尽量拆成更具体的字段，例如 `evidence`、`mechanism`、`time_scale`、`sources`、`assumption`。不使用同级的 `metadata.science_note` 或顶层 `science_note`，也不推荐在 `description` 内继续使用笼统的 `science_note`。

文献来源能定位到具体变量或公式时，优先写入 `variables.<name>.reference` 或 `formulas.<name>.reference`，让 GUI 的变量/方程视图能直接显示依据；只有无法明确分配的场景级背景来源，才保留在 `description.sources`。

短文本可以直接写成普通标量；需要保留换行时可用 `|`：

```yaml
description:
  method: |
    第一段。
    第二段。
```

---

## Imports 与输出选择

`imports` 只支持显式路径：

- `published/paper2/ckd_protein_a4_p2`：从 `models/` 根目录出发，省略 `.yaml`。
- `models/published/paper2/ckd_protein_a4_p2`：兼容旧写法，等价于上一条。
- `./local_component`、`../paper2/foo`：从当前 YAML 所在目录出发。

裸名字检索已经禁用，例如 `imports: a4_ckd_protein` 不再递归搜索整个 `models/`。这样可以避免同名模型被意外导入。

### 合并顺序

1. imports 按列表顺序加载，**靠后的覆盖靠前的**
2. **当前文件始终覆盖所有 imports**，无论 imports 列表怎么写
3. 循环 import 自动报错（A → B → A 不允许）
4. 同一文件被多次 import（菱形依赖：A → B、C，B → D，C → D）时只加载一次，不重复叠加

GUI 读取模型时会显示 resolved model：变量、方程、输出变量、`simulation` 和 `optimizer` 都包含 imports 合并后的结果。模型页负责结构审阅，会标出变量、方程、输出变量来自哪个 YAML；报告页保持面向结果，不展示 import/source provenance。

输出变量选择规则：

- 如果本模型没有定义 `simulation.output_variables` 和 `simulation.output_types`，则沿用所有 imported models 的输出选择并集。
- 如果本模型显式定义了任一输出字段，则本模型的定义优先，不再混入 imports 的输出字段。
- `output_variables` 和 `output_types` 同时存在时，最终输出取并集。
- 两个字段都不存在或都为空时，输出所有变量。
- `output_types` 只支持 `input`、`parameter`、`state`。
- `output_variables` 中不存在的变量会被跳过，并在 API/GUI 中给出 warning；不会再生成零值曲线。

---

## 时间与步长

步长由 `metadata.step_size` 声明，公式中使用 `step` 符号：

| 符号 | 含义 | 说明 |
|------|------|------|
| `step` | 当前步长（`step_size.value × 粗化倍率`，单位 = `step_size.unit`） | **规范符号** |
| `step_size` / `dt` | 同 `step` | 向后兼容别名 |
| `t` / `time` | 当前仿真时间（单位 = `step_size.unit`） | |

预定义单位常量（`step_size.unit: second` 时有效）：`SECOND=1`、`MINUTE=60`、`HOUR=3600`、`DAY=86400`。

---

## 公式步长规则

**根据变量类型决定是否乘 `step`：**

| 变量类型 | 公式类型 | 是否乘 step | 原因 |
|---------|---------|-----------|------|
| `state` | 速率（连续动力学） | **必须乘** | 效果与时间成比例 |
| `input` | 脉冲（pulse 驱动） | **不乘** | 一次性量，与步长无关 |
| `parameter` | 乘数系数 | 不适用 | 本身是系数 |

```yaml
# ✅ 速率类：state 更新必须乘 step
dynamics:
  insight:   insight + 0.069 * cognitive_efficiency * step
  nutrition: max(0, nutrition - 0.010 * step)

# ✅ 瞬时类：input 脉冲不乘 step
dynamics:
  stomach_carbs: stomach_carbs + carb_intake
```

---

## Euler 离散积分（永久决策）

**本框架永久采用统一 Euler 离散明文表达，直接写出下一时刻的值，不引入 RK4 等高阶积分器。**

```yaml
dynamics:
  blood_glucose: blood_glucose + (uptake - utilization) * step
  position:      position + velocity * step
  velocity:      velocity + (force - damping * velocity) * step
```

理由：生理/社会模型参数不确定性 ±10–50%，Euler 截断误差远低于此；离散事件（进餐、用药）破坏高阶积分器精度优势；明文表达所见即所得。

---

## simulation.schedules — 时间驱动的 input 序列

`simulation.schedules` 是 `type: input` 变量的子类型，表示"随仿真时间自动变化的输入量"。引擎以 **pulse** 模式处理：命中时间窗口的步写入 `value`，其余步自动为 0。

### 标准格式（扁平列表）

```yaml
simulation:
  start_date: "2026-01-01"
  end_date:   "2026-01-04"
  schedules:
    - variable: carb_intake
      time: "07:00"
      value: 50.0
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]   # 可省略，缺席 = 每天
      date_range: "2026-01-01 ~ 2026-01-04"        # 可省略，缺席 = 全程
      label: "早餐碳水"
    - variable: carb_intake
      time: "12:00"
      value: 80.0
      label: "午餐碳水"
    - variable: carb_intake
      time: "18:30"
      value: 60.0
      label: "晚餐碳水"
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `variable` | string | ✅ | 必须是 `variables` 中 `type: input` 的变量名 |
| `time` | `"HH:MM"` | ✅ | 触发时刻（24 小时制） |
| `value` | number | ✅ | 触发时写入的值 |
| `days` | `[Mon…Sun]` | — | 三字母缩写列表；缺席 = 每天都触发 |
| `date_range` | `"YYYY-MM-DD ~ YYYY-MM-DD"` | — | 条目仅在此日历区间内生效；缺席 = 从 `start_date` 到 `end_date` 全程 |
| `label` | string | — | GUI 展示用说明文字 |

### 多条目 vs 多周期

同一变量**可以有多个条目**（如三餐），pulse 引擎在同一步内累加所有命中事件：

```yaml
# 三餐：每步最多命中一个，累加结果 = 单餐值（不同时段错开）
# 步长 1 天时：三个条目在同一步内全部命中 → dietary_protein = 0.27+0.27+0.26 = 0.80
```

`date_range` 用于表达**分阶段方案**（如训练周期渐进），不要用"每周重复列条目"替代：

```yaml
# ✅ 正确：用 date_range 区分阶段
schedules:
  - variable: training_load
    time: "09:00"
    value: 50.0
    days: [Mon, Tue, Wed, Thu, Fri]
    date_range: "2026-01-01 ~ 2026-01-28"   # 基础期 4 周
  - variable: training_load
    time: "09:00"
    value: 100.0
    days: [Mon, Tue, Wed, Thu, Fri]
    date_range: "2026-01-29 ~ 2026-02-25"   # 强化期 4 周

# ❌ 错误：逐周罗列（冗余，条目数 = 周数 × 2）
schedules:
  - variable: training_load
    value: 50.0
    date_range: "2026-01-01 ~ 2026-01-07"   # 第1周
  - variable: training_load
    value: 50.0
    date_range: "2026-01-08 ~ 2026-01-14"   # 第2周（与第1周相同，无意义）
```

### 优先级规则

YAML Schedule 的优先级**高于** GUI Regimen（用户在界面上填写的值）。

| 来源 | 优先级 | 用途 |
|------|--------|------|
| `simulation.schedules`（YAML） | **最高** | 模型行为定义，作者决策 |
| GUI Regimen（`inputEvents`） | 中（被覆盖） | 用户交互预览 |
| 优化器 Regimen | 最高（显式抑制 schedule） | 优化搜索空间 |

**建模者须知**：如果模型已在 `simulation.schedules` 定义了某变量的时序，GUI 上对该变量的手动调整仅在优化模式下（optimizeValue=true）生效。

### 离散输入不写零值点

> `type: input` 的瞬时量（进食、给药等）在 pulse 模式下无需插入 `value: 0` 的关闭点——未命中步自动为 0。

```yaml
# ✅ 只写非零时刻
- variable: carb_intake
  time: "07:00"
  value: 50.0

# ❌ 冗余的 0 值点
- variable: carb_intake
  time: "07:30"
  value: 0.0    # 不需要，pulse 模式自动补零
```

例外：连续速率类变量（如持续泵药 `infusion_rate`）需要保留明确的关闭点。

### 向后兼容：旧字典格式

旧版 dict 格式（`{varName: {interpolation, points: [{time: 秒数, value}]}}`）在引擎中仍可解析，但不再推荐，新模型应使用扁平列表格式。

---

## daily_inputs 与 accumulators

`daily_inputs` 以天为单位指定输入值，引擎自动转秒级时间戳：

```yaml
daily_inputs:
  cigarettes:
    interpolation: step       # step（阶梯）| linear（线性插值）
    values:
      - { day: 1,  value: 20 }
      - { day: 8,  value: 10 }
      - { day: 30, value: 0  }
```

`accumulators` 按天/周/月窗口自动积分：

```yaml
accumulators:
  weekly_cigarettes:
    source: cigarettes
    window: week              # day | week | month
    operation: sum            # sum | mean
    unit: cigs/week
```

每步贡献 = `V × (dt / 86400)`，对任意步长均一致。

---

## 分层约束

1. **Model**：只能 `import` 其他 Model，严禁引用 Story。
2. **Story**：组合 Model 并配置场景，允许 `optimizer` 配置和 `patches`。
3. **循环检测**：`LoaderEngine` 自动阻止循环导入。

---

## 模型分类体系

三层目录：`models/source/{L1}/{L2}/{L3}/file.yaml`

| L1 | L2 | 说明 |
|----|----|----|
| medical | physiology / nutrition / fitness / disease / medicine / surgery | 生理与医学 |
| social | economy / conflict / law / psychology / technology / demography | 社会经济与社会学 |

完整 L3 细分见 `docs/decisions/0022-models-three-level-taxonomy.md`。

---

## optimizer.results — 优化结果内嵌格式

优化完成后，结果写回 `optimizer.results` 块，与配置并列存于同一 YAML 文件。
这意味着**发布模型即发布结果**；有结果的模型下次运行时自动热启动（warm-start）。

### 完整结构

```yaml
optimizer:
  method: nsga2
  objectives: [...]
  regimen: {...}
  algorithm: {...}

  results:                          # ← 优化完成后由 GUI 写入，无需手动填写
    generated_at: "YYYY-MM-DD"     # 生成日期（ISO 8601 日期部分）
    method: nsga2                  # 使用的算法
    n_solutions: 8                 # Pareto 前沿解的数量
    elapsed_seconds: 87.3          # 本次运行耗时（秒）
    pareto_front:                  # 所有非支配解（flow-style，每行一个解）
      - {x: [0.30, 0.29, 0.30], f: [65.8, 47.1]}
      - {x: [0.35, 0.33, 0.34], f: [66.9, 44.8]}
    best:                          # 推荐解（Pareto 前沿中的平衡点）
      x: [0.30, 0.29, 0.30]       # 决策变量值（与 optimizer.inputs 事件顺序对应）
      f: [65.8, 47.1]             # 目标函数值（与 objectives 顺序对应）
      regimen:                    # 人类可读的方案（变量名 → 时间标签 → 值）
        dietary_protein:
          "早餐蛋白质": 0.30
          "午餐蛋白质": 0.29
          "晚餐蛋白质": 0.30
      objectives:                 # 人类可读的目标结果
        muscle_mass: 65.8
        GFR: 47.1
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `generated_at` | 日期字符串 | 写入日期，用于判断结果是否过期 |
| `method` | string | 算法名（nsga2 / l-bfgs-b / nelder-mead） |
| `n_solutions` | int | Pareto 前沿解的数量 |
| `elapsed_seconds` | float | 本次运行耗时 |
| `pareto_front` | list | 所有非支配解，每个元素为 `{x: [...], f: [...]}` |
| `best.x` | list | 推荐解的决策变量值 |
| `best.f` | list | 推荐解的目标值 |
| `best.regimen` | dict | 人类可读的方案（变量名 → {时间标签: 值}）；供人类阅读，不用于程序反解 |
| `best.objectives` | dict | 人类可读的目标结果（变量名: 值） |

**`x` 向量与 inputEvents 的映射关系**：`x[i]` 对应 `optimizer.inputs`（或 `optimizer.regimen`）中按变量名顺序、再按 events 列表顺序展开的第 i 个可优化事件。此映射关系由 `optimizer.inputs` 的结构隐含，不需要额外存储。软件（前端）在将 Pareto 解转化为 Sim Plans 时，按相同顺序解析 `optimizer.inputs` 还原映射（见 `xToInputEvents` 函数，sim_design.md）。

### 设计原则

- **`results` 整体覆写**：每次保存时用新前沿完整替换旧 `results`，不保留历史；Pareto 前沿只会随搜索改善或持平，不会退化。
- **格式统一**：`pareto_front` 使用 YAML flow-style（`{x: [...], f: [...]}` 单行），50 个解 = 50 行，不破坏模型可读性。
- **热/冷启动（用户选择）**：加载有 `results` 的模型时，Opt 面板显示历史解数量和日期，由用户显式选择"热启动"（以历史前沿为初始种群继续搜索）或"冷启动"（从随机初始种群重新搜索）；不自动决定。
- **Sim 读取 opt 结果**：加载含 `best.regimen` 的模型时，Sim 面板询问是否将推荐解预填为当前 inputEvents；用户可选择加载或忽略。
- **Opt→Sim 多输出（N-N）**：Pareto 前沿是 N 组输入组合；软件将 N 个 Pareto 解各自重组为合规的 Sim inputEvents（Plan），供 F-MPLAN 并行仿真和比较；opt.results 仅保留原始 x/f 向量。
- **发布即结果**：建模者运行优化、保存模型、上传 YAML，接收者打开即看到 Pareto 前沿和推荐解；`results` 可独立阅读。
- **无结果也合法**：`optimizer.results` 是可选块；没有该字段的模型正常运行，从随机初始种群开始搜索。

### 工作流

```
建模者                          GUI                          模型文件
  │                              │                              │
  │── 打开含 results 的模型 ──>  │ 显示历史 Pareto 前沿          │
  │                              │ 工具栏：● 模型含有历史结果     │
  │── 点击"运行优化" ──────────> │ warm-start（历史解为初始种群）  │
  │                              │ 继续进化 n 代                │
  │── 点击"保存结果到模型" ────> │ POST /api/optimizer/write-results
  │                              │──────────────────────────>  │ optimizer.results 覆写
  │── 点击"下载模型" ──────────> │ GET /api/file-raw/{path}     │
  │   接收 .yaml 文件             │                              │
```
