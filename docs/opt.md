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
| R3  | 决策变量与固定背景输入统一在 `optimizer.schedules` 列表中定义；有 `optimize:` 块的条目为决策变量，无则为固定背景 |
| R4  | 优化任务异步执行，API 立即返回 `job_id`，不阻塞主线程                |
| R5  | 前端可通过轮询实时获取进度（当前代数、日志、fitness）                   |
| R6  | GUI 可通过 `optimizer_override` 覆盖 YAML 中的优化配置      |
| R7  | 支持任务取消（标记 cancelled，当前迭代完成后停止）                   |
| R8  | **T2**：支持在建模者指定时间窗（`time_window`）内优化给药/进食时刻，粒度 `opt_step` 可选 `1h`（缺省）或 `15min` |
| R9  | **T3**：支持从建模者预定义的候选星期模式列表（`days_options`）中选择一个，不在全 2⁷ 空间搜索 |
| R10 | **T4**：支持在建模者指定日期窗口（`date_start_window`）内优化干预起始日 |
| R11 | T2/T3/T4 可与 T1（值优化）任意组合，x 向量自动拼接所有已启用维度 |
| R12 | T2/T3/T4 使用连续松弛（float bounds + 评估时取整），保持 NSGA-II 代码不变 |
| R13 | 搜索可行性约束：T2 槽数 ≤ 9，T3 候选模式数 ≤ 6，T4 窗口天数 ≤ 365；单目标算法（L-BFGS-B / Nelder-Mead）遇 T2/T3/T4 时自动切换为 NSGA-II 并警告 |
| R14 | `optimizer` 块可独立声明评估时间窗（`start_date`/`end_date`/`step_size`），用于缩短评估周期或保证结果可复现；缺省继承 `simulation` / `metadata` 设置（ADR 0083） |
| R15 | GUI 工具栏的时间控件值通过 `optimizer_override` 传入引擎，优先级高于 YAML 静态值；改动实时有效 |
| R16 | Sim 和 Opt 的输入列表完全分离：`InputEvent[]`（sim）不含任何优化字段；`OptInput[]`（opt 决策变量）独立管理（ADR 0084） |
| R17 | `optimizer.schedules` 作为 opt 评估的固定背景输入；缺省时继承 `simulation.schedules` |
| R18 | GUI 提供"← 从 Sim 导入"按钮：将当前 sim inputEvents 转换为 opt 决策变量并自动填充 bounds |

### 1.2 依赖

| 库         | 用途                     | 最低版本    |
| --------- | ---------------------- | ------- |
| `pymoo`   | NSGA-II / Callback     | ≥ 0.6.0 |
| `scipy`   | L-BFGS-B / Nelder-Mead | ≥ 1.7.0 |
| `asteval` | 公式求值                   | 任意      |
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
| 核心模块 | `sim_engine/src/yaml_optimizer.py` |
| 算法 | NSGA-II（多目标）/ L-BFGS-B / Nelder-Mead（单目标） |
| 优化对象 | YAML `optimizer.schedules` 中含 `optimize:` 块的条目（T1–T4 决策变量） |
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
    schedules?: [...],
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

> **注**：`best_x`/`best_f` 是 API 响应级字段（取 Pareto 前沿第一个解）。YAML 层面的 canonical 表示是 `optimizer.results.reference`（含 `x`、`f`、`regimen`、`objectives`），由 GUI "保存结果到模型"写回。

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

### 2.5 T2/T3/T4 调度粒度优化（ADR 0080）

x 向量按 `inputs` 列表顺序展开，每个条目按 `[value, time?, days?, date_start?]` 顺序贡献维度：

| Tier | YAML 字段 | x 维度 | 类型（连续松弛） |
|------|----------|-------|--------------|
| T1 值 | `optimize.value: [lo, hi]` | 1 | float |
| T2 时间窗 | `time_window`, `opt_step`, `optimize.time: true` | +1 | float → slot idx |
| T3 星期模式 | `days_options`, `optimize.days: true` | +1 | float → pattern idx |
| T4 起始日 | `date_start_window`, `optimize.date_start: true` | +1 | float → day offset |

`OptResult.pareto_front` 中的 `x` 向量维度随之增加；`reference.regimen` 叶值在有 T2/T3/T4 时从标量改为字典（见 `docs/model.md`）。

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
       └─ run_yaml_optimizer(sim_engine, model_name, folder, progress_cb)
             ├─ simulator_engine.load_models([model_name], folder=None)
             ├─ base_model = simulator_engine.current_model
             ├─ opt_block = dict(base_model.optimizer)
             ├─ 解析 objectives, constraints, inputs/regimen, algo, mc
             ├─ 计算 time_hours / total_steps（见 3.3）
             ├─ 构造 evaluate(x) 闭包
             │     _clone(base_model) → _run_sim() → _eval_F() + _eval_G()
             └─ _run_nsga2(evaluate, ..., progress_callback=progress_cb)
                   └─ pymoo_minimize → 每代 _ProgressCb.notify → progress_cb
```

### 3.2 YAML optimizer 块规范

**inputs: 格式（新，推荐）**

```yaml
optimizer:
  method: nsga2
  objectives:
    - variable: output_var_name
      metric: final           # 'final' | 'max' | 'min' | 'mean'
      direction: maximize
  inputs:
    - variable: input_var_name
      time: "08:00"
      value: 10.0
      label: "Morning dose"
      optimize:
        value: [0.0, 50.0]   # 有 optimize: → 决策变量
    - variable: another_var
      time: "20:00"
      value: 5.0             # 无 optimize: → 固定输入
  algorithm:
    population_size: 10
    n_generations: 15
    seed: 19                 # NSGA-II 遗传算法 seed，与 MC 无关
  constraints:
    - variable: constraint_var
      condition: "<= 250"
  mc:                        # 可选；缺席或 runs=1 = 单次评估（默认）
    runs: 5                  # 每次候选评估的内层 MC run 数
```

**regimen: 格式（旧，向后兼容）**

```yaml
optimizer:
  method: nsga2
  objectives: [...]
  regimen:
    variable: input_var_name
    events:
      - time: "08:00"
        dose_bounds: [0.0, 10.0]
        label: "Morning dose"
  algorithm:
    population_size: 20
    n_generations: 40
```

优先读取 `inputs:`，不存在时回退到 `regimen:`。

参考实现：
- `inputs:` 格式：`models/source/medical/test/l1_drug_single_obj.yaml`
- `regimen:` 格式：`models/source/medical/disease/chronic/ckd_protein_muscle.yaml`

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
    time_hours = max(1.0, total_days * 24.0)
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
2. `optimizer:` 块缺失 → 返回 `"No optimizer: block in YAML"`
3. `regimen.variable` 或 `regimen.events` 缺失 → 返回 `"No regimen variable/events defined"`
4. `regimen.variable` 不是 `type: input` → `_apply_regimen_events` 跳过

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
- `simulator_engine._apply_regimens` 事件循环内新增 `ev.valid_start` 检查（T4 起始日过滤）

**前端（`types.ts` / `Simulator.tsx` / `SimSetupTab.tsx`）**

- `InputEvent` 新增 7 个可选字段：`timeWindow`, `optStep`, `optimizeTime`, `daysOptions`, `optimizeDays`, `dateStartWindow`, `optimizeDateStart`
- `xToInputEvents` 完全重写：修复了原有函数对 list-format inputs 的解析 bug，按 var_specs 顺序解码 T1–T4
- init useEffect：从 YAML `inputs:` 块读入所有 T2/T3/T4 字段
- `startOptimization`：从 `regimen:` 格式切换为 `inputs:` 格式（支持多变量），透传 T2/T3/T4 字段
- `SimSetupTab` opt 模式下，值 bounds 下方新增 T2/T3/T4 行（仅当 YAML 有对应字段时显示）
2. job_id 未正确传递给轮询
