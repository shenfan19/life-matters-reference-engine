# 0085 · 2026-05-25 · Sim · 移除锁机制、自由切换模型与运行中指示器

**取代**：ADR 0082（锁定/解锁/切换模型的会话状态设计，D3–D5 章节）

---

## 背景

ADR 0082 确立了两层状态分离架构（modelContent / modelSession），并在此基础上引入了"锁定"作为运行前的验证门禁。随着使用，锁机制暴露出以下问题：

1. **增加无意义摩擦**：每次运行前必须点击锁图标，而锁的本质作用（保存 session）ADR 0082 的架构本已自动完成。
2. **切换模型被拦截**：运行时点击其他模型会弹出"中止并切换"确认框，用户无法自由浏览其他模型。
3. **运行中任务被意外终止**：`loadFileContent` 在切换模型时无条件调用 `stopAllJobs()`，导致用户切走后任务直接停止。
4. **云端限制表达方式错误**：单线程限制（SCS 模式）用"禁止切换"来表达，但真正需要限制的是"不能同时发起两个运行"，而非"不能查看其他模型"。

---

## 决策

### D1：彻底移除锁/解锁机制

删除所有与锁相关的状态和 UI：

- 删除 `isLocked`、`setIsLocked`、`handleValidateAndLock`
- 删除 `validateModelFile` 调用（仍保留后端接口，但不在主流程强制调用）
- 删除 `LockOutlined`、`UnlockOutlined` 图标
- 树节点选中状态仅显示高亮背景条，不显示任何图标

> 锁的唯一价值是"防止切换时丢失编辑"，该问题已由 ADR 0082 的 modelSession 架构解决。

### D2：模型切换完全自由

`handleSelect`、`onSelectSessionModel` 直接执行切换，不再经过 `guardedSwitch` 拦截。

`loadFileContent` 不再调用 `stopAllJobs()`：

```ts
// 旧：切换时杀掉后台任务
const loadFileContent = async (filePath, opts) => {
  if (selectedKey && selectedKey !== filePath) stopAllJobs(); // ← 删除
  ...
};
```

切换后后台任务继续运行，`runningModelKey` 保持不变，运行中指示器持续可见。

### D3：运行中指示器（Running Indicator）

取代锁图标的新视觉反馈：当某个模型正在运行时，在树中该模型文字左侧显示动态双箭头。

**布局规则**：
- 箭头使用 `position: absolute; right: 100%` 相对于文字 `span`，不占用流式空间
- 所有模型的文字左边缘对齐，箭头突出到文字列左侧（利用树缩进空余空间）
- 字号 `fontSize: '1em'`，随用户字号设置自动缩放

**动画**：CSS keyframes 两个 `CaretRightFilled` 错位 0.25 s，形成向右推进的波浪效果：

```css
@keyframes lm-arrow-run {
  0%, 100% { transform: translateX(0); opacity: 1; }
  50%       { transform: translateX(3px); opacity: 0.4; }
}
.lm-running-arrow  { animation: lm-arrow-run 0.8s ease-in-out infinite; }
.lm-running-arrow2 { animation: lm-arrow-run 0.8s ease-in-out 0.25s infinite; }
```

**四处渲染位置**（均点击可跳转至运行模型）：
1. 树视图：叶节点标题左侧
2. Session 列表：模型名左侧
3. Flat list 视图：模型名左侧（同时移除 `BookOutlined` 图标，统一对齐）
4. 顶部运行条（strip）：条目最左侧，字号稍大

### D4：云端模式运行拦截

SCS 模式下，当另一个模型正在运行时，禁止在当前模型上发起新运行，但**不禁止切换**：

```ts
const blockIfRunning = (): boolean => {
  if (!scsMode || !runningModelKey || runningModelKey === selectedKey) return false;
  Modal.confirm({
    title: t('sim.run.blocked_title'),   // "无法启动运行"
    content: t('sim.run.blocked_content'), // "当前有模型正在运行，请先前往停止后再启动"
    okText: t('sim.run.goto_running'),   // "前往停止"
    onOk: navigateToRunning,
  });
  return true;
};
```

- `startSimulation`、`runAllPlans`、`startOptimization` 三处均在首行调用
- `isOtherRunning = scsMode && !!runningModelKey && runningModelKey !== selectedKey`
- 运行按钮在 `isOtherRunning` 时 `disabled`，Tooltip 显示"请先前往「X」停止运行后再启动"
- 按钮显示"Run"（而非 Pause/Stop），因为那是另一个模型的任务状态，与当前模型无关

### D5：删除的死代码

| 删除项 | 说明 |
|--------|------|
| `isLocked` / `setIsLocked` state | 无 lock 后无需此状态 |
| `validating` / `validationResult` state | 仅锁图标使用 |
| `handleValidateAndLock()` | 锁入口函数 |
| `validateModelFile` import | 仅此函数调用 |
| `guardedSwitch()` | 切换拦截器 |
| `LockOutlined` / `UnlockOutlined` import | SimModelTree |
| `BookOutlined` import | SimModelTree flat list（移除图标） |
| `isLocked` / `setIsLocked` in `LoaderProps` / `SimulatorProps` | types.ts |

---

## 影响文件

- `sim_gui/src/types.ts` — 删除 `LoaderProps`/`SimulatorProps` 中 `isLocked`/`setIsLocked`
- `sim_gui/src/App.tsx` — 删除 `isLocked` state 及传参
- `sim_gui/src/components/SimPlotTab.tsx` — 删除 `isLocked` prop
- `sim_gui/src/components/SimModelTree.tsx` — 全面重写指示器；新增 CSS keyframes；删除锁图标
- `sim_gui/src/components/Simulator.tsx` — 删除锁逻辑；新增 `runningModelKey`、`blockIfRunning`；`loadFileContent` 移除 `stopAllJobs`
- `sim_gui/public/locales/sim/*.json` — 新增 `sim.run.blocked_title/content/goto_running`；删除 `sim.tree.lock_tip/unlock_tip*`（保留但不再使用）

---

## 被否决的方案

**保留锁但设为可选**：锁本身没有实际保护作用，可选的锁等于没有锁，徒增 UI 噪声。

**切换时暂停而非继续**：在后台轮询期间暂停仿真需要引入 suspend/resume 机制，增加复杂度，且用户期望"后台跑完"而非"切走就暂停"。

**SCS 模式禁止切换（旧行为）**：表达方式不准确——限制的应该是"并发运行数"，而非"能否查看其他模型"。
