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
type: model | story
category: physiological | socio_economic | environmental | risk | simple

metadata:
  name: "唯一标识符"
  version: "1.0.0"
  tags: [tag1, tag2]
  references: ["Author et al. (Year) Title. Journal."]
  step_size:           # 必填：模型时钟分辨率
    value: 1           # canonical 步长，建议保持 1
    unit: minute       # second | minute | hour | day；决定公式中 step 的含义

imports:
  - components/medical/physiology/glucose_regulation   # 从 models/ 根出发加 components/ 前缀

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
  start_date: "YYYY-MM-DD"
  end_date: "YYYY-MM-DD"
  # step / step_unit 已移至 metadata.step_size，此处不再声明
  output_variables: [var1, var2]
  schedules:                      # 可选；每个 key 必须是 variables 中 type: input 的变量名
    var_name:
      interpolation: step | linear | pulse
      points:
        - {time: 25200, value: 1.5}   # time 单位：秒，从仿真起点累计
        - {time: 43200, value: 1.8}
```

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

`simulation.schedules` 是 `type: input` 变量的子类型，表示"随仿真时间自动变化的输入量"。

```yaml
simulation:
  schedules:
    carb_intake:
      interpolation: step    # step（阶梯保持）| linear（线性插值）
      points:
        - {time: 25200, value: 1.5}   # 07:00 早餐
        - {time: 43200, value: 1.8}   # 12:00 午餐
        - {time: 66600, value: 1.6}   # 18:30 晚餐
```

**使用规则：**

- `schedules` 必须在 `simulation` 下，与 `start_date` 同级，**不能放在顶层**。
- 每个 key 必须对应 `variables` 中存在且 `type: input` 的变量。
- `time` 单位为秒，从仿真起点（`start_date 00:00:00`）累计。
- GUI 加载模型时会自动将 schedule points 预填入对应输入变量的 Regimen 卡片（可编辑）。

**离散输入不写零值点（重要规则）：**

> `type: input` 变量（进食量、给药剂量、摄入/消耗等瞬时量）在 Euler 离散步进模式下是**逐步瞬时量**，不是连续保持量。因此 schedule 中只需列出有实际输入的时刻，**不需要插入 `value: 0` 的关闭点**。

```yaml
# ✅ 正确：只写非零时刻
schedules:
  carb_intake:
    points:
      - {time: 25200, value: 1.5}   # 早餐
      - {time: 43200, value: 1.8}   # 午餐

# ❌ 错误：多余的 0 值点使 schedule 臃肿且含义模糊
schedules:
  carb_intake:
    points:
      - {time: 25200, value: 1.5}
      - {time: 28800, value: 0.0}   # 不需要
      - {time: 43200, value: 1.8}
      - {time: 46800, value: 0.0}   # 不需要
```

此规则仅适用于瞬时量（进食、给药等）。连续速率类变量（如持续泵药 `infusion_rate`，预期在一段时间内保持非零）可视需要保留关闭点。

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

三层目录：`models/components/{L1}/{L2}/{L3}/file.yaml`

| L1 | L2 | 说明 |
|----|----|----|
| medical | physiology / nutrition / fitness / disease / medicine / surgery | 生理与医学 |
| social | economy / conflict / law / psychology / technology / demography | 社会经济与社会学 |

完整 L3 细分见 `docs/decisions/0022-models-three-level-taxonomy.md`。

`standalone: true`（或省略）= 可独立运行；`standalone: false` = 库组件，需被 import。
