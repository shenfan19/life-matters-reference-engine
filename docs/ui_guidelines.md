# 全局 UI/UX 设计规范

> 本文件是 sim_gui 和 game 两个前端应用的全局设计准则。  
> 所有新组件、新页面、新功能均应遵循以下规则。  
> **优先级**：本文件 > 局部组件注释 > 个人偏好。

---

## 1. 响应式布局 —— 宽度自适应，禁止溢出

### 1.0 全局全宽原则（Global Full-Width Rule）

**所有标签页内容区和导航/控制栏必须占满父容器的 100% 宽度，不允许依赖内容收缩（shrink-to-content）。**

- **标签页内容区**（Overview / Simulation / Optimization / Report 及任何新标签）：外层容器须显式设 `width: '100%'`，不依赖 flex-column 的默认 stretch 行为（因在不同浏览器/嵌套层级中可能失效）。
- **顶部导航/标签栏**（tab bar）：同样须 `width: '100%'`，确保 `borderBottom` 横线贯穿全宽而非仅覆盖 tabs 按钮范围。
- **控制栏（toolbar）**：SimControls、OptControls 等 `flexShrink: 0` 的工具条，必须同时声明 `width: '100%'`，而非仅依赖父容器 flex-stretch。
- **分列布局**（如 setup + drag + result 两栏）：内容行须对称 padding（`padding: '6px 10px'`），禁止单侧 padding + 子元素补偿的非对称做法，防止内容区宽度计算不对称导致空白。
- **验收标准**：任意屏幕宽度下，各标签的底部分隔线、工具栏背景色都应横贯整个中央面板宽度，右侧无意义不明的空白区域。

- **所有内容区必须支持换行**：行内元素组使用 `display: flex; flexWrap: 'wrap'`，而非固定宽度的单行排列。
- **工具栏（toolbar）**：必须加 `flexWrap: 'wrap'`，窄屏时按钮/控件自动换行，不允许出现横向滚动条。
- **三列/多列 block 布局**：使用 `flex-grow` 比例（如 3:3:4），配合 `minWidth` 兜底，窄屏时自动折叠为单列。
- **禁止**使用固定像素宽度限制整体内容区（如 `maxWidth: 800px` 居中布局），应全宽铺满。
- **输入控件**：文本框、日期框等使用 `flex: 1` 或 `minWidth` + `flex-grow` 组合，不要写死宽度。

### 1.1 控件宽度与多语言自适应

- **成熟做法**：不要用固定像素宽度猜测文案长度；优先使用 `minWidth`、`width: 'max-content'` / `fit-content`、`ch` 单位、`flex: '1 1 auto'` 和容器 `flexWrap: 'wrap'`。
- **Select / Segmented / Button**：标签来自 i18n 时，宽度必须能容纳最长选项。使用 `minWidth` 兜底，允许控件随内容变宽；禁止为单位、模式、枚举选项写死过窄宽度，例如 `width: 62`。
- **数字 + 单位组合**：数字框用 `ch` 单位表达预期位数，例如 `width: '7ch'`；单位选择框用 `minWidth: '9ch'` 或更大，并允许 `width: 'max-content'`。
- **日期 / 时间 / ID**：日期框用 `12ch` 左右的语义宽度，时间框用 `7ch` 左右；技术 ID 可以省略但必须有 `title` 或 `Tooltip` 显示完整值。
- **紧凑工具栏**：控件组应设置 `flexShrink: 0`，父容器必须 `flexWrap: 'wrap'`。空间不足时换行，不压缩文字到不可读。
- **表格 / 列表**：可只在展示列使用省略号；可编辑控件不得因省略导致无法观察或修改当前值。
- **验收标准**：中英文语言各检查一次；最长标签不被截断，输入值可完整观察，窄屏时控件换行而不是横向溢出。

---

## 2. 颜色 —— 克制、语义化，不超过 5 种功能色

- **主色**（primary）：仅用于主操作按钮、强调高亮、选中状态。一个应用一种主色。
  - sim_gui：绿色系（`#007A33` / `#52c41a`）
  - game：参考主色 token `c.primary`
- **功能色**（最多 4 种，有明确语义）：
  - 危险/错误：红色（antd `danger`）
  - 警告：橙/黄（antd `warning`）
  - 成功：绿（antd `success`）
  - 信息：蓝（antd `processing`）
- **禁止**：同一页面使用超过 5 种不同颜色的 Tag/Badge；不要用颜色区分"平级"内容，用位置和排版区分。
- **背景/边框/文字** 使用 token 变量（`c.panel`、`c.border`、`c.text`、`c.textMute`、`c.textSec`），禁止硬编码颜色字符串。

### 2.1 交互状态颜色规则（Interactive State Color Rule）

**核心原则：绿色 = 激活/选中，灰色 = 未选中，红色 = 危险**

| 状态 | 前景色 | 背景色 | 边框/下划线 |
|------|--------|--------|------------|
| 激活/选中（active/selected） | `c.primary` | `c.activeBg` | `c.primary` |
| 悬停但未选中（hover） | `c.text` | `c.navHover` | 无 |
| 未选中（inactive） | `c.textSec` | transparent | 无或 `c.border` |
| 禁用（disabled） | `c.textMute` | transparent | `c.border`（透明度降低） |

**token 对应值**（在 `getC(isDark)` / `C` 对象中定义）：

| token | 暗色 dark | 浅色 light |
|-------|-----------|------------|
| `c.primary` | `#52c41a` | `#007A33` |
| `c.activeBg` | `#1a3a22` | `#e8f5e9` |
| `c.navHover` | `rgba(82,196,26,0.08)` | `rgba(0,122,51,0.06)` |

**适用范围（凡表示"当前激活"的元素均须遵守）**：
- 中央面板 Tab（Overview / Simulation / Optimization / Report，以及动态 Builder Tab）
- 模式切换控件（Sim / Opt Segmented）
- 左侧树节点选中（Tree `nodeSelectedBg`）
- 左侧 Tab 选中（Inputs / Vars / Formulas）
- 小型 pill 开关按钮（时/日/范 toggle）

**不适用范围（以下元素不使用 primary 颜色，统一用 `c.border` / `c.panel`）**：
- 列表项 / 数据行（如 input event card、变量行、公式行）——这些是数据展示，不是导航状态
- 数据行内某个字段的值（如 `optimizeValue=true`）不应让整行变绿；opt 状态由行内的 checkbox 自身表达

**禁止**：
- 用灰色背景（如 `#2a2a2a`）表示"选中"状态
- 用绿色表示危险/删除操作（保留给 `danger` 红色）
- 在 antd ConfigProvider 之外直接写死选中色
- 用 primary 色高亮数据行/列表项（数据行一律 `c.border` + `c.panel`）

**antd ConfigProvider 对应配置**（`academicTheme.components`）：
```js
Segmented: {
  itemSelectedBg:    isDark ? '#1a3a22' : '#e8f5e9',  // c.activeBg
  itemSelectedColor: isDark ? '#52c41a' : '#007A33',  // c.primary
  trackBg:           isDark ? '#1a1a1a' : '#f0f0f0',
},
Tree: {
  nodeSelectedBg:  isDark ? '#1a3a22' : '#e8f5e9',    // c.activeBg
  nodeHoverBg:     isDark ? 'rgba(82,196,26,0.08)' : 'rgba(0,122,51,0.06)',
},
Tabs: {
  itemSelectedColor: c.primary, inkBarColor: c.primary,
},
```

---

## 3. 明暗模式 —— 全面兼容，禁止硬编码颜色

- 所有颜色必须通过 `isDarkMode` 条件或 color token 对象 `c` 来获取，禁止写死 `#ffffff`、`#000000`、`#333`等。
- 文字对比度：暗色模式下正文 ≥ 4.5:1，大标题 ≥ 3:1（WCAG AA 标准）。
- 背景层次：至少区分三层（`c.bg` 页面底色 → `c.panel` 面板 → `c.inputBg` 输入区），用明度差异（非色相）区分。
- 图标、边框、分割线均使用 token，避免只在亮色下可见、暗色下消失的情形。
- 测试原则：每个新组件开发完成后，在亮色和暗色模式下各截一张图，目视检查对比度。

---

## 4. 字体与排版 —— 专业、信息密度适中

- **基础字号**：14px（sim_gui 已设定为默认）。正文内容不小于 12px，标注/辅助信息不小于 11px，禁止使用 10px 以下字号显示正式内容。
- **等宽字体**（monospace）：数值、变量名、代码、ID、日期、时间等技术内容必须使用 `fontFamily: 'monospace'`。
- **字重层次**：
  - 主标题：700（bold）
  - 副标题/分组标签：600（semibold）
  - 正文：400（normal）
  - 辅助说明：400 + `c.textMute` 颜色
- **行高**：正文 1.5，紧凑列表 1.3，表格单元格 1.2。
- **大写字母标签**（如 section header）：配合 `letterSpacing: '0.08em'`，字号 ≤ 11px，颜色用 `c.textMute`。
- **禁止**：页面内同时出现超过 3 种字号差异；禁止使用斜体强调（中文斜体难看且可读性差）。

---

## 5. 多语言（i18n）—— 所有用户可见文字必须支持国际化

- **原则**：组件内不允许出现硬编码的中文或英文用户可见字符串（按钮文字、标签、提示等），一律通过 `t('key')` 获取。
- **例外**：技术内容（变量名、单位符号、数学符号如 `~`、`→`）不需要翻译。
- **新增组件**：先在 `sim_gui/public/locales/zh-CN.json` 和 `en-US.json` 中添加对应 key，再在组件中引用。
- **占位符**：翻译 key 尚未添加时，使用 `t('key') || '默认中文'` 降级，不要直接写死中文。
- **语言切换**：应实时生效（无需刷新页面）。UI 布局必须对中英文两种字符长度均能正常显示（英文通常比中文长 30~50%）。

---

## 6. 时间与日期输入 —— 统一用 YYYY-MM-DD 日期范围

- **仿真时间范围**：使用"开始日期 ~ 结束日期"（`YYYY-MM-DD ~ YYYY-MM-DD`）表示，而非"N 小时/天/月/年"的数量+单位组合。
- **Regimen 有效期**：同上，起止日期横排，中间用 `~` 分隔。
- **步长（step）**：仍使用数值 + 单位（秒/分钟/小时/天），因为步长是计算精度参数，与日历无关。
- **日期输入框**：使用 antd `Input`（text 类型），placeholder 为 `YYYY-MM-DD`，`fontFamily: 'monospace'`。
- **时间计算**：`time_hours = (Date(end) - Date(start)) / 3_600_000`，负值或零时视为无效，后端 clamp 为最小值。

---

## 7. 组件设计原则 —— 简洁、局部、可组合

- **每个组件只做一件事**：不把"配置"和"结果展示"混在同一个 Card 里。
- **状态提升原则**：多组件共享的状态提升到最近公共祖先，不要用全局状态管理（Redux/Zustand）除非真的必要。
- **删除操作**：使用红色图标按钮（`danger`），不需要二次确认弹窗（低风险操作），但操作必须可撤销或可重新添加。
- **空状态**：每个列表/数据区在空数据时必须显示 `<Empty>`，不允许显示空白区域。
- **加载状态**：API 请求期间必须有 loading 反馈（`Spin` 或 skeleton），不允许静默等待。

---

## 8. 间距与密度 —— 信息密度偏高，但保留必要呼吸感

- **组件内 padding**：卡片内部 `8px 12px`，紧凑卡片 `6px 8px`。
- **组件间 gap**：同一行控件 `gap: 4~8px`；不同 section 之间 `gap: 12~16px`；顶层区域之间 `gap: 8~12px`。
- **分割线 vs gap**：当两列/两区块的内容已经有自己的圆角框体时，用 `gap: 8px` 替代 `borderRight/borderBottom` 分割线；分割线只用于无框体的扁平内容之间。
- **分割线**：相关内容组之间用 `1px solid c.border`，不要用粗线或色块分割。
- **卡片圆角**：外层卡片 `borderRadius: 8px`，内嵌 block `borderRadius: 6px`，小标签 `borderRadius: 4px`。

---

## 9. 交互反馈 —— 及时、明确、不打扰

- **成功操作**：使用 `message.success()`，持续 2s，不阻塞操作。
- **错误操作**：使用 `message.error()` 或 `Alert`（持久性错误用 Alert），提供具体原因，不要只说"失败"。
- **进度**：长时间操作（> 1s）必须有进度条或 spinner。
- **禁用状态**：按钮禁用时必须有视觉区分（opacity 或颜色变灰），并在 `Tooltip` 中说明原因。
- **悬停提示**：图标按钮（无文字标签的）必须有 `Tooltip` 说明功能。

---

## 10. 其他约定

- **emoji**：不在 UI 中使用 emoji 作为功能图标，统一使用 antd icon 或 SVG。（文档/注释中可用）
- **动画**：仅用于状态过渡（展开/收起、进度条）；不要用于纯装饰目的。过渡时间 150~300ms。
- **z-index**：Tooltip/Popover 100；Modal 200；全局 Toast 300；不要随意用 `z-index: 9999`。
- **滚动**：内容区设置 `overflow: 'auto'`，禁止页面级横向滚动；纵向滚动允许但应有明显指示（不要隐藏滚动条）。
