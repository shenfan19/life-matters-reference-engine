# 0129 — 并发资源保护：优化 job 与仿真 session 全局上限（P1/P2）

**日期**：2026-07-10
**状态**：✅ 已接受

---

## 背景

ADR 0128 解决了僵尸 session 堆积问题（P0），但没有限制**同时活跃**的资源消耗——`2026-06-25_
task_prelaunch-publish-verification-checklist.md` §4 估算：5 个并发大型优化任务可能占满
10-20 核。`SCS_MODE` 只保护文件系统写操作，仿真/优化计算本身此前完全没有并发上限，公网多用户
场景下，恶意或无意的大量并发请求都会耗尽服务器资源，且此前是"悄悄接受所有请求直到系统过载"，
不是"明确拒绝并提示重试"。

## 决策

1. **两个独立上限**：`LM_MAX_CONCURRENT_OPTS`（默认 2）限制同时 `status == 'running'` 的
   `app_state.optimizer_jobs`；`LM_MAX_CONCURRENT_SIMS`（默认 5）限制 `ReferenceEngine.sessions`
   总数（不区分是否正在自动播放——一个暂停的 session 仍占用一份模型副本的内存，这正是要保护的
   资源，不是 CPU 占用）。两者物理上互不影响，与 ADR 0128 的隔离原则一致。
2. **超限即拒绝，返回 503**：新增请求超过上限时，路由层直接 `raise HTTPException(503)`，不做
   排队、不悄悄丢弃——前端可以据此提示"服务繁忙，请稍后重试"，比静默失败或让请求堆积更诚实。
   检查点放在路由层最前面（`app_state.check_optimizer_capacity()` /
   `app_state.check_sim_capacity()`，紧跟 `engine is None` 检查之后、进入业务逻辑之前），不在
   `session_manager.py`/`optimizer_engine.py` 内部检查——这两个模块不依赖 FastAPI，检查逻辑放
   在路由层能直接复用 `HTTPException`，也更贴近"这是 API 边界防护，不是业务规则"的定位。
3. **默认值来源**：直接采用 `2026-06-25_task_prelaunch-publish-verification-checklist.md` §4
   给出的建议值（`MAX_CONCURRENT_OPTS=2`），仿真 session 上限沿用同一份文档 P2 条目的建议
   （`MAX_CONCURRENT_SIMS=5`）。两者都做成 `paths.py` 里可被 `.env`/环境变量覆盖的配置项
   （`LM_MAX_CONCURRENT_OPTS`/`LM_MAX_CONCURRENT_SIMS`），不是硬编码常量——与 ADR 0128 的
   30 分钟超时阈值不同，并发上限强依赖实际部署机器的核数/内存，更需要按环境调整，外部化的
   必要性更高。
4. **只保护面向用户的两个创建入口**：`routes/simulation.py::/api/simulation/start` 和
   `routes/optimizer.py::/api/optimizer/run_yaml`。`plugin_context.py` 内部（插件如
   `sensitivity_analysis` 二次调用 `start_session` 做敏感性分析）**不受此限制**——这是同一个
   用户请求内部的短生命周期会话，不是"新的并发用户"，纳入同一上限会在插件运行期间意外触发限流。

## 未做的事（P3/P4，按需实现）

- **P3（IP 级限流）**：判断依据是"预期公网并发量"，本项目当前定位是研究工具演示站点，不是
  面向大规模匿名流量的产品，P1/P2 的全局上限已经能防止服务器被压垮，IP 级限流带来的额外收益
  （防止单个用户占满全部并发名额）暂时不足以覆盖引入 IP 识别/信任代理头等复杂度。
- **P4（排队系统）**：同上，503 快速失败对当前预期的低并发演示场景已经足够，排队系统适合
  "长期偶尔过载但值得等待"的场景，与当前"过载就是配置需要调整"的假设不符。
- 如果实际部署后发现真实流量超出预期，P3/P4 随时可以在这两个检查点上叠加，不需要改动现有设计。

## 结果

- `reference_engine/src/paths.py`：新增 `MAX_CONCURRENT_OPTS`/`MAX_CONCURRENT_SIMS`
  （`.env`/环境变量可覆盖，默认 2/5）
- `reference_engine/src/app_state.py`：新增 `check_optimizer_capacity()`/`check_sim_capacity()`，
  与既有 `check_write()`（SCS_MODE）同一模式
- `reference_engine/src/routes/optimizer.py`、`routes/simulation.py`：各自新增入口的一行检查
- `tests/test_capacity_limits.py`：6 个用例——两个检查函数各自的"未超限放行"/"超限 503"，
  外加 `optimizer_jobs` 只数 `running` 状态、`engine` 未初始化时 `check_sim_capacity` 不误报
- `.env.example`：补充新增两个环境变量的说明（顺带修正了该文件残留的改名前旧路径引用
  `sim_engine`/`sim_cli`，见 ADR 0121）
