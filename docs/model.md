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

**`input` 变量的单位规范（事件量，唯一规则）：**

LM 引擎以 pulse 模式执行 input 变量：schedule 触发时写入值，其余步为 0。`unit` 字段描述**一次脉冲触发交付的物理量**，始终使用裸单位，不含时间分母。`input` 公式直接加减，**不乘 `step`**：

| 正确写法 | 禁止写法 | 原因 |
|---------|---------|------|
| `mg`、`g`、`kcal`、`kg`、`MET-h`、`sessions` | ~~`mg/day`、`g/kg/day`、`kcal/day`、`kg/week`~~ | schedule 是离散脉冲，触发频率由 `days` 控制，`/day` 与 T3/T4 优化器不兼容 |

文献给出的速率参考值（如"500 mg/day"、"2 mg/kg/day"）记录在 `reference` 或 `description` 字段，不进入 `unit`。真正的持续速率过程（如静脉输注速率）建模为 `parameter`（带 `1/day`、`1/min` 单位），配合 `× step` 在公式中积分；`input` 变量的公式不使用 `× step`。

> 示例：`aspirin_dose = 50 mg`（晨服，文献"100 mg/day"记入 `reference`，`unit` 只写 `mg`）；
> `caloric_deficit = 500 kcal`（每日触发，不写 `kcal/day`）；
> `weight_loss_weekly = 0.5 kg`（每周一触发，不写 `kg/week`）。

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
  authors:
    - name: "姓名"
      email: "邮箱（可选）"
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
    unit: minute       # minute | hour | day；决定公式中 step 的含义

imports:
  - papers/paper2/ckd_protein_a4_p2     # 从 models/ 根出发，不写 .yaml，不写 models/ 前缀
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
  mc:                               # 可选；缺席或 runs=1 = 确定性模式
    runs: 30                        # 仿真可视化 MC run 数；默认 1
    seed: 19                        # 可选；固定整数=可复现，省略或 null=每次随机
  output_variables: [var1, var2]   # 可选；指定按名字输出的变量
  output_types: [input, state]     # 可选；input | parameter | state，按类型输出变量
  schedules:                      # 可选；单方案默认调度（向后兼容）
    - variable: var_name          # 必须是 variables 中 type: input 的变量
      time: "HH:MM"               # 24 小时制，触发时刻
      value: 1.5                  # 触发时写入变量的值（pulse 模式：其他步自动为 0）
      days: [Mon, Wed, Fri]       # 可选；三字母缩写 Mon–Sun；缺席 = 每天
      date_range: ["YYYY-MM-DD", "YYYY-MM-DD"]  # 可选；条目仅在此区间生效；缺席 = 全程
      label: "说明"               # 可选；GUI 展示用
  plans:                          # 可选；预定义的多方案比较（GUI 直接加载为 Plan 列表）
    - id: "plan_id"               # 方案唯一标识（小写加下划线）
      label: "方案显示名称"        # GUI 显示标签
      schedules:                  # 与 simulation.schedules 格式完全相同
        - variable: var_name
          time: "HH:MM"
          value: 1.5
          days: [Mon, Wed, Fri]
          date_range: ["YYYY-MM-DD", "YYYY-MM-DD"]
          label: "说明"

optimizer:                          # 可选；优化器配置；详见「optimizer — 决策变量与调度优化」章节
  method: nsga2                     # nsga2（默认，多目标）| l-bfgs-b | nelder-mead（单目标）
  start_date: "YYYY-MM-DD"         # 可选；优化评估时间窗起始；缺省沿用 simulation.start_date
  end_date:   "YYYY-MM-DD"         # 可选；优化评估时间窗结束；缺省沿用 simulation.end_date
  step_size:                        # 可选；优化评估步长；缺省沿用 metadata.step_size
    value: 1
    unit: day                       # minute | hour | day
  objectives:
    - variable: outcome_var
      metric: final                 # final | max | min | mean
      direction: maximize           # maximize | minimize
  constraints:                      # 可选
    - variable: side_effect
      condition: "<= 10"            # 支持 <= >= < > ==
      type: hard                    # hard | soft
  algorithm:                        # 可选；缺省 pop=50, gen=80, seed=42
    population_size: 50
    n_generations: 80
    seed: 19                        # NSGA-II 遗传算法 seed，与 MC 无关
  mc:                               # 可选；优化器内层 MC 评估；缺席或 runs=1 = 单次评估
    runs: 5                         # 每次候选评估的内层 MC run 数；默认 1
    seed: 19                        # 可选；固定整数=可复现，省略或 null=每次随机
  schedules:                        # 决策变量 + 固定背景输入（统一列表，取代旧 inputs:）
    - variable: var_name            # 固定背景量（无 optimize 块）——每次评估以固定值注入
      time: "HH:MM"
      value: 1.5
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      date_range: ["YYYY-MM-DD", "YYYY-MM-DD"]   # 可选；固定有效期 [start, end]
    - variable: var_name            # T1：值搜索
      time: "HH:MM"
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      label: "说明"
      optimize:
        value: [lo, hi]             # [lo, hi] 搜索区间
    - variable: var_name            # T1+T2：值 + 时刻搜索
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]  # 固定星期（T3 未激活时）
      label: "说明"
      optimize:
        value: [lo, hi]
        time: ["HH:MM", "HH:MM"]   # 时刻搜索窗 [start, end]
        time_step: "1h"             # 可选；时间槽粒度；缺省 1h；可设 15min
    - variable: var_name            # T1+T3：值 + 星期组合搜索（后台自由组合）
      time: "HH:MM"
      label: "说明"
      optimize:
        value: [lo, hi]
        days_pool: [Mon, Wed, Fri, Sat, Sun]  # 候选日集合
        days_n: [min, max]          # 从 pool 中选 min~max 天（后台枚举所有合法组合）
    - variable: var_name            # T1+T4：值 + 日期范围搜索
      time: "HH:MM"
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      label: "说明"
      optimize:
        value: [lo, hi]
        date_range:                 # [[起始日搜索窗lo,hi], [结束日搜索窗lo,hi]]，两组均必填
          - ["YYYY-MM-DD", "YYYY-MM-DD"]   # 起始日搜索窗
          - ["YYYY-MM-DD", "YYYY-MM-DD"]   # 结束日搜索窗（固定时写同一日期两次）
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

## 变量与公式数据规范

所有 YAML 中的 `variables` 和 `formulas` 条目须遵守：

1. **强制 `description`**：简洁说明该变量/公式的物理或医学意义。
2. **强制 `reference`**：所有数值（`value`）、范围（`bounds`）和动力学公式（`dynamics`）必须标注数据来源。格式不限，但须包含足够信息（DOI、PMID、简写引用或 URL）让读者在 30 秒内定位原始文献。暂无来源时填 `["TODO:SOURCE"]` 并在 `description` 中注明估算逻辑。
3. **可选 `comments`**：记录多文献冲突时的选择理由或参数微调过程，不替代 `description` 和 `reference`。

---

## Imports 与输出选择

`imports` 只支持显式路径：

- `papers/paper2/ckd_protein_a4_p2`：从 `models/` 根目录出发，省略 `.yaml`，不写 `models/` 前缀。
- `references/medical/physiology/glucose_regulation_2026_mw`：同上，深层路径写全即可。
- `./local_component`、`../paper1/foo`：从当前 YAML 所在目录出发。

裸名字检索已禁用，例如 `imports: ckd_protein_a4_p2` 不递归搜索 `models/`，须写出完整相对路径。

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
      date_range: ["2026-01-01", "2026-01-04"]        # 可省略，缺席 = 全程
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
| `date_range` | `["YYYY-MM-DD", "YYYY-MM-DD"]` | — | 条目仅在此日历区间内生效；缺席 = 从 `start_date` 到 `end_date` 全程 |
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
    date_range: ["2026-01-01", "2026-01-28"]   # 基础期 4 周
  - variable: training_load
    time: "09:00"
    value: 100.0
    days: [Mon, Tue, Wed, Thu, Fri]
    date_range: ["2026-01-29", "2026-02-25"]   # 强化期 4 周

# ❌ 错误：逐周罗列（冗余，条目数 = 周数 × 2）
schedules:
  - variable: training_load
    value: 50.0
    date_range: ["2026-01-01", "2026-01-07"]   # 第1周
  - variable: training_load
    value: 50.0
    date_range: ["2026-01-08", "2026-01-14"]   # 第2周（与第1周相同，无意义）
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

## simulation.plans — 预定义多方案比较

`simulation.plans` 允许建模者在 YAML 中预置多个命名方案，GUI 加载模型时直接呈现为 Plan 列表供多方案并行仿真（F-MPLAN）。

**使用场景**：
- 论文模型（papers/）：将 Pareto 前沿的代表点写成具名方案，读者打开即可比较"肾保护优先"vs"肌肉保留优先"
- 临床对照：预置"指南标准剂量"与"优化剂量"方案，直接展示论文图表对应的输入

**格式**：

```yaml
simulation:
  start_date: "2026-01-01"
  end_date:   "2026-12-31"
  plans:
    - id: "kidney_protect"
      label: "肾保护优先（Pareto 端点）"
      schedules:
        - variable: dietary_protein
          time: "08:00"
          value: 0.22
          days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
          label: "早餐蛋白质"
        - variable: dietary_protein
          time: "12:00"
          value: 0.21
          label: "午餐蛋白质"
        - variable: dietary_protein
          time: "18:00"
          value: 0.22
          label: "晚餐蛋白质"
    - id: "balanced"
      label: "临床平衡方案"
      schedules:
        - variable: dietary_protein
          time: "08:00"
          value: 0.29
          label: "早餐蛋白质"
        - variable: dietary_protein
          time: "12:00"
          value: 0.27
          label: "午餐蛋白质"
        - variable: dietary_protein
          time: "18:00"
          value: 0.28
          label: "晚餐蛋白质"
    - id: "muscle_preserve"
      label: "肌肉保留优先（Pareto 端点）"
      schedules:
        - variable: dietary_protein
          time: "08:00"
          value: 0.38
          label: "早餐蛋白质"
        - variable: dietary_protein
          time: "12:00"
          value: 0.36
          label: "午餐蛋白质"
        - variable: dietary_protein
          time: "18:00"
          value: 0.37
          label: "晚餐蛋白质"
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 方案唯一标识（小写加下划线） |
| `label` | string | ✅ | GUI 显示名称 |
| `schedules` | list | ✅ | 与 `simulation.schedules` 格式完全相同 |

**与 `simulation.schedules` 的关系**：

| 情形 | GUI sim 标签行为 | optimizer 背景 fallback |
|------|----------------|------------------------|
| 仅有 `schedules` | 视为一个未命名的默认方案（单方案模式） | 使用 `schedules` |
| 仅有 `plans` | 加载所有预置方案 | 无固定背景（除非定义 `optimizer.schedules`） |
| 两者共存 | **`plans` 完全覆盖，`schedules` 对 GUI sim 标签无效** | 若无 `optimizer.schedules`，仍用 `schedules` 作 fallback |

**建模者注意**：在有 `plans` 的模型中，`schedules` 对 GUI 仿真标签不起作用——GUI 只读取各 plan 自身的 `plan.schedules`。保留 `schedules` 唯一的意义是为 `optimizer.schedules` 提供隐式 fallback；若已显式定义 `optimizer.schedules`，则 `schedules` 可以安全删除。

**papers/ 模型规范**：所有 `models/papers/` 下的论文模型**不允许同时定义 `schedules` 和 `plans`**——应仅保留 `plans`（删除 `schedules`）。论文模型具有 Pareto 前沿结果，加载时天然呈现多方案；`schedules` 在此场景下纯属冗余。详见 ADR 0087。

**Plan 的 session 语义**：Plan 是 GUI 运行时对象，建模者在 YAML 中预置的是初始状态；用户在 GUI 中可继续添加、修改、删除方案，不会回写到 YAML 文件。

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

### `references/` 目录约定

`references/` 下的模型分两类，optimizer 要求不同：

| 类型 | 特征 | optimizer 要求 |
|------|------|--------------|
| **可独立分析的参考模型**（fitness、disease、nutrition 等）| 有自己的 `input` 变量和 `simulation.schedules`，可直接运行 | **应有** `optimizer` 块 |
| **深层生理组件**（physiology/ 下的 `_mw` 系列，如 `digestive_system`、`insulin_system`、`glucose_regulation` 等）| 无 `input` 变量，主要为 `import` 的积木，单独运行无生理意义 | **不需要** `optimizer` |

判断原则：若模型的 `variables` 中没有 `type: input` 的变量，说明它是纯组件，不需要 optimizer。

---

## lm_score — Life Matters 健康时长核心指标

`lm_score` 是 Life Matters 框架的约定核心变量，表示**关键指标同时满足健康条件的累计时长**。它是普通的 `state` 变量 + 标准公式，建模者在 YAML 中完整写出，无任何引擎特殊处理。变量名 `lm_score` 是约定俗成，可自由覆盖或重命名。

### 两种积累语义

| 语义 | 描述 | 适用场景 |
|------|------|---------|
| **可恢复**（cumulative） | 条件满足期间累加，不满足期间暂停；恢复后继续累计 | 慢性病管理、低血糖可扛过、轻度症状 |
| **不可逆**（latch） | 条件一旦不满足，`lm_alive` 标志永久归零，之后即使恢复也不再累计 | 器官衰竭、不可逆死亡事件 |

### YAML 写法

**可恢复模式**（推荐默认）：

```yaml
variables:
  lm_score:
    type: state
    value: 0.0
    unit: day
    description: "健康时长：GFR 与血压同时在安全范围内的累计仿真天数"
    reference: "Life Matters Framework core metric"

formulas:
  lm_score_update:
    dynamics:
      lm_score: "lm_score + step if (GFR >= 15 and SBP <= 160) else lm_score"
    description: "累加健康时长（可恢复）"
```

**不可逆模式**（latch，适合死亡/器官衰竭）：

```yaml
variables:
  lm_score:
    type: state
    value: 0.0
    unit: day
    description: "健康时长：首次崩溃前的累计天数（不可逆）"
    reference: "Life Matters Framework core metric"
  lm_alive:
    type: state
    value: 1.0
    description: "存活标志：0 = 不可逆崩溃，1 = 存活"

formulas:
  lm_alive_check:
    condition: "not (GFR >= 15 and SBP <= 160)"
    formula:
      lm_alive: "0.0"                    # 一旦触发，永久为 0
    description: "检测崩溃并锁定存活标志"
  lm_score_update:
    dynamics:
      lm_score: "lm_score + lm_alive * step"
    description: "累加健康时长（不可逆）"
```

### 作为优化目标

```yaml
optimizer:
  objectives:
    - variable: lm_score
      metric: final          # 仿真结束时的累计健康天数
      direction: maximize    # 最大化健康时长
```

### 多模型 Import 的合并

当多个子模型各自定义了 `lm_score`（条件不同），import 时后者会覆盖前者（遵循标准 import 覆盖规则）。若需 AND 合并多个子模型的条件，建模者在顶层模型中显式重写 `lm_score_update` 公式：

```yaml
# 顶层模型：显式合并 Model A（GFR 条件）和 Model B（SBP 条件）
formulas:
  lm_score_update:
    dynamics:
      lm_score: "lm_score + step if (GFR >= 15 and SBP <= 160) else lm_score"
```

### 设计原则

- `lm_score` 是普通变量，完全透明，所有仿真步的值均可输出和查看
- 条件表达式使用与公式相同的 asteval 沙箱，可引用模型中任意变量
- 多个健康条件用 `and`/`or` 自由组合
- GUI 目标变量选择器中，`lm_score` 显示 ⭐ 标记以便识别，无其他特殊行为

---

## optimizer — 决策变量与调度优化

### Sim 与 Opt 的分离原则

`simulation:` 和 `optimizer:` 是相互独立的场景描述，但可以通过 GUI 相互转化：

| 字段/概念 | simulation | optimizer |
|----------|-----------|-----------|
| 时间范围 | `simulation.start_date`/`end_date` | `optimizer.start_date`/`end_date`（可选） |
| 步长 | `metadata.step_size` | `optimizer.step_size`（可选） |
| Monte Carlo | — | `optimizer.mc` |
| 固定输入 + 决策变量 | `simulation.schedules`（可视化用） | `optimizer.schedules`（统一列表） |

**Fallback**：`optimizer.*` 字段缺省时，引擎从对应 `simulation.*` / `metadata.*` 继承；GUI 明确标注来源（"来自 sim" vs "已覆盖"）。

**GUI 转化**：
- "← 从 Sim 导入"：将 Sim tab 当前 inputEvents 复制为 `optimizer.schedules` 决策变量，自动推算 bounds
- "发送到 Sim"：将 Pareto 参考解的 regimen 预填为 Sim inputEvents

### optimizer.schedules — 决策变量与固定背景量统一列表

`optimizer.schedules` 是决策变量和固定背景量的统一列表（取代旧版分离的 `optimizer.inputs` + `optimizer.schedules`）。有 `optimize:` 块的条目是决策变量；无 `optimize:` 块的是固定背景量。

```yaml
optimizer:
  schedules:
    - variable: metformin_dose      # 固定背景量（无 optimize 块）
      time: "08:00"
      value: 500
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      label: "二甲双胍基础用药（背景）"
```

**优先级**：`optimizer.schedules` > `simulation.schedules`（对同一变量，通过 `manual_overrides` 实现覆盖）。`optimizer.schedules` 不存在时 → 回退到 `simulation.schedules`（向后兼容）。

### 评估时间窗（start_date / end_date / step_size）

优化器在每次评估时内部运行一次仿真，其时间范围和步长可独立于 GUI 的可视化设置：

| 字段 | 类型 | 说明 |
|------|------|------|
| `start_date` | `"YYYY-MM-DD"` | 优化评估起始日；缺省沿用 `simulation.start_date` |
| `end_date` | `"YYYY-MM-DD"` | 优化评估结束日；缺省沿用 `simulation.end_date` |
| `step_size` | `{value, unit}` | 评估步长；缺省沿用 `metadata.step_size` |

**设计原则：**
- 三者均为可选；不声明则从 simulation / metadata 继承。
- 显式声明可保证结果可复现：发布带 `optimizer.results` 的 YAML 时，读者可用相同时间窗重跑优化。
- 评估步长建议与 `metadata.step_size` 一致；若模型动力学时间尺度允许，可适当粗化以加速搜索。
- GUI 的时间控件值（工具栏上的日期和步长）在运行优化时作为 `optimizer_override` 传入引擎，优先级高于 YAML 静态值。

**典型用法（缩短评估窗以加速搜索）：**

```yaml
simulation:
  start_date: "2026-01-01"
  end_date:   "2030-12-31"   # 5 年可视化

optimizer:
  start_date: "2026-01-01"
  end_date:   "2027-12-31"   # 仅用 2 年评估，加速搜索
  step_size:
    value: 1
    unit: day
```

---

优化器将干预方案的参数化搜索分为四个粒度层（Tier），按科学价值与计算复杂度排序：

| Tier | 优化对象 | 变量类型 | 典型场景 |
|------|---------|---------|---------|
| T1 | 事件值（剂量/强度） | 连续实数 | 药物剂量、营养摄入量 |
| T2 | 事件时刻（在时间窗内） | 离散整数（时间槽索引） | 进食窗口、给药时机、昼夜节律 |
| T3 | 星期组合（从候选日自由组合） | 离散整数（组合索引） | 运动频率、断食日安排 |
| T4 | 干预起始日（在日期窗内） | 整数（天偏移） | 治疗时机、季节性干预 |

每个 `inputs` 条目可独立启用任意 Tier 组合；x 向量是所有已启用维度按顺序拼接的结果。

### T2：时间窗优化

```yaml
schedules:
  - variable: meal_carbs
    days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]   # 固定星期（T3 未激活）
    label: "早餐碳水"
    optimize:
      value: [30, 80]
      time: ["07:00", "09:00"]   # 时刻搜索窗 [start, end]
      time_step: "1h"            # 可选；缺省 1h；精细场景可设 15min
```

- `optimize.time` 格式：`["HH:MM", "HH:MM"]`（24 小时制，起止含边界）。
- `time_step` 合法值：`"1h"`（缺省）、`"15min"`。引擎展开为离散时间槽，例如 `["07:00","09:00"]` + `1h` → `["07:00","08:00","09:00"]`（3 个槽）。
- T2 激活时，顶层 `time:` 字段不写（无固定时刻）。
- 科学意义：时间生物学（Chrono-nutrition / Chronopharmacology）中，干预时机本身是关键决策变量，本框架将其显式纳入优化搜索空间。

### T3：星期组合搜索

```yaml
schedules:
  - variable: exercise_load
    time: "17:00"
    label: "运动"
    optimize:
      value: [30, 90]
      days_pool: [Mon, Tue, Wed, Thu, Fri, Sat]  # 候选日集合
      days_n: [3, 5]                             # 从 pool 中选 3~5 天
```

- `days_pool`：候选日集合（Mon–Sun 三字母缩写）。
- `days_n: [min, max]`：后台从 pool 中枚举所有满足 min ≤ n ≤ max 的合法组合，编码为整数决策变量。
- T3 激活时，顶层 `days:` 字段不写（无固定星期）。

### T4：干预日期范围优化

```yaml
schedules:
  - variable: caloric_restriction
    time: "08:00"
    days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
    label: "热量限制"
    optimize:
      value: [400, 800]
      date_range:                                # 强制两组，均必填
        - ["2026-05-01", "2026-05-30"]           # 起始日搜索窗 [lo, hi]
        - ["2026-12-31", "2026-12-31"]           # 结束日搜索窗（固定时写同一日期两次）
```

- `optimize.date_range` 必须恰好两组：第一组为起始日搜索窗，第二组为结束日搜索窗。
- 若结束日固定，写 `["YYYY-MM-DD", "YYYY-MM-DD"]`（两值相同）。
- T4 激活时，顶层 `date_range:` 字段不写（固定日期范围）。
- 典型场景：治疗介入时机、季节性干预窗口、灾后救援资源投放时机。

### x 向量编码规则

x 向量按 `schedules` 列表顺序展开，每个条目按 `[value?, time?, days?, date_start?, date_end?]` 顺序贡献维度：

| 条目启用的 Tier | x 贡献维度 | 变量类型 |
|--------------|-----------|---------|
| T1 only | 1（value） | 连续实数 |
| T2 only | 1（time_slot_idx） | 整数 |
| T1 + T2 | 2（value, time_slot_idx） | 实数 + 整数 |
| T1 + T3 | 2（value, combo_idx） | 实数 + 整数 |
| T1 + T4 | 2~3（value, date_start_offset[, date_end_offset]） | 实数 + 整数×1~2 |
| 固定背景量（无 optimize） | 0 | — |

混合整数向量由 NSGA-II 连续松弛处理；单目标算法（L-BFGS-B / Nelder-Mead）不支持整数变量，启用 T2/T3/T4 时自动切换为 NSGA-II 并给出警告。

**示例**：`meal_carbs`（T1+T2）和 `exercise_load`（T1+T3）各贡献 2 维，x 长度为 4：

```
x = [carbs_value, time_slot_idx, exercise_value, combo_idx]
    [   55.3,           1,            62.0,            2   ]
# time_slot_idx=1 → slots[1] = "08:00"
# combo_idx=2     → combinations(pool, n)[2] = [Mon, Wed, Fri]
```

`reference.regimen` 存储解码后的人类可读结果。当条目启用了 T2/T3/T4 时，regimen 值从标量改为字典：

```yaml
reference:
  regimen:
    meal_carbs:
      "早餐碳水":
        value: 55.3
        time: "08:00"             # T2 解码结果
    exercise_load:
      "运动":
        value: 62.0
        days: [Sat, Sun]          # T3 解码结果
    caloric_restriction:
      "热量限制":
        value: 620.0
        date_start: "2026-05-08"  # T4 解码结果
```

仅 T1 的条目维持标量格式（向后兼容）。

---

## optimizer.results — 优化结果内嵌格式

优化完成后，结果写回 `optimizer.results` 块，与配置并列存于同一 YAML 文件。
这意味着**发布模型即发布结果**；有结果的模型加载时，Opt 面板的"继续计算"复选框默认开启，用户可选择热启动（warm-start）或冷启动。

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
    reference:                     # 建模者从 Pareto 前沿中标注的参考点（非唯一最优）
      x: [0.30, 0.29, 0.30]       # 决策变量值（与 optimizer.schedules 决策条目顺序对应）
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
| `reference.x` | list | 参考点的决策变量值（建模者从 Pareto 前沿中选定，非唯一最优） |
| `reference.f` | list | 参考点的目标值 |
| `reference.regimen` | dict | 人类可读的方案（变量名 → {时间标签: 值}）；供人类阅读，不用于程序反解 |
| `reference.objectives` | dict | 人类可读的目标结果（变量名: 值） |

**`x` 向量与 inputEvents 的映射关系**：x 向量按 `optimizer.schedules` 中决策条目（有 `optimize:` 块）的顺序展开，每个条目按启用的 Tier 贡献维度：T1 贡献 1 维连续实数（value），T2/T3/T4 各贡献 1 维整数（时间槽索引 / 组合索引 / 天偏移）。此映射关系由 `optimizer.schedules` 的结构隐含，不需要额外存储；前端 `xToInputEvents` 函数按相同顺序解析（见 `sim_design.md`）。

### 设计原则

- **`results` 整体覆写**：每次保存时用新前沿完整替换旧 `results`，不保留历史；Pareto 前沿只会随搜索改善或持平，不会退化。
- **格式统一**：`pareto_front` 使用 YAML flow-style（`{x: [...], f: [...]}` 单行），50 个解 = 50 行，不破坏模型可读性。
- **热/冷启动（用户选择）**：Opt 控制栏的"继续计算"复选框始终可见；有已有结果时可勾选（热启动），无结果时 disabled（冷启动）。勾选热启动后若修改了目标函数、约束或决策变量搜索范围，复选框变为橙色"⚠ 继续计算"提示匹配度可能下降，但不强制切换为冷启动。
- **Sim 读取 opt 结果**：加载含 `reference.regimen` 的模型时，Sim 面板询问是否将参考点预填为当前 inputEvents；用户可选择加载或忽略。
- **Opt→Sim 多输出（N-N）**：Pareto 前沿是 N 组输入组合；软件将 N 个 Pareto 解各自重组为合规的 Sim inputEvents（Plan），供 F-MPLAN 并行仿真和比较；opt.results 仅保留原始 x/f 向量。
- **`reference` 不代表唯一最优**：多目标优化没有单一"最优解"，`reference` 是建模者标注的平衡点，用户应结合 `pareto_front` 自行权衡选择。
- **发布即结果**：建模者运行优化、保存模型、上传 YAML，接收者打开即看到 Pareto 前沿和参考点；`results` 可独立阅读。
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
