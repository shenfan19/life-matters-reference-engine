# ADR 0059 — 顶部导航重命名与标签排序

**日期：** 2026-05-05  
**状态：** 已接受  
**范围：** sim_gui 顶部导航栏

---

## 背景

顶部导航标签的命名与排序存在两个问题：

1. **命名不够准确**："Mod Builder"来自早期"mod"概念，现在模型体系已明确为 YAML 模型，应称 "Model Builder"；"Card Builder / Card Game"是早期卡牌游戏的命名，现在游戏层有独立定位，应与 sim 层的命名风格一致区分为编辑器与播放器。

2. **排序不符合使用流程**：用户通常先在 Model Builder 中选择或查看模型，再切换到 Simulator 运行仿真。原顺序 [Simulator, Model Builder, Game Builder] 把最高频入口放在了中间。

---

## 决定

### 标签排序

| 位置 | 标签 ID | 新标签名 | 原标签名 |
|------|---------|---------|---------|
| 第一 | `tools` | Model Builder / 模型构建 | Mod Builder / 模组构建 |
| 第二 | `simulator` | Simulator / 仿真器 | Simulator / 仿真器（不变） |
| 第三 | `story` | Game Builder / 游戏构建 | Card Builder / 卡牌构建 |
| 按钮 | — | Game Player ↗ / 游戏 ↗ | Card Game ↗ / 卡牌游戏 ↗ |

**默认页面仍为 `simulator`（第二标签）**，符合"快速进入仿真"的主要使用习惯。

### Simulator 标签名与副标题随模式动态切换

Simulator 标签内部通过 Segmented 控件切换 Sim / Opt 两种模式。  
顶部标签名与标题栏副标题均跟随模式变化：

| 模式 | 标签名 | 副标题 |
|------|--------|--------|
| sim | Simulator / 仿真器 | Medical & Social Simulation System |
| opt | Optimizer / 优化器 | Medical & Social Optimization System |

**理由：** 标签名与副标题联动，给用户双重模式反馈，与内部 Segmented 控件状态一致。将副标题锁定为 "Optimization System" 会导致 sim 模式下语义矛盾，故两处均保持动态。

---

## 影响

- `sim_gui/src/App.tsx`：tabs 数组重排；Simulator 标签 label 保留动态切换逻辑
- `public/locales/sim/en.json`：`menu.tools`、`menu.story`、`button.go_game`、`button.go_game.tip`
- `public/locales/sim/zh-CN.json`：同上
- `public/locales/sim/zh-TW.json`：同上

---

## 备选方案

**顶部标签统一显示 "Simulator"**：曾短暂实施后撤销。顶部标签反映当前模式能提供更直接的状态反馈，优于保持固定名称。
