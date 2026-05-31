# ADR 0090 — 移除 second 步长单位

**日期**：2026-05-31  
**状态**：已接受  
**范围**：引擎、前端、文档、模型

---

## 背景

框架支持四种步长单位：`second | minute | hour | day`。经评估，`second`（秒级）在 LM 框架的使用场景中无科学价值：

**仿真维度**：LM 框架关注慢性病管理、生活方式干预、多周到多年的健康时间跨度。生物参数不确定性典型为 ±10–50%，秒级精度是虚假精度——Euler 截断误差远低于参数误差，额外粒度没有科学回报。真正需要秒级的场景（心脏电生理、神经动力学）不在 LM 定位范围内。

**优化维度**：NSGA-II + MC + 多目标 Pareto 的完整优化管道在秒级步长下计算量不可行。以1年仿真为例，秒级 vs 天级步长差距 86,400 倍；配合 MC（30 runs）和 pop=50、gen=80，单次优化涉及 120,000 次完整仿真，秒级下实际无法运行。更根本的原因是：决策变量（服药时刻、运动日程）的最细分辨率为分钟，秒级搜索空间对优化结果无贡献。

**代码维度**：保留向后兼容代码是未来的屎山——`second` 在现有 YAML 模型中零使用，删除比维护成本更低，未来如有极端需求可按需重新添加。

---

## 决策

**永久删除 `second` 作为合法的 `step_size.unit` 选项，不保留任何向后兼容路径。**

最细步长单位变为 `minute`。

---

## 影响范围

### 文档
- `docs/model.md`：`step_size.unit` 合法值从 `second | minute | hour | day` 改为 `minute | hour | day`；删除"预定义单位常量（step_size.unit: second 时有效）"一节（SECOND=1 常量）
- `docs/ui_guidelines.md`：步长单位说明移除"秒"
- `docs/opt.md`：`_unit_to_sec` 字典移除 `second`，默认值改为 `minute`

### 引擎（sim_engine/）
- `base.py`：`TIME_UNIT_SECONDS` 移除 `'second': 1.0`
- `core.py`：默认 `time_unit` 从 `'second'` 改为 `'minute'`；asteval symtable 移除 `SECOND`
- `loader.py`：`time_unit` 默认和回退均改为 `'minute'`
- `simulation.py`：`_STEP_SYMS`、`step_sym_vals` 移除 `SECOND`；默认 fallback 改为 `'minute'`
- `validator.py`：时间单位集合、`dt_unit` 合法值、exclude 集合均移除 `SECOND`/`second`
- `optimizer_engine.py`：`_unit_to_sec` 移除 `second`，默认改为 `minute`
- `session_manager.py`：两处 `time_unit` fallback 改为 `minute`

### 前端（sim_gui/）
- `types.ts`：`StepUnit` 类型移除 `'second'`
- `Simulator.tsx`：`STEP_UNITS`、`toStepUnit`、`UNIT_SEC` 移除 `second`
- `useSimulation.ts`：`STEP_UNITS` 移除 `second`
- `SimControlBar.tsx`、`OptControlBar.tsx`：步长 Select 移除 second 选项
- i18n（en / zh-CN / zh-TW）：移除 `sim.step.second` key

### 模型
- `models/test/test_step_second.yaml`：删除（测试秒级步长的唯一 YAML，不再有存在价值）

---

## 后续约定

- 合法 `step_size.unit` 值：`minute | hour | day`
- 若 YAML 中写了 `unit: second`，引擎 loader 将警告并回退为 `minute`（不静默忽略）
- MINUTE、HOUR、DAY 常量在 asteval symtable 中保留（值为绝对秒数，供内部计算），但不面向建模者的公式推荐使用（建模者应用 `step`）
