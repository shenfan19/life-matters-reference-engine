# ADR 0088 — optimizer.schedules 统一格式

**日期**: 2026-05-28
**状态**: 已接受
**范围**: sim_engine · sim_gui · models/

---

## 背景

优化器决策变量的 YAML 表示经历了三个阶段：

1. **regimen**（最旧）：单变量 dict，`events[].dose_bounds`。
2. **optimizer.inputs**（中间态）：多变量列表，有 `optimize:` 子块的为决策变量，无的为固定量；但固定背景量另存于 `optimizer.schedules`，导致同一变量的配置分散在两个节下。
3. T2/T3/T4 的启用方式不一致：T2 靠顶层 `time_window:` + `optimize.time: true`；T3 靠顶层 `days_options:` + `optimize.days: true`；T4 靠顶层 `date_start_window:` + `optimize.date_start: true`——字段名在顶层和 `optimize:` 子块之间分裂。

这带来三个具体问题：

- **一张 GUI 卡片 ≠ 一条 YAML 条目**：决策变量进 `inputs`，固定背景量进 `schedules`，同一模型变量的配置被拆到两处。
- **T Tier 表意不明**：`time: true` 是激活标志还是时间值？读者无法直接看出 T2 的搜索区间；`opt_step` 在顶层而 `time: true` 在 `optimize:` 内，字段归属混乱。
- **后端需要维护两套解析路径**，且无法检测到格式不一致。

---

## 决策

**废弃 `optimizer.inputs` 和所有旧式 Tier 字段，改用 `optimizer.schedules` 统一列表。**

### 核心规则

| 条件 | 含义 |
|---|---|
| 条目无 `optimize:` 块 | 固定背景量（不参与搜索） |
| 条目有 `optimize:` 块 | 决策变量 |
| `optimize.value: [lo, hi]` | T1 激活 |
| `optimize.time: ["HH:MM", "HH:MM"]` | T2 激活 |
| `optimize.time_step: "1h"\|"15min"` | T2 步长（缺省 1h） |
| `optimize.days_pool: [...]` + `optimize.days_n: [min, max]` | T3 激活 |
| `optimize.date_range: [[lo,hi],[lo,hi]]` | T4 激活（两组均必填） |

### 互斥原则

某字段在 `optimize:` 内出现，对应顶层字段**不写**：

- T2 激活 → 不写顶层 `time:`
- T3 激活 → 不写顶层 `days:`
- T4 激活 → 不写顶层 `date_range:`

固定值字段只存在于顶层；搜索区间只存在于 `optimize:` 内；两者不重叠。

### T3 编码变更

旧格式要求建模者枚举所有候选模式（`days_options`）；新格式只需声明候选日集合（`days_pool`）和数量区间（`days_n`），后端自动枚举所有合法组合（`itertools.combinations`）并编码为整数维度。这让优化器有更大的搜索自由度，也消除了手写候选列表的冗余。

### T4 强制两组

旧格式 `date_start_window` 只表达起始日搜索窗，结束日隐式继承 `simulation.end_date`，导致意图不明确。新格式 `date_range` 强制两组：`[[start_lo, start_hi], [end_lo, end_hi]]`；结束日固定时写同一日期两次。

---

## 影响

### 废弃的字段

| 旧字段 | 位置 | 替换 |
|---|---|---|
| `optimizer.inputs` | YAML 顶层 | `optimizer.schedules` |
| `time_window: "A~B"` | 条目顶层 | `optimize.time: ["A","B"]` |
| `opt_step: 1h` | 条目顶层 | `optimize.time_step: "1h"` |
| `days_options: [[...]]` | 条目顶层 | `optimize.days_pool + optimize.days_n` |
| `date_start_window: "A~B"` | 条目顶层 | `optimize.date_range: [[...],[...]]` |
| `date_end_window: "A~B"` | 条目顶层 | `optimize.date_range` 第二组 |
| `optimize.time: true` | `optimize:` 内 | `optimize.time: ["A","B"]` |
| `optimize.days: true` | `optimize:` 内 | `optimize.days_pool + days_n` |
| `optimize.date_start: true` | `optimize:` 内 | `optimize.date_range` |
| `optimize.date_end: true` | `optimize:` 内 | `optimize.date_range` 第二组 |
| `regimen:` (oldest) | `optimizer:` 内 | `optimizer.schedules` |

### 已迁移的文件

- **14 个 paper YAML**（`models/papers/s1–s4/`）：全部迁移。
- **所有 references/ + scenarios/ + temp/ + test/ YAML**（~64 个文件）：`inputs:` → `schedules:`；test/ 中的 T2/T3/T4 测试文件同步迁移。
- **后端** `optimizer_engine.py`：移除所有 legacy 解析路径，只读 `optimizer.schedules`。
- **前端** `types.ts`：`InputEvent` opt 字段替换（`timeWindowStart/End/Step`、`daysPool/NMin/NMax`、`optimizeDateRange/dateStartLo/Hi/dateEndLo/Hi`）。
- **前端** `Simulator.tsx`：override 构造和模型加载均使用新字段。
- **前端** `OptSetupTab.tsx`：T2/T3/T4 UI 更新。
- **文档** `docs/model.md`：schema 更新为新格式。

### 不向后兼容

后端不再解析旧格式字段。有 `optimizer.inputs` 或旧 T Tier 字段的 YAML 将报错 `No optimizer.schedules defined`。

---

## 替代方案

**保留 `optimizer.inputs` + 新增 `optimizer.schedules`**：两套并存增加理解成本，被否决。

**保留 boolean flags**（`time: true`）：需额外字段描述区间，语义不自洽，被否决。

**明文枚举 T3 候选组合**（`days_options`）：限制优化器自由度，需建模者手动维护列表，被否决。
