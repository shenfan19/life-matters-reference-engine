# ADR 0122 — 报告导出重构与逐 Plan PNG 下载

**日期**：2026-07-02  
**状态**：已采纳  
**范围**：gui / `SimControlBar`, `OptControlBar`, `ReportButton`, `SimPlotTab`, `SimChart`, `Simulator/index`

---

## 背景

原报告按钮位于 Overview 标签页，通过 `createPortal` 注入工具栏。Overview 与 Report 合并为单一标签（`SimIntroTab`）后，产生三个问题：

1. **Overview 无仿真曲线**：`SimIntroTab` 只列变量名，不渲染图表；同时 opt 工作流结束后 `simulationData` 为空，导致 Overview 持续显示"No data"。
2. **报告按钮位置尴尬**：用户需先切回 Overview 才能导出报告，路径不直观。
3. **MD 导出内含巨型 base64 字符串**：PNG 图片内嵌为 `data:image/png;base64,...`，在 GitHub、Obsidian 等所有标准 Markdown 查看器中均无法渲染，外观为乱码。

---

## 决策

### 1. 报告按钮提取为共用组件，通过 slot 挂载到工具栏

新建 `ReportButton.tsx`，包含所有导出逻辑（Markdown 生成、HTML 生成、ZIP 打包）。`SimControlBar` 与 `OptControlBar` 均新增 `reportButton?: React.ReactNode` slot prop。`Simulator/index` 在顶层构建 `reportButton` 元素后统一传入，不在 `SimIntroTab` 内部维护。

**放弃的方案**：维持两套独立的导出逻辑（sim 侧和 opt 侧各一份）——导致代码重复、行为不一致。

### 2. `effectiveSimData` 三级 fallback

Overview 和报告使用的数据按优先级回退：

```
simulationData（当前仿真结果）
  → importedSimRuns 最后一条（历史归档仿真）
  → comparedPlans 中第一条有数据的 plan（Pareto 解仿真）
```

第三级是 opt 工作流的关键：opt 完成后 `simulationData` 始终为空，Pareto 解的轨迹存于 `comparedPlans`，没有这一回退则 Overview 和报告在 opt 场景下永远显示"No data"。

### 3. MD 导出改为 ZIP（report.md + images/ 目录）

| 格式 | 行为 |
|------|------|
| **HTML 预览** | 新标签页打开，图片以 base64 内嵌，自包含单文件，无需改动 |
| **MD 导出** | 下载 `.zip`，内含 `report.md`（相对路径引用图片）+ `images/` 目录（PNG 文件） |

Markdown 标准不支持 base64 data URL（GitHub、Obsidian、VS Code 等均不渲染）。ZIP + 相对路径是使 MD 文件可在任意查看器中正确显示图片的唯一通用方案。

### 4. 图片以"每变量 × 每 plan"为单位生成，不叠加

原方案在一张图里叠加所有 plan 曲线并附图例。

**放弃原因**：Plan 名称（如 `Sim 2026-05-01 · 1h`）过长，图内图例面积超过图表本身，可读性极差；多曲线叠加适合交互界面（有悬停提示），不适合静态导出图。

**采纳方案**：  
- 每变量 × 每 plan 各生成一张 PNG  
- 文件名直接体现 plan 名称：`{varName}_{planLabel}.png`  
- 多 plan 时 MD 中每张图前插入 `**— Plan 名 —**` 分隔

`varToDataUrl` 增加 `planDatasets?: PlanResult[]` 参数：传入单个 plan 时使用该 plan 的颜色绘制单条曲线；图例仅在传入 2+ plan 且一次性生成所有 plan 叠加图时启用（目前不走该路径）。

### 5. 逐变量 PNG 下载按钮放在 SimPlotTab 的 Collapse extra slot

所有 `SimChart` 实例均以 `hideTitleBar` 模式渲染（SimPlotTab、SimIntroTab 均如此），`SimChart` 内部标题栏的下载按钮对用户不可见。Collapse 面板标题行的 `extra` slot 是用户实际看到 CSV 按钮的位置，PNG 按钮应与 CSV 并排于此。

新增 `exportVarPNG(varName, colorIndex)` 函数：

- **单 plan**：直接下载 `{varName}.png`
- **多 plan**：下载 `{varName}_charts.zip`，每 plan 一张 PNG（各自独立，不叠加）

---

## 结果

- `ReportButton.tsx`（新文件）：包含 `buildChartImages()`、`buildMd(sources)`、`buildHtml(md)`、JSZip 打包逻辑
- `SimControlBar.tsx` / `OptControlBar.tsx`：新增 `reportButton?` slot
- `SimPlotTab.tsx`：新增 `exportVarPNG`，Collapse extra slot 改为 `[PNG] [CSV]` 双按钮
- `SimChart.tsx`：`varToDataUrl` 增加 `planDatasets?` 参数，修正 early-return 条件（`activePlans.length === 0 && data.length === 0`），单 plan 时也将 plan 数据传入 `drawChartOnCtx` 以使用正确的 plan 颜色
- `Simulator/index.tsx`：计算 `reportPlanDatasets`（镜像 SimPlotTab 的 comparedPlans 组装逻辑）和 `effectiveSimData`

---

## 未决

- Pareto 散点图（SimOptTab）的 PNG 导出尚未实现，建议后续在 Pareto 图组件同位置（图表标题旁）加相同的 PNG 按钮。
