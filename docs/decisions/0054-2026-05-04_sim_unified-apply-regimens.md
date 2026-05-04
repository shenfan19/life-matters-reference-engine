# 0054 — 仿真/优化 Regimen 执行函数统一为 `_apply_regimens`

**日期**：2026-05-04  
**状态**：✅ 已实施

---

## 背景

优化器（`optimizer_engine.py`）和仿真器（`simulator_engine.py`）各自维护了一套 Regimen 事件执行逻辑：

- `optimizer_engine._apply_regimen_events`：接收 `dict[var → events]` 格式，逐事件覆写变量值（"最后一个事件赢"语义）。
- `simulator_engine._apply_regimens`：接收 `list[{variable, events}]` 格式，脉冲重置 + 累加语义。

两套逻辑不一致，导致同一 Regimen 在仿真和优化中产生不同行为。尤其是同一变量的多时刻事件：仿真结果是累加，优化结果是覆盖。

---

## 决策

**删除 `optimizer_engine._apply_regimen_events`，由优化器直接导入并调用 `SimulatorEngine._apply_regimens`。**

优化器在调用前将 `dict[var → events]` 格式转换为 `list[{variable, events}]` 格式，再传入统一函数。

`_apply_regimens` 的语义固定为：
1. **脉冲重置**：每步开始时，将所有受 Regimen 控制的变量归零。
2. **累加触发**：本步内触发的所有事件值累加（而非覆盖）。

---

## 理由

- 仿真和优化使用同一物理引擎，语义必须一致。
- 脉冲重置 + 累加是正确的日历调度语义（三餐蛋白质 = 三次脉冲之和，而非最后一餐覆盖）。
- 单一实现，bug 修一处即全局生效。

---

## 后果

- 优化器的 Regimen 执行行为与仿真完全一致。
- 优化器需在 `_run_sim` 中做一次格式转换（`dict → list`），约 5 行代码。
- 原 `_apply_regimen_events` 约 45 行代码删除。
