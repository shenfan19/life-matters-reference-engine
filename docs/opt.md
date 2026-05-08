# Optimizer 文档
> 版本 2026-05-02（已移除路径 B）；2026-05-04 更新：inputs: 格式、optimizer_override、三态指示器。

---

## 1. Requirements

### 1.1 功能需求

| ID  | 需求                                               |
| --- | ------------------------------------------------ |
| R1  | 优化目标、决策变量、约束完全由 YAML `optimizer:` 块驱动，不硬编码任何目标函数 |
| R2  | 支持多目标算法（NSGA-II）和单目标算法（L-BFGS-B、Nelder-Mead）     |
| R3  | 支持两种输入格式：`inputs:`（新，推荐）和 `regimen:`（旧，向后兼容）     |
| R4  | 优化任务异步执行，API 立即返回 `job_id`，不阻塞主线程                |
| R5  | 前端可通过轮询实时获取进度（当前代数、日志、fitness）                   |
| R6  | GUI 可通过 `optimizer_override` 覆盖 YAML 中的优化配置      |
| R7  | 支持任务取消（标记 cancelled，当前迭代完成后停止）                   |

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
| 优化对象 | YAML `optimizer.inputs` 或 `optimizer.regimen` 中定义的决策变量 |
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
    inputs?: [...] | regimen?: {...},
    objectives?: [...],
    constraints?: [...],
    algorithm?: {...},
    method?: str,
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
    seed: 42
  constraints:
    - variable: constraint_var
      condition: "<= 250"
  mc:
    enabled: false
    sim_runs: 1
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

### 3.3 仿真时长计算

```python
step_size = float(base_model.simulator.get('step_size', 86400.0))  # 秒

sd = sim_data.get('start_date', '')
ed = sim_data.get('end_date', '')
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
2. job_id 未正确传递给轮询
