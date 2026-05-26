# LMML 快速入门

> 目标：30 分钟内写出并运行你的第一个 LMML 模型。  
> 前提：能读懂临床文献，无需编程背景。

---

## 核心概念（3 种变量）

LMML 模型只有三种积木：

| 类型 | 含义 | 类比 |
|------|------|------|
| `state` | 随时间变化的指标 | 患者的检验报告值 |
| `input` | 干预行为（药物、饮食、运动） | 医嘱 |
| `parameter` | 固定的机制系数 | 文献里的回归系数 |

公式（`formulas`）描述这些变量如何相互影响。仅此而已。

---

## 第一个模型：高血压患者服降压药

### 1. 最简版（可运行）

```yaml
metadata:
  name: hypertension_intro
  description:
    brief: "降压药物效果演示——LMML 入门示例"
  step_size:
    value: 1
    unit: day

variables:
  med_dose:
    type: input
    value: 0.0
    unit: mg
    description: "降压药每日剂量（氨氯地平等效）"
    reference: "示例值，非临床剂量"

  SBP:
    type: state
    value: 160.0
    unit: mmHg
    description: "收缩压"
    reference: "初始值代表典型未控制高血压"

  bp_sensitivity:
    type: parameter
    value: 0.08
    unit: mmHg/mg/day
    description: "每 mg 剂量每天的平均降压幅度"
    reference: "Law et al. (2009) BMJ 338:b1665"

formulas:
  bp_daily_change:
    dynamics:
      SBP: SBP - bp_sensitivity * med_dose * step
    description: "降压药线性效应（简化模型）"

simulation:
  start_date: "2026-01-01"
  end_date:   "2026-06-30"
  schedules:
    - variable: med_dose
      time: "08:00"
      value: 5.0
      label: "晨服 5mg"
```

把这段 YAML 保存为任意 `.yaml` 文件，在 Life Matters 界面加载即可运行。输出：SBP 随时间的变化曲线。

---

### 2. 加一条约束：如果 SBP 过低就停药

在 `formulas` 里加条件：

```yaml
formulas:
  bp_daily_change:
    condition: "SBP > 90"          # 收缩压高于 90 mmHg 才生效
    dynamics:
      SBP: SBP - bp_sensitivity * med_dose * step
```

`condition` 是普通数学表达式，可以引用任意变量。

---

### 3. 加优化：让软件帮你找最优剂量

```yaml
optimizer:
  method: nsga2
  objectives:
    - variable: SBP
      metric: final
      direction: minimize
  inputs:
    - variable: med_dose
      time: "08:00"
      optimize:
        value: [2.5, 10.0]          # 搜索范围：2.5–10 mg
      label: "晨服剂量"
```

运行后得到 Pareto 前沿：不同剂量下 SBP 最终值的权衡曲线。

---

## 变量类型速查

**何时用 `state`**  
指标随时间演变，且演变过程是你要建模的核心——血压、血糖、肌酐清除率、体重。

**何时用 `input`**  
患者或医生可以调整的行为——剂量、餐食内容、运动时长。优化器搜索的就是这些变量。

**何时用 `parameter`**  
文献给出的固定系数——回归斜率、速率常数、群体均值。不随时间变化，不参与优化。

---

## 两个常见错误

**错误 1：state 更新忘了乘 `step`**

```yaml
# ❌ 每步降压量与步长无关，步长变了结果就错
dynamics:
  SBP: SBP - bp_sensitivity * med_dose

# ✅ 正确
dynamics:
  SBP: SBP - bp_sensitivity * med_dose * step
```

**错误 2：input 脉冲乘了 `step`**

```yaml
# ❌ 药片剂量不随步长缩放，5mg 就是 5mg
dynamics:
  stomach_drug: stomach_drug + med_dose * step

# ✅ 正确
dynamics:
  stomach_drug: stomach_drug + med_dose
```

规则：`state` 连续演化 → 乘 `step`；`input` 瞬时给药 → 不乘。

---

## 下一步

| 目标 | 去哪里找 |
|------|---------|
| 完整字段规范 | `docs/model.md` |
| 多模型组合（import） | `docs/model.md` → Imports 章节 |
| 优化器全部参数 | `docs/model.md` → optimizer 章节 |
| 已有可运行模型参考 | `models/papers/` 目录 |
| 架构决策背景 | `docs/decisions/` 目录 |
