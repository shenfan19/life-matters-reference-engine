# ADR 0079 — Sim/Opt 工作区布局：4:6 百分比分列

**日期**：2026-05-18
**状态**：已决定
**范围**：LM-Simulator sim_gui — `WorkspacePage` 组件

---

## 背景

Simulation 和 Optimization 标签页需要将操作面板（Setup/Inputs）与结果面板（Plot/Opt）并排展示。

历史演变：
1. 最初使用 `width: '34%'`（百分比，上限 440px）——比例合理，但有上限硬值
2. 改为 `useResize(390, 220, 700)` 拖拽固定像素——解决了"太窄"的问题，但引入了新问题：opt 运行时，`optElapsed` / `optHistory` 频繁 setState 触发重渲染，百分比 34% 相对容器重新计算，出现明显 flickering
3. 本次：改为 flex 百分比固定比例，去掉拖拽

---

## 问题

- 固定像素宽度（390px）在窄屏（< 700px 中央面板）时 setup 面板占比过大
- 拖拽分隔线（`useResize`）在 opt 持续轮询场景下产生宽度 flickering
- 当时"全宽修复"（`flex: 1` 补全整条宽度链）同步解决了根本问题，百分比布局因此可以可靠工作

---

## 决定

`WorkspacePage` 内部采用 **flex 百分比固定比例**，暂定 4:6：

```jsx
// Setup（输入、事件配置）
<div style={{ flex: '0 0 40%', minWidth: 0, overflow: 'hidden' }}>

// Result（图表、Pareto 前沿）
<div style={{ flex: '0 0 60%', minWidth: 0, overflow: 'hidden' }}>
```

两栏 `gap: 8px`，外层 `padding: 6px 10px`。

### 选择 4:6 而非其他比例

| 比例 | 问题 |
|------|------|
| 3:7 | Setup 面板过窄，输入事件列表难以操作 |
| 5:5 | Result 面板偏窄，图表展示受限 |
| **4:6** | 1200px 和 800px 屏宽下均保持可用性，经验证通过 |

### 放弃拖拽

`useResize` 拖拽增加了组件状态（resize state + MouseEvent handlers），且在 opt 高频更新场景下仍有 flickering 风险（即使改为像素也可能因父容器重绘触发）。百分比布局无需拖拽即可适配屏幕宽度变化。

若未来需要用户可调节比例，可在 Simulator 层用一个 `[0.4, 0.6]` 的 state 驱动两栏 flex-basis，配合防抖避免高频刷新。

---

## 不影响的部分

- Overview、Report 标签：不使用 `WorkspacePage`，布局不变
- 左侧模型面板：仍使用 `useResize(280, 160, 400)` 像素拖拽（低频操作，无 flickering 风险）

---

## 影响

- `sim_gui/src/components/Simulator.tsx`：`WorkspacePage` 去掉 `setupW / startSetupDrag / c` props，内部硬编 40%/60%；移除对应 `useResize` 调用
- `docs/ui_guidelines.md`：§1.0 全宽原则补充了百分比分列规范
