# ADR 0044 — `simulation.schedules`：时间驱动输入归属 `simulation` 块，作为 `input` 子类型；GUI 自动预填 Regimen
**日期**：2026-04-30  
**状态**：已实施

---

## 背景

`test_glucose_meal.yaml` 等测试场景引入了时间驱动的输入变量（三餐进食时刻 → 血糖波动），需要决定"时间序列输入"在 YAML 中的归属位置，以及 GUI 如何呈现它。

出现的问题：

1. 原始实现将 `schedules:` 作为顶层 key，与 `variables:`、`formulas:` 平级。
2. GUI 读取 `content.schedules`（错误路径），且将其渲染为只读块，与 `variables` 中 `type: input` 的同名变量完全断开——用户在 Inputs 面板只看到 `carb_intake = 0.0` 的空输入框，schedule 数据形同虚设。
3. 顶层 `schedules` 与优化器（optimizer）字段混用风险：optimizer 若需要自己的时间序列，会产生命名冲突。

---

## 讨论

### 位置归属

`schedules` 描述的是"仿真执行时如何驱动某个输入量随时间变化"，这是**仿真配置**，不是变量定义，也不是动力学公式。因此它应属于 `simulation` 块，与 `start_date`、`step` 等同级。

Optimizer 若需要时间序列（如最优给药方案），可在 `optimizer` 块内自定义，两者命名空间隔离。

### 语义归属

`schedules` 本质上是 `type: input` 的一种子类型——它说明"某个 input 变量的值由 YAML 内的时间序列驱动，而非由用户在 GUI 上手填"。因此 schedule 的 key 必须是 `variables` 中已声明的 `type: input` 变量名。

### GUI 呈现

原来方案：只读块单独显示，与 Regimen 系统断开。

问题：用户无法编辑，且视觉上与"可操作输入"脱节，容易误认为模型没有输入。

新方案：模型加载时，将 `simulation.schedules` 中的 points 自动转换（`time_seconds % 86400 → HH:MM`，多天重复点按时刻去重）并预填入对应变量的 Regimen 卡片。用户可在此基础上直接编辑，行为与手动创建 Regimen 完全一致。

### 离散输入的零值点规则

Euler 离散步进模式下，`type: input` 的瞬时量（进食量、给药剂量）是逐步独立的，不是连续保持量。因此 schedule 中无需写 `value: 0` 的"关闭点"——只列有实际输入的时刻即可。

---

## 决策

### 决策一：`schedules` 归属 `simulation` 块

```yaml
# ✅ 正确
simulation:
  start_date: "2026-01-01"
  end_date: "2026-01-04"
  step: 10
  step_unit: minute
  output_variables: [blood_glucose]
  schedules:
    carb_intake:
      interpolation: step
      points:
        - {time: 25200, value: 1.5}
        - {time: 43200, value: 1.8}

# ❌ 废弃：顶层 schedules
schedules:
  carb_intake: ...
```

Engine loader 从 `simulator_data.get('schedules', {})` 读取（`simulator_data` 已统一指向 `data['simulation']`）。

### 决策二：`schedules` key 必须对应 `type: input` 变量

Schedule 的语义是"驱动某个输入量"，因此每个 schedule key 必须在 `variables` 中有对应的 `type: input` 声明。这使二者语义显式关联，避免"有 schedule 但变量未声明"的静默失效。

### 决策三：GUI 自动预填 Regimen

模型加载（`useEffect` on `selectedModel`）时：
1. 检查 `simulation.schedules`
2. 对每个有 schedule 的 input 变量，将 points 转换为 `RegimenEvent[]`（`time_seconds % 86400 → HH:MM`，按时刻去重保留首次出现）
3. 预填入该变量对应的 Regimen 卡片

预填后的 Regimen 与手动创建的行为完全一致，用户可自由编辑。

### 决策四：离散 input 不写零值点（建模规则）

> `type: input` 的瞬时量（进食量、给药剂量等）在 schedule 中只列非零时刻，不插入 `value: 0` 的关闭点。

此规则写入 `model_design.md § simulation.schedules`。

例外：连续速率类变量（如持续泵药 `infusion_rate`，预期在一段时间内保持非零）可视需要保留关闭点。

---

## 结果

```
sim_engine/src/model_structure/loader.py
  schedules 从 simulator_data.get('schedules') 读取（原 data.get('schedules')）

sim_gui/src/components/Simulator.tsx
  schedules 读取路径：content.simulation.schedules
  useEffect：有 schedule 的 input 变量自动预填 Regimen events
  移除：只读 schedules 展示块

models/scenarios/test/
  test_glucose_meal.yaml   schedules 移入 simulation 块（重建）
  test_daily_life.yaml     schedules 移入 simulation 块
  test_schedule.yaml       schedules 移入 simulation 块

docs/model_design.md
  Schema 更新：simulator → simulation，新增 schedules 字段
  新增：simulation.schedules 规范节（含离散输入规则）
```
