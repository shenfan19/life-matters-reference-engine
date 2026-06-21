# ADR 0116 — 内部命名统一：`regimen_runner.py` → `schedule_runner.py`（修订 0115）

**日期**: 2026-06-21
**状态**: 已接受
**范围**: sim_engine（`schedule_runner.py` 及调用方）、sim_gui（`useSimulation.ts`/`useModelInit.ts`）、sim_cli/build.spec、docs

---

## 背景

ADR 0115 删除了 `daily_inputs`/`Simulation._apply_schedules()`/`manual_overrides` 整套旧机制。在那之前，
代码里长期用 `regimen` 这个词命名"plan-based 输入执行核心"（`regimen_runner.py`、`apply_regimens()`、
`_build_regimen_events`），而 YAML 规范用 `schedule` 命名同一份数据（`simulation.plans[*].schedules`）。
这个用词分裂**并非随意**：ADR 0115 之前，`Simulation` 类上确实存在另一个不同的方法
`_apply_schedules()`（处理旧版 `daily_inputs`），如果当时把 `apply_regimens` 改名为 `apply_schedules`，
会直接和它撞名，混淆两套语义不同的执行路径。

ADR 0115 删除了 `_apply_schedules()` 之后，这个撞名风险已经消失——`apply_regimens`（现
`apply_schedules`）是仓库里唯一的输入执行路径，没有第二个同名/近名函数与之竞争。用户随后要求把这部分
"纯内部命名"按之前评估的方案统一过去。

## 决策

**统一内部实现命名为 `schedule`，但不改动跨前后端的 API 契约字段名：**

| 改动对象 | regimen → schedule |
|---------|---------------------|
| `sim_engine/src/regimen_runner.py` | 重命名为 `schedule_runner.py` |
| `apply_regimens()` | → `apply_schedules()` |
| `precompute_sustained_divisors`/`advance_steps` 的 `regimens` 参数 | → `schedules` |
| `_n_active_days`/内部循环变量 `reg` | → `sched` |
| `optimizer_engine.py` 的 `_build_regimen_events` 闭包 | → `_build_schedule_events` |
| `optimizer_eval.py` 的 `regimen_events_by_var`/`regimens_list` | → `schedule_events_by_var`/`schedules_list` |
| `simulator_engine.py` 的 `schedule_regimens`（本就是半改过的混合命名）局部变量 | → `schedules` |
| 前端 `buildRegimenPayload`/`varRegimens` | → `buildSchedulePayload`/`varSchedules` |
| `sim_cli/build.spec` 的 hiddenimport | `'regimen_runner'` → `'schedule_runner'` |

**不改动（API 契约 / 跨前后端字段名，维持现状）：**

- HTTP 请求字段 `SimulationStartRequest.regimens`、`start_session(regimens=...)`、`session['regimens']`
- Pydantic 类 `RegimenData`/`RegimenEventData`（与上面的 `regimens` 字段一一对应）
- 响应字段 `result['regimen_variable']`/`result['regimen_event_labels']`（前端 `useModelInit.ts`/
  `SimOptTab.tsx` 读取的 key）
- YAML `optimizer.results.reference.regimen`（写入/读回模型文件的持久化字段）
- 文档里的"GUI Regimen"措辞（概念层面的用词，留给后续单独评估，见下）

理由：这些是跨前后端/跨进程边界的契约名，改名涉及双端同步或 YAML 向后兼容问题，和"消除引擎内部
两套术语"这件事本身无关，不在本次范围内。

## 结果

```
sim_engine/src/regimen_runner.py → schedule_runner.py   apply_regimens → apply_schedules，
                                                          regimens 参数/局部变量 → schedules
sim_engine/src/optimizer_engine.py    _build_regimen_events → _build_schedule_events
sim_engine/src/optimizer_eval.py      regimen_events_by_var/regimens_list → schedule_events_by_var/schedules_list
sim_engine/src/simulator_engine.py    import 更新；schedule_regimens 局部变量 → schedules
sim_engine/src/session_manager.py     import 更新
sim_engine/src/model_structure/{loader,core}.py   注释更新（apply_regimens → apply_schedules）
sim_cli/build.spec                    hiddenimports: regimen_runner → schedule_runner
sim_gui/src/components/sim_tab/useSimulation.ts        buildRegimenPayload → buildSchedulePayload
sim_gui/src/components/Simulator/useModelInit.ts       varRegimens → varSchedules
sim_gui/.../optUtils.test.ts, simUtils.ts              注释更新
docs/cli.md, docs/opt.md, docs/coding_conventions.md   函数名引用更新
docs/sim_design.md   "GUI Working State Layer" 小节按 ADR 0115 后的现状重写
                      （manual_overrides/_apply_schedules 已不存在，不再有"谁覆盖谁"的优先级问题）
```

验证：`pytest tests/` 8 个测试全过；`sim_gui` `tsc --noEmit` 零错误；`vitest run` 全过。

## 不在本次范围内

- API 字段名 `regimens`/`RegimenData`/`regimen_variable`/`regimen_event_labels`、YAML
  `reference.regimen` 的概念层命名是否也要统一成 `schedule`——这涉及前后端契约改动和 YAML
  持久化字段，是否要做留待单独评估，不与本次"纯内部命名"改动混在一次提交里。

## 关联

- ADR 0115 — 本次改名的直接前提（移除了会撞名的 `_apply_schedules`）
- ADR 0109/0110 — `schedule` 一词在 YAML 规范里的来源
