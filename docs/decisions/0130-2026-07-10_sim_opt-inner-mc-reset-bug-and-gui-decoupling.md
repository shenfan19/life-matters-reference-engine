# 0130 — Opt 内层 MC 被 reset_simulation 静默清零的 bug 修复 + GUI 控件与 Sim MC 解耦

**日期**：2026-07-10
**状态**：✅ 已接受
**修订**：ADR 0045 决策二部分内容（GUI 的 `simRuns`/`mcSeed` 状态"不再从 optimizer.mc 读取"）

---

## 背景

用户在复查本 session 早些时候补的一条测试（`test_opt_inner_mc_unedited_gui_override_matches_
cli_cold_start`）时追问："前端我设计了 mc 和 seed 的输入，sim 和 opt 都有，opt 那个没起作用
吗？"——顺着这个问题查下去，发现了两层独立的问题，比测试本身严重得多。

## 发现一：GUI 的 Opt MC 控件确实存在，但从未真正接入 `optimizer.mc`

`OptControlBar.tsx` 确实有 MC×N / Seed 输入框，但绑定的 `simRuns`/`mcSeed` 状态与 Sim tab
**共用同一份**（`Simulator/index.tsx` 里两处 `onSimRunsChange`/`onMcSeedChange` 都写
`setEdited('simRuns', ...)`/`setEdited('mcSeed', ...)`）。这份共享状态只在模型加载时从
`simulation.mc.runs`/`simulation.mc.seed` 初始化（`useModelInit.ts`），从未读过
`optimizer.mc`；`useOptimizer.ts` 虽然接收了这两个值作为参数，但函数体内完全没有使用它们，
没有被塞进 `optimizer_override`；后端 `run_optimizer()` 的 override 合并白名单也不含
`'mc'` key。三层叠加的结果：用户在 Opt tab 调整 MC×N/Seed，实际上对优化运行**没有任何影响**。

回查 ADR 0045 决策二，发现这**不完全是意外**——该 ADR 明确记录"结果"一节写"simRuns / mcSeed
从 YAML simulation.mc.runs / simulation.mc.seed 读取（不再从 optimizer.mc 读取）"，即
2026-06-04 的原始设计就是"GUI 不提供 optimizer.mc 的交互式配置入口，这个值只能在 YAML 里写"。
但当时的设计没有解释清楚"那为什么 Opt tab 工具栏还要显示一个看起来像是控制 opt 的 MC 输入
框"——这个控件摆在 Opt tab 里，对用户造成了"这控制的是优化过程"的合理误导，而实际语义完全
是另一回事。用户复核后确认：这不是他想要的设计，Opt tab 的 MC×N/Seed 应该真正控制
`optimizer.mc`，与 Sim tab 解耦。

## 发现二：即使接入了，`optimizer.mc.runs>1` 本身也从未真正生效过（更严重）

排查发现值链路时，进一步发现 `optimizer_eval.py::_run_sim()` 每次求值开头无条件调用
`model.reset_simulation()`，而 `reset_simulation()` 把每个变量重置为
`variable_history[var_name][0]`——即 `clone_model()` 克隆时刻**采样之前**快照的值。
`optimizer_engine.py::evaluate()` 的调用顺序是：

```
m = _clone(base_model)              # variable_history[0] 在此刻快照，还是采样前的均值
apply_parameter_sampling(m, ...)    # 只更新了 m.variables[x].value 和 m.asteval.symtable[x]
hist = _run_sim(m, ...)             # 第一行 model.reset_simulation() 把值改回快照——采样被吞掉
```

也就是说：**任何声明了 `optimizer.mc.runs > 1` 的模型，优化搜索过程中每一次"多次采样取平均"
实际上都在对同一个确定性均值反复评估同一个值**，`mc.runs`/`mc.seed` 从未真正影响过优化结果，
只是白白拖慢了 `mc.runs` 倍的计算时间。用直接实验验证：同一模型分别用 `mc.seed=19` 和
`mc.seed=999` 跑优化，`best_f` 逐位相同——只有在修复后才出现预期的差异。

**影响范围**：精确核实（脚本逐文件解析 `optimizer.mc.runs`，非估计）——`models/papers/`
下共 19 个 `*_opt_*.yaml` 文件声明了 `optimizer.mc.runs: 5, seed: 19`：
`ckd_protein`（4个：joint/joint_largepop/muscle/renal）、`fatty_liver`（3个：exercise/
hepatology/joint）、`bergman_glucose`（3个：hba1c/insulin/joint）、`ibs_diet`（3个：
joint/microbiome/symptom）、`masld_insulin`（3个：homair/joint/liverfat）、
`burnout_allostatic`（3个：cvdrisk/joint/workoutput）。这些模型此前发表/记录的优化结果，
实际上都是在
"内层鲁棒优化"名不副实、退化为单次确定性评估的条件下算出来的，不是模型作者声明的
`mc.runs: 5` 真正想要的"对参数不确定性取平均"的结果。这是一个 C 类（模型科学内容）后续
排查任务，见 `b_lm_home/tasks/2026-07-10_issue_opt-inner-mc-never-worked-rerun-needed.md`。

## 决策

### 决策一：修复 `mc_utils.py::apply_parameter_sampling()`

采样后同步写回 `model.variable_history[var_name][0] = val`，让这份"初始值快照"与刚采样的值
保持一致——这样后续任何 `reset_simulation()` 调用都会把这次 MC run 的采样值当作"初始值"
保留，而不是回退到采样前的均值。选择在 `apply_parameter_sampling()` 里修，不是在
`_run_sim()` 里去掉 `reset_simulation()` 调用——后者是防御性设计（保证每次求值前状态干净），
改 `apply_parameter_sampling()` 是更小范围、更贴近问题根源的修法：采样值本来就应该被当作
这个克隆体的"初始状态"，语义上更准确。

### 决策二：Opt tab 的 MC×N/Seed 与 Sim tab 解耦，绑定真实的 `optimizer.mc`

新增独立状态 `optMcRuns`/`optMcSeed`（`SimulationState`/`ModelSession`），模型加载时从
`optimizer.mc.runs`/`optimizer.mc.seed` 初始化（对齐 `optSeed`/`optPop`/`optGen` 已有的
"从 YAML algorithm 块读取"模式，而非对齐 `simRuns`/`mcSeed` 的"共享单一状态"模式）；
`useOptimizer.ts` 用这两个值构造 `optimizer_override.mc`；后端 override 合并白名单新增
`'mc'` key。**撤销 ADR 0045 决策二"不再从 optimizer.mc 读取"这部分内容**——当时的设计选择
本意可能是"避免维护两套 MC 状态"，但代价是 Opt tab 的控件名不副实，且叠加决策一的 bug 后，
`optimizer.mc` 事实上完全没有任何配置入口（YAML 手写也测不出效果）。现在两个 tab 的 MC 配置
各自独立、各自生效，互不影响。

## 结果

- `reference_engine/src/mc_utils.py`：`apply_parameter_sampling()` 同步写回
  `variable_history[var_name][0]`
- `gui/src/types.ts`：`SimulationState`/`ModelSession` 新增 `optMcRuns`/`optMcSeed`
- `gui/src/App.tsx`：默认值 `optMcRuns: 1, optMcSeed: null`
- `gui/src/components/Simulator/useModelInit.ts`：模型加载（含 session 恢复）时从
  `optimizer.mc` 读取
- `gui/src/components/Simulator/usePersistedUI.ts`：纳入 `ModelSession` 持久化
- `gui/src/components/Simulator/index.tsx`：`OptControlBar`/`useOptimizer` 改接
  `optMcRuns`/`optMcSeed`，不再传共享的 `simRuns`/`mcSeed`
- `gui/src/components/opt_tab/useOptimizer.ts`：`optimizerOverride.mc` 新增
- `gui/src/components/opt_tab/OptControlBar.tsx`：Tooltip 改用 `sim.opt.mc_tooltip`/
  `sim.opt.mc_seed_tooltip`（新增 i18n key，四语言），不再复用 Sim tab 的措辞
- `reference_engine/src/optimizer_engine.py`：override 合并白名单新增 `'mc'`
- `tests/test_sim_cli_consistency.py`：新增
  `test_opt_inner_mc_override_actually_takes_effect`——用不同 `mc.seed` override 断言
  `best_f` 必须变化，此前会因决策一的 bug 而误报"通过"（两次结果碰巧逐位相同）

## 未决 / 后续

- 19 个受决策一 bug 影响的论文模型需要重新跑 `--opt` 核实结果是否变化、是否需要更新论文数字
  ——C 类科学内容判断，人工决定，见对应任务文件。
- ADR 0045 未整体重写，只在本 ADR 里记录了对决策二的撤销；ADR 0045 原文保留作历史记录。
