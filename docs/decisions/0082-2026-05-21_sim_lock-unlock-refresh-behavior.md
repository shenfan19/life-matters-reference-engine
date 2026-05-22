# 0082 · 2026-05-21 · Sim · 锁定/解锁/切换模型的会话状态设计

## 背景

原始问题：用户在 GUI 中编辑 inputEvents 后点击锁定，编辑内容被重置为 YAML 默认值。
根本原因：`inputEvents`（用户会话）和 `selectedModel`（模型结构）耦合在同一个 `useEffect` 里，
任何触发 `selectedModel` 变更的操作（包括锁定时的 YAML 重读）都会无条件重置用户状态。

讨论中还发现两个额外问题：
- 运行时可以通过树视图的锁图标解锁，无任何拦截或提示
- 切换到其他模型再切回来，之前的编辑数据全部丢失

## 核心架构决策：两层分离

将 Simulator 的状态分为性质不同的两层：

```
层1  modelContent[key]   YAML 结构（loadFileContent 刷新，只读）
层2  modelSession[key]   用户会话（用户编辑驱动，持久化到 localStorage）
```

**层2 的内容（ModelSession 类型）：**
- `inputEvents` / `plans` / `activePlanId`
- `simStartDate` / `simEndDate` / `stepValue` / `stepUnit`
- `objectives` / `constraints` / `optAlgo` / `optPop` / `optGen`

**实现方式：**
- `modelSessionsRef = useRef<Record<string, ModelSession>>(initModelSessions())`
  在组件初始化时从 localStorage (`lm_model_sessions`) 读取，并迁移旧格式的全局 `inputEvents`。
- 持续更新：每当 session 字段变化，写入 `modelSessionsRef.current[selectedKey]` 并同步到 localStorage。
- `useEffect([selectedModel])` 重构为三段：
  1. 永远执行：解析模型结构 → `inputParams`、`stateVariables`、`optRanges`
  2. 永远执行：从 YAML 预加载 opt 结果（Pareto 图表数据）
  3. 有 session → restore；无 session → 从 YAML 初始化（首次加载）

## D1：锁定时保留用户编辑

**原来的方案（已废弃）：** `skipInputReinitRef` flag 打补丁。

**新方案：** 锁定调用 `loadFileContent`，触发 `useEffect([selectedModel])`，
但 `modelSessionsRef.current[key]` 已有最新的用户状态，直接 restore，YAML 默认值不再生效。
flag 不需要了，架构自然解决。

## D2：切换模型后回来保留会话

会话连续写入 `modelSessionsRef`，切换到新模型时旧模型的 session 保留在 map 里。
切回旧模型时 `useEffect` 找到 session 直接 restore，数据不丢失。

## D3：刷新到 YAML 默认值

"Reset to YAML" 按钮（Inputs 卡片标题栏的 `⟳` 图标）：
先 `delete modelSessionsRef.current[key]`，再调用 `loadFileContent`。
`useEffect` 找不到 session，走 YAML 初始化路径。

## D4：运行时解锁弹确认框

`SimModelTree` 新增 `isSimulating` prop。
解锁点击统一走 `handleUnlock()`：
- `isSimulating` 为 false → 直接解锁
- `isSimulating` 为 true → `Modal.confirm` 弹出确认（"解锁将终止仿真，确认吗？"），用户确认后才执行 `onUnlock`

## D5：锁定状态不跨刷新持久化

YAML 可能在刷新期间被外部修改，还原旧的锁定状态会绕过验证。
页面刷新后始终从解锁状态开始，用户需重新点击锁图标验证。

## 被否决的方案

**继续用 `skipInputReinitRef`：** 治标不治本，每个新场景需要新 flag。

**session 只存内存不写 localStorage：** 页面刷新后数据丢失，不如 game 的持久化体验。

**unlock while running 直接禁用按钮：** 用户确实可能需要紧急中止，弹确认比禁用更好。
