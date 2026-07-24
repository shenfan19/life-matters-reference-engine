# 0007 — Sim / Game 顶栏统一

**状态**：✅ 已实施  
**日期**：2026-04-04

## 背景

`sim_gui`（端口 5173）和 `game`（端口 5174）是同一产品的两个子应用，但顶栏风格不一致：

- sim 有完整的顶栏：LM logo、"Life Matters" 大标题、页面导航、语言选择、暗/亮切换。
- game 的 CardGame 页面（游戏进行中）顶栏极简，只有 LM 波形 logo、当前 story 名称和一个返回按钮，缺少语言和暗/亮控制。
- game 的 StorySelect 页面（选关）已有完整顶栏，但 CardGame 未继承。

## 决策

CardGame 顶栏对齐 StorySelect，增加以下元素：
- LM 波形 logo + "Life Matters" 大标题（`Georgia` 字体，20px）
- 竖线分隔
- 当前 story 名称（原有，调整为次要色 `textSec`）+ 时间段（原有）
- 右侧：返回按钮、语言选择 `<select>`、暗/亮切换按钮

顶栏高度从 42px 统一为 50px，与 StorySelect 一致。

实现：`App.tsx` 新增 `onToggleDark` prop 传入 CardGame；CardGame 内通过已有的 `useI18n()` hook 获取 `setLanguage`，无需额外 prop。

## 后果

- ✅ 用户从选关页进入游戏后，顶栏视觉保持一致，可随时切换语言和明暗
- ✅ 不依赖额外状态提升，CardGame 自身管理语言切换
- ⚠️ 游戏进行中切换语言不会重置游戏状态（`langAtLoad` ref 保证加载时语言已固定），但 UI 文字会立即变化
