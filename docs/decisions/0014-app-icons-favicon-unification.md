# 0014 — 应用图标重设计 + 浏览器标签图标统一

**状态**：✅ 已实施  
**日期**：2026-04-05

## 背景

两个应用的图标过于简单，缺乏识别度。浏览器标签页图标（favicon）与应用内顶栏图标使用不同的 SVG，且 game 的 `index.html` 仍指向 Vite 默认图标（`/vite.svg`）。

## 决策

### 1. 双图标体系

| 图标 | 应用 | 含义 |
|------|------|------|
| **HeartPulseIcon** | sim_gui | 心脏（左）+ QRS 波形（右出） — 模拟器/生命体征 |
| **CardPulseIcon** | game | 卡牌轮廓 + 心形花色 + QRS 波形（内嵌） — 卡牌游戏 |

设计原则：两个图标共享"心电图 QRS 波"母题，建立系列感；通过容器（心脏 vs 卡牌）区分应用身份。

### 2. HeartPulseIcon SVG 路径（viewBox 0 0 32 32）

```svg
<!-- 心脏：尖端朝下 (11,22)，双叶峰顶 y=7 -->
<path d="M11,22 C6,17.5 2,14.5 2,12 A6,6 0,0,1 11,7 A6,6 0,0,1 20,12
         C20,14.5 16,17.5 11,22 Z" stroke-width="2.2"/>
<!-- QRS 波形从心脏右侧中线出发 -->
<path d="M20,15 L22,15 L22.5,17 L23.5,9 L24.5,19 L25.5,15 L30,15"
      stroke-width="2"/>
```

### 3. CardPulseIcon SVG 路径（viewBox 0 0 24 24）

```svg
<!-- 卡牌外框，圆角矩形 -->
<rect x="4" y="2" width="16" height="20" rx="2.5" stroke-width="1.8"/>
<!-- 心形花色，居中偏上 -->
<path d="M12,12.5 C9.5,10.5 7.5,9 7.5,7.5 A3,3 0,0,1 12,5
         A3,3 0,0,1 16.5,7.5 C16.5,9 14.5,10.5 12,12.5 Z"
      stroke-width="1.6"/>
<!-- QRS 波形横穿卡牌底部 -->
<path d="M5.5,17 L8,17 L8.5,18.5 L9.5,13.5 L10.5,19.5 L11.5,17 L18.5,17"
      stroke-width="1.8"/>
```

### 4. Favicon 与应用图标统一

- `sim_gui/public/favicon.svg`：写入 HeartPulseIcon 静态 SVG（`stroke="#52c41a"`）
- `game/public/favicon.svg`：写入 CardPulseIcon 静态 SVG（`stroke="#52c41a"`）
- `game/index.html`：`href="/vite.svg"` → `href="/favicon.svg"`
- 删除 `game/public/vite.svg` 和 `sim_gui/public/vite.svg`（Vite 默认图标）

静态 SVG 使用 HTML 属性命名（`stroke-width`、`stroke-linecap`），而非 JSX camelCase，确保浏览器直接解析正确。

## 后果

- ✅ 浏览器标签、书签、应用顶栏三处图标完全统一
- ✅ 两个图标共享 QRS 波母题，一眼可识别为同系列产品
- ✅ 纯 SVG，不依赖字体或外部资源，缩放无损
- ⚠️ QRS 波在 16×16 favicon 尺寸下细节减少，但整体轮廓仍清晰
