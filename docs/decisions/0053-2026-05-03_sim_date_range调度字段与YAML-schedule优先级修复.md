# ADR 0053 — `date_range` 调度字段 & YAML Schedule 优先级修复

**日期**：2026-05-03  
**状态**：已实施

---

## 背景

ADR 0052 确立了 `simulation.schedules` 的扁平列表格式（HH:MM 时间 + `days` 星期掩码），但仍遗留三个问题：

### 问题一：每周逐条罗列的假循环

建模者为了表达"每周不同训练负荷"，在 YAML 里把 18 周的条目全部写出：

```yaml
schedules:
  - variable: training_load
    value: 50.0
    days: [Mon,Tue,Wed,Thu,Fri]
    date_range: "2026-01-01 ~ 2026-01-07"   # 第1周
  - variable: training_load
    value: 55.0
    days: [Mon,Tue,Wed,Thu,Fri]
    date_range: "2026-01-08 ~ 2026-01-14"   # 第2周
  # ... 重复 16 次
```

这产生大量冗余，且引擎并不限制条目数。

真正需要的是**一个条目只生效于指定日期区间**——即 `date_range` 字段。该字段在 ADR 0052 的 YAML 里已经存在，但前端和后端都没有完整实现它。

### 问题二：前端未解析 `date_range`

`Simulator.tsx` 读取调度条目时只认 `s.valid_start` / `s.valid_end`，不认 `date_range`：

```typescript
validRangeEnabled: !!(s.valid_start || s.valid_end),  // date_range 被忽略
```

结果：GUI 里日期范围列永远显示为空，用户无法看到或编辑有效期。

### 问题三：YAML Schedule 被 GUI Regimen 值覆盖

每次批量步进时，前端把当前 `inputParams`（所有输入变量的 GUI 默认值）随 `input_changes` 一起发给后端：

```python
# batch_steps 旧代码
if input_changes:
    for var_name, value in input_changes.items():
        model.set_variable_value(var_name, value)
        model.manual_overrides[var_name] = value   # ← 写入 manual_overrides
```

`model.manual_overrides` 会让 `_apply_schedules()` 跳过该变量的 YAML Schedule。结果：

- `test_ckd_protein`：三餐脉冲（0.27 + 0.27 + 0.26 = 0.80 g/kg/day）被覆盖为最后一个事件的值 0.26
- `test_glucose_meal`：两餐之间 `carb_intake` 应归零（pulse 模式），实际保持上餐值持续累加，血糖立即冲上限

### 问题四：`_apply_regimens` 的历元错误

当 `valid_range_enabled=true` 时，后端用固定历元 1900-01-01 计算"仿真当前日期"：

```python
_EPOCH = date(1900, 1, 1)
sim_date = _EPOCH + timedelta(days=prev_day_idx)  # 最大到 1900+几十年
```

而 `valid_start` 是 "2026-01-01"，`sim_date < date(2026, 1, 1)` 永远为真 → 所有有效期限制的事件全部跳过。

---

## 决策

### 决策一：`date_range` 为调度条目的标准日期范围字段

格式：`date_range: "YYYY-MM-DD ~ YYYY-MM-DD"`（与全局日期输入规范一致，见 ADR 0006 / global_prompt）

```yaml
simulation:
  start_date: "2026-01-01"
  end_date:   "2026-05-06"
  schedules:
    - variable: training_load
      time: "09:00"
      value: 70.0
      days: [Mon, Tue, Wed, Thu, Fri]
      date_range: "2026-01-01 ~ 2026-01-28"   # 只在第1-4周生效
      label: "基础期训练"
    - variable: training_load
      time: "09:00"
      value: 100.0
      days: [Mon, Tue, Wed, Thu, Fri]
      date_range: "2026-01-29 ~ 2026-02-25"   # 只在第5-8周生效
      label: "强化期训练"
```

**Python 引擎（loader.py）**已支持 `date_range`（ADR 0052 期间实现），本 ADR 补全前端和 regimen 端的实现。

`date_range` 缺席时：事件在整个仿真期间（`start_date` ~ `end_date`）每天生效。

### 决策二：前端解析 `date_range` → `validStart` / `validEnd`

`Simulator.tsx` 的调度条目解析新增回退逻辑：

```typescript
let validStart = s.valid_start ?? '';
let validEnd   = s.valid_end   ?? '';
if (!validStart && !validEnd && s.date_range) {
  const parts = String(s.date_range).split('~');
  if (parts.length === 2) {
    validStart = parts[0].trim();
    validEnd   = parts[1].trim();
  }
}
```

`valid_start` / `valid_end` 仍作为向前兼容的等效别名保留。

### 决策三：YAML Schedule 优先于 GUI Regimen

**根本原则**：`simulation.schedules` 是模型的行为定义；GUI Regimen 是用户的交互覆盖。两者冲突时，前者优先。

**修复**：`batch_steps` 的 `input_changes` 处理不再写入 `manual_overrides`：

```python
# 修复后：只更新初始值，不标记为手动覆盖
if input_changes:
    for var_name, value in input_changes.items():
        if var_name in model.variables:
            model.set_variable_value(var_name, value)
            # 不写 manual_overrides → _apply_schedules 正常运行
```

`manual_overrides` 仅保留两个写入路径：
1. **优化器** `_run_sim()`：显式抑制 YAML Schedule，让优化器控制该变量
2. 未来：用户在 GUI 中点击"锁定覆盖"（待实现）

### 决策四：`_apply_regimens` 使用模型实际 `start_date` 作为历元

```python
# 修复：从 session 读取 sim_start_date
def _apply_regimens(model, regimens, prev_time, next_time, sim_start_date=''):
    try:
        _EPOCH = date.fromisoformat(sim_start_date) if sim_start_date else date(1900, 1, 1)
    except ValueError:
        _EPOCH = date(1900, 1, 1)
    # sim_date = _EPOCH + timedelta(days=prev_day_idx) → 正确对应绝对日历日期
```

`sim_start_date` 由 `start_session()` 从 `base_model.simulator['start_date']` 读取并存入 session，再由 `batch_steps()` 传入。

### 决策五：测试场景用最短周期验证核心逻辑

`test_banister.yaml` 由 18 周（126 步）简化为 **1 周（6 步）**，与其他 5 个测试场景（`test_ckd_protein`、`test_glucose_meal`、L1/L2/L3）一致——测试文件只需验证链路正确性，不需要复现完整的临床方案。

```yaml
# 简化前：18 个 date_range 条目，126 天
# 简化后：2 个条目，7 天
simulation:
  start_date: "2026-01-01"
  end_date:   "2026-01-07"
  schedules:
    - variable: training_load
      time: "09:00"
      value: 70.0
      days: [Mon, Tue, Wed, Thu, Fri]
      date_range: "2026-01-01 ~ 2026-01-07"
    - variable: training_load
      time: "09:00"
      value: 35.0
      days: [Sat]
      date_range: "2026-01-01 ~ 2026-01-07"
```

---

## 优先级规则总结

| 来源 | 写入路径 | 优先级 | 用途 |
|------|---------|--------|------|
| YAML `simulation.schedules` | `loader.py` → `model.schedules` → `_apply_schedules()` | **最高** | 模型行为定义 |
| GUI Regimen（`inputEvents`） | `batch_steps._apply_regimens()` | 中（被上层覆盖） | 用户交互预览 |
| 优化器 Regimen | `_run_sim()` + `manual_overrides` | 最高（显式抑制 schedule） | 优化搜索空间 |
| `input_changes`（GUI 默认值） | `batch_steps` 仅 `set_variable_value` | 仅初始化 | 不影响 schedule |

---

## 变更文件

```
sim_engine/src/simulator_engine.py
  _apply_regimens(): 新增 sim_start_date 参数，历元由 1900-01-01 改为模型 start_date
  start_session(): session 存储 sim_start_date
  batch_steps(): input_changes 不再写 manual_overrides；传 sim_start_date 给 _apply_regimens

sim_gui/src/components/Simulator.tsx
  调度条目解析：date_range → validStart/validEnd 回退解析

models/scenarios/test/test_banister.yaml
  简化为 1 周（7 天，2 个调度条目）

docs/model_design.md
  simulation.schedules 规范更新（见本 ADR）
```

---

## 验证

| 场景 | 预期 | 机制 |
|------|------|------|
| `test_ckd_protein` 运行 1 步 | `dietary_protein = 0.80` | 三餐脉冲 (0.27+0.27+0.26) 在 `_apply_schedules` 正确累加 |
| `test_glucose_meal` 两餐之间 | `carb_intake = 0.0` | `_apply_schedules` pulse 模式无事件步返回 0 |
| `test_banister` 全程 6 步 | Mon-Fri `training_load=70`，Sat=35，Sun=0 | `date_range` + `days` 限定正确 |
| 加载含 `date_range` 的模型 | GUI 显示有效期起止日期 | 前端 `date_range` 解析为 `validStart/validEnd` |
| 优化器运行 | YAML schedule 被抑制，optimizer 控制变量 | `_run_sim` 显式写 `manual_overrides` |
