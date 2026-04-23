# Sim/Opt 概率仿真与优化策略
**日期**：2026-04-20  
**状态**：已决策，待实现

---

## 问题背景

本项目有两个执行模式：

- **sim 模式**：给定固定 Regimen 输入，运行仿真，观察轨迹
- **opt 模式**：搜索最优 Regimen，使目标变量（如 health）达到最佳

系统存在**随机性**，来源是**医学/生理模型中的概率参数**，例如：
- 某种疾病在特定状态下的发病概率（如 `P(infection | radiation > 60) = 0.3/month`）
- 生理过程的个体差异（如食物消化速率服从正态分布）
- 药物吸收效率的随机波动

> **注**：卡牌游戏（c_sim game 层）是 sim 的纯下游展示，其随机性不参与 sim/opt 的计算逻辑。

随机性的存在使得同一组输入参数每次仿真结果不同，由此产生两个设计分叉：

> 同一组 Regimen 输入 → 每次仿真结果不同 → 一条曲线够吗？

---

## 决策一：Sim 模式 —— 默认单条，可选 Monte Carlo

**已决策**：

- **默认 N=1**（单条轨迹）：快速预览，秒级响应，适合大多数交互探索场景
- **可选 N>1**（Monte Carlo）：同一参数运行 N 次，展示不确定性范围

**单条的价值**：快速、直观，给用户"一种可能的未来"的感受。当模型随机性弱（参数确定，无概率项）时，单条即为唯一正确轨迹。

**多条的价值**："曲线密集 = 结果稳定，曲线分散 = 高度依赖随机参数"，让用户直接感知策略的稳健性。对含概率参数的医学模型（如辐射致癌概率、感染率）尤为重要。

**UI 展示方案**（已定）：
- N=1：单条实线
- N>1：N 条半透明细线（opacity ≈ 0.25）+ 一条均值粗线（opacity = 1.0），颜色与变量一致

**参数**：

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `sim_runs` | 1 | 1~100 | Sim 模式运行条数 |

---

## 决策二：Opt 模式 —— 方案 B（多条期望迭代），后续演进至方案 C

**已决策**：**当前采用方案 B**，后续有需要时升级为方案 C。

### 方案 B（当前）：每次迭代用 N_inner 条取期望

- 优化器每次评估一组参数时，运行 N_inner 条仿真，取**均值**作为目标函数值
- 目标函数稳定、可泛化（不依赖单次随机实现）
- 找到最优后，用 N_verify 条做最终验证仿真

**放弃方案 A（固定种子单条）的理由**：固定种子的"最优解"只在该随机现实下成立，泛化性差。若模型含真实概率参数（疾病发生率、消化速率），固定种子的结论等于"在一个特定的人身上最优"，而非"平均意义上最优"。

### 方案 C（后续演进）：两阶段混合

1. Phase 1（快速探索）：N_inner=1，大量迭代，快速锁定候选区域
2. Phase 2（精细收敛）：N_inner=5~10，在候选区域精细搜索
3. 最终验证：N_verify=20

方案 C 更省计算但衔接逻辑复杂，待方案 B 稳定后再实施。

**目标函数聚合方式**：默认均值（mean），可配置为 min（最坏情形）或 median。

**参数**：

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `opt_inner_runs` | 5 | 1~20 | 每次迭代评估的仿真条数 |
| `opt_verify_runs` | 20 | 5~50 | 最终验证运行条数 |
| `opt_aggregation` | `mean` | `mean/min/median` | 目标函数聚合方式 |

---

## 决策三：随机种子管理

- **每条 run 使用独立随机种子**（不固定），确保 N 条曲线真正独立采样
- **Session 级别统一生成种子列表**：sim session 启动时预先生成 `[seed_1, ..., seed_N]`，保证同一次 session 内 N 条曲线可复现（重跑同一 session 得到相同 N 条）
- 不同 session 之间种子不同（真随机），避免用户总看到同一组"命运"

---

## 两者关系图

```
随机性来源：医学/生理概率参数（发病率、消化速率等）
               ↓
Sim 模式
  ├── N=1  → 单条轨迹（默认，快速）
  └── N>1  → Monte Carlo 多条轨迹（均值粗线 + N 条半透明细线）

Opt 模式（方案 B）
  ├── 每次迭代：N_inner=5 条仿真 → 取均值 → 目标函数值
  ├── 迭代完成：返回最优 Regimen
  └── 最终验证：N_verify=20 条 → 触发 sim Monte Carlo 展示
```

---

## 实现任务清单
- [x] sim和opt核心 [priority:: medium]  [completion:: 2026-04-23]

### T1：仿真引擎支持随机参数采样
- [x] `parameter` 变量的 `value` 字段支持分布表达式：`normal(μ, σ)` / `uniform(a, b)` / `lognormal(μ, σ)`；Loader 解析时检测字符串形式，静态数字走原有路径  [completion:: 2026-04-23]
- [x] 确定性模式：`_collect_param_distributions` 初始化时取均值；`_get_mean_value` 静态工具方法  [completion:: 2026-04-23]
- [x] MC 模式：每条 run 开始时用独立 `np.random.default_rng(seed)` 采样，整条 run 用采样值跑  [completion:: 2026-04-23]
- [x] 支持随机种子注入：`fitness_func_with_seed(seed=...)`  [completion:: 2026-04-23]
- [ ] 单元测试：相同种子 → 相同结果；不同种子 → 不同结果

### T2：Sim 模式 Monte Carlo 多条运行
- [x] `api_server.py`：`SimulationStartRequest` 加 `sim_runs: int = 1`  [completion:: 2026-04-23]
- [x] `simulator_engine.py`：`start_session` / `batch_steps` 支持 N 条顺序运行，返回 N 组 + 均值  [completion:: 2026-04-23]
- [x] 前端 `Simulator.tsx`：工具栏加 `MC×` 输入（默认 1，范围 1~50，运行中禁用）  [completion:: 2026-04-23]
- [x] 前端 Plot 渲染：N=1 时单线；N>1 时 N 条半透明细线 + 均值粗线（canvas 直接绘制）  [completion:: 2026-04-23]

### T3：Opt 模式方案 B —— 多条期望目标函数
- [x] `optimizer_engine.py`：`_multi_eval_objective` 每次评估运行 `opt_inner_runs` 条，聚合目标值  [completion:: 2026-04-23]
- [x] opt 配置界面：加 `opt_inner_runs`（默认 5）、`opt_aggregation`（默认 mean）、`opt_verify_runs`  [completion:: 2026-04-23]
- [x] 最终验证流程：`_run_verification` 以 `opt_verify_runs` 条运行，返回均值/std/min/max  [completion:: 2026-04-23]
- [x] 进度反馈：迭代动态卡显示当前期望目标分、std；验证结果内联展示  [completion:: 2026-04-23]

### T4：Session 级种子管理
- [x] `simulator_engine.py`：session 创建时生成 `session_seed` + `seed_list`，存入 session dict  [completion:: 2026-04-23]
- [x] 每条 run 从 `seed_list[run_idx]` 取种子，保证 session 内可复现  [completion:: 2026-04-23]
- [x] 前端：`MC×` 输入的 tooltip 显示 seed 值（`sessionSeed` 从 start API 返回写入 state）  [completion:: 2026-04-23]

### T5：文档与测试
- [ ] 在 `sim_design.md` 中更新随机参数语法示例
- [ ] 在 Newton / Curie YAML 中补充至少一个概率参数示例（如辐射致病率）
- [ ] 集成测试：对含概率参数的模型验证 Monte Carlo 分布宽度随 N 收敛
