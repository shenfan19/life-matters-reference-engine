# ADR 0089 — Session 精化：`useSession` 分离、`userEdited` 追踪、Warm-start Dirty 检测、非活跃模型 Opt 隔离

**日期**：2026-05-30  
**状态**：已实施  
**范围**：LM-Simulator 前端（`sim_gui/`） + 仿真引擎 (`sim_engine/`)  
**修订**：ADR 0082 D3 小节（刷新到 YAML），ADR 0077（session 模型重载按钮）

---

## 背景

本轮变更解决了四个独立但相关的问题：

1. **Session 逻辑散落**：`readMS`、`writeMS`、`initModelSessions`、`modelSessionsRef`、`sessionReadyRef` 全部写在 `simUtils.ts` 和 `Simulator.tsx` 中，职责不清晰，难以维护。

2. **无法区分"原始"与"已编辑"**：用户打开模型后只是看看但未改动，和用户运行了仿真/修改了 inputEvents，在 localStorage 里无从区分——模型树没有视觉反馈，用户不知道哪些模型有本地修改。

3. **Warm-start 无退化提示**：用户运行过一次优化后，若修改了目标函数、约束或决策变量的搜索范围，"继续计算"仍显示绿色，用户不知道上次前沿与当前问题定义已经不匹配。此外，"继续计算"checkbox 只在 `hasExistingResults` 时才出现，首次加载时无法提前感知状态。

4. **非活跃模型 Opt Tab 显示混乱**：用户切换到模型 B 浏览时，若模型 A 正在运行优化，模型 B 的 Opt Tab 会显示模型 A 的实时 Gen 计数器和 Log，造成混淆。

另：warm-start 在部分场景下无法正确读取 YAML 中的 `optimizer.results`，导致含结果的模型加载后热启动复选框仍为 false。

---

## 决策

### D1：`useSession.ts` — Session 管理独立成 Hook

将 `simUtils.ts` 中的 session 相关逻辑全部迁移到 `sim_gui/src/components/sim_tab/useSession.ts`：

**导出的 API：**

```ts
// 工具函数（模块级，可单独 import）
readMS(): Record<string, ModelSession>
writeMS(sessions): void

// Hook
useSession() → { modelSessionsRef, sessionReadyRef, persistSession, clearSession, getSession }
```

| 方法 | 职责 |
|------|------|
| `persistSession(key, session)` | 写入 ref + 写入 localStorage |
| `clearSession(key)` | 从 ref + localStorage 删除 |
| `getSession(key)` | 读取 ref 中的 session |

`initModelSessions()` 保留在 `useSession.ts`，负责首次加载时从 localStorage 恢复，并迁移旧格式（`sim_persist` 全局 inputEvents）。

`simUtils.ts` 删除对应的 `readMS`、`writeMS`、`initModelSessions` 导出，避免双重维护。

---

### D2：`userEdited` Flag — 区分"原始"与"已编辑" Session

**新增字段：** `ModelSession.userEdited?: boolean`

`sessionEditedRef = useRef(false)` 在以下操作发生时设为 `true`：
- 新增 / 修改 / 删除 inputEvent
- 点击"运行仿真"（`startSimulation`）
- 点击"运行优化"（`startOptimization`）

每次保存 session 时，`userEdited: sessionEditedRef.current` 一并写入。

**模型树 `(edited)` 标记：**

`Simulator.tsx` 计算 `sessionKeys`：从 localStorage 所有 session 中筛选 `userEdited === true` 的 key，传给 `SimModelTree`。树在模型名后显示小字 `(edited)`（`c.primary` 色 + italic，`0.75em`），仅视觉提示，不影响功能。

```tsx
const sessionKeys = new Set(
  Object.entries(readMS())
    .filter(([, s]) => !!(s as any)?.userEdited)
    .map(([k]) => k)
);
```

---

### D3：Warm-start Dirty 检测

**问题定义 Signature：**

```ts
buildProblemSignature(objectives, constraints, inputEvents) → string
```

由目标函数 + 约束 + 所有决策变量的搜索范围（T1/T2/T3/T4 参数）拼接成一条字符串。

**状态：**

- `lastRunSignature`：最近一次点击"运行优化"时记录的 signature
- `warmStartDirty = lastRunSignature !== null && currentSignature !== lastRunSignature`

**UI 行为：**

| 状态 | checkbox 显示 |
|------|--------------|
| 无已有结果 | 灰色 disabled，Tooltip 说明无法热启动 |
| 有结果，问题未改变 | 绿色"继续计算" |
| 有结果，问题已改变 | 橙色"⚠ 继续计算"，Tooltip 警告匹配度下降 |

"继续计算"checkbox 从原来"仅 `hasExistingResults` 时显示"改为**始终可见**（无结果时 disabled），让用户在运行前就能感知热启动状态。

**重置：** 切换模型时 `lastRunSignature` 清空。

---

### D4：`isActiveModel` — 非活跃模型 Opt Tab 隔离

`SimOptTab` 新增 `isActiveModel?: boolean` prop（默认 `true`）。

当 `isActiveModel === false`（即当前查看的模型不是正在运行优化的模型）时：

```ts
const activeRunning = isActiveModel && optRunning;  // 实时 running 状态
const activeHistory = isActiveModel ? optHistory : [];  // 实时历史
const activeLogs    = isActiveModel ? optLogs    : [];  // 实时 log
const activeCurGen  = isActiveModel ? optCurGen  : 0;
```

效果：非活跃模型的 Opt Tab 显示空 log、空历史图表、Gen 计数为 0，但**保留已完成的 `optResult`**（来自 session 或 YAML），不显示其他模型的实时数据。

---

### D5：Warm-start 结果读取 `rawContent` Fallback（Bug Fix）

部分场景下（import 合并后的模型），`selectedModel.content.optimizer` 不含 `results` 块，但 `rawContent.optimizer.results` 有。

修复：

```ts
const rawResults = optBlock?.results ?? selectedModel?.rawContent?.optimizer?.results;
```

相关的所有 `optBlock.results` 引用统一改为 `rawResults`：
- warm-start 复选框初始化
- warm-start Modal 弹窗的 `reference.x` 读取
- 传给 `xToInputEvents` 的 optBlock 参数加 fallback

---

### D6：SimModelTree 精简

移除了两处被认为噪音大于价值的 UI 元素：

1. **运行状态条（running model status strip）**：树顶部绿色背景的"XX 正在运行"条，功能与树节点左侧双箭头 indicator（ADR 0085 D3）重复，移除。

2. **Session 模型的关闭按钮（×）**：用户上传的 session 模型可通过"重载"或直接忽略清理，主动关闭按钮增加误操作风险，移除。

---

### D7：OptControlBar 按钮顺序重排

新顺序（左→右）：

```
[运行/停止] [继续计算 checkbox] [Gen 计数] ... [参数控件] | [保存结果] [重载] | [YAML下载]
```

原顺序是 `[YAML下载] [重载]`，调整为先保存结果再下载，与用户工作流（运行→保存→下载）一致。

"保存结果"按钮（`SaveOutlined`）：
- `scsMode = true`：保存到 session（`message.success`）
- `scsMode = false`：调用 `saveResultsToFile`（写回 YAML）
- 无 optResult 时 disabled

---

### D8：Opt Log 复制/导出

`SimOptTab` Log panel 新增两个按钮（右上角）：
- **复制**（`CopyOutlined`）：`navigator.clipboard.writeText(logText)`
- **导出 .txt**（`DownloadOutlined`）：文件名 `opt_log_<ISO时间>.txt`

按钮在 `activeLogs.length === 0` 时 disabled。

---

### D9：Session 模型 `reloadFromYAML` 路径

ADR 0082 D3 描述的"刷新到 YAML 默认值"流程，现在对 `session/` 模型有独立处理路径：

```ts
const reloadFromYAML = () => {
  clearSession(selectedKey);
  sessionReadyRef.current = false;
  sessionEditedRef.current = false;
  if (selectedKey.startsWith('session/')) {
    // Session 模型：重新 setConfirmedModel 触发 YAML 重解析
    const sessModel = sessionModels.find(m => m.key === selectedKey);
    if (sessModel) { setConfirmedModel({ ...sessModel }); onModelSelect({ ...sessModel }); }
  } else {
    loadFileContent(selectedKey, { preserveTab: true });
  }
};
```

ADR 0077 中"session/ 模型刷新按钮不显示"的规则**已废弃**：刷新按钮对所有模型（包括 session 模型）均可见，行为差异由 `reloadFromYAML` 内部处理。

---

### D10：后端模块解耦（sim_engine）

`optimizer_engine.py` 移除对 `SimulatorEngine` 私有方法的依赖：

| 旧调用 | 新调用 |
|--------|--------|
| `SimulatorEngine._apply_regimens(...)` | `apply_regimens(...)` from `regimen_runner` |
| `SimulatorEngine._collect_param_distributions(...)` | `collect_param_distributions(...)` from `mc_utils` |
| `SimulatorEngine._apply_parameter_sampling(...)` | `apply_parameter_sampling(...)` from `mc_utils` |
| `simulator_engine._clone_model(m)` | `clone_model(m)` from `mc_utils` |

优化器不再需要持有 `SimulatorEngine` 实例来访问这些工具函数，降低了模块耦合。

---

## 影响文件

| 文件 | 变更 |
|------|------|
| `sim_gui/src/components/sim_tab/useSession.ts` | **新建**：session 逻辑独立 hook |
| `sim_gui/src/types.ts` | `ModelSession.userEdited?: boolean` |
| `sim_gui/src/components/Simulator.tsx` | 使用 `useSession`；`sessionEditedRef`；`sessionKeys`；`reloadFromYAML` 双路径；`rawContent` fallback |
| `sim_gui/src/components/sim_tab/simUtils.ts` | 删除 `readMS`、`writeMS`、`initModelSessions` |
| `sim_gui/src/components/sim_tab/SimModelTree.tsx` | `(edited)` 标记；移除运行状态条；移除 session 关闭按钮；重载按钮统一用 `onReloadModel` |
| `sim_gui/src/components/sim_tab/SimOptTab.tsx` | `isActiveModel` prop；Log 复制/导出按钮 |
| `sim_gui/src/components/opt_tab/OptControlBar.tsx` | 按钮重排；`warmStartDirty` prop；"继续计算"始终可见；`scsMode`/`onSaveResults` |
| `sim_gui/src/components/opt_tab/useOptimizer.ts` | `buildProblemSignature`；`lastRunSignature`；`warmStartDirty` |
| `sim_engine/src/optimizer_engine.py` | 移除对 `SimulatorEngine` 私有方法的依赖（见 D10） |

---

## 被否决的方案

**将 `warmStartDirty` 自动强制冷启动**：过于激进——用户可能只是微调了约束，仍希望热启动加速搜索。改为提示而非强制。

**Opt Tab 在非活跃时完全禁用**：Opt Tab 是结果查看区，即使不是活跃运行模型，用户仍需查看该模型的历史 Pareto 结果，因此只隔离"实时数据"，保留"静态结果"。

**session 模型保留关闭按钮**：session 模型通过 localStorage 持久化，"关闭"不等于"删除"，视觉上关闭后刷新页面又回来，行为混乱。移除更清晰——session 模型的生命周期由上传/刷新决定。
