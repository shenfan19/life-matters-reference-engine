# Design Decision Records

每个文件记录一个设计决策，格式参考 [ADR](https://adr.github.io/)。

## 索引

| # | 标题 | 状态 | 日期 |
|---|------|------|------|
| [0001](0001-simulator-two-column-layout.md) | 仿真器双列布局与多图方案 | ✅ 已实施 | 2026-03-28 |
| [0002](0002-left-panel-accordion.md) | 左侧面板 Accordion（VSCode 风格）| ✅ 已实施 | 2026-04-01 |
| [0003](0003-toolbar-flow-validate-mode-run.md) | 工具栏操作流：验证→模式→运行 | ✅ 已实施 | 2026-04-01 |
| [0004](0004-i18n-locale-files.md) | 多语言方案：JSON locale 文件 | ✅ 已实施 | 2026-04-01 |
| [0005](0005-localstorage-persistence.md) | 客户端状态持久化：localStorage | ✅ 已实施 | 2026-04-02 |
| [0006](0006-game-story-folder-format.md) | Game Story 文件夹格式与前端 Loader | ✅ 已实施 | 2026-04-04 |
| [0007](0007-unified-titlebar.md) | Sim / Game 顶栏统一 | ✅ 已实施 | 2026-04-04 |
| [0008](0008-remove-font-size-slider.md) | 移除字体大小滑块，统一用浏览器缩放 | ✅ 已实施 | 2026-04-04 |
| [0009](0009-migrate-stories-to-folder-format.md) | 旧格式 Story 迁移 + 删除旧解析逻辑 | ✅ 已实施 | 2026-04-04 |
| [0010](0010-game-hearthstone-layout.md) | Game 界面 Hearthstone 式布局重构 | ✅ 已实施 | 2026-04-04 |
| [0011](0011-game-6row-unified-cards.md) | Game 6行对称布局 + 统一卡牌尺寸 + 对方手牌机制 | ✅ 已实施 | 2026-04-04 |
| [0012](0012-neutral-theme-unified-colors.md) | Game 中性主题 + 双应用色彩 Token 统一 | ✅ 已实施 | 2026-04-05 |
| [0013](0013-relative-font-scale-selector.md) | 相对字号系统 + 字号选择器 | ✅ 已实施 | 2026-04-05 |
| [0014](0014-app-icons-favicon-unification.md) | 应用图标重设计 + 浏览器标签图标统一 | ✅ 已实施 | 2026-04-05 |
| [0015](0015-card-hand-mechanics.md) | 卡牌手牌机制：无回收 + 双重惩罚 + 永久牌 | ✅ 已实施 | 2026-04-05 |
| [0016](0016-game-terminology-and-fate-rule.md) | 游戏术语统一 + 命运机制规则 | ✅ 术语已实施；命运 AI 待定 | 2026-04-05 |
| [0017](0017-card-backs-story-assets.md) | 卡背图片 + Story 静态资产加载 | ✅ 已实施 | 2026-04-05 |
| [0018](0018-background-music-player.md) | 背景音乐 + MusicBar 播放控制条 | ✅ 已实施 | 2026-04-05 |
| [0019](0019-disclaimer-placement-and-content.md) | 免责声明：位置、内容与呈现规范 | ✅ 已实施 | 2026-04-07 |
| [0020](0020-app-naming-life-matters.md) | 应用命名：统一为 Life Matters，中文副名仅在 About 中显示 | ✅ 已实施 | 2026-04-07 |
| [0021](0021-about-contact-info-github-only.md) | About 弹窗联系信息：仅保留 GitHub，去除邮件与主页 | ✅ 已实施 | 2026-04-09 |
| [0022](0022-models-three-level-taxonomy.md) | Models 三层分类体系（medical/social → 学科 → 细分） | ✅ 已实施 | 2026-04-12 |
| [0023](0023-models-runnable-from-gui.md) | Models 可在 GUI 文件树中直接运行 + standalone 约定 | ✅ 已实施 | 2026-04-12 |
| [0024](0024-asteval-rebuild-over-clear.md) | asteval Interpreter 重建而非 symtable.clear() | ✅ 已实施 | 2026-04-12 |
| [0025](0025-story-editor-four-tab-layout.md) | StoryEditor 转换器四标签平铺 + 多条件结局设计器 + 通用卡牌库 | ✅ 已实施 | 2026-04-13 |
| [0026](0026-simulator-report-tab.md) | 仿真器报告标签：左列勾选 + 右侧折叠预览 + MD 导出 | ✅ 已实施；DOCX 待续 | 2026-04-13 |
| [0027](0027-hand-discard-and-card-backs.md) | 手牌弃置机制与界面重组 | ✅ 已实施 | 2026-04-15 |
| [0028](0028-card-drag-drop-zones.md) | 卡牌区域拖拽系统 | ✅ 已实施 | 2026-04-15 |
| [0029](0029-responsive-layout-and-deck-config.md) | 响应式游戏布局、draw_per_turn 与 copies 牌组配置 | ✅ 已实施 | 2026-04-15 |
| [0030](0030-story-meta-author-field.md) | Story Meta author 字段标准化 | ✅ 已实施 | 2026-04-15 |
| [0031](0031-scenario-to-story-semi-auto-generation.md) | Scenario-to-Story 半自动生成工作流 | ✅ 已实施 | 2026-04-15 |
| [0032](0032-sim-gui-default-font-size-14.md) | sim_gui 默认字号调整为 14px | ✅ 已实施 | 2026-04-16 |
| [0033](0033-2026-04-14_game_弃牌机制设计决策.md) | 弃牌机制设计（暂存区 + 双区布局） | ✅ 已实施 | 2026-04-14 |
| [0034](0034-2026-04-15_game_手牌数量设计.md) | 手牌数量设计（hand_size + draw_per_turn） | ✅ 已定稿 | 2026-04-15 |
| [0035](0035-2026-04-19_sim_报告生成设计.md) | Sim 报告生成：章节顺序、含义列、CSV 分离、图表内嵌 | ✅ 已实施 | 2026-04-19 |
| [0036](0036-2026-04-19_game_动画与结算时序设计.md) | Game 动画与结算时序设计 | ✅ 已实施 | 2026-04-19 |
| [0037](0037-2026-04-19_game_i18n多语言覆盖层设计.md) | Game i18n 多语言覆盖层设计 | ✅ 已实施 | 2026-04-19 |
| [0038](0038-2026-04-20_sim_regimen-k4-input-scheduling.md) | Regimen K×4 输入调度：时刻/摄入量/执行日/有效期 | ✅ 已实施 | 2026-04-20 |
| [0039](0039-2026-04-22_docs_模块文档重组.md) | docs 模块文档重组：modules/ 合并入 design/ | ✅ 已实施 | 2026-04-22 |
| [0040](0040-2026-04-22_sim_医学证据类型与变量映射.md) | Sim 医学证据类型与变量映射（evidence 8 子类型） | ✅ 已实施 | 2026-04-22 |
| [0041](0041-2026-04-22_project_命名规范下划线优先.md) | 项目命名规范：snake_case 下划线优先 | ✅ 已实施 | 2026-04-22 |
| [0042](0042-2026-04-23_project_mod-to-model-rename.md) | mod → model 全面重命名；保留 sim_xxx 不改 | ✅ 已实施 | 2026-04-23 |
| [0043](0043-2026-04-25_game_battlefield-tension-framework.md) | 战场张力框架：battle_progress/danger_accumulation 归 Game-native；origin 字段；命运牌模式；南丁格尔 + 希波克拉底首次实现 | ✅ 已实施 | 2026-04-25 |
| [0044](0044-2026-04-30_sim_schedule作为simulation-input子类型.md) | `simulation.schedules`：时间驱动输入归属 `simulation` 块；pulse 插值模式；GUI 自动预填 Regimen；离散 input 不写零值点规则 | ✅ 已实施 | 2026-04-30 |
| [0045](0045-2026-04-30_sim_MC概率仿真与随机参数架构.md) | MC 概率仿真架构：parameter 分布表达式、多 run 引擎、半透明曲线渲染、Opt 内环均值评估、种子管理 | ✅ 已实施 | 2026-04-30 |
| [0046](0046-2026-04-30_sim_步长设计-step_size元数据与step公式符号.md) | 步长最终方案：`metadata.step_size.{value,unit}`；公式用 `step`；simulation 去掉 step/step_unit；GUI 粗化倍率控件 | ✅ 已实施 | 2026-04-30 |
| [0047](0047-2026-05-02_sim_后端健康检查与非阻塞修复.md) | 后端健康检查与非阻塞修复 | ✅ 已实施 | 2026-05-02 |
| [0048](0048-2026-05-02_sim_BabelManager英文Locale警告消除.md) | BabelManager 英文 Locale 警告消除 | ✅ 已实施 | 2026-05-02 |
| [0049](0049-2026-05-02_sim_Optimizer异步Job系统设计.md) | Optimizer 异步 Job 系统设计 | ✅ 已实施 | 2026-05-02 |
| [0050](0050-2026-05-04_sim_InputEvent扁平化与交互状态颜色规则.md) | InputEvent 扁平化与交互状态颜色规则 | ✅ 已实施 | 2026-05-04 |
| [0051](0051-2026-05-04_sim_inputs初始化修复与模式感知.md) | inputs 初始化修复与模式感知 | ✅ 已实施 | 2026-05-04 |
| [0052](0052-2026-05-04_sim_schedule格式统一与opt-regimen支持.md) | Schedule 格式统一（扁平列表）& optimizer.regimen 支持；L3 重设计为五时段给药 | ✅ 已实施 | 2026-05-04 |
| [0053](0053-2026-05-03_sim_date_range调度字段与YAML-schedule优先级修复.md) | `date_range` 日期区间字段；YAML Schedule 优先于 GUI Regimen；`_apply_regimens` 历元修复；test_banister 简化为 1 周 | ✅ 已实施 | 2026-05-03 |
| [0054](0054-2026-05-04_sim_unified-apply-regimens.md) | 仿真/优化 Regimen 执行函数统一：删除 `_apply_regimen_events`，优化器改用 `SimulatorEngine._apply_regimens`；脉冲重置+累加语义 | ✅ 已实施 | 2026-05-04 |
| [0055](0055-2026-05-04_project_docs-go-public-private-split.md) | `docs/` 公开发布 / `go/` 内部不发布 分界规则；清除 docs 中的内部引用 | ✅ 已实施 | 2026-05-04 |
| [0056](0056-2026-05-04_project_three-tier-validation-framework.md) | 三层验证框架：层1数值精度（解析解）/ 层2文献对标（效应量范围）/ 层3优化合理性；报告格式规范 | ✅ 框架已实施，脚本待写 | 2026-05-04 |
| [0057](0057-2026-05-04_project_models-paper-directory.md) | `models/published/paper1-3/` 论文专用场景目录（原 `researches/`，2026-05-05 更名）；按案例ID命名；发表后改为论文标题 | ✅ 已实施 | 2026-05-04 |
| [0058](0058-2026-05-04_sim_scan-models-recursive.md) | `scan_models` 未指定文件夹时递归发现所有子目录（`os.walk`），前端改为动态分组而非硬编码 comp/scen | ✅ 已实施 | 2026-05-04 |
| [0063](0063-2026-05-07_sim_resolved-imports-and-output-selection.md) | Resolved imports 与仿真输出选择规则 | ✅ 已实施 | 2026-05-07 |
| [0064](0064-2026-05-07_project-edit-refresh-run-snapshot.md) | 编辑态刷新源文件，运行态固定快照 | ✅ 已实施 | 2026-05-07 |
| [0065](0065-2026-05-08_sim_structured-description.md) | metadata.description 支持结构化与自由文本 | ✅ 已实施 | 2026-05-08 |
| [0066](0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md) | Simulator 拆分与 Sim/Opt 结果工作区 | ✅ 已实施；OPT/SIM 分离重构待进一步设计 | 2026-05-08 |
| [0067](0067-2026-05-15_sim_optimizer-algo-preset-slider-ui.md) | 优化算法参数预设（快速/标准/精细）与滑动条联动 UI | ✅ 已实施 | 2026-05-15 |
| [0068](0068-2026-05-15_sim_formula-precompile-to-python-function.md) | 公式预编译：asteval 运行时解析 → 加载时生成 Python 函数，step 调用函数 | ✅ 已实施 | 2026-05-15 |
| [0069](0069-2026-05-15_sim_run-history-auto-archive.md) | 运行历史自动存档：sim/opt 完成后自动 POST 到服务器，历史抽屉加载/删除 | ✅ 已实施 | 2026-05-15 |
| [0070](0070-2026-05-15_sim_asteval-as-safety-sandbox-constraint.md) | asteval 作为公式安全沙箱：禁止用 Python eval() 直接替代（补录核心约束） | ✅ 已实施 | 2026-05-15 |
| [0071](0071-2026-05-15_sim_ui-rounded-cards-settings-gear-drag-sort.md) | 全局圆角卡片面板 + 设置齿轮 Popover（字号/语言）+ 区块拖拽排序 | ✅ 已实施 | 2026-05-15 |
| [0072](0072-2026-05-15_project_gui-only-no-cli.md) | GUI-only：放弃 CLI 作为正式接口（⭐⭐ 核心约束，补录） | ✅ 核心约束 | 2026-05-15 |
