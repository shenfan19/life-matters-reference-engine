# Sim 决议汇总

> 本文件是 `docs/decisions/` 中 61 条 ADR 的**主题分类摘要**，标注重要程度与对应文档。  
> 完整时序索引见 [decisions/README.md](decisions/README.md)。

**重要程度**：⭐⭐ = 核心约束，影响格式规范或架构，不可随意更改；⭐ = 重要实现决策；无标注 = 已实施，历史记录

---

## 一、YAML 模型格式（→ model_design.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0022](decisions/0022-models-three-level-taxonomy.md) | Models 三层分类体系（medical/social → 学科 → 细分） | ⭐ | ✅ |
| [0040](decisions/0040-2026-04-22_sim_医学证据类型与变量映射.md) | **医学证据 8 子类型（evidence vs parameter 区分）** | ⭐⭐ | ✅ |
| [0044](decisions/0044-2026-04-30_sim_schedule作为simulation-input子类型.md) | **schedule 归属 simulation 块；pulse 模式；离散 input 不写零值点** | ⭐⭐ | ✅ |
| [0046](decisions/0046-2026-04-30_sim_步长设计-step_size元数据与step公式符号.md) | **step_size 元数据；公式用 `step`；simulation 不再声明 step/step_unit** | ⭐⭐ | ✅ |
| [0053](decisions/0053-2026-05-03_sim_date_range调度字段与YAML-schedule优先级修复.md) | date_range 字段；YAML Schedule 优先于 GUI Regimen | ⭐ | ✅ |
| [0063](decisions/0063-2026-05-07_sim_resolved-imports-and-output-selection.md) | **Resolved imports 与输出变量选择规则（output_types / output_variables 语义）** | ⭐⭐ | ✅ |
| [0065](decisions/0065-2026-05-08_sim_structured-description.md) | metadata.description 支持结构化写法（brief/need/method 等字段） | ⭐ | ✅ |
| [0057](decisions/0057-2026-05-04_project_models-paper-directory.md) | models/published/paper1-3/ 论文专用场景目录 | ⭐ | ✅ |
| [0062](decisions/0062-2026-05-06_project_models-directory-rename.md) | models 目录重命名规范（source/ → in_process/ 等） | | ✅ |

---

## 二、仿真引擎（→ sim_design.md, sim_impl.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0038](decisions/0038-2026-04-20_sim_regimen-k4-input-scheduling.md) | **Regimen K×4 输入调度：时刻/摄入量/执行日/有效期** | ⭐⭐ | ✅ |
| [0024](decisions/0024-asteval-rebuild-over-clear.md) | asteval Interpreter 重建而非 symtable.clear() | ⭐ | ✅ |
| [0070](decisions/0070-2026-05-15_sim_asteval-as-safety-sandbox-constraint.md) | **asteval 作为公式安全沙箱：禁止用 Python eval() 直接替代** | ⭐⭐ | ✅ |
| [0045](decisions/0045-2026-04-30_sim_MC概率仿真与随机参数架构.md) | **MC 概率仿真：parameter 分布表达式、多 run 引擎、半透明曲线渲染** | ⭐⭐ | ✅ |
| [0054](decisions/0054-2026-05-04_sim_unified-apply-regimens.md) | **仿真/优化 Regimen 执行函数统一；删除 `_apply_regimen_events`** | ⭐⭐ | ✅ |
| [0064](decisions/0064-2026-05-07_project-edit-refresh-run-snapshot.md) | **编辑态刷新源文件，运行态固定快照（两种不同的模型加载语义）** | ⭐⭐ | ✅ |
| [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md) | **Simulator 拆分；Sim/Opt 结果工作区分离** | ⭐⭐ | ✅（OPT/SIM 分离重构待续）|

---

## 三、优化器（→ opt.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0049](decisions/0049-2026-05-02_sim_Optimizer异步Job系统设计.md) | **Optimizer 异步 Job 系统：API 立即返回 job_id，轮询进度** | ⭐⭐ | ✅ |
| [0052](decisions/0052-2026-05-04_sim_schedule格式统一与opt-regimen支持.md) | Schedule 扁平列表格式；optimizer.regimen 支持 | ⭐ | ✅ |
| [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md) | **三层验证框架：数值精度 / 文献对标 / 优化合理性** | ⭐⭐ | ✅（脚本待写）|

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
| [0071](decisions/0071-2026-05-15_sim_ui-rounded-cards-settings-gear-drag-sort.md) | **全局圆角卡片面板 + 设置齿轮 Popover + 区块拖拽排序** | ⭐ | ✅ |

---

## 五、项目结构

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0041](decisions/0041-2026-04-22_project_命名规范下划线优先.md) | **命名规范：snake_case 下划线优先** | ⭐⭐ | ✅ |
| [0042](decisions/0042-2026-04-23_project_mod-to-model-rename.md) | mod → model 全面重命名 | | ✅ |
| [0055](decisions/0055-2026-05-04_project_docs-go-public-private-split.md) | **docs/ 公开 / go/ 内部不发布 分界规则** | ⭐⭐ | ✅ |
| [0060](decisions/0060-2026-05-05_project_game-repo-separation.md) | **Game repo 独立（sim 和 game 分离为独立 repo）** | ⭐⭐ | ✅ |
| [0061](decisions/0061-2026-05-06_project_temp-storage-no-user-accounts.md) | 临时存储方案，不做用户账号系统 | ⭐ | ✅ |
| [0072](decisions/0072-2026-05-15_project_gui-only-no-cli.md) | **GUI-only：CLI 不是正式接口，不新增功能，批量场景用 HTTP API** | ⭐⭐ | ✅ |

---

## 六、验证框架（→ validation.md）

| ADR | 标题 | 重要程度 | 状态 |
|-----|------|---------|------|
| [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md) | **三层验证框架**：层1数值精度（解析解）/ 层2文献对标（效应量范围）/ 层3优化合理性 | ⭐⭐ | ✅（验证脚本待写）|
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
