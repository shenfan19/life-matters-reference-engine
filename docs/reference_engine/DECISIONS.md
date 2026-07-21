# Sim 决议汇总

> 本文件是 `docs/decisions/` 中仿真引擎、优化器、UI 和项目结构 ADR 的**主题分类摘要**。  
> YAML 模型格式相关 ADR 见 `b_lm_model/docs/DECISIONS.md`。  
> 完整时序索引见 [decisions/README.md](decisions/README.md)。

**重要程度**：⭐⭐ = 核心约束，影响格式规范或架构，不可随意更改；⭐ = 重要实现决策；无标注 = 已实施，历史记录

---

## 一、仿真引擎（→ design.md, impl.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0038](decisions/0038-2026-04-20_sim_regimen-k4-input-scheduling.md) | **Regimen K×4 输入调度：时刻/摄入量/执行日/有效期** | ⭐⭐ | ✅ |
| [0024](decisions/0024-asteval-rebuild-over-clear.md) | asteval Interpreter 重建而非 symtable.clear() | ⭐ | ✅ |
| [0070](decisions/0070-2026-05-15_sim_asteval-as-safety-sandbox-constraint.md) | **asteval 作为公式安全沙箱：禁止用 Python eval() 直接替代** | ⭐⭐ | ✅ |
| [0045](decisions/0045-2026-04-30_sim_MC概率仿真与随机参数架构.md) | **MC 概率仿真：parameter 分布表达式、多 run 引擎、半透明曲线渲染** | ⭐⭐ | ✅ |
| [0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md) | **修复 optimizer.mc.runs 被 reset_simulation() 静默清零的 bug（影响19个论文模型）；Opt tab MC 控件与 Sim tab 解耦** | ⭐⭐⭐ | ✅ |
| [0054](decisions/0054-2026-05-04_sim_unified-apply-regimens.md) | **仿真/优化 Regimen 执行函数统一；删除 `_apply_regimen_events`** | ⭐⭐ | ✅ |
| [0064](decisions/0064-2026-05-07_project-edit-refresh-run-snapshot.md) | **编辑态刷新源文件，运行态固定快照（两种不同的模型加载语义）** | ⭐⭐ | ✅ |
| [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md) | **Simulator 拆分；Sim/Opt 结果工作区分离** | ⭐⭐ | ✅（OPT/SIM 分离重构待续）|
| [0099](decisions/0099-2026-06-11_sim_sustained-value-step-invariance.md) | sustained 模式 `value` 语义修正：窗口总量 / N_steps（step-size 不变性） | | ⚪ 已被 [b_lm_model 0131](../../../b_lm_model/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md) 取代 |
| [0100](decisions/0100-2026-06-11_sim_unify-pulse-sustained-time-interval.md) | **统一 pulse/sustained 为时间区间 `time_start`/`time_end`；GUI 取消 full day/time/sustained 三态** | ⭐⭐ | 🟡 部分实施（papers 术语已补充说明，未做全文改写）|
| [b_lm_model 0131](../../../b_lm_model/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md) | **sustained `value` 改为每个匹配日独立满额（`N_steps` = 单次命中窗口自身时长 / step_size），取代 0099 的"整跨度总量"** | ⭐⭐ | ✅ |
| [b_lm_model 0132](../../../b_lm_model/docs/decisions/0132-2026-07-14_model_sustained-delivery-total-vs-level.md) | **regimen 新增 `delivery: total\|level`，区分"总量摊分"（默认）与"恒定水平不摊分"** | ⭐⭐ | ✅ |

---

## 三、优化器（→ opt.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0049](decisions/0049-2026-05-02_sim_Optimizer异步Job系统设计.md) | **Optimizer 异步 Job 系统：API 立即返回 job_id，轮询进度** | ⭐⭐ | ✅ |
| [0052](decisions/0052-2026-05-04_sim_schedule格式统一与opt-regimen支持.md) | Schedule 扁平列表格式；optimizer.regimen 支持 | ⭐ | ✅ |
| [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md) | **三层验证框架：数值精度 / 文献对标 / 优化合理性** | ⭐⭐ | ✅（脚本待写）|
| [0098](decisions/0098-2026-06-11_sim_optimizer-schedule-sustained-mode.md) | optimizer.schedules 新增 `mode: sustained`（子日步长持续输入） | ⭐ | ✅（旧格式，由 0100 取代但仍受支持）|

---

## 四、UI / 前端（→ ui_guidelines.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0001](decisions/0001-simulator-two-column-layout.md) | 仿真器双列布局 | | ✅ |
| [0003](decisions/0003-toolbar-flow-validate-mode-run.md) | 工具栏流程：验证→模式→运行 | ⭐ | ✅ |
| [0004](decisions/0004-i18n-locale-files.md) | 多语言：JSON locale 文件 | ⭐ | ✅ |
| [0005](decisions/0005-localstorage-persistence.md) | 客户端状态持久化：localStorage | ⭐ | ✅ |
| [0012](decisions/0012-neutral-theme-unified-colors.md) | **中性主题 + 双应用色彩 Token 统一** | ⭐⭐ | ✅ |
| [0013](decisions/0013-relative-font-scale-selector.md) | 相对字号系统 + 字号选择器 | ⭐ | ✅ |
| [0050](decisions/0050-2026-05-04_sim_InputEvent扁平化与交互状态颜色规则.md) | **InputEvent 扁平化；激活/未选中的颜色规则（绿色=激活）** | ⭐⭐ | ✅ |
| [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md) | Sim/Opt Tab 分离与结果工作区 UI | ⭐ | ✅（部分待续）|
| [0067](decisions/0067-2026-05-15_sim_optimizer-algo-preset-slider-ui.md) | 优化器算法预设与参数滑块 UI | | ✅ |
| [0068](decisions/0068-2026-05-15_sim_formula-precompile-to-python-function.md) | 公式预编译为 Python 函数（asteval → fn） | ⭐ | ✅ |
| [0069](decisions/0069-2026-05-16_sim_optimizer-results-stateless-design.md) | **optimizer.results 内嵌 + 无状态服务 + warm-start + CSV 导出** | ⭐⭐ | ✅ |
| [0071](decisions/0071-2026-05-15_sim_ui-rounded-cards-settings-gear-drag-sort.md) | **全局圆角卡片面板 + 设置齿轮 Popover + 区块拖拽排序** | ⭐ | ✅ |
| [0073](decisions/0073-2026-05-16_sim_multi-plan-simulation.md) | **多方案仿真：Plan 术语、数据模型、MC 逐方案独立运行** | ⭐⭐ | 待实现 |
| [0074](decisions/0074-2026-05-16_sim_gui-working-state-priority.md) | **GUI Working State 优先级高于 YAML Schedule（反转 ADR 0053 对 GUI 变量的规则）** | ⭐⭐ | 待实现 |
| [0074](decisions/0074-2026-05-16_sim_single-tab-group-and-builder-tab.md) | **单层标签组导航：移除顶层 Tools/Sim 双层；动态 Builder Tab + 统一目录树双模式** | ⭐ | ✅ |
| [0077](decisions/0077-2026-05-17_sim_session-model-import.md) | **Session 模型导入：原子上传（UUID 临时文件 + 内联解析 + 即时删除）→ localStorage；session/ key 前缀** | ⭐ | ✅（2026-05-18 重写，原两步法已废弃）|
| [0078](decisions/0078-2026-05-18_project_scs-mode-design.md) | **SCS_MODE：云端部署写操作保护、前端行为适配、合并→session model** | ⭐ | ✅ |
| [0082](decisions/0082-2026-05-21_sim_lock-unlock-refresh-behavior.md) | **两层状态分离：modelContent / modelSession；localStorage 持久化会话** | ⭐ | ✅（D3–D5 由 0085 取代；D3 reloadFromYAML 由 0089 更新）|
| [0084](decisions/0084-2026-05-23_sim_sim-opt-separation.md) | **Sim / Opt 完全分离：InputEvent / OptInput 独立类型；OptSetupTab；optimizer.schedules** | ⭐ | ✅ |
| [0085](decisions/0085-2026-05-25_sim_remove-lock-free-switch-running-indicator.md) | **移除锁机制；自由切换模型；双箭头运行指示器；SCS 模式仅拦截新启动** | ⭐ | ✅ |
| [0089](decisions/0089-2026-05-30_sim_session-refactor-warm-start-dirty-active-model.md) | **Session 精化：`useSession` 分离、`userEdited` 追踪（`(edited)` 标记）、warm-start dirty 检测（⚠ 橙色警告）、非活跃模型 Opt Tab 隔离、rawContent fallback** | ⭐ | ✅ |
| [0093](decisions/0093-2026-06-05_sim_runtime-log-panel.md) | Sim/Opt 运行时日志面板：内容分层（模型信息、NaN/bounds 警告、完成统计）与实现 | | ✅ |

---

## 五、项目结构

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0055](decisions/0055-2026-05-04_project_docs-go-public-private-split.md) | **docs/ 公开 / go/ 内部不发布 分界规则** | ⭐⭐ | ✅ |
| [0060](decisions/0060-2026-05-05_project_game-repo-separation.md) | **Game repo 独立（sim 和 game 分离为独立 repo）** | ⭐⭐ | ✅ |
| [0061](decisions/0061-2026-05-06_project_temp-storage-no-user-accounts.md) | 临时存储方案，不做用户账号系统（upload-temp 并发问题见 ADR 0077 修订） | ⭐ | ✅ |
| [0078](decisions/0078-2026-05-18_project_scs-mode-design.md) | **SCS_MODE：云端部署写操作保护、前端行为适配、合并→session model** | ⭐ | ✅ |
| [0128](decisions/0128-2026-07-10_sim_gui-session-idle-timeout.md) | **GUI session 30 分钟无活动自动销毁**（公网部署 P0，防僵尸 session 堆积） | ⭐ | ✅ |
| [0129](decisions/0129-2026-07-10_sim_concurrency-limits-opt-jobs-and-sim-sessions.md) | 并发资源保护（P1/P2）：优化 job / 仿真 session 全局上限，超限返回 503 | ⭐ | ✅ |
| [0072](decisions/0072-2026-05-15_project_gui-only-no-cli.md) | **GUI-only：CLI 不是正式接口，不新增功能，批量场景用 HTTP API**（部分修订见 0101） | ⭐⭐ | ✅ |
| [0091](decisions/0091-2026-06-01_project_cli-batch-tool.md) | `cli/`：批量仿真 CLI 工具 | ⭐ | ✅ |
| [0101](decisions/0101-2026-06-13_project_cli-public-release-interface.md) | **CLI 升级为公开发布接口：面向 AI/自动化场景，随 release 发布** | ⭐⭐ | ✅ |
| [0121](decisions/0121-2026-06-24_project_top-level-rename-cli-gui-reference_engine.md) | **顶层目录改名：`sim_cli`/`sim_engine`/`sim_gui` → `cli`/`reference_engine`/`gui`；消除 sim/opt 不对称命名** | ⭐⭐ | ✅ |

---

## 六、验证框架（→ test_verify/verification_report.md + models/validation/validation_report.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md) | **三层验证框架**：层1数值精度（解析解）/ 层2文献对标（效应量范围）/ 层3优化合理性 | ⭐⭐ | ✅（验证脚本待写）|
| [0123](decisions/0123-2026-07-06_project_test-plan-and-report-consolidation.md) | **测试文档合并**：验证协议 + 引擎数值检查 + 模型逐项核对表 → `models/test_validation/test_plan.md`（大纲）+ `test_report.md`（报告） | ⭐⭐ | ✅ |
| [0023](decisions/0023-models-runnable-from-gui.md) | Models 可在 GUI 文件树中直接运行；standalone 约定 | ⭐ | ✅ |

---

## 七、Game 相关（pre-separation，历史记录）

以下 ADR 在 game repo 独立前写入，内容已迁移至 game repo 的设计文档，在 sim repo 中作为历史记录保留：

| ADR | 主题 |
|-----|------|
| 0006 | Game Story 文件夹格式 |
| 0010/0011 | Hearthstone 式布局 / 6 行对称布局 |
| 0015/0016 | 手牌机制 / 游戏术语 |
| 0027/0028/0029 | 弃牌机制 / 拖拽区域 / 响应式布局 |
| 0033/0034 | 弃牌机制设计 / 手牌数量 |
| 0036/0037 | 动画时序 / i18n 设计 |
| 0043 | 战场张力框架 |

---

## 维护规则

- 新 ADR：写入 `decisions/` 并在 `decisions/README.md` 添加行，同时在本文件对应分类中新增一行
- ⭐⭐ 决议有改动时：同步更新对应的 design/impl 文档
- 本 repo 内容保持独立，不引用 game repo 的文件路径或内容
