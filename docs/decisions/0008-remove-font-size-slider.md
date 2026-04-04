# 0008 — 移除字体大小滑块，统一用浏览器缩放

**状态**：✅ 已实施  
**日期**：2026-04-04

## 背景

sim_gui 顶栏有一个字体大小选择器（13–18px，6档）。实现方式：
- `fontSize` state（默认 16）传入 Ant Design `ConfigProvider token.fontSize`，控制 AntD 组件字体
- 内容区 `div` 设置 `zoom: fontSize / 16`，将整个内容区等比缩放

game 没有此功能。两个应用风格不一致。

## 分析

`zoom: fontSize / 16` 与浏览器的 Ctrl+滚轮缩放效果等价：两者都对内容区做整体等比缩放，视觉结果相同。差异仅在于：
- sim 的滑块仅缩放内容区（不含顶栏）
- 浏览器 zoom 缩放整个页面（含顶栏）

这个差异对用户体验无实质影响。

两个应用中大量 inline style 使用硬编码 `px` 值（如 `fontSize: 14`），这些值不会随浏览器字体设置变化，只有整体 zoom 能缩放它们。因此"跟随浏览器默认字体"在当前代码中意义有限，未来如需无障碍适配，需统一改用 `rem` 单位。

## 决策

移除 sim_gui 的字体大小选择器：
- 删除 `FONT_SIZES` 常量和 `TitleBar` 的 `fontSize` / `onFontSize` props
- 删除顶栏中的字体 `<select>` 元素
- 删除 `App` 中的 `fontSize` state
- `ConfigProvider token.fontSize` 固定为 `16`（与 game 一致）
- 内容区 div 去掉 `zoom` 属性

字体大小调整统一依赖浏览器原生 Ctrl+滚轮缩放。

## 后果

- ✅ sim 和 game 顶栏元素对齐，视觉一致
- ✅ 顶栏减少一个控件，更简洁
- ✅ 浏览器 zoom 是用户已知行为，无需学习
- ⚠️ 原本使用字体滑块的用户需改用 Ctrl+滚轮（行为变化）
- ⬜ 若未来需要精细字体控制（如无障碍），应改为 `rem` 单位 + CSS 变量方案，而非恢复此滑块
