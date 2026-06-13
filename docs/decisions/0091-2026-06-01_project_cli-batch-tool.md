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

**2026-06-13 修订（ADR 0101）**：CLI 进一步升级为面向 AI/自动化场景的公开发布接口，
随代码 release 提供 `lm-sim.exe`，并在 README/`cli.md` 中说明用途。
"不进入 GUI 文档"的约束不变——GUI 文档仍只面向人类用户，CLI 文档独立维护于 `cli.md`。

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

**2026-06-13 修订：迁移为 `sim_cli/batch.py`（见下方）。**

---

## 2026-06-13 修订：`script/test_batch.sh` → `sim_cli/batch.py`

ADR 0101 把 CLI 升级为面向 AI/发布的公开接口后，`test_batch.sh` 暴露出两个问题：

1. **依赖 bash**：发布的 `lm-sim.exe` 在纯 Windows（无 Git Bash）环境下无法使用批量功能，与"公开接口"定位不符。
2. **subprocess + stdout 解析**：脚本通过 `python sim_cli/main.py ... 2>&1` 拿到输出后用 `grep` 提取 CSV 文件名/错误信息，脆弱且与 `main.py` 的打印格式耦合。

**决策**：删除 `script/test_batch.sh`，新增 `sim_cli/batch.py`：

- 纯 Python，与 `main.py` 同目录，不依赖 bash，PyInstaller 编译的 `lm-sim` 同环境可用
- 直接 `import runner.run_sim / run_sim_all_plans / run_opt` 在进程内调用，不经 subprocess，无需解析 stdout
- 每个模型的运行包在 `try/except` 中，单个模型崩溃不中断整批（原 bash 版靠 subprocess 天然隔离，Python 版需显式处理）
- 错误摘要通过临时挂载的 `logging.Handler` 捕获 ERROR 级别日志，而非 grep 文本
- 参数、批次目录结构（`<output-dir>/<timestamp>/<模型名>/`）、`batch_report.md` 格式与原 bash 版保持一致

CLI 本身（`main.py`）的"按模型分子目录 + `--output-dir`"规则（本次 ADR 0101 实施时引入）对两者通用，`batch.py` 只是给每个模型调用传入同一个批次目录作为 `output_dir`。

---

## 关联

- `docs/cli.md` — 使用文档
- `sim_cli/` — 实现目录（`main.py` 单模型，`batch.py` 批量）
- ADR 0072 — GUI-only 决策（部分修订）
- ADR 0101 — CLI 升级为公开发布接口；`--output-dir` + 按模型分子目录规则；`batch.py` 取代 `test_batch.sh`
- `sim_engine/src/optimizer_engine.py` — `_StopOptimization` + `latest_front` 改动
