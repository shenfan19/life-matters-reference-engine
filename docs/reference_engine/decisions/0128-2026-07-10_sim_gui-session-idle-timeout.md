# 0128 — GUI session 空闲超时自动销毁

**日期**：2026-07-10
**状态**：✅ 已接受

---

## 背景

公网部署前置条件排查（`2026-06-25_task_prelaunch-publish-verification-checklist.md` §4）确认：
`reference_engine/src` 完全没有 session 超时逻辑。GUI 仿真 session（`ReferenceEngine.sessions`，
由 `SessionManagerMixin` 管理）一旦创建，只有前端显式调用某个销毁端点才会消失——但浏览器标签页
关闭、用户中途放弃都不会触发销毁。公网多用户场景下，僵尸 session 会无限堆积，每个 session 持有
一份完整模型副本（含 MC 多 run 的独立 clone），长期运行会耗尽服务器内存。

`app_state.optimizer_jobs`（优化任务）是完全独立的字典，不受这个问题影响，本次改动也不涉及它。

## 决策

1. **超时阈值**：30 分钟无活动（`SESSION_IDLE_TIMEOUT_SECONDS = 1800.0`，定义在
   `session_manager.py`），销毁标准是"距上次活动的时间"，与 session 的 `running`（是否正在自动
   播放）标志无关——`running=True` 但无人轮询 `batch_steps` 超过 30 分钟同样视为僵尸（对应浏览器
   标签页关闭这类场景）。
2. **"活动"的定义**：`start_session` 创建时写入 `last_active`；`batch_steps`/`pause_session`/
   `resume_session`/`reset_session`/`export_session_csv`/`get_session_info` 六个访问点各自刷新。
   只读访问（`get_session_info`/`export_session_csv`）也算活动——理由：这些调用本身证明有人正在
   与该 session 交互，若只把"步进"算活动，会误杀一个用户正在查看结果、但暂时没点"继续"的 session。
3. **清理触发方式**：不在每次请求里内联检查（避免每个请求都付出一次全表扫描的代价），改为
   `api_server.py` 的 `lifespan` 里起一个独立的 `asyncio` 后台任务，每 `SESSION_CLEANUP_INTERVAL_
   SECONDS = 300`（5 分钟）扫描一次，调用 `ReferenceEngine.cleanup_stale_sessions()`。扫描间隔
   明显小于超时阈值，保证僵尸 session 最多比 30 分钟这条线多存活约 5 分钟，不会长期滞留。
4. **与优化 job 的隔离**：`cleanup_stale_sessions()` 只操作 `self.sessions`，物理上不接触
   `app_state.optimizer_jobs`，天然满足"超时逻辑不应影响正在运行的优化任务"的要求，不需要额外
   的排除逻辑。

### 为什么不做成每请求内联检查

内联检查（每次访问 session 前先扫一遍是否有其他 session 过期）会让请求延迟依赖 session 总数，
且和"是否清理"这个决策耦合进每一条业务路径的调用栈里。独立的后台任务把"何时清理"和"业务逻辑要不要
关心过期"两件事分开，`cleanup_stale_sessions()` 本身也可以被测试直接调用，不需要模拟请求上下文。

## 结果

- `reference_engine/src/session_manager.py`：新增 `SESSION_IDLE_TIMEOUT_SECONDS` 常量、
  `last_active` 字段（创建 + 六个访问点刷新）、`cleanup_stale_sessions(idle_seconds=...)` 方法
- `reference_engine/src/api_server.py`：`lifespan` 内 `asyncio.create_task` 起后台清理循环，
  应用关闭时 `cleanup_task.cancel()`
- `tests/test_session_cleanup.py`：三个用例——过期 session 被清理、活跃 session 被保留、
  `batch_steps` 会刷新计时使其免于被清理

## 未决

- P1-P4（并发资源保护：优化 job 上限、仿真 session 上限、IP 限流、排队系统）仍未实现，见
  `2026-06-25_task_prelaunch-publish-verification-checklist.md` §4，本次只做了 P0。
- 30 分钟阈值和 5 分钟扫描间隔目前是硬编码常量，没有做成环境变量/配置项——如果实际部署后发现
  这两个数字需要按流量调整，再考虑外部化。
