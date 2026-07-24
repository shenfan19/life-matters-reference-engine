# 0071 · 全局圆角卡片面板 + 设置齿轮 Popover + 区块拖拽排序

**日期**：2026-05-15  
**状态**：✅ 已实施  
**类别**：GUI / 交互设计

---

## 背景

现有 SimSetupTab（左侧输入面板）、SimOptTab（优化结果区）、SimIntroTab（Overview 区）的可折叠区块均采用 `borderBottom: 1px solid` 扁平分割线样式——区块之间无视觉边界，展开内容与相邻区块的界限模糊，用户难以聚焦当前操作区域。

右上角设置项（字号选择器、语言下拉、暗色 toggle）三个控件并排常驻标题栏，占用水平空间；字号和语言属于低频偏好操作，不需要始终可见。

SimSetupTab 的区块顺序固定，用户无法根据工作习惯调整（如先看 Optimizer 设置再看 Inputs）。

---

## 决策

### 1. 全局圆角卡片面板

所有可折叠区块（`Section` 组件）统一替换为独立圆角卡片：

```
borderRadius: 10px
border: 1px solid c.border
boxShadow: 暗色 0 1px 5px rgba(0,0,0,0.35) / 亮色 0 1px 4px rgba(0,0,0,0.08)
overflow: hidden
background: c.panel
```

卡片容器从 `display: flex; flexDirection: column`（高度分割）改为滚动列表：

```
overflowY: auto
padding: 8px
gap: 8px
```

折叠态呈圆角胶囊，展开态为完整卡片，卡间间距 8px 提供明确的格式塔分组边界。

**影响范围**：`SimSetupTab`、`SimOptTab`、`SimIntroTab` 三个组件中的 `Section` 组件，以及各自的容器 div。`SimOptTab` 顶部固定摘要栏同步去掉 `borderBottom`。

### 2. 设置齿轮 Popover

标题栏右侧改为三个控件：

```
[⚙ 齿轮]  [🌙/☀ 暗色]  [ℹ About]
```

- **暗色 toggle** 保留在外，因为这是演示/实际使用中切换频率最高的操作
- **字号选择器**（12 / 14 / 16 px）和**语言下拉**（EN / 简体中文 / 繁體中文 / Français）收入齿轮图标触发的 `Popover`（`trigger: "click"`, `placement: "bottomRight"`）
- Popover 内容为两行：行一"字号 + 三按钮组"，行二"语言 + select"

使用 antd `Popover` + `SettingOutlined` 图标，无需额外状态管理（Popover 自管理 open 状态）。

### 3. 区块拖拽排序（SimSetupTab）

SimSetupTab 的区块支持用户自由拖拽排序（仅同列内上下重排，不支持跨列）：

- 引入 `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- 每张卡片头部左侧加 `HolderOutlined`（⠿）握柄图标
- 拖动激活阈值：位移超过 6px 才触发（防止点击误触发拖拽）
- 握柄点击加 `stopPropagation`，不影响折叠/展开
- 排序状态存于 `SimSetupTab` 本地 state（`tabOrder`），mode 切换（sim ↔ opt）时自动重置为默认顺序
- 旧的区块高度分割拖拽（`startSectionResize`）随新卡片布局一并移除；`sectionWeights` / `SECTION_H` prop 保留接口但不再使用

---

## 被排除的方案

| 方案 | 排除原因 |
|------|---------|
| 多列自由拖拽（Grafana 式） | 图表组件宽度敏感，跨列拖入窄列渲染差；实现复杂度 400+ 行 |
| 列数切换按钮（1列/2列 toggle） | 灵活性低，不如拖排对用户直观 |
| 字号/语言也收入齿轮 + 暗色也收入 | 暗色是演示场景高频操作，收起后路径过长 |
| 区块顺序持久化到 localStorage | 当前仅 2 个区块，收益有限；mode 切换需重置逻辑复杂 |

---

## 影响文件

| 文件 | 变更 |
|------|------|
| `sim_gui/src/App.tsx` | TitleBar：去掉 FontSizer 和 language select 常驻控件；加 `SettingOutlined` + `Popover`；`Popover` 内嵌字号按钮组和语言下拉 |
| `sim_gui/src/components/SimSetupTab.tsx` | `Section` 卡片化；容器改为滚动 + gap；引入 dnd-kit 实现排序；`SortableCard` 子组件；移除 `startSectionResize` |
| `sim_gui/src/components/SimOptTab.tsx` | `Section` 卡片化；容器加 `padding: 8, gap: 8`；顶部摘要栏去 `borderBottom` |
| `sim_gui/src/components/SimIntroTab.tsx` | `Section` 卡片化；容器加 `padding: 8, gap: 8` |
| `sim_gui/package.json` | 新增依赖 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities` |
