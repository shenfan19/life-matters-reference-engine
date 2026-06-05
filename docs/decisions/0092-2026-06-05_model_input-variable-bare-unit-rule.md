# ADR 0092 — `type: input` 变量单位规范：裸单位（事件量），禁止速率单位
**日期**：2026-06-05  
**状态**：已实施

---

## 背景

ADR 0044 确立了 `simulation.schedules` 的 pulse 执行模式：schedule 触发时写入值，其余步自动为 0。ADR 0046 确立了公式步长规则：input 脉冲变量的公式不乘 `step`。

但两个 ADR 均未明确 `type: input` 变量的 `unit` 字段应该写什么。实践中出现了大量语义错误：建模者将 `input` 的单位写成速率单位（`mg/day`、`kcal/day`、`g/kg/day`、`hours/day`、`kg/week`、`MET-hours/day`），导致：

1. **语义矛盾**：pulse 是一次性事件，`/day` 暗示持续速率，两者自相矛盾。
2. **优化器不兼容**：T3（星期组合优化）和 T4（日期范围优化）允许同一变量在不同频率或不同时间窗下触发。若单位含 `/day`，解码后的"每次事件量"无法在变频场景下保持一致语义——用户周一到周五触发和隔天触发，单次触发值相同，但速率含义完全不同。
3. **公式错误传播**：单位含速率时，建模者倾向于在公式中加 `* step`，与 ADR 0046 规定的"input 不乘 step"冲突，导致步长变化时数值不稳定。

---

## 讨论

### input 的本质语义

Schedule 的每次触发交付一次**事件**，事件的物理量是一次性的：

- 服用 50 mg 阿司匹林 → 50 mg（一次触发量）
- 摄入 500 kcal → 500 kcal（一次触发量）
- 减少 0.5 kg 体重 → 0.5 kg（每次触发的目标变化量）

触发频率（每天、隔天、周三次）由 `days` 字段和 T3 优化器控制，与变量本身的 `unit` 无关。单位只描述"一次脉冲交付的物理量"，不应包含时间分母。

### 速率语义属于 parameter

持续性速率过程（如静脉输注速率 `mg/hour`、基础代谢消耗 `kcal/day`、自然恢复速率 `1/day`）应建模为 `parameter`，在公式中以 `parameter × step` 的形式积分：

```yaml
# ✅ 持续速率：parameter + * step
infusion_rate:
  type: parameter
  value: 10.0
  unit: mg/hour

formulas:
  plasma_drug:
    dynamics:
      plasma_drug: plasma_drug + infusion_rate * step - clearance_rate * plasma_drug * step
```

```yaml
# ✅ 离散事件：input，裸单位，公式不乘 step
oral_dose:
  type: input
  value: 0.0
  unit: mg

formulas:
  plasma_drug:
    dynamics:
      plasma_drug: plasma_drug + oral_dose - clearance_rate * plasma_drug * step
```

### 文献速率参考值的处理

文献给出的速率参考（如"每天 100 mg"）不进入 `unit`，而是记录在 `reference` 或 `description` 字段，作为背景说明：

```yaml
aspirin_dose:
  type: input
  value: 100.0
  unit: mg                              # 裸单位：一次触发量
  reference: "Antithrombotic Trialists' Collaboration (2002). 文献剂量：100 mg/day"
```

---

## 决策

### 决策一：input 变量的 unit 字段只能写裸单位

`type: input` 变量的 `unit` 字段描述**一次脉冲触发交付的物理量**，须始终使用裸单位（不含时间分母）：

| 正确写法 | 禁止写法 |
|---------|---------|
| `mg`、`g`、`kcal`、`kg`、`MET-h`、`sessions` | ~~`mg/day`、`g/kg/day`、`kcal/day`、`kg/week`、`MET-hours/day`、`hours/day`~~ |

### 决策二：input 变量的公式不乘 step

已由 ADR 0046 规定，此处再次强调：凡 `type: input` 变量出现在公式右侧，**不得乘 `step`**。只有 parameter 驱动的速率项才乘 `step`。

混合情形下的拆分写法：

```yaml
# ✅ input 项提出，parameter 项保留 * step
gfr_decline:
  dynamics:
    GFR: GFR - alpha * max(0, dietary_protein - 0.6) * GFR - beta0 * GFR * step
#          ↑ input 项（dietary_protein）不乘 step
#                                                    ↑ parameter 项（beta0）乘 step
```

### 决策三：文献速率参考值写入 reference 或 description

文献中的速率表述（如"500 mg/day"、"2 mg/kg/day"）作为引用背景信息，记录在 `reference` 或 `description` 字段，不进入 `unit`：

```yaml
dietary_protein:
  type: input
  value: 0.8
  unit: g/kg                   # 裸单位：一次餐量（g/kg 体重）
  description: "每餐蛋白质摄入量（一次触发量）。文献参考：慢性肾病推荐 0.6–0.8 g/kg/day"
  reference: "KDIGO 2012 CKD guidelines"
```

### 决策四：持续速率过程建模为 parameter

凡需要在每个时间步持续积累的速率效应（自然恢复、waning、基础消耗等），建模为 `type: parameter`，单位含时间分母（`1/day`、`mg/hour` 等），在公式中乘 `step`：

```yaml
clearance_rate:
  type: parameter
  value: 0.198
  unit: 1/hour
```

---

## 受影响的文件

以下文件的 `type: input` 变量已按此规则修正（2026-06-05）：

- `models/references/medical/disease/chronic/hypertension_gout_2026.yaml`
- `models/references/medical/disease/chronic/stress_health_2026.yaml`
- `models/references/medical/medicine/preventive/vaccine_herd_immunity_2026.yaml`
- `models/references/medical/fitness/racket/badminton_2026.yaml`
- `models/references/social/economy/labor/migrant_labor_exploitation_2026.yaml`
- `models/papers/sodium_lifestyle_bp.yaml`
- `models/papers/s2/ckd_protein_a4_s2.yaml`
- `models/papers/s2/hypertension_gout_a5_s2.yaml`
- `models/papers/s2/ibs_diet_a9_s2.yaml`
- `models/papers/s2/masld_insulin_a7_s2.yaml`
- `models/papers/s4/smoking_stress_a6_s4.yaml`
- `models/test/test_plans.yaml`
- `models/test/test_opt_t4.yaml`
- `models/test/test_opt_results.yaml`

`docs/model.md` 的 `input 变量的单位规范` 节已同步更新。

---

## 与已有 ADR 的关系

| ADR | 内容 | 与本 ADR 的关系 |
|-----|------|----------------|
| 0044 | schedule 作为 input 子类型，pulse 模式 | 奠定 pulse 语义基础 |
| 0046 | step 符号规范，input 不乘 step | 确立公式规则 |
| **0092** | **input unit 只能裸单位，速率属于 parameter** | 在 0044/0046 基础上补全单位规范 |
