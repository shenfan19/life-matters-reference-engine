# 0147 — 优化器 T1 决策变量新增 value_step 网格量化解码

**日期**：2026-08-04
**状态**：✅ 已接受

---

## 背景

优化器 T1 决策变量 `optimize.value: [lo, hi]` 此前只支持连续区间内的任意小数解，对按临床/工程可读精度取值的场景（例如喂养量按 5 mL 一档、代谢当量按 0.1 MET-h 一档）不友好——搜索算法给出的解可能是 `12.347` 这类无法直接执行的数字。T2 时间窗的 `time_step` 已经有"连续内部表示、解码时离散化到网格"的先例，T1 缺少对应字段。

## 决策

`optimizer_parsing.py` 新增 `_snap_to_step(raw, lo, hi, step)`：把连续实数按 `step` 为间隔、以 `lo` 为网格锚点做四舍五入，并 clamp 回 `[lo, hi]` 范围，最后按 `step` 的小数位数做一次 `round()` 清除二进制浮点噪声。锚定 `lo` 而非 `0`，是为了在 `lo` 本身不是 `step` 整数倍时（如 `[0.9, 1.0]`）网格仍与搜索区间对齐。

`optimize.value` 新增可选字段 `value_step`：声明后，解码阶段用 `_snap_to_step` 把内部连续值转换为执行值；不声明时行为不变，仍是连续解。

**配套修复**：算法后端记录的 `pareto_front`/`best_x` 此前一直是 snap 前的原始连续值，与 `evaluate()` 实际用于跑仿真的 snap 后数值不一致，即结果表里显示的 x 和真正被仿真过的 x 对不上。修复方式是在结果产出后对 `pareto_front`/`best_x` 中带 `value_step` 的分量统一重新 snap 一遍，保证记录值与被仿真值一致。

## 影响范围

- `reference_engine/src/optimizer_parsing.py`：新增 `_snap_to_step`。
- `reference_engine/src/optimizer_engine.py`：T1 解码接入 `value_step`；结果产出后对 `pareto_front`/`best_x` 补做 snap。
- `docs/opt.md`：T1 行说明新增 `value_step`，补充与 T2 `time_step` 的类比说明。
- `gui/src/components/opt_tab/OptSetupTab.tsx`、`gui/src/types.ts`、`gui/src/components/sim_tab/optUtils.ts`：GUI 表单新增 `value_step` 输入与解析。
- 四份 locale 文件新增对应字段的多语言文案。

## 结果

- T1 决策变量可选按可读精度离散化，与 T2 的 `time_step` 是同一种设计模式，用户心智负担不增加。
- 结果记录中的 x 向量与实际仿真所用的 x 向量保持一致，消除了此前"表里的数字和真正跑过的数字对不上"的隐患。
