# 0027 — 手牌弃置机制与界面重组

**状态**: ✅ 已实施  
**日期**: 2026-04-15  
**作者**: shenfan19

---

## 背景

旧版游戏流程存在以下问题：

1. **弃牌阶段割裂**：`phase` 枚举包含 `'player' | 'env' | 'discard'`，弃牌是独立阶段，玩家在回合结束后被迫进入专门的弃牌步骤，体验割裂。
2. **无法主动弃牌**：玩家出完牌后只能等待，不能主动放弃不需要的牌。
3. **对手手牌透明**：环境手牌正面朝上显示，失去了"命运未知"的悬念感。
4. **无动画反馈**：发牌、出牌、环境揭示均无动画过渡。

## 决策

### 1. 弃牌机制内联化（Staged Discard）

废弃独立的 `'discard'` phase，弃牌变为玩家回合内的随时操作：

- 新增 `stagedDiscards: PlayerCard[]` 状态，存放本回合预备弃置的牌
- 手牌每张右下角新增 **✕** 按钮（`onDiscard` 回调）
- 点击 ✕ 将牌移入 `stagedDiscards`，同时释放一个出牌点（`playsLeft + 1`）
- 回合结束时 `stagedDiscards` 与 `playerDiscard` 合并，区别于正常出过的牌
- `DashedSlot` 新增 `'discard'` variant（灰色 `#8c8c8c`，显示"放弃"）

```
phase: 'player' | 'env'     ← 不再有 'discard'
stagedDiscards: PlayerCard[] ← 新增
```

### 2. 环境手牌改为牌背显示

环境手牌（`envHand`）不再正面展示，改为显示故事专属牌背图片（`cardBackFate`）。揭示时才翻面，还原"命运抽签"的悬念感。

### 3. 动画状态

新增三个动画辅助状态（不影响游戏逻辑）：

| 状态 | 类型 | 用途 |
|------|------|------|
| `newlyDealtMap` | `Map<cardId, staggerIndex>` | 发牌进场动画，按错位时序入场 |
| `lastStagedId` | `string \| null` | 标记刚出到 Play 区的牌，触发入场动画 |
| `revealAnimIds` | `Set<string>` | 本回合正在揭示的环境牌 ID |

## 设计取舍

**为何移除独立 discard 阶段**：玩家需要在回合结束后才能弃牌，导致策略判断延迟。内联弃牌让玩家可以在出牌途中随时调整手牌结构，与主流卡牌游戏惯例一致（炉石、杀戮尖塔均无独立弃牌阶段）。

**为何不直接移除而是暂存（staged）**：`stagedDiscards` 与 `playerDiscard` 分开，是为了在 End Turn 时对两类弃牌做不同的日志记录，未来也可以支持"弃牌触发效果"。

**环境手牌牌背**：保留信息不对称是卡牌游戏核心张力之一。正面展示环境牌相当于提前剧透，失去决策意义。
