# 0069 · optimizer.results 内嵌设计与无状态服务架构

**日期**：2026-05-16  
**状态**：✅ 已实施  
**类别**：数据格式 / 持久化 / 软件架构

---

## 背景

优化结果（Pareto 前沿、最优 Regimen）是 LM 最有价值的计算产出，但之前：
- Opt 结果仅存于前端 React 状态，关闭浏览器即丢失
- 没有保存、续跑、传播结果的标准路径
- 之前一版实现（ADR 0069 已撤销）采用服务器端 `runs/` 目录持久化，引入了 SaaS 级别的存储依赖——对个人研究者托管的场景不可维护

## 核心决策

### 1. 数据格式：YAML 内嵌，结果随模型走

**决定**：优化结果写入 `optimizer.results` 块，与 optimizer 配置并列存于同一 YAML 文件。

```yaml
optimizer:
  method: nsga2
  objectives: [...]
  results:                     # ← 跑完后写入
    generated_at: "2026-05-16"
    pareto_front:
      - {x: [0.30, 0.29, 0.30], f: [65.8, 47.1]}
    best:
      regimen:
        dietary_protein: {"早餐蛋白质": 0.30, "午餐蛋白质": 0.29, "晚餐蛋白质": 0.30}
      objectives: {muscle_mass: 65.8, GFR: 47.1}
```

**理由**：
- 发布模型 = 发布结果，一个文件包含完整可复现信息
- 人类可直接阅读，不需要后处理工具
- YAML flow-style（每解一行）在 50 个解时约 50 行，不破坏文件可读性
- 与模型格式（YAML-first 路线）完全统一

**替代方案被否决**：
- 独立 JSON 文件（results.json）：需要管理两个文件，发布时容易遗漏
- 服务器端数据库：SaaS 复杂度，个人托管不可维护

### 2. 无状态服务架构

**决定**：服务器不做任何持久化存储。数据流：

```
用户上传 model.yaml → 服务器计算 → 用户下载 model.yaml（含结果）→ 服务器遗忘
```

**理由**：
- 个人研究者托管：无存储成本，无 GDPR 隐患，无用户账号压力
- 科学家天然信任"自己管文件"的工作模式（与 R/Python 习惯一致）
- 无状态让服务器可以随时重启，不影响用户数据

**与 SaaS 的区别**：这是"无状态计算服务"（stateless compute service），类比 Binder/RStudio Cloud，而非 Notion/Figma 型 SaaS。

### 3. 仿真结果处理

**决定**：仿真结果（时间序列）只提供 CSV 导出，不保存到服务器，不导入续跑。

**理由**：仿真结果廉价（可随时重跑），CSV 是科学家最通用的格式（Excel/R/Python 直接打开）。断点续算对 sim 意义不大——"改参数后继续跑"实际上等价于"重新跑新参数"。

### 4. 热启动（Warm-start）

**决定**：加载含 `optimizer.results` 的模型时，GUI 自动将 `pareto_front` 的 `x` 向量作为 NSGA-II 初始种群。

**实现**：
```python
# optimizer_engine.py _run_nsga2()
if warm_x:
    warm = np.clip(np.array(warm_x), xl, xu)
    fill = xl + rng.random((pop_size - len(warm), n_var)) * (xu - xl)
    sampling = np.vstack([warm, fill]) if len(warm) < pop_size else warm[:pop_size]
    algo = NSGA2(pop_size=pop_size, sampling=sampling)
```

**优势**：比 pickle checkpoint 更灵活——可以改 pop_size、改代数，甚至小幅改目标，而不是死板地从上次状态继续。

---

## 实现范围

### 新端点
- `POST /api/optimizer/write-results` — 将 `results` 块写回模型 YAML

### 修改的模块
| 文件 | 改动 |
|------|------|
| `optimizer_engine.py` | `_run_nsga2` 支持 `warm_x` 参数；`run_optimizer` 提取 `optimizer.results.pareto_front` |
| `api_server.py` | 新增 `write-results` 端点 |
| `Simulator.tsx` | `exportSimCSV`（CSV 下载）、`saveOptResults`、`downloadModelYAML`；startOptimization 注入 warm_start |
| `SimOptTab.tsx` | "保存结果到模型"按钮、"下载模型"按钮、热启动提示横幅 |

### 更新的模型文件
所有 5 个含 optimizer 块的 published 模型均加入了 `optimizer.results` 样本：
- `paper1/fatty_liver_a1_p1` — 单目标，演示格式
- `paper2/ckd_protein_a4_p2`, `hypertension_gout_a5_p2` — 双目标
- `paper3/ckd_protein_pareto_a4_p3`, `hypertension_gout_3obj_a5_p3`, `smoking_stress_a6_p3` — 2-3 目标，论文主案例

---

## 局限性

- **服务器重启后 opt 丢失**：若用户未点击"保存结果到模型"，服务器重启后 opt 结果丢失。缓解：opt 完成后 GUI 的 Best 面板常驻，用户看到结果后有机会保存。
- **Opt 无真正断点续算**：warm-start 只能继承上次前沿，不能从上次种群的精确状态继续。对于 < 1 小时的运行，这足够；对超长运行（数小时），未来可考虑 pymoo checkpoint。
- **Sim 无断点续算**：有意为之（结果廉价）。
- **无历史对比**：每次保存覆写，不保留多次运行的对比记录。未来可在 `best` 下加 `history: [...]` 存储多次运行摘要。
