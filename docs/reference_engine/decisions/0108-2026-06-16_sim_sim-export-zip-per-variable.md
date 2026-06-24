# ADR 0108 — Sim 导出重设计：多 plan 时输出按变量分 CSV 的 ZIP 包

**Date:** 2026-06-16  
**Status:** ✅ 已实施  
**Context:** sim_gui — Sim tab 控制栏下载按钮  
**Revises:** ADR 0094（Sim 导出行为部分）

---

## 背景

ADR 0094 设计的 Sim CSV 导出读取 `state.simulationData`（当前运行的时序）。  
随后 ADR 0073/0076 引入多 plan 仿真：用户运行"Run All Plans"后，数据进入 `comparedPlans`，`simulationData` 被清空。  
由此产生 bug：**点击下载按钮无响应**（`simulationData.length === 0`，函数提前返回）。

此外，summary bar 里的"Export Result CSV"按钮是 ADR 0094 前遗留的冗余入口，与控制栏按钮功能重叠。

---

## 决策

### 1. 数据范围：覆盖所有 plan，包括 imported runs

导出函数从 `useSimulation` 迁移到 `Simulator.tsx`，在此可访问全量数据：

- `simulationData`（当前运行）
- `comparedPlans`（Run All Plans 结果）
- `importedSimRuns`（CSV 导入的历史曲线）

组合逻辑与 SimPlotTab 收到的 `comparedPlans` prop 完全一致。

### 2. 导出格式按 plan 数量自动分支

| 情形 | 格式 | 文件名 |
|------|------|--------|
| 无对比曲线（单 plan） | 宽表 CSV，列 = `step, time, var1, var2 …` | `modelName_startDate_endDate.csv` |
| 有对比曲线（多 plan） | ZIP，每个变量一个 CSV | `modelName_startDate_endDate.zip` |

多 plan CSV 格式（每个变量一文件）：

```
time_s,time_h,Plan A label,Plan B label,…
0,0.0000,5.0,4.8,…
3600,1.0000,5.2,5.1,…
```

设计理由：同类变量的所有 plan 曲线集中在一个文件里，在 Excel / pandas 中可直接横向对比，无需手动合并。

### 3. 按钮状态

下载按钮 disabled 条件从 `!selectedModel` 收紧为 `!selectedModel || !hasSimData`，  
其中 `hasSimData = simulationData.length > 0 || comparedPlans.some(p => p.data.length > 0) || importedSimRuns.length > 0`。

### 4. 删除 summary bar 中的冗余下载按钮

SimPlotTab 顶部 summary bar 的"Export Result CSV"按钮删除；  
每个变量 Collapse 面板内的单变量下载按钮（`exportVarCSV`）保留不变。

---

## 实施

- `sim_gui/src/components/Simulator.tsx`：新增 `handleExportSimCSV`；引入 `fflate` 做 ZIP 创建
- `sim_gui/src/components/sim_tab/useSimulation.ts`：移除 `exportSimCSV`
- `sim_gui/src/components/sim_tab/SimControlBar.tsx`：新增 `hasSimData` prop
- `sim_gui/src/components/sim_tab/SimPlotTab.tsx`：移除 `onExportCSV` prop 及 summary bar 按钮
- `sim_gui/package.json`：新增依赖 `fflate ^0.8`

---

## 影响

- 单 plan 用户：无感知变化，下载行为与之前一致
- 多 plan 用户：从"只能下载当前 run"升级为"一键下载所有 plan 的完整对比数据"
- 文件格式：多 plan 时从 `.csv` 变为 `.zip`，解压后每个变量一个 CSV
