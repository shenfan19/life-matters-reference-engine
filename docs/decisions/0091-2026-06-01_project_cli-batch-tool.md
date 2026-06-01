# 0091 — `sim_cli/`：批量仿真 CLI 工具

**日期**：2026-06-01  
**状态**：✅ 已实施  
**类别**：架构 / 接口  
**修订**：部分修订 ADR 0072（GUI-only）

---

## 背景

ADR 0072 确立"GUI 是唯一正式用户接口，CLI 仅用于内部调试"。  
随着 `optimizer.results` 集成到模型 YAML、模型文件数量增加，出现两个新需求：

1. **批量运行**：对多个模型批量跑仿真或优化，GUI 无法自动化。
2. **开发调试**：跑优化过程中需要观察 `feasible ratio`、提前停止保存中间结果、热启动继续，GUI 的交互限制了调试效率。

---

## 决策

新增 `sim_cli/` 模块，实现以下能力：

| 能力 | 说明 |
|------|------|
| `--sim` | 读取模型 YAML，运行仿真，输出 CSV |
| `--opt` | 运行 NSGA-II 优化，输出带结果的完整模型 YAML + Pareto CSV |
| `--continue` | 热启动：从模型中已有的 `optimizer.results` 继续搜索 |
| 提前停止 | 运行中输入 `q` + Enter，当代完成后停止并保存当前前沿 |
| 实时日志 | 每代输出 `feasible ratio`、`n_eval`、`best_f` |

---

## IO 设计决策

### 输出文件格式

| 文件 | 内容 |
|------|------|
| `*_sim.csv` | 仿真时间序列 |
| `*_opt.yaml` | 完整模型 + `optimizer.results`（可直接在 GUI 加载） |
| `*_opt.csv` | Pareto 前沿（x 列 + f 列，便于分析） |
| `*_log.txt` | 运行日志 |

文件名含时间戳（`YYYYMMDD_HHMM`），多次运行不覆盖，可追溯。  
所有输出写入 `output/`（`.gitignore` 排除）。

### 结果不自动写回模型

CLI 默认不修改原始模型 YAML。`_opt.yaml` 是输出副本，包含本次完整结果。  
"发布结果"是用户的显式操作（手动覆盖原文件），不是 CLI 自动行为。

这一设计的理由：
- 调试阶段可能跑多次，每次都覆盖模型文件会污染定义
- 用户对"什么时候结果值得发布"有判断权
- 已有结果的模型（`_opt.yaml`）可直接拖入 GUI 热启动

### 模型文件依然是单文件（不拆分）

讨论过将 `optimizer.results` 独立为 sidecar 文件，最终维持单文件设计。  
理由：目标用户（临床研究者）通过邮件/补充材料共享模型，单文件无歧义；  
CLI 的工程摩擦通过输出副本（`_opt.yaml`）解决，无需改变格式。

---

## 早停机制实现

`optimizer_engine._ProgressCb` 新增：
- `self.latest_front`：每代保存当前 Pareto 前沿
- `progress_callback` 返回 `True` 时抛出 `_StopOptimization`
- `_run_nsga2` 捕获异常后从 `latest_front` 构建结果，`result["stopped"] = True`

键盘监听使用 stdin（`q` + Enter），兼容 VSCode 集成终端、Git Bash 及所有平台。  
`msvcrt.kbhit()` 方案因被 VSCode 拦截而放弃。

---

## 与 ADR 0072 的关系

ADR 0072 的核心约束保持不变：
- GUI 仍是唯一正式用户接口
- CLI 不向普通用户宣传，不承诺功能对等
- 自动化批量场景的"正式"路径仍是 HTTP API

本 ADR 新增的 CLI 定位为**开发者/高级用户工具**，可编译为独立 exe 分发给有批量需求的合作研究者。不进入 GUI 文档，不接受功能请求驱动的迭代。

---

## 关联

- `docs/cli.md` — 使用文档
- `sim_cli/` — 实现目录
- ADR 0072 — GUI-only 决策（部分修订）
- `sim_engine/src/optimizer_engine.py` — `_StopOptimization` + `latest_front` 改动
