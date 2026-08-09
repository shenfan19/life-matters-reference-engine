# Monte Carlo（MC）：分布参数与多 run 仿真

> 对应 `reference_engine/src/mc_utils.py`。架构决策见 [ADR 0045](decisions/0045-2026-04-30_sim_MC概率仿真与随机参数架构.md)；Opt 内层 MC 曾经完全不生效的历史 bug 及 Sim/Opt MC 解耦见 [ADR 0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md)（**必读**——下文"采样后回写 `variable_history[0]`"这一步就是该 bug 的修复点，改动 `mc_utils.py` 前务必先看这份 ADR）。

## 用途 

`parameter` 类型变量的 `value` 除了写静态数值，还可以写分布表达式（`normal(μ, σ)` / `uniform(a, b)` /
`lognormal(μ, σ)`），表示个体间差异。确定性模式（默认）取分布均值，得到单条可复现轨迹；MC 模式
对每个声明了分布的 `parameter` 独立采样 N 次，跑出 N 条轨迹，得到输出的分布而非单点。YAML 语法见
`life-matters-models` 仓库 `docs/LM_format_1.0.md` §2.2/§2.3。

MC 在两个独立层级生效，彼此不共享状态（[ADR 0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md) 决策二撤销了此前"两者共用一份配置"的设计）：


| 层级     | 配置位置                                                         | 作用                                                                |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Sim 顶层 | `simulation.mc.runs` / `simulation.mc.seed`                      | 对一次仿真本身跑 N 条轨迹，得到分布                                 |
| Opt 内层 | `optimizer.mc.runs` / `optimizer.mc.seed`（见 [opt.md](opt.md)） | 优化器评估每个候选解时，对该候选跑 N 次采样取聚合目标值，做鲁棒优化 |

GUI 中 Sim tab 和 Opt tab 的 MC×N/Seed 控件分别绑定各自配置，互不影响。CLI 批量场景（`--input-dir`）
按各模型 YAML 自己的 `mc.runs` 跑，不是 batch 级别的统一参数——某个模型声明了较大的 `mc.runs`
会让批量测试相应变慢，见 [cli.md](cli.md)。

## 分布表达式解析

`parse_distribution(value)`：用正则匹配 `normal(p1, p2)` / `uniform(p1, p2)` / `lognormal(p1, p2)`，
返回 `(dist_type, (p1, p2))`；不匹配（含非分布的普通数字/字符串）返回 `None`。

- `get_mean_value(value)`：确定性模式用，分布取第一个参数（`normal`/`lognormal` 是 μ，`uniform` 是 a）；
  非分布值直接转 `float`。
- `sample_value(value, rng)`：MC 模式用，用传入的 `numpy.random.Generator` 采样——`normal(μ,σ)` →
  `rng.normal`，`uniform(a,b)` → `rng.uniform`，`lognormal(μ,σ)` → `rng.lognormal`。

## Seed 派生：一个 master seed → N 个独立 run seed

`derive_seed_list(session_seed, n_runs)`：用 `session_seed` 构造一个 master `Generator`，再从它连续
抽取 `n_runs` 个独立整数各自作为一个 run 的 seed（`master_rng.integers(0, 2**31)`）。GUI 的
`start_session` 和 CLI 的批量/MC 入口共用这一份函数，保证同一个 master seed 下，逐 run 的轨迹在
CLI 和 GUI 之间完全一致、可复现。

## 采样应用与已知教训

`collect_param_distributions(model)`：收集所有声明了分布值的 `parameter` 变量，优先读 Loader 存的
`model._param_dist_raw`（原始分布字符串），兜底扫描 `Variable.value` 本身是否为分布字符串（用于
不经过标准 Loader 直接构造 `ModelStructure` 的场景）。

`apply_parameter_sampling(model, param_distributions, rng=None)`：`rng=None` → 确定性，每个分布参数
设为均值；`rng=<Generator>` → 随机，独立采样一次。**采样后会立刻把值同步写回
`model.variable_history[var_name][0]`**——这一步不是可选的整洁性操作，而是 [ADR 0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md)
修复的核心：`reset_simulation()` 会把每个变量重置为 `variable_history[var_name][0]`（即克隆时刻的
"初始值快照"），而 `optimizer_eval.py::_run_sim()` 每次求值开头都无条件调用 `reset_simulation()`。
如果采样后不同步这个快照，任何后续 `reset_simulation()` 都会把刚采样的值悄悄冲掉、退回到采样前的
均值——这不是假设性风险：这个 bug 曾让所有声明了 `optimizer.mc.runs > 1` 的模型在优化搜索过程中
实际上反复评估同一个确定性均值，`mc.seed` 从未真正影响过优化结果，影响了 `models/papers/` 下 19 个
`*_opt_*.yaml` 文件的历史优化结果（详见 ADR 0130）。改动这个函数时必须保留这次回写。

## Model 克隆：`clone_model`

`ModelStructure` 持有一个不可 pickle 的 asteval `Interpreter`，不能用 `copy.deepcopy`。`clone_model(base)`
因此手动构造一份独立副本：

- 只读元数据（`metadata`/`equations`/`simulator`/`optimizer`/`time_unit` 等）**共享引用**，不复制。
- 每个变量重新构造独立的 `Variable` 实例（各 run 需要互不干扰的当前值）。
- 运行时状态重置：`variable_history` 重新初始化为 `{name: [初始值]}`，`current_step=0`，`time=0.0`，
  重新调用 `_initialize_asteval()` 注入一份新的 asteval 符号表。
- 分布元数据（`_param_dist_raw`/`param_distributions`）原样继承，供后续 `apply_parameter_sampling` 使用。

**每个 MC run 必须从这份"干净克隆"重新采样，不能链式复用上一个 run 的终态**——否则多个 run 之间会
产生虚假的相关性（`test_verification/verification_report.md` §1.2 将此列为需要人工/半自动抽查的实现细节，
目前没有专门的自动化断言覆盖，改动 MC 相关代码后应抽样核对）。

## 确定性保证

`mc.runs` 缺席或为 1 时，仿真是完全确定性、可复现的——`test_verification/test_sim_cli_consistency.py` 的
一部分断言依赖这一性质（CLI 与 GUI 走同一份核心代码路径，相同输入必须逐位相同）。
