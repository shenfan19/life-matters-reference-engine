# 0013 — 相对字号系统 + 字号选择器

**状态**：✅ 已实施  
**日期**：2026-04-05

## 背景

两个应用之前存在大量硬编码字号（`fontSize: 12`、`fontSize: 16` 等），导致：
1. 字号无法统一调整，桌面/手机用户体验差异大
2. 设计变更时需要逐一修改，容易遗漏
3. sim_gui 曾有字号下拉选择器，后被移除（ADR 0008），需以更好的方式恢复

## 决策

### 1. `makeFontScale(base)` 算术偏移系统

以基准字号 `base`（默认 16px）为锚点，所有字号用差值定义：

```typescript
function makeFontScale(base: number) {
  return {
    xs:   base - 5,   // 辅助文字、角标
    sm:   base - 3,   // 次级标签、按钮
    md:   base,       // 正文
    lg:   base + 2,   // 小标题
    xl:   base + 4,   // 大标题
    card: base + 8,   // 卡牌名称（突出，信息密度低）
    eff:  base - 1,   // 卡牌效果文字（紧凑）
  };
}
```

选择差值而非比例（如 `base * 1.2`）是因为差值在小字号变化时更线性、更易心算，设计师可直接推理"比正文小 3px"。

卡牌字号特意设为 `base + 8`（远大于正文），因为卡牌游戏要求卡名一眼可读、信息少而精准。

### 2. 三档字号选择器 `FontSizer`

替代旧版下拉列表，改用三个 A 按钮（视觉上大小递增）：

```
[A]  [A]  [A]
14   16   18
```

- 点击即切换，当前档位高亮主题色边框
- 组件通过 `fontSize`、`onFontSize`、`c`（颜色 token）三个 props 驱动
- 两个应用均在顶部工具栏右侧区域放置

### 3. 状态提升到 App 根组件

`fontSize` 状态在两个应用均提升至根 `App` 组件，通过 props 下传，并持久化到 `localStorage`：

- Game：存于 `game_persist` key
- Sim：存于 `sim_prefs` key

Ant Design ConfigProvider 的 `fontSize` token 也随之动态变化，影响所有 antd 组件字号。

## 后果

- ✅ 任意字号调整只需改一处，所有子组件自动跟随
- ✅ 三档选择比下拉列表更直观，点击区域更大，适合触屏
- ✅ 持久化后刷新不丢失用户偏好
- ⚠️ `base - 5`（即 9px）在 base=14 时可能过小，日后可加下限保护
- ⚠️ 卡牌字号 `base + 8` 在 base=18 时为 26px，在窄卡宽（132px）下需注意换行
