# ADR 0096 — `Simulation.step()` 入参单位约定：秒

**Date:** 2026-06-11
**Status:** Accepted
**Context:** sim_engine — `model_structure/simulation.py`, `simulator_engine.py`, `optimizer_engine.py`, `session_manager.py`

---

## Context

`Simulation.step(step_size)` 在 `model_structure/simulation.py` 内部需要两份不同单位的步长：

- **秒**：用于 `self.time` 累加、`_apply_schedules`（pulse 模式窗口判定）、`_update_accumulators`。
- **模型声明单位（`time_unit`，如 day/hour/month）**：用于公式中的 `step`/`step_size`/`dt`/`t`/`time` 符号（公式作者按"1 天=1"书写，而非"86400 秒=1"）。

`step()` 只接受一个入参 `step_size`，因此必须二选一作为"入参约定"，内部再换算出另一份。这个约定此前从未在文档中明确写下，导致 2026-06-10 至 2026-06-11 期间发生连续两次方向相反的 bug：

1. **commit a9e2f07（"fix step bug"，2026-06-10）之前**：`step()` 把入参当作"声明单位"，内部 `step_size_sec = step_size * unit_sec`（乘）。但 `--sim` 路径（`simulator_engine.py`）传入的是 `model.simulator['step_size']`——这个值在 `loader.py` 中始终是**秒**（`step_sec = raw_step * unit_sec`）。于是 `--sim` 把"秒"当"声明单位"传入，`step()` 内部又乘一次 `unit_sec`，导致单步时间推进量被放大 `unit_sec` 倍（如 day 模型放大 86400 倍），仿真一步即触顶（"触顶" bug）。

2. **a9e2f07 之后，本会话之前**：为修复上述触顶，a9e2f07 把 `step()` 的入参约定反转为"秒"，内部改为 `declared_step = step_size_sec / unit_sec`（除）。这对 `--sim` 是对的（它本来就传秒）。但 `optimizer_engine.py::_run_sim` 和 `session_manager.py`（GUI 交互式 session 的 `start_session`/`batch_steps`）当时的代码是为**旧约定**写的：它们各自先做了一次 `native_step = step_size_sec / unit_sec`（除），再传给 `step()`。在旧约定下"调用方除一次 + step() 内部乘一次"正好抵消、自洽；a9e2f07 把 step() 内部的"乘"改成"除"后，变成"调用方除一次 + step() 内部再除一次"——双重除法，`declared_step ≈ 0`，公式中所有依赖 `step`/`dt` 的时间推进（如 `days_elapsed`）被冻结，仿真结果停留在初值附近（`--opt` 路径）/ 仿真"前进"但状态几乎不变（GUI session 路径）。

a9e2f07 只改了 `simulation.py` 和 `loader.py`，未同步 `optimizer_engine.py::_run_sim` 与 `session_manager.py` 这两处沿用旧约定的调用点，是回归的直接原因。本次（2026-06-11）一并修复了这两处。

---

## Decision

**确立并文档化统一约定：`Simulation.step(step_size)` 的入参 `step_size` 恒为"秒"。**

- `step()` 内部：`step_size_sec = step_size`；`declared_step = step_size_sec / unit_sec` 供公式 `step`/`step_size`/`dt`/`t`/`time` 使用。
- 任何调用 `model.step(...)` 的地方，传入值必须是 `model.simulator['step_size']`（或等价的、由 `loader.py` 按 `metadata.step_size.value * TIME_UNIT_SECONDS[unit]` 算出的秒值），**不得**自行预先除以 `unit_sec` 再传入。

当前已统一到此约定的调用点：

| 调用点 | 文件 | 状态 |
|---|---|---|
| CLI `--sim` 主循环 | `simulator_engine.py:151` | 本来正确（直接传 `step_size`），a9e2f07 后保持正确 |
| CLI `--opt` 适应度函数 `_run_sim` | `optimizer_engine.py:85` | 本会话修复：移除 `native_step = step_size_sec/unit_sec`，直接传 `step_size_sec` |
| GUI session `batch_steps`（单 run / MC 多 run 两处） | `session_manager.py` | 本会话修复：移除两处 `_native_step = step_size/_unit_sec`，直接传 `step_size` |
| CLI `run_with_csv_inputs` | `simulator_engine.py:308` | `dt = curr_time - prev_time`，CSV 时间列本身按秒约定，未发现问题 |

---

## Consequences

- 新增任何 `model.step(...)` 调用点时，必须直接传入秒值（通常就是 `model.simulator['step_size']` 或会话/适应度函数里以同一来源算出的 `step_size_sec`），不再做 `/unit_sec` 或 `*unit_sec` 的预换算。
- `optimizer_engine.py` 中不再需要导入 `TIME_UNIT_SECONDS`；`session_manager.py` 同样移除了该导入。
- 受影响的历史模型已重新跑过 `--opt` 回归验证（ad0228/ad1910/ad1847/ad1945 结果与文档记录一致；ad1941 是首个对该 bug 敏感、藉此发现问题的模型，详见对应 output 目录下的 `*_opt.md`）。GUI session 路径修复后已用 ad1941 做 10 步 `batch_steps` 冒烟测试，`days_elapsed`/`health`/`nutritional_status` 按预期逐日演化。
