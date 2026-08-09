# Optimizer 文档

> **决议导航**：本文件中的关键决议已汇总至 [DECISIONS.md](DECISIONS.md)（⭐⭐ 为核心约束）。  
> 关键 ADR：异步 Job → [0049](decisions/0049-2026-05-02_sim_Optimizer异步Job系统设计.md)；三层验证 → [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md)；Regimen 格式 → [0052](decisions/0052-2026-05-04_sim_schedule格式统一与opt-regimen支持.md)

> 版本 2026-05-02（已移除路径 B）；2026-05-04 更新：inputs: 格式、optimizer_override、三态指示器。

---

## 1. Requirements

### 1.1 功能需求

| ID  | 需求                                               |
| --- | ------------------------------------------------ |
| R1  | 优化目标、决策变量、约束完全由 YAML `optimizer:` 块驱动，不硬编码任何目标函数 |
| R2  | 支持多目标算法（NSGA-II）和单目标算法（L-BFGS-B、Nelder-Mead）     |
| R3  | 决策变量与固定背景输入统一在 `optimizer.startpoint.regimens` 列表中定义；有 `optimize:` 块的条目为决策变量，无则为固定背景 |
| R4  | 优化任务异步执行，API 立即返回 `job_id`，不阻塞主线程                |
| R5  | 前端可通过轮询实时获取进度（当前代数、日志、fitness）                   |
| R6  | GUI 可通过 `optimizer_override` 覆盖 YAML 中的优化配置      |
| R7  | 支持任务取消（标记 cancelled，当前迭代完成后停止）                   |
| R8  | **T2**：支持在建模者指定时间窗（`time_window`）内优化给药/进食时刻，粒度 `opt_step` 可选 `1h`（缺省）或 `15min` |
| R9  | **T3**：支持从建模者预定义的候选星期模式列表（`days_options`）中选择一个，不在全 2⁷ 空间搜索 |
| R10 | **T4**：支持在建模者指定日期窗口（`date_start_window`）内优化干预起始日 |
| R11 | T2/T3/T4 可与 T1（值优化）任意组合，x 向量自动拼接所有已启用维度 |
| R12 | T2/T3/T4 使用连续松弛（float bounds + 评估时取整），保持 NSGA-II 代码不变 |
| R13 | **⚠️ 待实现**（2026-07-17 复核，代码无对应逻辑）：搜索可行性约束：T2 槽数 ≤ 9，T3 候选模式数 ≤ 6，T4 窗口天数 ≤ 365；单目标算法（L-BFGS-B / Nelder-Mead）遇 T2/T3/T4 时自动切换为 NSGA-II 并警告。当前 `optimizer_engine.py:369-381` 的算法选择只看 `method_raw`/`n_obj>=2`，不检查 `var_specs` 维度种类，也没有任何上限校验——`method: l-bfgs-b` 配大范围 T2/T3/T4 会直接用 scipy 连续松弛跑，不报错不切换 |
| R14 | `optimizer` 块可独立声明评估时间窗（`start_date`/`end_date`/`step_size`），用于缩短评估周期或保证结果可复现；缺省继承 `simulation` / `metadata` 设置（ADR 0083） |
| R15 | GUI 工具栏的时间控件值通过 `optimizer_override` 传入引擎，优先级高于 YAML 静态值；改动实时有效 |
| R16 | Sim 和 Opt 的输入列表完全分离：`InputEvent[]`（sim）不含任何优化字段；`OptInput[]`（opt 决策变量）独立管理（ADR 0084） |
| R17 | `optimizer.startpoint.regimens` 作为 opt 评估的固定背景输入（无 `optimize:` 块的条目）；该字段是独立声明，缺省时**不**继承 `simulation.plans[*].regimens`，直接报错（`optimizer_engine.py:83-85`） |
| R18 | GUI 提供"← 从 Sim 导入"按钮：将当前 sim inputEvents 转换为 opt 决策变量并自动填充 bounds |

### 1.2 依赖

| 库         | 用途                     | 最低版本    |
| --------- | ---------------------- | ------- |
| `pymoo`   | NSGA-II / Callback     | ≥ 0.6.0 |
| `scipy`   | L-BFGS-B / Nelder-Mead | ≥ 1.7.0 |
| `asteval` | 方程求值                   | 任意      |
| `fastapi` | 异步端点 + `create_task`   | ≥ 0.100 |

pymoo 0.6+ 正确导入路径：
```python
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import Problem
from pymoo.core.callback import Callback
from pymoo.optimize import minimize
from pymoo.termination import get_termination
```

---

## 2. Design

### 2.1 架构：唯一优化路径

系统只有一条优化路径，完全由 YAML 的 `optimizer:` 块驱动。

| 项目 | 说明 |
|------|------|
| 前端入口 | `Simulator.tsx` `startOptimization()` |
| 端点 | `POST /api/optimizer/run_yaml` |
| 核心模块 | `reference_engine/src/optimizer_engine.py`（主流程）+ `optimizer_parsing.py`/`optimizer_eval.py`/`optimizer_backends.py`（按职责拆分，见 3.1） |
| 算法 | NSGA-II（多目标）/ L-BFGS-B / Nelder-Mead（单目标） |
| 优化对象 | YAML `optimizer.startpoint.regimens` 中含 `optimize:` 块的条目（T1–T4 决策变量） |
| 目标函数来源 | YAML `optimizer.objectives` |
| 进度回调 | pymoo `Callback` 每代调用一次 |
| 进度展示 | 前端 1.5s 轮询 `/api/optimizer/status/{job_id}` |

### 2.2 REST API

**启动任务**
```
POST /api/optimizer/run_yaml
Body: {
  model_name: str,
  folder: null,
  optimizer_override: null | {
    startpoint?: { regimens: [...] },
    objectives?: [...],
    constraints?: [...],
    algorithm?: {...},
    method?: str,
    start_date?: str,
    end_date?: str,
    step_size?: {...},
    warm_start?: [{x: [...], f: [...]}],
  }
}
返回: {success: true, job_id: "uuid"}
```

`model_name` 使用 `selectedModel.key`（完整相对路径，如 `components/medical/disease/chronic/ckd_protein_muscle.yaml`）。  
`optimizer_override` 覆盖 YAML `optimizer:` 块中的对应字段，不提供时完全使用 YAML 配置。

**轮询状态**
```
GET /api/optimizer/status/{job_id}
返回: {
  status:    "running" | "completed" | "failed" | "cancelled",
  history:   [{iteration, fitness, n_eval}],
  logs:      [{t: float, msg: str}],
  result:    null | OptResult,
  error:     null | str,
  elapsed:   float,
  iteration: int,
  method:    str,
  job_type:  "yaml"
}
```

**取消任务**
```
DELETE /api/optimizer/job/{job_id}
```
标记为 cancelled，线程池中的任务继续运行到当前迭代结束。

### 2.3 OptResult 结构

```json
{
  "success": true,
  "method": "nsga2",
  "pareto_front": [{"x": [dose1, ...], "f": [obj1, obj2, ...]}],
  "n_solutions": 20,
  "best_x": [dose1, ...],
  "best_f": [obj1_display, obj2_display],
  "objectives": [{variable, metric, direction}],
  "regimen_variable": "protein_intake",
  "regimen_event_labels": ["Daily protein intake"],
  "time_hours": 8736.0
}
```

> **注**：`best_x`/`best_f` 是 API 响应级字段（取 Pareto 前沿第一个解）。YAML 层面的 canonical 表示是 `optimizer.results.recommended`（只含 `x`、`f`；不再存解码后的人类可读字典，解码现场用 `xToInputEvents` 完成），由 GUI "保存结果到模型"写回。

### 2.4 前端状态机

```
state:
  optRunning: bool         - 是否在运行（轮询期间为 true）
  optResult: any           - 完成后的 OptResult
  optCurGen: int           - 当前代数（轮询更新）
  optTotalGen: int         - 总代数（从 YAML optimizer.algorithm.n_generations 读取）
  optLogs: [{t, msg}]     - 日志条目
  optJobId: string|null   - 当前 job_id
  optPollRef: ref          - setInterval handle

startOptimization():
  POST run_yaml → 得到 job_id → setOptRunning(true)
  → setInterval(1500ms): GET status → 更新进度
    completed → setOptResult(data.result), clearInterval
    failed    → message.error, clearInterval

cancelOptimization():
  clearInterval → DELETE job/{job_id} → setOptRunning(false)

UI:
  optRunning=true            → 进度面板（Gen X/N + 日志 + 停止按钮）
  !optRunning && pareto_front → ParetoChart
  !optRunning && !optResult  → 占位提示
```

### 2.5 T2/T3/T4 调度粒度优化（ADR 0080/0088/0100）

x 向量按 `optimizer.startpoint.regimens` 列表顺序展开，每个条目按
`[value?, time_start?, time_end?, days?, date_start?, date_end?]` 顺序贡献维度：

| Tier | YAML 字段 | x 维度 | 类型（连续松弛） |
|------|----------|-------|--------------|
| T1 值 | `optimize.value: [lo, hi]`，可选 `value_step` | 1 | float，声明 `value_step` 后离散为网格点 |
| T2 时间窗（1 维） | `optimize.time_start: [lo, hi]`，`time_step` | +1 | float → slot idx |
| T2 时间窗（2 维） | 额外声明 `optimize.time_end: [lo, hi]` | +2 | float → slot idx ×2 |
| T3 星期模式 | `optimize.days_pool` + `days_n` | +1 | float → pattern idx |
| T4 起始日 | `optimize.date_range`（两组窗口） | +1~2 | float → day offset |

`OptResult.pareto_front` 中的 `x` 向量维度随之增加。T2 1 维（仅 `time_start`）时区间宽度
（`time_end - time_start`）固定不变，搜索后的 `time_end` 按固定宽度推算；同时声明
`optimize.time_end` 时为 2 维，起止独立搜索（详见 `life-matters-models` 仓库 `docs/authoring/regimens_and_optimizer.md` x 向量编码规则）。

T1 的 `optimize.value` 默认在 `[lo, hi]` 连续区间内搜索，不声明 `value_step` 时解会带任意小数精度；声明 `value_step` 后，解码阶段把内部连续实数 snap 到以 `lo` 为起点、以 `value_step` 为间隔的网格点上，超出 `[lo, hi]` 的网格点会被 clamp 回边界，这与 T2 的 `time_step` 是同一种"连续内部表示 + 解码时离散化"模式，只是网格锚定在 `lo` 而非窗口起点，适合按临床/工程可读精度取值的场景，例如喂养量按 5 mL 一档、代谢当量按 0.1 MET-h 一档。

---

## 3. Implementation

### 3.1 完整调用链

```
Simulator.tsx  startOptimization()
  └─ POST /api/optimizer/run_yaml
        ├─ 创建 job_id, job_history: List[Dict]
        ├─ progress_cb(entry) → job_history.append + 每5代写log
        ├─ fn = functools.partial(run_yaml_optimizer, ...)
        ├─ asyncio.create_task(_run_optimizer_job(job_id, fn))
        └─ 返回 {success: True, job_id}

_run_optimizer_job(job_id, fn)
  └─ await loop.run_in_executor(None, fn)   # 线程池，不阻塞 event loop
       └─ run_optimizer(engine, model_name, folder, progress_cb)
             ├─ engine.load_models([model_name], folder=None)
             ├─ base_model = engine.current_model
             ├─ opt_block = dict(base_model.optimizer)
             ├─ 解析 objectives, constraints, inputs/regimen, algo, mc
             ├─ 计算 time_hours / total_steps（见 3.3）
             ├─ 构造 evaluate(x) 闭包
             │     _clone(base_model) → _run_sim() → _eval_F() + _eval_G()
             └─ _run_nsga2(evaluate, ..., progress_callback=progress_cb)
                   └─ pymoo_minimize → 每代 _ProgressCb.notify → progress_cb
```

### 3.2 YAML optimizer 块规范

决策变量与固定背景输入统一写在 `optimizer.startpoint.regimens` 一个扁平列表里（R3/R17）：条目结构与 `simulation.plans[*].regimens` 相同（`variable`/`time_start`/`time_end`/`value`/`days`/`date_range`/`delivery`，见 [design.md](design.md) K×4），额外可加 `optimize:` 子块——有则该条目的对应维度成为决策变量，无则整条作为固定背景输入参与仿真。

```yaml
optimizer:
  method: nsga2
  objectives:
    - variable: output_var_name
      metric: final            # 'final' | 'max' | 'min' | 'mean'
      direction: maximize
  constraints:
    - variable: constraint_var
      condition: "<= 250"    # 缺省不写 metric：整条轨迹逐步校验（trajectory-wide max/min）
    - variable: another_constraint_var
      condition: ">= 10"
      metric: mean            # 'final' | 'mean' | 'max' | 'min'；显式写 metric 时先按该口径把
                               # 轨迹压成单值再比较（如 mean 表示"整体/平均达标"而非"每步都不能低于阈值"，
                               # 允许有计划内的短暂低谷，如安排的完全休息日）
  startpoint:
    regimens:
      - variable: input_var_name
        time_start: "08:00"
        time_end: "08:00"
        days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
        label: "Morning dose"
        optimize:
          value: [0.0, 50.0]   # T1：value 区间 → 决策变量
      - variable: another_var
        time_start: "20:00"
        time_end: "20:00"
        value: 5.0              # 无 optimize: → 固定输入，不参与搜索
  algorithm:
    population_size: 10
    n_generations: 15
    seed: 19                    # NSGA-II 遗传算法 seed，与 MC 无关
  mc:                           # 可选；缺席或 runs=1 = 单次评估（默认）
    runs: 5                     # 每次候选评估的内层 MC run 数
```

`optimize:` 子块除 T1（`value: [lo, hi]`）外还支持 T2（`time_start`/`time_end` 区间搜索）、T3（`days_pool`+`days_n` 候选星期模式）、T4（`date_range` 起止日窗口），四类可在同一条目上任意组合，详见 3.6。

未提供 `optimizer.startpoint.regimens` 时不回退到 `simulation.plans`——两者是彼此独立的字段，`optimizer.startpoint` 缺失直接报错（见 3.5）。

参考实现：`life-matters-models` 仓库 `models/papers/s1/banister/banister_opt.yaml`。

### 3.3 评估时间窗配置（ADR 0083）

优化器的评估时间窗和步长可在 `optimizer` block 中独立声明，优先级高于 `simulation` / `metadata` 的默认值。GUI 工具栏的日期和步长通过 `optimizer_override` 传入，优先级最高。

```yaml
optimizer:
  start_date: "YYYY-MM-DD"   # 可选；缺省 simulation.start_date
  end_date:   "YYYY-MM-DD"   # 可选；缺省 simulation.end_date
  step_size:                  # 可选；缺省 metadata.step_size
    value: 1
    unit: day
```

**读取优先级**（由高到低）：
1. `optimizer_override.start_date / end_date / step_size`（GUI 工具栏实时值）
2. `optimizer.start_date / end_date / step_size`（YAML 静态声明）
3. `simulation.start_date / end_date` + `metadata.step_size`（默认继承）

### 3.3.1 仿真时长计算

```python
# step_size: opt block 优先，否则 simulation block
_opt_step_cfg = opt_block.get('step_size')
if _opt_step_cfg and isinstance(_opt_step_cfg, dict):
    _unit_to_sec = {'minute': 60.0, 'hour': 3600.0, 'day': 86400.0}
    step_size = float(_opt_step_cfg.get('value', 1)) * _unit_to_sec.get(
        str(_opt_step_cfg.get('unit', 'minute')).lower(), 60.0)
else:
    step_size = float(base_model.simulator.get('step_size', 86400.0))  # 秒

sd = opt_block.get('start_date') or sim_data.get('start_date', '')
ed = opt_block.get('end_date')   or sim_data.get('end_date', '')
if sd and ed:
    sy, sm, sdd_ = [int(x) for x in sd.split('-')]
    ey, em, edd_ = [int(x) for x in ed.split('-')]
    if sy >= 1:
        total_days = (date(ey, em, edd_) - date(sy, sm, sdd_)).days  # 精确
    else:
        total_days = (ey-sy)*365 + (em-sm)*30 + (edd_-sdd_)          # 古代日期近似
    time_hours = max(total_days, 1) * 24.0   # 先 clamp 天数下限再乘 24，修复单日/子日步长模型的
                                              # unreachable-schedule bug（旧写法 max(1.0, total_days*24.0)
                                              # 在 total_days<1 时会得到非 24 的倍数，错过命中窗口）
else:
    time_hours = float(base_model.simulator.get('total_time', 1)) * step_size / 3600.0

total_steps = max(1, int(time_hours * 3600.0 / step_size))
```

### 3.4 进度回调数据格式

每代一条（`_ProgressCb.notify`）：
```python
{'iteration': algorithm.n_gen, 'fitness': float(np.min(F)), 'n_eval': algorithm.evaluator.n_eval}
```

每5代一条日志（`_add_log`）：
```python
{'t': unix_timestamp, 'msg': "Gen 5  best=-24.3215  eval=100"}
```

### 3.5 调试检查清单

**症状：点击运行后 log 只有 "Loading model..."，没有 "Gen X"**
1. 模型文件未找到 → 后端日志查 `ERROR:src.loader_engine:模型...未找到`
2. `optimizer.objectives` 缺失 → 返回 `"No objectives configured (add optimizer: block in YAML or set targets in UI)"`
3. `optimizer.startpoint.regimens` 缺失 → 返回 `"No optimizer.startpoint.regimens defined"`
4. `optimizer.startpoint.regimens` 里没有任何条目带 `optimize:` 子块 → 返回 `"No entries with optimize: sub-block in optimizer.startpoint.regimens"`

**症状：log 有 "Starting optimizer..." 但没有 "Gen X"**
1. pymoo 未安装 → `pip install pymoo`
2. pymoo 版本 < 0.6 → `_ProgressCb.notify` API 不同，需升级
3. `n_gen=0` 或 `pop_size=0` → 检查 YAML algorithm 配置

**症状：completed 但 optResult.pareto_front 为空**
1. NSGA-II 返回 `res.X = None` → 检查 `job['error']` 字段
2. 前端条件：`optResult?.pareto_front?.length > 0` → 确认 result 是 `data.result` 而非 `data`

**症状：轮询返回 404**
1. 后端重启了（job 在内存中，重启清空）

### 3.6 T2/T3/T4 实现（ADR 0080，2026-05-20）

**后端（`optimizer_engine.py`）**

- `_expand_time_window(window, opt_step)` → slot 列表
- `run_optimizer` inputs 解析段：逐条目按 T1/T2/T3/T4 追加 `var_specs` 条目和 bounds
- `_build_regimen_events(x)` 两步解码：先按 `id(entry)` 合并同条目，再写入 `time`/`days`/`valid_start`
- `schedule_runner.apply_schedules` 事件循环内新增 `ev.valid_start` 检查（T4 起始日过滤）

> **R13（搜索空间上限 + 单目标自动切换 NSGA-II）未实现**，见 1.1 表格标注；本节描述的 T1–T4 解码本身已实现，缺的只是可行性护栏。

**前端（`types.ts` / `Simulator.tsx` / `SimSetupTab.tsx`）**

- `InputEvent` 新增 7 个可选字段：`timeWindow`, `optStep`, `optimizeTime`, `daysOptions`, `optimizeDays`, `dateStartWindow`, `optimizeDateStart`
- `xToInputEvents` 完全重写：修复了原有函数对 list-format inputs 的解析 bug，按 var_specs 顺序解码 T1–T4
- init useEffect：从 YAML `inputs:` 块读入所有 T2/T3/T4 字段
- `startOptimization`：从 `regimen:` 格式切换为 `inputs:` 格式（支持多变量），透传 T2/T3/T4 字段
- `SimSetupTab` opt 模式下，值 bounds 下方新增 T2/T3/T4 行（仅当 YAML 有对应字段时显示）
2. job_id 未正确传递给轮询
