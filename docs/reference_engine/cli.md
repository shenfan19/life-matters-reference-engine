# Life Matters CLI (`lm-sim`)

`cli/` 提供命令行批量运行接口，适合自动化仿真、脚本调度、开发调试，
以及 **AI agent**（如 Claude Code 等）直接运行模型并读取结构化结果。  
面向人类研究者的正式用户界面仍为 GUI（`gui/`）；CLI 不覆盖 GUI 的交互功能（图表、拖拽、历史存档等）。

完整数据流见 [`data_flow.md`](data_flow.md)。

---

## 面向 AI / 自动化场景

CLI 的输入输出均为文本/文件，适合被脚本或 AI agent 调用：

- **输入**：模型 YAML 文件路径 + 可选的步骤标志（`--sim-only` / `--opt-only`，默认两者都跑），无需交互。
- **输出**：结构化 CSV（仿真时间序列 / Pareto 前沿）+ 日志文件，路径在运行结束后打印到 stdout，可直接解析。
- **退出码**：成功为 `0`，仿真/优化失败为 `1`。
- **无需图形环境**：可在 headless 容器、CI、SSH 会话中运行。

随代码 release 发布的压缩包中包含可直接运行的 `lm-sim`（PyInstaller 编译产物），无需安装 Python 即可使用（见下方"编译为独立可执行文件"）。

---

## 安装与运行

### 直接运行（需要 Python 环境）

从项目根目录执行：

```bash
# 单模型（main.py）
python cli/main.py <model.yaml>                # 同时跑 sim + opt
python cli/main.py <model.yaml> --sim-only
python cli/main.py <model.yaml> --opt-only
python cli/main.py <model.yaml> --opt-only --opt-continue
python cli/main.py <model.yaml> --opt-only --opt-continue output/masld_insulin_a7_s2/2026-06-06_13-00-34_opt.csv

# 批量（batch.py，遍历文件夹，汇总报告，详见下方"批量运行"一节）
python cli/batch.py --input-dir models/papers --sim-only
```

### 编译为独立可执行文件

```bash
pyinstaller cli/build.spec
```

产出 `dist/lm-sim.exe`（Windows）。发布时需将 `models/` 文件夹与 exe 放在同一目录。

> `build.spec` 目前只打包 `main.py`（单模型入口）。`batch.py` 暂无对应 exe，
> 需要批量运行的用户仍需 `python cli/batch.py`（要求本机有 Python 环境）。

---

## 路径配置

模型库根目录、输出根目录、SCS 模式由 `reference_engine/src/paths.py` 统一解析，GUI 后端（`api_server.py`）
和 CLI（本文档）共用同一份逻辑，不各自维护一套默认值：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `LM_MODELS_PATH` | `<项目根>/models` | 模型库根目录 |
| `LM_OUTPUT_PATH` | `<项目根>/output` | CLI 输出根目录（GUI 暂不写盘，见"与 GUI 的关系"） |
| `SCS_MODE` | `false` | 云端多用户部署的写保护开关，见 [ADR 0078](decisions/0078-2026-05-18_project_scs-mode-design.md) |

复制项目根目录下的 `.env.example` 为 `.env` 并修改即可（`.env` 已在 `.gitignore`，不会被提交）；
不设置时使用上表默认值，本地开发通常无需创建 `.env`。

---

## 命令参数

两个入口的"跑哪些步骤"参数完全一致：`--sim-only`/`--opt-only` 互斥，都不传则默认两者都跑。

### `main.py`（单模型）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `<model.yaml>` | （必填） | 模型文件路径（绝对路径或相对于项目根的路径） |
| `--sim-only` | （跑 sim + opt） | 只运行仿真，跳过优化器。与 `--opt-only` 互斥。若模型定义了 `simulation.plans`，对每个方案各跑一次，输出多个 CSV（`<stem>__<plan_id>.csv`）；否则输出单个 `<stem>.csv` |
| `--opt-only` | （跑 sim + opt） | 只运行优化器（NSGA-II），跳过仿真。与 `--sim-only` 互斥 |
| `--opt-continue` | （不热启动） | 热启动：从模型 YAML 内嵌的 `optimizer.results` 继续搜索。要求优化器步骤会运行（不能与 `--sim-only` 同传） |
| `--opt-continue PATH` | — | 热启动：从指定的 `_opt.csv` 文件加载 Pareto 前沿（相对路径从项目根起算，或绝对路径） |
| `--output-dir PATH` | `output/` | 指定输出根目录（相对项目根或绝对路径）。结果写入 `<PATH>/<模型名>/` |

> 仿真步骤和优化步骤各写各自的日志文件（`*_sim.log` / `*_opt.log`），不会混在一起；两步骤都跑时按"先 sim 再 opt"顺序执行，sim 失败则不再跑 opt。

> **Monte Carlo 跑几次不是 CLI 参数**：跑 N 次仿真的次数和种子来自模型自己的 `simulation.mc.runs`/`simulation.mc.seed`（见 `model.md`），CLI 只是照着 YAML 跑，不提供 `--mc-runs`/`--seed` 这样的覆盖开关——和 `optimizer.mc.*`（优化器的 MC 配置，也只在 YAML 里，从无对应 CLI flag）保持同一套规则：要改运行次数，编辑模型文件，不是命令行。`mc.runs` 缺省或为 1 即确定性模式（取分布均值，ADR 0045）；大于 1 时输出 `<stem>__run{i}.csv`（多方案为 `<stem>__<plan_id>__run{i}.csv`）。

### `batch.py`（批量，遍历文件夹）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--input-dir PATH` | `models/`（整个模型库） | 要扫描的模型文件夹（递归查找 `*.yaml`）。**相对路径从 `models/` 起算**（与 GUI 的文件树/`model_key` 同一套根目录约定，见下方"路径配置"），例如 `--input-dir test` 等价于 `models/test`；绝对路径不受影响 |
| `--output-dir PATH` | `output/`（项目根） | 批次目录的根路径（相对项目根，或绝对路径）；实际输出在 `<PATH>/<时间戳>/<模型名>/` 下 |
| `--sim-only` | （跑 sim + opt） | 只运行仿真，跳过优化器。与 `--opt-only` 互斥 |
| `--opt-only` | （跑 sim + opt） | 只运行优化器，跳过仿真。与 `--sim-only` 互斥 |

> `batch.py` 不带参数运行等价于 `--help`（避免误跑默认文件夹）。
> 与 `main.py` 的区别仅在于输入是文件夹（`--input-dir`）而非单个模型文件，且无 `--opt-continue`（批量场景不支持热启动，多个模型也不可能共享一份热启动 CSV）。Monte Carlo 同样按各自模型 YAML 里的 `mc.runs` 跑，不是 batch 的参数——这意味着如果某个模型声明了较大的 `mc.runs`，批量测试会按该模型的真实配置变慢。

---

## 输出文件

所有输出写入 `output/{模型名}/` 目录（`output/` 已加入 `.gitignore`，目录本身入 git）；
用 `--output-dir` 可改变根目录，模型子目录的嵌套规则不变。  
文件名格式：`{模型名}_{YYYY-MM-DD_HH-MM-SS}_{模式}.{扩展名}`

| 文件 | 说明 |
|------|------|
| `*_sim.csv` | 仿真时间序列，每列一个输出变量；若模型定义了多个 `simulation.plans`，则为 `*_sim__<plan_id>.csv`（每个方案一个文件） |
| `*_opt.csv` | Pareto 前沿表格，每行一个解（x 列 + f 列）；每代结束后实时覆盖，中断不丢 |
| `*_{模式}.log` | 运行日志（含每代 feasible ratio） |

CLI 不输出 YAML 副本。要发布结果，在 GUI opt tab 导入 CSV 后点击"保存结果到模型"，将 Pareto 前沿写回原始 YAML 的 `optimizer.results` 块。

---

## 运行时输出

```
  Life Matters CLI
  Model : masld_insulin_a7_s2.yaml
  Mode  : opt
  Log   : masld_insulin_a7_s2_2026-06-01_14-23-05_opt.log

  Type  q + Enter  at any time to stop and save current results.

  Gen  10 | eval:   999 | feasible:  23% | best_f: [12.1, 2.8, 76.0]
  Gen  20 | eval:  1999 | feasible:  61% | best_f: [9.3,  2.3, 74.2]
```

**`feasible` 字段含义**：当前代种群中满足所有硬约束的解的比例。  
持续为 0% 说明约束过紧或初始状态本身违反约束，需检查模型设计。

---

## 提前停止与热启动

优化运行期间输入 `q` + Enter（任意终端均有效）：

1. 当前代跑完后停止
2. 已搜索到的 Pareto 前沿写入 `_opt.csv`
3. 日志末尾标注 `stopped_early: true`

> **每代自动保存**：`_opt.csv` 在每代结束后实时覆盖写入，即使终端意外关闭也不会丢失进度。

下次从停止点继续，有两种方式：

```bash
# 1. 从指定 _opt.csv 文件热启动（推荐：路径明确，不依赖模型文件是否已更新）
python cli/main.py <model.yaml> --opt-only --opt-continue output/masld_insulin_a7_s2/2026-06-06_13-00-34_opt.csv

# 2. 从模型 YAML 内嵌的 optimizer.results 热启动（需先在 GUI 保存结果到模型）
python cli/main.py <model.yaml> --opt-only --opt-continue
```

---

## 输入校验

CLI 与 GUI 在仿真/优化真正开始执行前，会校验模型里所有日期（`start_date`/`end_date`/
`valid_start`/`valid_end`/`date_range`）和时间（`time_start`/`time_end`）字段的格式
（`reference_engine/src/validation.py`，ADR 0118）。格式不合法时直接报错并停止，不会用默认值
静默继续：

```
Simulation failed: Invalid date for simulator.start_date: '2026-13-99' (expected YYYY-MM-DD)
```

这条校验和 sim/opt 执行核心共用同一份引擎层代码（见下"与 GUI 的关系"），所以 CLI 报错信息
和 GUI 报错信息（出现在界面的提示框里）对同一个错误输入完全一致。CLI 端这条信息同时写入
`运行时输出`一节描述的日志文件和标准输出。

---

## 日志设计

日志文件记录：
- CLI 自身的进度消息（每代 `Gen N | eval | feasible | best_f`、各 plan 完成的步数）
- 仿真/优化运行信息——模型规模（变量/公式数）、imports、起止日期与步长、output 变量列表、
  schedule/regimen 变量名、NaN/越界告警、完成耗时与 schedule 命中次数（sim）；目标/约束/决策变量/
  算法配置（opt）。这部分内容由 `reference_engine/src/run_logging.py`（sim）和 `optimizer_engine.py` 的
  `log_cb` 机制（opt）生成，与 GUI 运行时日志面板显示的内容是同一份代码产出，只是落地渠道不同
  （CLI 写日志文件，GUI 存进内存会话） —— 见 ADR 0119。
- 引擎级别 WARNING / ERROR

日志与 CSV 使用相同时间戳命名，便于对应。

---

## 与 GUI 的关系

| 功能 | GUI | CLI |
|------|-----|-----|
| 交互式参数调整 | ✅ | ❌ |
| Pareto 前沿可视化 | ✅ | ❌ |
| 批量/自动化运行 | ❌ | ✅ |
| 结果文件输出 | 手动导出 | 自动（`output/<模型名>/`） |
| 热启动 | ✅（界面勾选或导入 CSV） | `--opt-continue` |
| CLI 结果导入 GUI | — | GUI opt tab "导入 CSV" |
| Monte Carlo 多 run | ✅（界面可临时改 sim_runs/seed，覆盖 YAML，不回写） | 严格按模型 YAML 的 `mc.runs`/`mc.seed` 跑，无覆盖开关 |

CLI 与 GUI 共用同一个引擎层（`reference_engine/src/`），结果格式一致，可互通——sim 的执行核心
（`apply_schedules` → `model.step()` 的循环）和 MC 种子派生都是同一份代码（见 ADR 0113），
不是两份各自实现后凑巧一致。这个一致性由 `tests/test_sim_cli_consistency.py` 自动回归验证
（见 ADR 0111/0112/0113）。

### 按数据流拆分：哪些共用，哪些独立

把整条流水线（输入 → 校验 → 执行 → 日志/报错 → 结果输出）拆开看，更精确的边界是：

| 步骤 | GUI 独有 | CLI 独有 | 共用 |
|---|---|---|---|
| 入口/触发 | HTTP API，异步、session/job 轮询 | argparse，同步阻塞 | 都落到 `ReferenceEngine` 的方法上 |
| 参数来源 | 请求体可运行时覆盖 regimens/MC runs，不回写 YAML | 严格只读 YAML | 解析后落到同一套 `ModelStructure` 字段 |
| 模型加载/校验 | — | — | `LoaderEngine.fetch()`；`validation.py`（ADR 0118） |
| MC 采样 | — | — | `mc_utils.py` |
| Sim 执行核心 | 分批跑（`batch_steps`），支持暂停/恢复 | 一次跑到底 | `schedule_runner.advance_steps`（ADR 0113） |
| Opt 执行核心 | 异步 Job，可取消 | 同步阻塞，`q`+Enter 提前停止 | `optimizer_engine.run_optimizer()` 整个函数 |
| 进度/日志内容 | — | — | `run_logging.py`（sim）+ `log_cb`（opt），见 ADR 0119 |
| 进度/日志落地 | 内存 `session['logs']`/`job['logs']`，前端面板展示 | 写入 `<stem>.log` 文件 | 内容来自同一份代码，只是出口不同 |
| 报错 | `HTTPException` → 前端 `message.error()` | `logger.error()` + 退出码 1 | 同一个 `{"success": False, "error": str(e)}` |
| 结果输出 | 手动导出 | 自动写入 `output/<模型名>/` | CSV 字段格式一致 |

暂停/恢复控制是唯一一处"合理且预期独立"的部分——CLI 同步阻塞执行，GUI 异步轮询，两种执行模型
本身不共享同一种暂停机制。其余差异都是"批处理工具 vs 交互式服务"该有的 IO/触发方式不同，逻辑内核
（校验、执行核心、日志内容、报错格式）都已经统一。

---

## 批量运行 (`cli/batch.py`)

`cli/batch.py` 遍历一个文件夹下的所有 YAML，对每个模型依次运行仿真和优化器（默认两者都跑，可用 `--sim-only`/`--opt-only` 收窄），汇总结果到 Markdown 报告。
与 `main.py` 同属 `cli/`，纯 Python 实现，不依赖 bash，可在 PyInstaller 编译的 `lm-sim` 同一环境下运行。
运行示例与参数见上方"命令参数"一节。

每次运行创建一个以秒级时间戳命名的批次目录（`<output-dir>/YYYY-MM-DD_HH-MM-SS/`），
内部按 `lm-sim` 的统一规则再分模型子目录（`<模型名>/`），所有 CSV、log 和 `batch_report.md` 都放入该批次目录。并发运行多个进程不会冲突。

### 报告

`batch_report.md` 中每个模型一行，包含 Sim / Opt 两列：
- 实际运行且成功：`[✓ PASS](./<模型名>/xxx.csv)`（链接到结果 CSV）
- 实际运行但失败：`✗ FAIL`，错误摘要列附带引擎日志中的最后一条 ERROR 消息
- 因 `--sim-only`/`--opt-only` 而未运行的步骤：`⏭ SKIP`

单个模型崩溃不会中断整批运行；汇总区给出整体 PASS/FAIL 计数（按模型计，只要该模型实际运行的步骤全部成功即为 PASS）。

---

## 目录结构

```
cli/
  main.py       # 单模型入口，argparse，dispatch
  batch.py      # 批量入口：遍历文件夹，逐模型调用 runner，生成 batch_report.md
  runner.py     # run_sim / run_opt，调用引擎
  output.py     # 输出目录/CSV 写入与日志配置
  progress.py   # 实时进度显示与停止信号监听
  build.spec    # PyInstaller 构建配置

output/                     # CLI 输出根目录（内容 gitignore，目录本身入 git）
  <模型名>/                  # 按模型分子目录
    <timestamp>_sim.csv
    <timestamp>_opt.csv
    <timestamp>_<mode>.log
```
