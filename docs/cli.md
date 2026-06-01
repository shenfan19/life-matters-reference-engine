# Life Matters CLI (`lm-sim`)

`sim_cli/` 提供命令行批量运行接口，适合自动化仿真、脚本调度和开发调试。  
正式用户界面仍为 GUI（`sim_gui/`）；CLI 不覆盖 GUI 的交互功能（图表、拖拽、历史存档等）。

完整数据流见 [`data_flow.md`](data_flow.md)。

---

## 安装与运行

### 直接运行（需要 Python 环境）

从项目根目录执行：

```bash
python sim_cli/main.py <model.yaml> --sim
python sim_cli/main.py <model.yaml> --opt
python sim_cli/main.py <model.yaml> --opt --continue
python sim_cli/main.py <model.yaml> --opt --continue 20260606_1122
```

### 编译为独立可执行文件

```bash
pyinstaller sim_cli/build.spec
```

产出 `dist/lm-sim.exe`（Windows）。发布时需将 `models/` 文件夹与 exe 放在同一目录。

---

## 命令参数

| 参数 | 说明 |
|------|------|
| `<model.yaml>` | 模型文件路径（绝对路径或相对于项目根的路径） |
| `--sim` | 运行仿真 |
| `--opt` | 运行优化器（NSGA-II） |
| `--continue` | 热启动：从模型 YAML 内嵌的 `optimizer.results` 继续搜索 |
| `--continue TIMESTAMP` | 热启动：从 `output/<model>_<TIMESTAMP>_opt.csv` 加载 Pareto 前沿，例如 `--continue 20260606_1122` |

---

## 输出文件

所有输出写入项目根的 `output/` 目录（内容已加入 `.gitignore`，目录本身入 git）。  
文件名格式：`{模型名}_{YYYYMMDD_HHMM}_{模式}.{扩展名}`

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
  Log   : masld_insulin_a7_s2_20260601_1423_opt.log

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
# 1. 从指定时间戳的 _opt.csv 热启动（推荐：不依赖模型文件是否已更新）
python sim_cli/main.py <model.yaml> --opt --continue 20260606_1122
#   等价于加载 output/<model>_20260606_1122_opt.csv

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
| 结果文件输出 | 手动导出 | 自动（`output/`） |
| 热启动 | ✅（界面勾选或导入 CSV） | `--continue` |
| CLI 结果导入 GUI | — | GUI opt tab "导入 CSV" |

CLI 与 GUI 共用同一个引擎层（`sim_engine/src/`），结果格式一致，可互通。

---

## 目录结构

```
sim_cli/
  main.py       # 入口，argparse，dispatch
  runner.py     # run_sim / run_opt，调用引擎
  output.py     # CSV 写入与日志配置
  progress.py   # 实时进度显示与停止信号监听
  build.spec    # PyInstaller 构建配置

output/         # CLI 输出目录（内容 gitignore，目录本身入 git）
```
