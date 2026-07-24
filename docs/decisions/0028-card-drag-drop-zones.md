# 0028 — 卡牌区域拖拽系统

**状态**: ✅ 已实施  
**日期**: 2026-04-15  
**作者**: shenfan19

---

## 背景

出牌交互仅支持点击，玩家无法直观地调整牌的分配：

- 已打出的牌想收回，需要特殊操作（回召按钮仅限部分场景）
- 无法通过手势快速判断"这张牌打还是弃"
- 点击操作在触屏设备上缺乏区域感知

## 决策

在玩家回合期间，`GameCard` 支持完整的拖拽交互，覆盖三个区域：**手牌区（Hand）**、**出牌区（Play）**、**弃置区（Discard）**。

### 拖拽状态

```typescript
dragOverDiscard: boolean   // 鼠标悬停在弃置区
dragOverPlay:    boolean   // 鼠标悬停在出牌区
dragOverHand:    boolean   // 鼠标悬停在手牌区
dragSource:      'hand' | 'played' | 'discard' | null
```

### `GameCard` 新增 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `draggable` | `boolean` | 是否启用拖拽 |
| `onDragStart` | `DragEventHandler` | 拖拽开始，写入 `cardId` + `dragSource` 到 dataTransfer |
| `onDragEnd` | `DragEventHandler` | 拖拽结束，清除所有 dragOver 状态 |
| `onContextMenu` | `MouseEventHandler` | 右键菜单（预留，当前与 drag 行为一致） |

拖拽时鼠标样式变为 `grab`。

### 区域间移动逻辑

| 来源 → 目标 | 函数 | 行为 |
|------------|------|------|
| Hand → Discard | `stageDiscard(card)` | 移入 stagedDiscards，playsLeft 不变（未出牌） |
| Play → Discard | `movePlayedToDiscard(cardId)` | 撤销出牌效果，playsLeft +1，移入 stagedDiscards |
| Discard → Play | `moveDiscardToPlayed(cardId)` | 重新计算效果，playsLeft -1 |
| Discard → Hand | `unstageDiscard(cardId)` | 移回手牌 |

**跨区移动均重新计算 `gs`**：从 `turnInitGs` 出发，依次应用当前 Board 被动牌和 Play 区已出牌效果，确保状态一致。

### Drop Zone 处理

每个区域通过 `onDragOver`（`e.preventDefault()` 允许 drop）+ `onDrop` 处理放置，`onDragLeave` 清除高亮。Drop 区在 `dragOverXxx` 为 true 时显示高亮边框，提供视觉落点反馈。

## 设计取舍

**为何选 HTML5 Drag API 而非 pointer events 手写**：HTML5 drag API 在桌面浏览器支持完善，无需第三方库，dataTransfer 天然隔离拖拽数据。缺点是移动端不支持原生拖拽，移动端改用点击交互（✕ 按钮）覆盖。

**为何保留点击路径并行**：拖拽是锦上添花，不能作为唯一交互方式。✕ 按钮和回召按钮保留，盲目依赖拖拽会让触屏用户无法操作。
