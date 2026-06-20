# ADR 0114 — CLI 移除 `--mc-runs`/`--seed`，MC 配置改为只读 YAML（修订 0113）

**日期**: 2026-06-20
**状态**: 已接受
**范围**: sim_cli（`main.py` / `runner.py`），docs（`cli.md` / `data_flow.md` / `sim_design.md`）

---

## 背景

ADR 0113（2026-06-19，前一天）给 CLI 新增了 `--mc-runs N` / `--seed X`，让 `--sim` 也能跑
Monte Carlo。用户随后指出这两个 flag 是"不干净的外延"：YAML 规范（`model.md`）早就定义了
`simulation.mc.runs`/`simulation.mc.seed` 作为模型自身声明的 MC 配置，GUI 也是读这个字段做
默认值；但 `sim_cli/runner.py::run_sim` 完全没读这个字段——`n_runs` 默认硬编码成 `1`，直传给
引擎，等于无视模型 YAML 里已经写好的配置，必须靠用户自己在命令行上再传一遍 `--mc-runs` 才能
对上。这意味着同一份模型，CLI 默认跑出来的结果可能和 YAML 自己声明的配置不一致。

排查发现这个不一致只存在于 sim 侧。opt 侧的 `optimizer.mc.runs`/`optimizer.mc.seed`
（`optimizer_engine.py:290-294`）从一开始就**只从 YAML 读，没有任何 CLI flag**：
`mc_cfg = opt_block.get('mc', {})`。sim 侧这次新增的 `--mc-runs`/`--seed` 是项目里第一次给
"模型已经声明的 MC 配置"开一个命令行覆盖口子，跟 opt 侧的既有模式不统一。

副作用：`sim_cli/batch.py` 调用 `run_sim()` 时从不传 `n_runs`，所以批量跑所有模型时永远是
确定性单跑——即使某个模型的 YAML 写了 `mc.runs: 30`，批量测试也不会真的跑 30 次。

## 决策

1. **删除 `--mc-runs`/`--seed` CLI 参数**（`main.py`），不再提供命令行覆盖。
2. **`runner.py::run_sim` 改为从加载后的模型读取 MC 配置**：
   ```python
   mc_cfg = engine.current_model.simulator.get('mc', {})
   n_runs = max(1, int(mc_cfg.get('runs', 1)))
   seed = mc_cfg.get('seed')
   seed = int(seed) if seed is not None else None
   ```
   写法直接照搬 `optimizer_engine.py` 读 `optimizer.mc` 的模式，两条路径（sim CLI / opt 全局）
   现在统一成"MC 配置只活在 YAML 里，没有运行时覆盖"。
3. **引擎层签名不变**：`SimulatorEngine.run_simulation_mc`/`run_simulation_all_plans` 仍然接受
   `n_runs`/`seed` 作为普通参数——这一层本来就该是通用的，GUI 的 `session_manager.py`（接收
   前端 session 覆盖值）和测试（直接传值验证一致性）都还需要显式传参的能力。改动只发生在
   "CLI 这个调用方怎么决定传什么值"，不动引擎 API。
4. **连带影响（用户已确认接受）**：`batch.py` 不需要改代码，但运行时行为会变——批量测试会
   开始按每个模型自己 YAML 里的 `mc.runs` 老实跑 MC，不再永远确定性单跑。如果某些模型声明了
   较大的 `mc.runs`，批量回归测试会变慢，但这是"行为变得正确"，不是回归。

## 不在本次范围内

- GUI 的 session 覆盖机制（`sim_runs`/`mcSeed` 存 localStorage，不回写 YAML）不动——GUI 面向
  交互式探索，临时改 MC 设置看效果是合理的场景，跟 CLI 的"自动化批跑、结果必须可复现"诉求不同。
- 不给 CLI 加任何形式的"显式覆盖" flag（例如 `--mc-runs-override`）。用户的诉求是"配置应该只在
  一个地方"，加一个换皮的覆盖口子等于没解决问题。

## 结果

```
sim_cli/main.py     删除 --mc-runs / --seed 参数及其透传
sim_cli/runner.py   run_sim 签名简化为 (model_path, project_root, csv_path)；
                     内部从 engine.current_model.simulator['mc'] 读 runs/seed
docs/cli.md         移除 --mc-runs/--seed 文档；说明 MC 来自 YAML，与 optimizer.mc 同模式；
                     "与 GUI 的关系"表更新 MC 行；batch.py 一节补充"会按模型 mc.runs 变慢"提示
docs/data_flow.md   路径 A 示例不再涉及 MC flag（本就没提及，无需改）
docs/sim_design.md  CLI 行的标注同步成 --sim-only/--opt-only（随 ADR 也顺带修正了上一轮改名遗留）
```

## 关联

- ADR 0045 — MC 概率仿真架构（YAML `mc:` 字段定义的源头）
- ADR 0113 — 本次修订的对象：CLI 新增 `--mc-runs`/`--seed`（一天前）
