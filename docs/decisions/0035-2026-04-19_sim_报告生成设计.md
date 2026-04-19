# Sim 报告生成设计（ADR）
**日期**：2026-04-19  
**状态**：已实现  
**涉及文件**：`sim_gui/src/components/Simulator.tsx`

---

## 背景

Simulator 的 Report Tab 原先只有轨迹数据采样表和模型概览，缺乏完整的学术报告结构。需要支持导出可独立传阅的 HTML 预览与 .md 文件。

---

## 决策一：报告章节顺序

**确定顺序**：简介 → 模型概览 → 方程列表 → 变量汇总 → 仿真配置 → Plot 曲线 → 优化结果 → 参考文献

**理由**：方程和变量是模型的核心定义，优先于配置参数；Plot 曲线在所有数据呈现之后；参考文献永远置于最末。仿真配置放在变量后是因为配置依赖变量含义才有意义。

每个 section 均可在左侧 checklist 单独勾选。轨迹数据不作为 section，改为顶部"↓ 轨迹 .csv"独立导出按钮（见决策三）。

---

## 决策二：含义说明来源

**方程表**新增"含义"列，读取 YAML `formulas[name].description`。  
**变量表**新增"含义"列，读取 YAML `variables[name].description`。  
**仿真配置**的输入参数新增"含义"列，从 `variables` 中反查对应变量的 `description`。

**理由**：YAML 中已有 `description` 字段，无需另行维护；报告无 description 时可溯源至 YAML 补充，形成单一数据源。

---

## 决策三：轨迹数据单独 CSV 下载

**不**将完整轨迹表嵌入报告，改为顶部 action bar 的"↓ 轨迹 .csv"按钮。

**理由**：
- 轨迹数据行数可达数千行，嵌入报告会使文件膨胀、可读性差
- CSV 是数据分析的标准格式，下游工具（Excel、Python、R）直接可用
- 报告的受众是读者（人），CSV 的受众是工具（机器），职责分离

CSV 列头格式：`varName(描述)` ，保留含义信息。

---

## 决策四：Plot 曲线以 PNG base64 内嵌导出

HTML 预览和 .md 导出均以 `data:image/png;base64,…` 内嵌图像，无外部文件依赖。

**选择 PNG 而非 SVG 的理由**：
- Canvas `toDataURL('image/png')` 是原生 API，无需手写 SVG 生成器
- 主流 markdown 渲染器（VS Code、GitHub、Obsidna、Typora）均支持 base64 PNG
- 单文件自包含，分享时无路径问题

**导出分辨率**：680×160 px @ 2× DPR，白底，固定 light mode（报告面向打印/分享场景）。

### 实现方式

将 SimChart 内的绘制逻辑提取为模块级函数 `drawChartOnCtx(ctx, W, H, varName, data, isDark, lineColor)`，同时被：
- SimChart 的 `useEffect`（DOM canvas 实时绘制）
- `varToDataUrl(varName, colorIndex)`（offscreen canvas 生成 PNG data URL）

调用，避免重复逻辑。

### Canvas 首次渲染修复

SimChart 在 accordion 中条件渲染（`{isOpen && ...}`）时，canvas mount 后 `offsetWidth` 尚为 0，useEffect 立即执行导致空画布。修复：useEffect 内用 `requestAnimationFrame` 推迟一帧，待 DOM layout 完成后再绘制。

---

## 决策五：IEEE 编号参考文献系统

**数据来源**（三层，按显示顺序收集）：
1. `metadata.references` / `metadata.reference`（模型整体引用）
2. `variables[name].reference`（变量级引用）
3. `formulas[name].reference`（方程级引用）

**编号规则**：按首次出现顺序统一编号，自动去重。格式 `[N]` inline 标注在含义列末尾，文末独立 `## 参考文献` 章节列出完整条目。

**格式**：IEEE 数字编号风格 `[1] Author et al. (Year) Title. Journal Vol(No):pp.`（内容来自 YAML 原始字符串，不做二次格式化）。

**无引用时**：显示提示语，引导在 YAML 对应字段补充。

---

## 决策六：Accordion 重叠修复

Report section 的自定义 accordion 使用 `flexDirection: column` + `gap: 6`，展开/收起时 flex 重排导致相邻 item 短暂重叠。修复：每个 accordion item 加 `flexShrink: 0`，阻止 flex 压缩。

---

## 不在此 ADR 范围内

- DOCX 导出（未实现，按钮灰显占位）
- 多变量叠加曲线图（当前每变量独立一图）
- 参考文献的 BibTeX 导出
