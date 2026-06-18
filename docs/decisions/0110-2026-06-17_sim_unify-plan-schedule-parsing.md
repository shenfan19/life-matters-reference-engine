# ADR 0110 — Plan/Schedule 解析单一来源：后端 `self.plans`，前端不再重新解析 YAML

**日期**: 2026-06-17
**状态**: 已接受
**范围**: sim_engine · sim_gui

---

## 背景

`docs/cli.md` 对外承诺"CLI 与 GUI 共用同一个引擎层，结果格式一致，可互通"。
但 `simulation.plans[*].schedules` 这一段 YAML，实际上被两套互不相关的代码独立解析：

| 路径 | 解析代码 |
|------|---------|
| CLI（及 GUI 后端的 `start_session`/`apply_regimens` 执行核心） | `ModelStructure._parse_schedule_entries()`（`sim_engine/src/model_structure/loader.py`），结果存入 `self.plans[plan_id]` |
| GUI 前端的 plan 初始化 | `Simulator.tsx` 加载模型时，直接对 `selectedModel.content.simulation.plans` 重新实现 days mask、`date_range`→`valid_start/valid_end` 兼容、时间区间默认值等语义 |

两套实现没有共享代码。即使用户在 GUI 里不做任何编辑、原样运行一个 YAML，"GUI 默认结果"
与"CLI 结果"是否一致也完全没有机制保证——目前两边数值能对上，只是因为两份独立实现的细节
碰巧写得一样，任何一边后续修改都可能在不知情的情况下使其分叉。

## 决策

**Plan/Schedule 的语义解析只保留一个实现：Python 的 `_parse_schedule_entries()`。前端不再
自己解析 days/date_range/pulse-vs-sustained 语义，只做"后端结果 → UI 编辑状态"的无逻辑字段映射。**

1. **后端**：`GET /api/models/{model_name}` 的响应新增 `plans` 字段，原样返回
   `ModelStructure.plans`（`sim_engine/src/routes/models.py`）。这个 dict 本来就是
   `apply_regimens` 兼容的 regimen-dict 格式（CLI 已经在用），直接 JSON 序列化即可。

2. **前端**：`Simulator.tsx` 初始化 plan 列表时，仍从原始 YAML 的 `simulation.plans` 数组
   取 `id`/`label`（纯展示元数据，后端解析结果里没有这两个字段），但每个 plan 的事件数据
   改为从 `selectedModel.content.plans[planId]`（后端已解析好的 regimen 列表）取，
   按 1 个 regimen-event → 1 个 `InputEvent` 做字段映射，不再自己判断 `date_range` 兜底、
   days 长度、时间区间默认值等语义。

```
YAML simulation.plans[*].schedules
        │
        ▼
ModelStructure._parse_schedule_entries()   ← 唯一语义解析点（CLI 和 GUI 后端共用）
        │
        ├──→ self.plans[plan_id]  ──→ CLI: schedule_entries → apply_regimens()
        │
        └──→ GET /api/models/{name} 的 `plans` 字段
                    │
                    ▼
        前端 Simulator.tsx：1 regimen-event → 1 InputEvent（无逻辑映射）
                    │
                    ▼
        用户编辑 → buildRegimenPayload() → POST /api/simulation/start
                    │
                    ▼
              start_session() → 共用的 apply_regimens()
```

## 不在本次范围内

- `simulation.schedules`（顶层扁平格式）/ `daily_inputs` 的前端默认输入事件构造
  （`Simulator.tsx` 第 607-658 行附近）：这部分服务于"没有 plans 时的默认输入"展示，
  跟 `_parse_schedule_entries` 无关，不属于本次要消除的重复。
- 优化器路径（`optimizer.startpoint.schedules`）的解析：本身已经走 regimen-dict 格式
  （ADR 0088），不受影响。

## 结果

```
sim_engine/src/routes/models.py
  data 新增 "plans": model.plans

sim_gui/src/components/Simulator.tsx
  yamlPlans 处理块改为查 selectedModel.content.plans[plan.id ?? `plan_${i}`]，
  不再自己推导 days/date_range/时间区间语义
```

## 关联

- ADR 0076 — `simulation.plans` 格式引入
- ADR 0100 — pulse/sustained `[time_start, time_end)` 区间约定
- ADR 0109 — schedules 位置强制规范
- `docs/cli.md`"与 GUI 的关系"一节的"结果格式一致"承诺
