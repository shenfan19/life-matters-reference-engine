# 0146 — GUI 会话按模型归属：优化进度快照持久化 + 仿真 pause/resume 前后端同步

**日期**：2026-07-21
**状态**：✅ 已接受

---

## 背景

GUI 允许用户在多个模型之间自由切换，每个模型的会话状态（`ModelSession`）此前已经按模型独立持久化 `optResult`，但优化运行过程中的实时进度面板（Gen/Eval/Front/Feasible/Mean CV 卡片与趋势图）没有归属者，只在组件级 state 里，随 `selectedKey` 切换而不清空也不恢复。用户切到另一个模型时，进度面板继续显示上一个模型的残留数字；切回原模型时，`optResult` 能恢复，但"这次运行是怎么走到这个结果的"这部分过程数据已经丢失。

同一批改动还修复了仿真侧一个相关的状态一致性问题：前端暂停仿真时只把本地 `isRunningRef` 置为 false，从未通知后端 `session_manager.py`，导致后端 `running` 标志与前端显示状态脱节——一次意外的 batch 调用会静默继续推进，而不是快速失败并提示。

## 决策

**优化进度按模型持久化**：`ModelSession` 类型新增 `optHistory`/`optTotalGen`/`optElapsed`/`optMethod`/`optLogs` 字段，`useOptimizer.ts` 在一次运行完成时把这些字段连同 `optResult` 一起写入 `modelSessionsRef`；切换 `selectedKey` 时，若目标模型有历史运行记录则恢复进度面板，否则清空为 idle 状态。`optJobId` 不参与这套归属逻辑，仍然独立于当前选中模型之外，用于取消一个已经切换走的模型上仍在后台运行的任务。

**仿真 pause/resume 前后端同步**：`pauseSimulation`/`resumeSimulation` 新增对已存在的后端接口 `POST /api/simulation/pause`、`POST /api/simulation/resume`（`session_manager.py` 的 `pause_session`/`resume_session`，随 ADR 0129 并发资源保护一同引入）的调用，fire-and-forget，不阻塞前端的暂停/恢复反馈；`resetSimulation` 同样在重置前先通知后端暂停。此前这两个后端接口已经存在但从未被前端实际调用。

## 影响范围

- `gui/src/components/opt_tab/useOptimizer.ts`：切换模型时的进度快照保存与恢复逻辑。
- `gui/src/types.ts`：`ModelSession` 新增 5 个可选字段。
- `gui/src/components/sim_tab/useSimulation.ts`：`pauseSimulation`/`resumeSimulation`/`resetSimulation` 新增后端同步调用。

## 结果

- 切换模型后进度面板显示的是该模型自己的历史，不再残留上一个模型的数据；切回时能完整恢复过程视图，不止 Front/Solutions 这一份最终结果。
- 前端暂停/重置仿真的同时，后端 `running` 标志与前端状态保持一致，不再出现前端已暂停、后端仍在推进的静默不一致。
