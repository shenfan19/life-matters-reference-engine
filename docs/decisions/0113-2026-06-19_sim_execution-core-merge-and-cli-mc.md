# ADR 0113 — Sim 执行核心合并（CLI/GUI 共用 `advance_steps`） + CLI 新增 MC 能力

**日期**: 2026-06-19
**状态**: 已接受
**范围**: sim_engine（`regimen_runner.py` / `simulator_engine.py` / `session_manager.py` /
`mc_utils.py`），sim_cli（`main.py` / `runner.py`）

---

## 背景

用户要求评估 sim 在 CLI 与 GUI 之间的完整合流程度，并"能合进去就合"——不是局部打补丁，而是
希望 GUI 的执行核心直接复用 CLI 的方法，不维护两份并行实现。

排查发现 CLI 的 `run_simulation`（`simulator_engine.py`，一次性跑到底再写 CSV）和 GUI 的
`batch_steps`（`session_manager.py`，按 batch 轮询调用，支持暂停/MC）各自手写了一份
"`apply_regimens` → `model.step()` → 记录一行输出"的循环体——共用了 `apply_regimens`/
`model.step()` 这两个底层函数没错，但循环本身（怎么分批、怎么收集行、`step`/`time` 怎么累加）是
两份独立代码，纯属巧合才长得像，不是真的合流。

另外，CLI 的 `--sim` 完全没有 Monte Carlo（多 run、参数采样）能力——不是"跟 GUI 不一致"，是
"没有对应物可比较"，但用户明确要求补上，让 CLI 和 GUI 能用同一个 master seed 直接对账。

## 决策

### 1. 抽取共用的单步/多步执行核心 `advance_steps`

新增 `regimen_runner.py::advance_steps(model, regimens, step_size, n_steps, start_step,
start_time, output_variables, sim_start_date)`，把"apply_regimens → model.step() → 收集一行
{step, time, **vars}"这个循环体封装成一个函数，返回 `(rows, end_step, end_time)`。放在
`regimen_runner.py`（而不是 `simulator_engine.py` 或 `session_manager.py`）是因为这两个文件
互相 import（`simulator_engine.py` 通过 `SessionManagerMixin` 用 `session_manager.py`），放在
两者共同已依赖的 `regimen_runner.py` 不会造成循环引用。

- **CLI** 的 `run_simulation`：原来的 `while` 循环改为按 `pause_every`（无交互暂停时整段一次性）
  分 chunk 调用 `advance_steps`，外层只保留 CSV 行拼装和暂停回调检查——暂停/`q` 提前停止的语义
  完全不变（原代码本来就只在 chunk 边界检查 `self.running`）。
- **GUI** 的 `batch_steps`：单 run 路径和 MC 多 run 路径的循环体都换成调用 `advance_steps`，
  入参用 `session['current_step']`/`session['time']`（或每个 run 自己的）支持跨多次轮询续跑。

`tests/test_sim_cli_consistency.py` 现有的 4 个用例是这次重构的回归安全网——重构前后全部
保持通过，验证"提炼公共函数"本身没有引入行为变化。

### 2. 抽取共用的种子派生 `derive_seed_list`

`mc_utils.py` 新增 `derive_seed_list(session_seed, n_runs)`，把原来 inline 在
`start_session()` 里的 `master_rng = np.random.default_rng(session_seed)` → 派生
`seed_list` 的逻辑抽出来。GUI 的 `start_session` 改为调用它；CLI 新增的 MC 能力（见下）同样调用
它——这是两边能用同一个 master seed 复现同一组 per-run 种子的关键。

### 3. CLI 新增 `--mc-runs N` / `--seed X`

`sim_cli/main.py` 新增两个参数；`runner.py::run_sim` 透传给
`SimulatorEngine.run_simulation_mc()`（新方法，`simulator_engine.py`）：

- `n_runs == 1`：行为不变（确定性，ADR 0045）。
- `n_runs > 1`：用 `derive_seed_list` 派生 `seed_list`，每个 run `clone_model` +
  `apply_parameter_sampling` + `advance_steps`，写 `<stem>__run{i}.csv`
  （多 plan 时是 `<stem>__<plan_id>__run{i}.csv`）。

`run_simulation_all_plans` 新增 `n_runs`/`seed` 参数，`n_runs > 1` 时每个 plan 改调
`run_simulation_mc`（而不是 `run_simulation`），文件名加一层 `__run{i}` 后缀；`n_runs == 1`
时路径和文件名与之前完全一致，不影响现有用户。

#### 实现中发现并修复的一个真 bug

`run_simulation_mc` 第一版按"clone → 立刻跑完这个 run → 进入下一个 run 的 clone"顺序写，但
run 0 直接用 `base_model`（不 clone）原地跑——这意味着 run 0 跑完时 `base_model` 已经被
mutate 成跑完之后的终态，run 1 再 `clone_model(base_model)` 时克隆的是 run 0 的终态，不是
初始态！这跟 GUI 的 `start_session` 不一样：`start_session` 在任何 run 开始 step 之前，先把
所有 run 的 model（clone + 采样）准备好。`tests/test_sim_cli_consistency.py` 新增的
MC 一致性测试（见下）在合并前一版代码上确实跑出了不一致（`peak_plasma` 这种依赖运行历史的
Accumulator 变量在 run 1/2 上数值跑偏），修复方式是把"clone 所有 run"和"跑所有 run"拆成两个
独立阶段，跟 `start_session` 的顺序对齐。这次"先写测试、测试真的抓到 bug"再次验证了
ADR 0111/0112 一直在用的方法论。

### 4. 测试覆盖

`tests/test_sim_cli_consistency.py` 新增两个用例：

- `test_mc_runs_match_with_same_seed`：CLI 的 `run_simulation_mc(n_runs=3, seed=19)` 和 GUI
  的 `start_session(sim_runs=3, seed=19)`，逐 run 比较派生种子和采样后的最终状态，要求完全一致。
- `test_opt_unedited_gui_override_matches_cli_cold_start`：GUI 路径未编辑时发给后端的
  `optimizer_override`（直接取 YAML 自己的 `optimizer.startpoint/objectives/constraints/
  algorithm`，代表一次忠实的前端往返——已用 ADR 0112 的 `optUtils.test.ts` 验证过该往返对
  T1-T4 fixture 无损）与 CLI 冷启动（只覆盖 `warm_start`）的结果完全一致。这条同时纠正了
  ADR 0111 里"opt 没有发现分叉"的不准确结论。

## 不在本次范围内

- Opt 路径的执行核心合并：opt 的模拟执行（`optimizer_engine.py::_run_sim`）已经在调用
  `apply_regimens`（不是这次合并的 `advance_steps`），暂不改动——opt 的循环结构（适应度函数
  反复调用、每次只需要终态不需要逐步记录）跟 sim 的逐步记录需求不同，强行套用同一个
  `advance_steps` 收益不明显，留作未来需要时再评估。
- 把 `derive_seed_list` 的种子派生算法本身改成别的方案：现状（`np.random.default_rng` 派生）
  本来就是 GUI 已经在用、本次只是抽取共用，不改算法。

## 结果

```
sim_engine/src/regimen_runner.py      新增 advance_steps（CLI/GUI 共用 step 循环核心）
sim_engine/src/simulator_engine.py    run_simulation 改调 advance_steps；新增 run_simulation_mc；
                                       run_simulation_all_plans 新增 n_runs/seed 参数
sim_engine/src/session_manager.py     batch_steps 单/多 run 路径改调 advance_steps；
                                       start_session 改调 derive_seed_list
sim_engine/src/mc_utils.py            新增 derive_seed_list
sim_cli/main.py                       新增 --mc-runs / --seed 参数
sim_cli/runner.py                     run_sim 新增 n_runs/seed 参数，透传 + 文件名处理
tests/test_sim_cli_consistency.py     新增 2 个测试用例（MC 一致性 + opt 一致性）
docs/cli.md                           "与 GUI 的关系"表格补充 MC 行
```

## 关联

- ADR 0045 — MC 概率仿真架构
- ADR 0072 — 测试直接 import 引擎层函数
- ADR 0101 — CLI 公开发布接口
- ADR 0110 / 0111 / 0112 — 同一轮 sim/opt 一致性排查的前序工作
