# ADR 0111 — Sim/CLI 一致性回归测试套件

**日期**: 2026-06-18
**状态**: 已接受
**范围**: sim_engine（测试基础设施，仓库首个自动化测试套件）

---

## 背景

`docs/cli.md`"与 GUI 的关系"一节写着"CLI 与 GUI 共用同一个引擎层，结果格式一致，可互通"——
这是对外部使用者（含 AI agent，见 ADR 0101）的承诺，但此前没有任何自动化手段验证它。
排查中确认这个承诺曾经是不成立的（见 [ADR 0110](0110-2026-06-17_sim_unify-plan-schedule-parsing.md)
关于 plan/regimen 解析双实现的部分），且发现 `session_manager.py::start_session()` 有一处
独立 bug：含分布参数（`parameter: normal(...)` 等）的模型，`sim_runs=1`（未显式要求 MC）时仍会
随机采样，而不是按 [ADR 0045](0045-2026-04-30_sim_MC概率仿真与随机参数架构.md) 的规定取均值——
导致 GUI 默认运行结果和 CLI 永远对不上，且 GUI 自己都不可重现。

这是单文件 bug 修复（`session_manager.py` 的 per-run 采样判断补一个 `n_runs > 1` 条件），按项目
ADR 判断标准不需要单独立项；但既然问题本身是"两个正式接口的结果一致性"，需要一个能长期盯住这件事
的自动化测试，而不是每次靠人工排查才发现。

## 决策

**新增 `tests/` 目录，作为仓库首个自动化测试套件，专门验证 CLI 与 GUI 路径对同一模型的仿真结果一致。**

遵循 [ADR 0072](0072-2026-05-15_project_gui-only-no-cli.md) 已经定下的约束——"测试直接 import
引擎层 Python 函数，不经 CLI 解析层"——`tests/test_sim_cli_consistency.py` 不 fork `sim_cli/main.py`
子进程、不起 HTTP server，直接 import `sim_engine.src.simulator_engine.SimulatorEngine`：

- **CLI 路径**：`engine.run_simulation()` / `run_simulation_all_plans()`（写 CSV，读回比较）
- **GUI 路径**：`engine.start_session()` + `batch_steps()`（内存返回，直接比较）
- 两条路径喂同一份 `current_model.plans[plan_id]`（后端已解析的 regimen 数据，ADR 0110 之后是
  唯一来源），逐步比较每个输出变量的值，要求数值完全一致

测试用例：
1. `models/test/test_plans.yaml`（无分布参数）× 3 个 plan：纯粹验证 CLI 的连续 `run_simulation`
   循环和 GUI 的 `start_session`/`batch_steps` 分批循环这两种不同的执行机制，在喂同样 regimen 数据
   时是否产生相同轨迹。
2. `models/test/test_mc_distributions.yaml`（有分布参数）：GUI 路径 `sim_runs=1`，钉住上述 MC
   确定性 bug 的回归——验证后该用例确认能在恢复 bug 时失败、修复后通过。

### 配套基础设施

- 新增 `pytest.ini`（`testpaths = tests`）。仓库根目录已有的 `pyproject.toml` 不是合法 TOML
  （只是非正式笔记），pytest 默认会尝试解析它作为配置来源并报错退出；`pytest.ini` 优先级更高，
  绕开这个问题，不改动 `pyproject.toml` 本身。

## 不在本次范围内

- 不验证优化器（`--opt`）路径的一致性：CLI 和 GUI 的 opt 路由都直接调用同一个
  `sim_engine.src.optimizer_engine.run_optimizer`，没有发现分叉，暂不需要专门测试。
- 不验证前端 TypeScript 的 plan 映射逻辑（ADR 0110 处理的那部分）：那是纯字段映射，已通过浏览器
  实测验证，不在这个 Python 测试套件的范围内。

## 结果

```
tests/test_sim_cli_consistency.py   新增，4 个测试用例
pytest.ini                          新增
sim_engine/src/session_manager.py   start_session() 的采样条件补 n_runs > 1（ADR 0045 回归修复）
```

## 关联

- ADR 0045 — MC 概率仿真架构（"MC=1 确定性模式取均值"的原始决策）
- ADR 0072 — 测试直接 import 引擎层函数，不经 CLI 解析层
- ADR 0101 — CLI 升级为公开发布接口（结果一致性对 AI/自动化使用者尤其重要）
- ADR 0110 — Plan/Schedule 解析单一来源
- `docs/cli.md`"与 GUI 的关系"一节的"结果格式一致"承诺
