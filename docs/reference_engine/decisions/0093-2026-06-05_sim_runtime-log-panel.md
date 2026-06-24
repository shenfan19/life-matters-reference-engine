# 0093 — Sim/Opt 运行时日志面板：内容分层与实现

**日期**：2026-06-05  
**状态**：✅ 已实施  
**类别**：UI / 引擎接口

---

## 背景

仿真和优化运行完成后，用户需要了解"刚才发生了什么"——模型加载了哪些 imports、输出了哪些变量、有没有数值异常——但没有任何地方汇总这些信息。Opt Tab 已有一个基础 Log 面板（仅记录每代进度），Sim Tab 完全没有日志。

---

## 决策

### 记录内容（两档）

**必须记录**（每次运行都有）：

| 内容 | 示例 |
|------|------|
| 模型名 + 变量/公式数量 | `Model: ckd_protein_a4 (31 vars, 12 formulas)` |
| 已解析的 imports 列表 | `Imports: references/medical/physiology/glucose_regulation_2026_mw` |
| 仿真配置（起始日、步长、总步数） | `Sim: start=2026-01-01, step=1 day, 365 steps` |
| 输出变量列表（最多 8 个，超出标 +N more） | `Outputs (5): GFR, muscle_mass, lm_score, ...` |
| Regimen 变量（来自用户 GUI 输入） | `Regimens: dietary_protein` |
| MC 配置（有 MC 时才显示） | `MC: 30 runs, seed 42` |
| 耗时 + 总步数（完成时） | `Done in 2.3s — 365 steps` |
| Schedule 命中统计（完成时，有 input 变量才显示） | `Schedule hits: dietary_protein=1095` |

**值得记录**（按需出现，不超发）：

| 内容 | 示例 | 限制 |
|------|------|------|
| NaN / Inf 检测 | `⚠ NaN/Inf in 'GFR' at step 45` | 每变量首次出现 |
| bounds 越界 | `⚠ Bounds: 'blood_glucose'=310.5 ∉ [0, 300] at step 12` | 每变量首次出现 |
| output_variables 中不存在的变量（已有机制，作为 output warning） | — | — |

### 不记录的内容（决定排除）

- **每步每变量的值**：这是仿真输出数据，不是日志；已通过 CSV 导出覆盖。
- **Python 内部调用栈 / INFO 级别引擎消息**：仅在 debug 模式开启；日志面板面向建模者，不面向开发者。

### Opt Log 增补

在已有 Gen N 进度日志的基础上，在优化开始时追加相同的模型信息和配置摘要：

```
Starting optimizer...
Model: ckd_protein_a4 (31 vars, 12 formulas)
Imports: references/medical/physiology/glucose_regulation_2026_mw
Objectives (2): ↑GFR(final), ↑muscle_mass(final)
Decision vars (3 dims): dietary_protein
Algorithm: nsga2, pop=50, gen=80
Gen 1  best=-47.1  eval=50
...
```

---

## 实现

### 后端（`session_manager.py` / `optimizer_engine.py`）

- **Session log**：`session['logs']` 存储 `{t: unix_timestamp, msg: str}` 列表，由 `start_session()` 初始化，`batch_steps()` 追加。
- **NaN/Inf / bounds 检查**：每个 batch 调用结束后检查本批输出；`session['warned_vars']` 集合确保每变量只警告一次。
- **Schedule hits**：仅在 `completed=True` 时统计（扫描 `session['data']`，对 input 变量的非零值计数）。
- **Opt log**：`run_optimizer()` 新增可选 `log_cb` 参数；`routes/optimizer.py` 传入 `lambda msg: add_log(job, msg)`。

### 前端

- **Sim Tab**：`simLogs` 状态存在 `Simulator.tsx`；`useSimulation` 从 `/api/simulation/start` 和 `/api/simulation/batch` 响应的 `logs` 字段更新；`SimPlotTab` 底部渲染可折叠 Log 面板（含复制/下载按钮，自动滚底）。
- **Opt Tab**：已有 Log 面板，无 UI 变更；仅扩充后端写入内容。
- **日志传输方式**：嵌入在已有 API 响应体（`start` / `batch`）的 `logs` 字段，不新增轮询端点。

---

## 替代方案

| 方案 | 否决原因 |
|------|---------|
| 新增 `GET /api/simulation/session/{id}/logs` 端点 | 需要额外轮询，增加前端复杂度；logs 体积小，随 batch 响应捎带成本可忽略 |
| 每步都写 log | 日志量与步数成正比，数千步后面板卡顿；绝大多数步数信息对建模者没有价值 |
| 只在 CLI 写日志，GUI 不改 | GUI 建模者同样需要快速定位 NaN/越界问题，而不是去看服务器终端 |
