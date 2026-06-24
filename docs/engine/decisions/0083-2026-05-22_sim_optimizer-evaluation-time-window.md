# 0083 · 2026-05-22 · Sim · Optimizer 评估时间窗独立配置

## 背景

优化器在每次适应度评估时内部运行一次仿真。此前，评估时间窗和步长硬绑定到 YAML 的 `simulation.start_date`/`end_date` 和 `metadata.step_size`，存在两个问题：

1. **GUI 时间控件失效**：Opt tab 工具栏上的日期和步长控件与 `simStartDate`/`simEndDate`/`stepValue`/`stepUnit` 状态绑定，但 `startOptimization()` 构建 `optimizer_override` 时**未包含这些字段**，引擎始终读 YAML 静态值，GUI 改动无效。

2. **结果不可复现**：`optimizer.results` 记录了 Pareto 前沿，但 YAML 里没有声明使用了哪个时间窗和步长，发布后无法独立复现。

## 决策

### D1：`optimizer` block 新增三个可选字段

```yaml
optimizer:
  start_date: "YYYY-MM-DD"   # 评估时间窗起始；缺省 simulation.start_date
  end_date:   "YYYY-MM-DD"   # 评估时间窗结束；缺省 simulation.end_date
  step_size:                  # 评估步长；缺省 metadata.step_size
    value: 1
    unit: day
```

引擎读取优先级：`opt_block` > `simulation` block / `metadata.step_size`。

### D2：`optimizer_override` 始终包含当前时间设置

`startOptimization()` 在构建 `optimizerOverride` 时加入：

```js
start_date: simStartDate,
end_date:   simEndDate,
step_size:  { value: stepValue, unit: stepUnit },
```

这样 GUI 工具栏的值实时有效，优先级高于 YAML 静态值。

### D3：引擎 override 合并扩展

`optimizer_engine.py` 的 override 合并循环新增 `'start_date'`、`'end_date'`、`'step_size'` 三个 key，使 D2 的值能正确传入。

## 不变的设计

- GUI 的 Sim tab 和 Opt tab 共用同一套时间状态（`simStartDate` / `simEndDate` / `stepValue` / `stepUnit`）——不拆分。简单场景下两 tab 保持一致；需要不同时间窗时，YAML 静态声明优化评估窗，GUI 控件覆盖可视化窗。
- `optimizer.results` 写入时**不自动**将当前 GUI 时间写回 YAML——由建模者在下载前手动确认时间设置后，将其写入 `optimizer.start_date`/`end_date`。

## 影响

- `sim_engine/src/optimizer_engine.py`：override 合并 + 时间参数读取
- `sim_gui/src/components/Simulator.tsx`：`startOptimization()` 传入时间
- `docs/model.md`：optimizer schema 新字段
- `c:/fan/b_lm_home/LM_FORMAT_1.0.md`：同步 optimizer block schema
- `docs/opt.md`：新增评估时间窗章节
- Paper3 YAML：`ckd_protein_pareto_a4_p3`、`hypertension_gout_3obj_a5_p3`、`smoking_stress_a6_p3` 补充 `start_date`/`end_date`
