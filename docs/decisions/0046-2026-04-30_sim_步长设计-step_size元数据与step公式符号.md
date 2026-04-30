# ADR 0046 — 步长设计最终方案：`metadata.step_size` + 公式符号 `step`
**日期**：2026-04-30  
**状态**：已实施

---

## 背景

原设计将步长（`step`）和步长单位（`step_unit`）放在 `simulation` 块中，导致三个问题：

1. **步长锁死**：公式系数隐含步长假设，换步长即破坏数值
2. **YAML 歧义**：`step: 10, step_unit: minute` 对建模者不够直观
3. **时间点精度**：步长越大，schedule pulse 落窗判断越不精确

以下决策解决所有问题。

---

## 决策

### 决策一：`metadata.step_size` 两级结构

```yaml
metadata:
  name: my_model
  step_size:
    value: 1        # canonical 步长数值，建议永远为 1
    unit: minute    # 公式系数的时间单位（决定 step 的含义）
```

- `step_size.unit` = 公式系数所在的时间单位（模型的"时钟分辨率"）
- `step_size.value` = canonical 步长（默认 1，即每步走一个 unit）
- 放在 `metadata` 而非 `simulation`，因为它是模型定义的属性，不是运行配置

**取代**：`simulation.step` + `simulation.step_unit`（从 simulation 块删除）

### 决策二：公式中统一使用 `step` 符号

速率类公式（state 变量更新）必须乘以 `step`：

```yaml
# ✅ 速率类（每 time_unit 的持续效应）
dynamics:
  insight:    insight + 0.069 * cognitive_efficiency * step
  nutrition:  max(0, nutrition - 0.010 * step)

# ✅ 瞬时类（input 脉冲，不乘）
dynamics:
  stomach_carbs: stomach_carbs + carb_intake
```

`step_size` 和 `dt` 保留为向后兼容别名，三者值相同。

**Unicode 方案（`ΔT`）被否决**：`Δ`（U+0394）与 `∆`（U+2206）视觉无法区分，易造成静默 bug。ASCII 的 `step` 完全无歧义。

### 决策三：三种变量类型的完整规则

| 变量类型 | 公式角色 | 是否乘 step |
|---------|---------|-----------|
| `state` | 速率公式（连续动力学） | **必须** |
| `input` | 瞬时脉冲（pulse 驱动） | **不乘** |
| `parameter` | 乘数系数 | 不适用（本身是系数） |

### 决策四：simulation 块只保留起止时间和输出

```yaml
simulation:
  start_date: "2026-01-01"
  end_date:   "2026-01-04"
  output_variables: [blood_glucose, stomach_carbs]
  schedules: {...}
  # step 和 step_unit 已删除
```

### 决策五：GUI 粗化控件

- 工具栏显示 canonical 步长（来自 `metadata.step_size`，只读提示）
- 粗化倍率选择器：1× / 2× / 5× / 10× / 30× / 60×
- 实际运行步长 = `step_size.value × 粗化倍率`
- 公式中 `step` = 实际运行步长，公式自动适配

### 决策六：多文件合并约束

所有 import 的组件文件必须有相同的 `metadata.step_size.unit`。Loader 校验不一致时 warning，后续改为 error。

---

## 结果

```
sim_engine/src/model_structure/loader.py
  优先读 metadata.step_size.{value,unit}；向后兼容 simulation.step/step_unit

sim_engine/src/model_structure/simulation.py
  symtable['step'] = step_size  （新增；step_size/dt 保留为别名）

sim_gui/src/components/Simulator.tsx
  model load：从 metadata.step_size 读默认步长
  工具栏：显示 canonical 步长 + 粗化倍率选择器（1×~60×）

models/ 下所有 YAML 文件
  metadata 新增 step_size: {value: 1, unit: <原step_unit>}
  simulation 删除 step 和 step_unit 字段
  formulas 中 step_size 替换为 step

docs/model_design.md
  Schema 更新：metadata.step_size 两级结构
  Euler 节：示例改用 step 符号
  新增：变量类型 × 是否乘step 规则表
```
