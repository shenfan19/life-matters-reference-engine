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
