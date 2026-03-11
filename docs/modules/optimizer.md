# Optimizer 模块说明 (Parameter Optimization)

## 功能说明
Optimizer（参数优化器）以 `LoaderEngine` 加载的合并模型为输入，通过机器学习方法对**可控输入参数**进行最优化，使某个或多个状态指标达到期望目标。Optimizer 是 Simulator 的"外循环"：每次参数候选 → Simulator 跑一轮仿真 → 评估目标函数 → 反馈给 Optimizer。

## 优化指标建议

在 LifeMatters 中，推荐以下状态参数作为优化指标（可在 `story.yaml` 的 `optimizer.targets` 中组合定义）：

| 目标名称 | 含义 | 适用场景 |
|---|---|---|
| `max_longevity` | 寿命最长 | 慢性病（肺癌、糖尿病）健康仿真 |
| `max_wealth` | 赚钱最多 | 微观社会学、职业路径经济仿真 |
| `max_qol` | 生活品质最高（健康最高） | 交互式人生模拟 Experience Game |
| `max_career` | 事业最成功 | 社会网络演化、职业影响力仿真 |
| `max_social_impact` | 社会影响力最大 | 传染病传播、领导力与政策仿真 |
| `max_sustainability` | 环境可持续性最高 | 碳足迹、生态系统跨领域仿真 |

这些指标可灵活组合形成**多目标优化问题**，通过帕累托前沿（Pareto Front）得到一组权衡解，而非单一最优解。

## 优化方法推荐

| 方法 | 优点 | 缺点 | 推荐场景 |
|---|---|---|---|
| **加权和法 (Weighted Sum)** | 实现最简单，计算快 | 权重需人工设定，可能遗漏非凸区域 | 入门，快速验证想法 |
| **NSGA-II（多目标遗传算法）** | 提供完整帕累托解集，处理非凸问题 | 计算密集，收敛慢 | 多目标平衡，科研分析 |
| **ε-约束法** | 对约束边界控制精确，解均匀分布 | 需多次求解，对 ε 值敏感 | 约束明确的单指标优化 |
| **多目标粒子群 (MOPSO)** | 全局搜索能力强，收敛较快 | 易陷局部最优，稳定性依赖初始设置 | 并行计算场景 |
| **多目标强化学习 (MORL)** | 适应动态环境，能学复杂策略 | 训练不稳定，样本效率低 | 长期动态决策，远期规划 |

**推荐入手顺序**：
1. 先用**加权和法**跑通流程
2. 再换**NSGA-II**（通过 `pymoo` 库）得到 Pareto Front
3. 如需动态交互，探索 MORL

## Simulator 的角色
优化过程要求 Simulator 具备以下能力：
- **无副作用快照**：每次评估后能恢复初始状态（reset），避免状态污染。
- **批量并行执行**：支持多参数组合的并发仿真（用于种群算法的每一代评估）。
- **目标函数提取**：在仿真结束后，能从状态变量中提取用户指定的 `targets`（如最终的 `health` 值）。

## 开放接口（CLI）
```bash
python sim_engine/src/optimizer_cli.py --file stories/marie_curie/story --target max_qol --method nsga2
```
