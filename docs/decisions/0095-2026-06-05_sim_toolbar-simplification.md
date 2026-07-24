# ADR 0095 — Sim Toolbar Simplification: Remove Step, Restrict Reset

**Date:** 2026-06-05  
**Status:** Accepted  
**Context:** sim_gui — SimControlBar

---

## Context

SimControlBar 原有三个运行控制按钮：Run/Pause、Step（单步）、Reset（重置）。  
Step 来自工程习惯，Reset 在引入 auto-snapshot 后产生了副作用。

---

## Decision

### 1. 移除 Step 按钮

LM 的仿真特征使单步调试没有实用价值：

- **步长是分钟/小时/天**：步进一次看到的是"血糖从 5.20 变 5.21 mmol/L"——无可解读信息
- **时间跨度是月到年**：调试应通过缩短 `end_date` 跑完整轨迹，而非逐步点击
- **Euler 离散积分**：公式是数学表达式，没有"断点"或离散状态转换，单步无意义
- **后端是 API 调用**：单步 = 每步一次 HTTP 请求，与模型规模不匹配

完整移除：`useSimulation.ts` 中的 `runSingleStep`，SimControlBar 中的 JSX、interface prop、icon import。

### 2. Reset 仅在运行中可用

引入 auto-snapshot 后，Reset 在 `completed` 状态下会清除当前结果但**不触发快照**，造成数据丢失陷阱。

新规则：`disabled={!isRunning && !isPaused}`

| 状态 | Reset 状态 | 语义 |
|------|-----------|------|
| idle | 禁用 | 无内容可重置 |
| running / paused | **可用** | 中止并清空当前未完成的跑 |
| completed | 禁用 | 用 Run 开始下一次（自动快照当前结果） |

### 3. Sim / Opt 工具栏对称性

两个标签页各保留两个运行控制：

| | 主操作 | 辅助控制 |
|---|---|---|
| **Sim** | Run / Pause（同一按钮） | Reset（仅运行中） |
| **Opt** | Run / Stop（同一按钮） | 继续计算 checkbox |

Opt 的 checkbox 是启动前配置；Sim 的 Reset 是运行中中止。语义不同，视觉上两边各两个控件，工整对称。

---

## Consequences

### Removed
- `runSingleStep` 函数（`useSimulation.ts`）
- Step 按钮及其 `sessionId` prop（后者仅用于禁用 Step 按钮）
- `StepForwardOutlined` icon import

### Changed
- Reset 按钮 disabled 条件：`status === 'idle'` → `!isRunning && !isPaused`
