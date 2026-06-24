# 0029 — 响应式游戏布局、draw_per_turn 与 copies 牌组配置

**状态**: ✅ 已实施  
**日期**: 2026-04-15  
**作者**: shenfan19

---

## 背景

三个相互关联的问题在同一批次解决：

1. **布局固定宽度**：游戏仅为桌面横屏设计，半屏笔记本、平板、手机均无法正常显示。
2. **手牌无法区分"发牌数"与"上限"**：原设计 `hand_size` 同时充当发牌数和手牌上限，无法设计"每回合只抽3张但手牌可以保留6张"的策略层。
3. **每种卡牌只能放1张入牌组**：`player_deck` 中每个 `path` 项仅加载一次，无法配置"放5张演讲牌"等常见卡牌游戏设计。

## 决策

### 1. 响应式布局（两个断点）

```
isNarrow: window.innerWidth < 900px   ← 半屏笔记本、竖屏平板
isMobile: window.innerWidth < 600px   ← 手机竖屏
```

**宽屏（≥ 900px）**：原三列布局（左侧日志栏 168px｜主区域｜右侧牌堆列 ~150px）。

**窄屏（< 900px）**：
- 隐藏左侧日志栏，改为底部抽屉（`logDrawerOpen` 开关）
- 隐藏右侧牌堆列，改为顶部栏内联 `DeckBadge`（彩色小徽章显示牌数）
- 顶部栏压缩：隐藏副标题和分割线，Story 名称截断
- 手牌区改为 `flex-wrap` 多行排列

**移动端（< 600px）**：
- 顶部隐藏 Logo 图标和 App 名称，只保留 Story 名和操作点
- 卡牌按比例缩小

断点通过 `window.addEventListener('resize', ...)` 响应窗口变化。

### 2. draw_per_turn — 发牌数与手牌上限分离

在 `game_story.yaml` 的 `turns` 块新增可选字段 `draw_per_turn`：

```yaml
turns:
  player_hand_size: 6   # H — 回合结束时的手牌上限（超出需弃牌）
  action_points:    3   # p — 每回合可出牌次数
  draw_per_turn:    3   # a — 每回合发牌数（可选，默认 = hand_size）
```

设计意图：`draw_per_turn = a`，则回合结束手牌量 ≈ `H - a`（保留策略纵深）。

Loader 读取：

```typescript
draw_per_turn: rawStory.turns?.draw_per_turn ?? undefined
```

`undefined` 时游戏端回退到 `hand_size` 作为发牌数（向后兼容）。

### 3. copies — player_deck 牌组倍数

`player_deck` 中每个 `path` 项新增可选 `copies` 字段：

```yaml
player_deck:
  - path: cards/player_speech.yaml
    copies: 5    ← 放 5 张演讲牌入牌组
```

Loader 实现：

```typescript
const copies = entry.copies ?? 1;
const base = toPlayerCard(card);
for (let i = 0; i < copies; i++) {
  playerCards.push(copies > 1 ? { ...base, id: `${base.id}_${i + 1}` } : base);
}
```

`copies > 1` 时自动为重复牌追加 `_1`、`_2`…后缀，确保 `id` 唯一。

所有现有 social story 同步补充了 `draw_per_turn` 和 `copies` 字段。

## 设计取舍

**为何不用 CSS media query 而用 JS 断点**：游戏布局依赖 JS 条件（如抽屉 state、徽章数量），纯 CSS 难以同步控制组件级别的显示/隐藏和状态管理。JS 断点更易维护一致性。

**draw_per_turn 为何可选**：旧 story（`hand_size = draw_per_turn`）不需要改动。新 story 显式设置，形成"保留牌"的策略空间（`buffer = H - a`）。

**copies 而非直接写多个 path**：避免重复配置，语义清晰（"5张演讲牌"而非写5行相同的 path），与常见卡牌游戏引擎约定一致。
