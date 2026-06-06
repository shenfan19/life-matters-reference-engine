# 0091 — `sim_cli/`：批量仿真 CLI 工具

**日期**：2026-06-01  
**状态**：✅ 已实施（2026-06-01 修订：去除 `_opt.yaml` 输出；2026-06-06 修订：时间戳格式、`--continue` 简化、批量测试脚本）  
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
| `*_opt.csv` | Pareto 前沿（x 列 + f 列）；每代实时覆盖写入 |
| `*_{mode}.log` | 运行日志 |

文件名含时间戳（`YYYY-MM-DD_HH-MM-SS`，精确到秒），多次运行不覆盖，可追溯。  
所有输出写入 `output/`（内容 `.gitignore`，目录本身入 git）。

**修订（2026-06-01）**：原设计含 `*_opt.yaml`（完整模型副本 + results）。
经评估该文件与"GUI 保存结果到模型"功能重叠，引入了"哪个 YAML 是主文件"的歧义，已移除。
发布路径改为：GUI 导入 `_opt.csv` → "保存结果到模型" → 写回原始 YAML。

### 结果不自动写回模型

CLI 不修改原始模型 YAML。发布是用户的显式操作，不是 CLI 自动行为：
- 调试阶段可能跑多次，每次覆盖会污染模型定义
- 用户对"什么时候结果值得发布"有判断权
- 发布路径：GUI "导入 CSV" → "保存结果到模型" → git

### 模型文件依然是单文件（不拆分）

讨论过将 `optimizer.results` 独立为 sidecar 文件，最终维持单文件设计。  
理由：目标用户（临床研究者）通过邮件/补充材料共享模型，单文件无歧义。

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

---

## 2026-06-06 修订

### 1. 时间戳格式变更

原格式 `YYYYMMDD_HHMM`（精度到分钟）改为 `YYYY-MM-DD_HH-MM-SS`（精度到秒）。  
原因：同分钟内多次运行会覆盖输出文件；秒级精度消除冲突，且格式更易读。

影响范围：`sim_cli/output.py::make_stem()`，文件名示例已更新至 `cli.md`。

### 2. `--continue` 接口简化

移除原"写法二"（`--continue TIMESTAMP`，形如 `--continue 20260606_1122`）。  
保留：
- `--continue`（无参数）：从模型 YAML 的 `optimizer.results` 热启动
- `--continue PATH`：从指定 `_opt.csv` 文件热启动（相对于项目根或绝对路径）

原因：时间戳写法依赖文件名格式的隐含约定，路径写法更明确，也兼容批量子目录布局。

### 3. `script/test_batch.sh` — 批量测试脚本

新增 `script/test_batch.sh`，作为 CLI 的批量编排层：

- 遍历指定文件夹（默认 `models/references`）下所有 YAML
- 对每个模型依次执行 `--sim` 和 `--opt`
- 每次运行创建 `output/YYYY-MM-DD_HH-MM-SS/` 子目录，所有 CSV、log 和 `batch_report.md` 放入其中
- 并发运行多个实例不冲突（子目录按脚本启动时间戳区分）
- 参数通过环境变量控制：`MODEL_FOLDER`、`RUN_OPT`

子目录管理是脚本的职责，CLI 本身始终写入 `output/` 根目录，对批量逻辑无感知。

**公开性**：`batch_test.sh` 随代码公开发布（无敏感内容，合作者维护模型库时可用）；不进入 S1 论文（纯工程工具，非科学贡献）。

---

## 关联

- `docs/cli.md` — 使用文档
- `sim_cli/` — 实现目录
- `script/test_batch.sh` — 批量测试脚本
- ADR 0072 — GUI-only 决策（部分修订）
- `sim_engine/src/optimizer_engine.py` — `_StopOptimization` + `latest_front` 改动
