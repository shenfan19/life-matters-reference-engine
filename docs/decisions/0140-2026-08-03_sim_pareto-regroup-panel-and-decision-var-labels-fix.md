# 0140 — Pareto Regroup 面板（任意目标/决策变量选轴+分组）+ 决策变量标签口径修复

**日期**：2026-08-03
**状态**：✅ 已接受

---

## 背景

Opt tab 原有的 `ParetoChart.tsx` 只能画固定的"第一个目标 vs 第二个目标"散点图，用户无法换轴，也无法按某个决策变量把解分组对比。用户希望在不重新跑优化的前提下，自由选择任意目标/决策变量做 X 轴、Y 轴，并可选一个第三维度做分组着色，来探索已有 `pareto_front` 里的权衡结构。

## 决策

### 决策一：新增 `ParetoRegroupChart.tsx`，在前端本地对已有 `pareto_front` 重新映射，不新增后端接口

X/Y/分组三个下拉框的候选字段统一由 `objectives`（`f0..`）和决策变量（`x0..`）拼成，用户切换选择时只是对同一份 `result.pareto_front` 数组做本地取值/重排/分箱，不触发任何后端请求、不需要重新跑优化。选择这个方案而不是让后端提供"按字段查询"的新接口，是因为 `pareto_front` 里每个解本来就带着完整的 `f[]`/`x[]`，换轴换分组是纯粹的展示层重组，没有理由为此增加一次网络往返。

### 决策二：分组变量的离散化策略——≤6 个去重值按值分组，否则等宽分 5 箱

分组维度既可能是离散的（如 T3 的 `days` 组合索引，取值集中在个位数），也可能是连续的（如 T1 的 `value`），无法用同一种分组方式覆盖两种情况。取 `groupKey` 对应值四舍五入到小数点后两位去重，若去重后种类数 ≤ 6，直接按值分组（离散场景，每个值就是一组，标签形如 `变量名=值`）；超过 6 种则视为连续分布，按最小-最大值等宽切成 5 箱（标签形如 `变量名 lo–hi`）。6 和 5 是经验阈值，不是精确推导——6 组以内的图例仍可读，超过则改用区间分箱避免图例爆炸。

### 决策三（bug 修复，非新决策，随本功能一并发现并修复）：X/Y/分组标签统一改用 `decision_var_labels`，不用 `regimen_event_labels`

开发过程中发现 `ParetoRegroupChart.tsx` 最初和既有的 Solutions 表格（`SimOptTab.tsx`）一样，用 `result.regimen_event_labels` 给决策变量命名——这个字段是按 **regimen 事件**数量生成的（`optimizer_engine.py:390`），而一个事件的 `optimize:` 子块可以同时声明 `value`/`time_start`/`time_end`/`days_pool`/`date_range` 中的多种，每种各自展开成一个独立的决策变量维度（`optimizer_engine.py:97-157` 的 `var_specs`）。也就是说事件数和决策变量数（`x[]` 的长度）经常对不上，取值越界时前端只能 fallback 成 `x1`/`x2` 这种无意义的序号。后端其实已经有对齐好的字段：`decision_var_labels`（`optimizer_engine.py:385-386`），按 `var_specs` 逐维生成，长度和顺序与 `x[]` 严格一致，并带 `[time]`/`[time_end]`/`[days]`/`[date]`/`[date_end]` 后缀区分同一变量的不同决策维度。改用这个字段后，`ParetoRegroupChart.tsx` 和 Solutions 表格才能在多维度事件下正确显示变量名而不是回退成序号。

## 结果

- 新增 `gui/src/components/opt_tab/ParetoRegroupChart.tsx`：X/Y/分组三选择器 + canvas 散点图 + 分组图例，挂载在 Opt tab 新增的 `regroup` Section（`SimOptTab.tsx`）
- `gui/src/components/opt_tab/ParetoRegroupChart.tsx`：标签源改为 `result.decision_var_labels`
- `gui/src/components/sim_tab/SimOptTab.tsx`：Solutions 表格表头同一处标签源改为 `optResult.decision_var_labels`
- i18n：`gui/public/locales/engine/{zh-CN,en,zh-TW,fr}.json` 新增 Regroup 面板相关 key

## 未决 / 后续

- 从已保存 `optimizer.results.pareto_front` 的 YAML 文件直接加载查看（不重新跑优化）这条路径，前端 `useModelInit.ts` 本地拼装结果时仍只生成 `regimen_event_labels`、没有 `decision_var_labels`，多维度事件场景下会退回 `x1`/`x2`。已记录到 `life-matters-home/tasks/2026-08-03_task_yaml-preload-decision-var-labels.md`，可选后续任务，本次未做。
