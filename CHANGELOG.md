# Changelog

本文件记录 LM Reference Engine 仓库（`cli/`、`reference_engine/`、`gui/`）的工程变更，按子系统分组，组内按时间顺序排列。每条尽量只写一句话说清楚改了什么，完整决策背景见 `docs/decisions/` 下对应编号的 ADR。

YAML 模型库不在本文件覆盖范围内，独立维护于 [life-matters-models](https://github.com/shenfan19/life-matters-models)，每个模型自身的修改历史记录在该文件的 `metadata.log` 字段里。

## [1.0.0] - 2026-07-26

### LM format 执行语义：Regimen、Schedule、Plan

- Regimen 采用 K×4 结构化输入调度，把时刻、摄入量、执行日、有效期四个维度分开表达，取代早期的单一事件列表，对应 ADR 0038。
- `simulation.schedules` 与 `simulation.plans` 一度共存，`plans` 优先，`papers/` 目录禁止混用两者，对应 ADR 0087；随后进一步强制规范到位置层面，仿真固定用 `plans`，优化固定用 `optimizer.startpoint`，对应 ADR 0109，取代 ADR 0087。
- 引入 `simulation.plans` 支持在 YAML 里预定义多组仿真方案，一次运行同时产出多条曲线，对应 ADR 0076。
- Optimizer 的调度粒度分为 T2 时间窗、T3 星期模式、T4 起始日三层，对应 ADR 0080，评估用的时间窗口可独立于仿真配置单独设置，对应 ADR 0083。
- `optimizer.schedules` 统一为决策变量与固定背景量合并的单一列表格式，对应 ADR 0088，后由 ADR 0109 的位置规范取代。
- 仿真与优化的 Regimen 执行路径合并为同一份 `_apply_regimens` 实现，删除此前重复的 `_apply_regimen_events`，对应 ADR 0054；Plan/Schedule 的解析收敛到后端 `self.plans` 单一来源，前端不再重新解析 YAML，对应 ADR 0110。
- 移除 `second` 步长单位，仿真步长统一为 minute/hour/day 三档，对应 ADR 0090；`Simulation.step()` 入参单位约定为秒，对应 ADR 0096。
- `daily_inputs`、`_apply_schedules`、GUI 端的 manual override 状态层在 plans 强制落地后作为废稿一并清理，对应 ADR 0115。
- 内部实现改名 `regimen_runner.py` 为 `schedule_runner.py`，API 契约字段名不变，对应 ADR 0116；API/YAML 概念层命名最终维持 `regimen`，`optimizer.results.reference` 改名为 `recommended` 并删除中间解码字典，对应 ADR 0117。
- 多方案仿真的术语、数据模型与 Monte Carlo 交互方式定案为 Plan，对应 ADR 0073。

### Optimizer 与 Monte Carlo

- Monte Carlo 概率仿真架构落地：`parameter` 支持分布表达式、引擎支持多 run、前端半透明曲线渲染 Monte Carlo 结果分布，对应 ADR 0045。
- Optimizer 改为异步 Job 系统，配合前端实时进度展示，对应 ADR 0049；优化算法参数收敛为快速/标准/精细三档预设并联动滑动条 UI，对应 ADR 0067。
- `optimizer.results` 改为内嵌设计，配合后端无状态服务架构，对应 ADR 0069。
- 修复优化内层 Monte Carlo 在 `runs>1` 时被 `reset_simulation()` 静默清零的 bug，此问题曾影响 19 个论文模型的输出正确性；同批把 Opt tab 的 MC 控件与 Sim tab 解耦，对应 ADR 0130。
- 增加并发资源保护，优化 Job 与仿真 Session 各自设置全局上限，超限在路由层直接返回 503，对应 ADR 0129。

### 仿真执行核心与 CLI

- 修复 asteval Interpreter 复用导致的状态污染问题，改为每次仿真重建 Interpreter 而非调用 `symtable.clear()`，对应 ADR 0024；asteval 沙箱执行方式被确认为不可替代的核心安全约束，禁止用 Python 原生 `eval()` 直接替代，对应 ADR 0070。
- 方程从运行时用 asteval 逐步解析改为加载时预编译成 Python 函数，对应 ADR 0068。
- CLI 从内部批量运行工具升级为面向 AI 与自动化场景的正式公开接口，对应 ADR 0091 与 ADR 0101，修订了此前"GUI-only、放弃 CLI"的定位，对应 ADR 0072。
- Sim 执行核心在 CLI 与 GUI 之间合并为共用的 `advance_steps`，CLI 同时新增 `--mc-runs`/`--seed` 能力，对应 ADR 0113；随后 CLI 侧的 MC 命令行参数被移除，MC 配置改为只读 YAML 里的 `simulation.mc`，与 `optimizer.mc` 模式统一，对应 ADR 0114，修订 ADR 0113。
- 日期与时间字段改为前置校验，消除 CLI/GUI 共用代码里此前多处 `except: pass` 造成的静默回退，对应 ADR 0118；Sim 运行日志的内容生成合并到共用核心，CLI/GUI 各自只负责各自的输出出口，对应 ADR 0119。
- `LoaderEngine.fetch()` 新增 `last_error` 字段，`Loader`/`Validator` 的具体报错信息不再被吞成裸 `None`/`False`，对应 ADR 0124。
- Opt startpoint 解析修复两处忠诚性问题：seed 曾被硬编码、T4 模式下 `date_range` 曾被静默丢失，同批新增前端忠诚性测试，对应 ADR 0112。
- Result Exchange 确定 CSV 作为通用数据交换格式，YAML 作为统一模型下载格式，对应 ADR 0094。

### GUI：会话管理、部署与交互

- Session 管理经历多轮精化：模型导入改为原子上传，`useSession` 与主状态分离，`userEdited` 独立追踪，Warm-start 场景下的 Dirty 检测与非活跃模型的 Opt 隔离逐步补齐，对应 ADR 0077 与 ADR 0089；早期基于锁的模型切换与刷新机制先由分离架构替代，对应 ADR 0082，后进一步移除锁机制、改为自由切换模型并增加双箭头运行指示器，对应 ADR 0085。
- 云端多用户部署新增 SCS 模式，对写操作做保护并联动前端行为，对应 ADR 0078；GUI Session 增加 30 分钟无活动自动销毁，配合后台定时扫描任务，为公网部署的 P0 需求，对应 ADR 0128。
- Sim 与 Opt 在数据类型层面完全分离，`InputEvent`/`OptInput` 各自独立，新增 `OptSetupTab` 组件，对应 ADR 0084；工作区布局定为 4:6 百分比分列，对应 ADR 0079。
- 新增 LM Score 作为核心健康时长指标，区分可恢复与不可逆两种模式，对应 ADR 0081。
- 报告导出重构为 Sim/Opt 数据整合加逐 Plan 独立 PNG 下载，取代此前只能整页截图的方式，对应 ADR 0122；Sim 导出改为多 plan 时按变量分 CSV 的 ZIP 包，对应 ADR 0108。
- 新增 Pareto Regroup 面板，支持任意目标/决策变量选轴与分组，同批修复决策变量标签口径问题，对应 ADR 0140。
- 早期 UI 骨架陆续搭建完成：仿真器双列布局、左侧面板 Accordion、工具栏验证到运行的操作流、i18n locale 文件方案、客户端状态用 localStorage 持久化、Sim/Game 顶栏统一、相对字号系统、圆角卡片面板与区块拖拽排序、Toolbar 精简、运行时日志面板分层展示，分别对应 ADR 0001、0002、0003、0004、0005、0007、0013、0071、0095、0093。
- 免责声明的位置与呈现规范、应用统一命名为 Life Matters、About 弹窗联系信息分层为项目仓库与作者邮箱、Models 可在 GUI 文件树中直接运行，分别对应 ADR 0019、0020、0021、0023。

### 测试与验证体系

- 三层验证框架定案：层1数值精度、层2文献对标、层3优化合理性，对应 ADR 0056。
- 新增仓库首个自动化回归测试套件，钉住 Sim/CLI 一致性与一处 Monte Carlo 确定性 bug，对应 ADR 0111。
- 测试大纲与测试报告合并为大纲加报告两件套，迁至 `models/test/`，取代此前分散的 validation 文档与模型核对表，对应 ADR 0123。

### 项目结构

- 顶层目录改名，`sim_cli`/`sim_engine`/`sim_gui` 统一为 `cli`/`reference_engine`/`gui`，`docs/` 同步重组，`SimulatorEngine` 类改名为 `ReferenceEngine`，对应 ADR 0121。
- 公开文档与内部文档的分界规则定案，`docs/` 对外发布、`go/` 内部不发布，对应 ADR 0055。
- 游戏前端拆分为独立仓库并确定各自 UI 架构，对应 ADR 0060；确认不建用户账号体系，中间结果用临时目录暂存，对应 ADR 0061。

---

- [ ]  投稿那天修改
    - [ ] 把上面的标题从 `[Unreleased]` 改成 `[1.0.0] - YYYY-MM-DD`，并在对应 commit 上打 `git tag v1.0`。
