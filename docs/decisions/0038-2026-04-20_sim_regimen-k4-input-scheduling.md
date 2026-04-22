# Regimen K×4 输入调度设计（ADR）
**日期**：2026-04-20  
**状态**：已实施  
**涉及文件**：
- `sim_gui/src/components/Simulator.tsx`
- `sim_engine/src/simulator_engine.py`
- `sim_engine/src/api_server.py`
- `docs/sim_design.md`
- `mods/scenarios/social/ad1666_uk_issac_newton.yaml`

---

## 背景

Simulator 的输入面板原先只有一个平坦的"变量→数值"映射表，无法表达"每天 8:00 吃 120g 面包、12:00 再吃 150g"这类时间调度型行为。这是生活方式优化（nutrition、medication、作息）场景的核心需求。

---

## 决策一：输入模型 —— Regimen K×4

**放弃方案**：Type-R/B/P/S（速率/布尔/脉冲/计划）四类型分离设计。分析后发现该设计过度复杂，且把"速率"和"摄入量"混淆在一起，与实际使用习惯不符。

**采用方案**：单一 Regimen 结构，每个 Regimen 包含四个字段：

| 字段 | 含义 | 可关闭 |
|------|------|--------|
| `time[]` | 每天执行的时刻（HH:mm） | 否，至少一个 |
| `value[]` | 每次执行的摄入量，与 time 一一配对 | 否 |
| `days` | 每周哪几天执行（7 布尔值） | 可关闭 → 每天 |
| `valid_range` | 此计划在哪段日期内有效 | 可关闭 → 永久有效 |

**理由**：
- `value` 是每次摄入量（离散事件量），而非速率。单位是 `g`、`ml` 等，不是 `g/min`。
- 多个（time, value）对表达同一天内多次执行，如"早饭 120g + 午饭 150g"。
- `days` 关闭 = 每天执行，与"每天都有这个事件"的默认直觉一致。
- `valid_range` 关闭 = 永久有效，避免新用户必须填日期的障碍。

---

## 决策二：GUI 布局 —— 三块 flexWrap，比例 3:3:4

每个 Regimen 卡片 Header（变量下拉 + 删除按钮）+ Body（三块水平排布，屏宽不足时自动换行）：

- **Block 1（flex-grow 3）**：时刻 → 摄入量事件列表，可添加/删除行，上限 6 条
- **Block 2（flex-grow 3）**：执行日，Switch 关=每天，Switch 开=显示周一至周日 Tag
- **Block 3（flex-grow 4）**：有效期，Switch 控制启用，日期输入框常显（禁用时半透明），起止日期横排

有效期日期框设计为常显而非开关后隐藏，理由：用户开启 Switch 时立即可见并填写，无需"开关→显现→填写"三步操作。

---

## 决策三：后端调度 —— `_apply_regimens` 逐步触发

在 `batch_steps` 每步执行前，调用 `_apply_regimens(model, regimens, prev_time, next_time)`：

1. 事件时刻 `HH:mm` 转换为当天秒偏移 `ev_sec`
2. 判断 `ev_sec ∈ [prev_sec_of_day, next_sec_of_day)`（或跨天时两段均检）
3. 通过有效期和执行日过滤后，命中的事件调用 `model.set_variable_value(variable, value)`

仿真起始日固定为 1900-01-01 作为相对基准（不依赖真实日历），后续场景如有实际起始日期可扩展。

---

## 决策四：YAML 单位 —— 每次摄入量而非速率

将 Newton YAML 中食物输入变量单位从 `g/min`/`ml/min` 改为 `g`/`ml`，取值范围和默认值同步调整为真实每餐摄入量（如面包 0~300g，默认 120g）。

**理由**：`g/min` 是连续流量语义，用户无法直觉理解"每分钟吃多少克面包"；`g` 是离散事件量，与 Regimen 模型的语义一致。

---

## 待跟进

- Newton YAML 公式仍使用旧速率语义，数值结果需重新验证（见 `pending_improvements.md` 问题 2）
- 多个 Regimen 写同一变量时当前为后写覆盖，累加语义待确认（见 `pending_improvements.md` 问题 1）
