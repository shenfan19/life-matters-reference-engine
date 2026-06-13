# Life Matters CLI (`lm-sim`)

`sim_cli/` 提供命令行批量运行接口，适合自动化仿真、脚本调度、开发调试，
以及 **AI agent**（如 Claude Code 等）直接运行模型并读取结构化结果。  
面向人类研究者的正式用户界面仍为 GUI（`sim_gui/`）；CLI 不覆盖 GUI 的交互功能（图表、拖拽、历史存档等）。

完整数据流见 [`data_flow.md`](data_flow.md)。

---

## 面向 AI / 自动化场景

CLI 的输入输出均为文本/文件，适合被脚本或 AI agent 调用：

- **输入**：模型 YAML 文件路径 + 模式标志（`--sim` / `--opt`），无需交互。
- **输出**：结构化 CSV（仿真时间序列 / Pareto 前沿）+ 日志文件，路径在运行结束后打印到 stdout，可直接解析。
- **退出码**：成功为 `0`，仿真/优化失败为 `1`。
- **无需图形环境**：可在 headless 容器、CI、SSH 会话中运行。

随代码 release 发布的压缩包中包含可直接运行的 `lm-sim`（PyInstaller 编译产物），无需安装 Python 即可使用（见下方"编译为独立可执行文件"）。

---

## 安装与运行

### 直接运行（需要 Python 环境）

从项目根目录执行：

```bash
python sim_cli/main.py <model.yaml> --sim
python sim_cli/main.py <model.yaml> --opt
python sim_cli/main.py <model.yaml> --opt --continue
python sim_cli/main.py <model.yaml> --opt --continue output/masld_insulin_a7_s2/2026-06-06_13-00-34_opt.csv
```

### 编译为独立可执行文件

```bash
pyinstaller sim_cli/build.spec
```

产出 `dist/lm-sim.exe`（Windows）。发布时需将 `models/` 文件夹与 exe 放在同一目录。

> `build.spec` 目前只打包 `main.py`（单模型入口）。`batch.py` 暂无对应 exe，
> 需要批量运行的用户仍需 `python sim_cli/batch.py`（要求本机有 Python 环境）。

---

## 命令参数

| 参数 | 说明 |
|------|------|
| `<model.yaml>` | 模型文件路径（绝对路径或相对于项目根的路径） |
| `--sim` | 运行仿真 |
| `--all-plans` | 配合 `--sim`：对 `simulation.plans` 中每个方案各跑一次，输出多个 CSV（`<stem>__<plan_id>.csv`） |
| `--opt` | 运行优化器（NSGA-II） |
| `--continue` | 热启动：从模型 YAML 内嵌的 `optimizer.results` 继续搜索 |
| `--continue PATH` | 热启动：从指定的 `_opt.csv` 文件加载 Pareto 前沿（相对路径从项目根起算，或绝对路径） |
| `--output-dir PATH` | 指定输出根目录（相对项目根或绝对路径），默认为 `output/`。结果写入 `<PATH>/<模型名>/` |

---

## 输出文件

所有输出写入 `output/{模型名}/` 目录（`output/` 已加入 `.gitignore`，目录本身入 git）；
用 `--output-dir` 可改变根目录，模型子目录的嵌套规则不变。  
文件名格式：`{模型名}_{YYYY-MM-DD_HH-MM-SS}_{模式}.{扩展名}`

| 文件 | 说明 |
|------|------|
| `*_sim.csv` | 仿真时间序列，每列一个输出变量 |
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
python sim_cli/main.py <model.yaml> --opt --continue output/masld_insulin_a7_s2/2026-06-06_13-00-34_opt.csv

# 2. 从模型 YAML 内嵌的 optimizer.results 热启动（需先在 GUI 保存结果到模型）
python sim_cli/main.py <model.yaml> --opt --continue
```

---

## 日志设计

日志文件仅记录：
- CLI 进度消息（每代 `Gen N | eval | feasible | best_f`）
- 引擎级别 WARNING / ERROR

引擎内部 INFO 消息（模型加载、语言初始化等）不写入日志，避免干扰分析。  
日志与 CSV 使用相同时间戳命名，便于对应。

---

## 与 GUI 的关系

| 功能 | GUI | CLI |
|------|-----|-----|
| 交互式参数调整 | ✅ | ❌ |
| Pareto 前沿可视化 | ✅ | ❌ |
| 批量/自动化运行 | ❌ | ✅ |
| 结果文件输出 | 手动导出 | 自动（`output/<模型名>/`） |
| 热启动 | ✅（界面勾选或导入 CSV） | `--continue` |
| CLI 结果导入 GUI | — | GUI opt tab "导入 CSV" |

CLI 与 GUI 共用同一个引擎层（`sim_engine/src/`），结果格式一致，可互通。

---

## 批量运行 (`sim_cli/batch.py`)

`sim_cli/batch.py` 遍历一个文件夹下的所有 YAML，对每个模型依次运行 `--sim`（和可选的 `--opt`），汇总结果到 Markdown 报告。
与 `main.py` 同属 `sim_cli/`，纯 Python 实现，不依赖 bash，可在 PyInstaller 编译的 `lm-sim` 同一环境下运行。

```bash
# 不带参数运行等价于 --help（避免误跑默认文件夹）
python sim_cli/batch.py --folder models/papers --sim-only
```

每次运行创建一个以秒级时间戳命名的批次目录（`<output-dir>/YYYY-MM-DD_HH-MM-SS/`），
内部按 `lm-sim` 的统一规则再分模型子目录（`<模型名>/`），所有 CSV、log 和 `batch_report.md` 都放入该批次目录。并发运行多个进程不会冲突。

### 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--folder PATH` | `../b_lm_model/models/references` | 要扫描的模型文件夹（递归查找 `*.yaml`，相对路径从项目根起算） |
| `--output-dir PATH` | `../b_lm_model/output` | 批次目录的根路径；实际输出在 `<PATH>/<时间戳>/<模型名>/` 下 |
| `--sim-only` | （跑 sim + opt） | 只运行 `--sim`，跳过优化器。与 `--opt-only` 互斥 |
| `--opt-only` | （跑 sim + opt） | 只运行 `--opt`，跳过仿真。与 `--sim-only` 互斥 |
| `--no-skip` | （仅测 `_nosim`/`_noopt`） | 默认只测试文件名含 `_nosim` 或 `_noopt` 的模型（修复队列）；加此参数则测试文件夹下所有 YAML |
| `--all-plans` | （关闭） | 配合 sim 步骤：对 `simulation.plans` 中每个方案各出一个 CSV，而非只输出一个 |

### 报告

`batch_report.md` 中每个模型一行，包含 Sim / Opt 两列：
- 实际运行且成功：`[✓ PASS](./<模型名>/xxx.csv)`（链接到结果 CSV）
- 实际运行但失败：`✗ FAIL`，错误摘要列附带引擎日志中的最后一条 ERROR 消息
- 因 `--sim-only`/`--opt-only` 而未运行的步骤：`⏭ SKIP`

单个模型崩溃不会中断整批运行；汇总区给出整体 PASS/FAIL 计数（按模型计，只要该模型实际运行的步骤全部成功即为 PASS）。

---

## 目录结构

```
sim_cli/
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
