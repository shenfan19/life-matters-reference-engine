# Optimizer 实现细节文档
> 供复查与调试使用。版本 2026-05-02（已移除路径 B）；2026-05-04 更新：inputs: 格式、optimizer_override、三态指示器。

---

## 1. 架构：唯一优化路径（YAML Optimizer）

系统只有一条优化路径，完全由 YAML 的 `optimizer:` 块驱动，无任何硬编码目标函数。

| 项目 | 说明 |
|------|------|
| 前端入口 | `Simulator.tsx` `startOptimization()` — opt 模式下的运行按钮 |
| 端点 | `POST /api/optimizer/run_yaml` |
| 核心模块 | `sim_engine/src/yaml_optimizer.py` |
| 算法 | NSGA-II（多目标）/ L-BFGS-B / Nelder-Mead（单目标） |
| 优化对象 | YAML `optimizer.regimen` 中定义的事件剂量 |
| 目标函数来源 | YAML `optimizer.objectives` |
| 进度回调 | pymoo `Callback` 每代调用一次 |
| 进度展示 | 前端 1.5s 轮询 `/api/optimizer/status/{job_id}` |

---

## 2. 完整调用链

```
Simulator.tsx  startOptimization()
  ├─ POST /api/optimizer/run_yaml
  │     {model_name: selectedModel.key, folder: null}
  │
  └─ api_server.run_yaml_optimization()
        ├─ 创建 job_id, job_history: List[Dict]
        ├─ 定义 progress_cb(entry) → job_history.append(entry) + 每5代写log
        ├─ fn = functools.partial(run_yaml_optimizer, simulator_engine,
        │                         model_name, folder, progress_cb)
        ├─ asyncio.create_task(_run_optimizer_job(job_id, fn))
        └─ 返回 {success: True, job_id}

  前端拿到 job_id，设 optRunning=true，启动 setInterval(1500ms):
    GET /api/optimizer/status/{job_id}
    → 更新 optLogs, optCurGen, progress
    → status=completed: setOptResult(data.result), optRunning=false
    → status=failed: message.error, optRunning=false

_run_optimizer_job(job_id, fn)  [async coroutine, event loop 不阻塞]
  └─ await loop.run_in_executor(None, fn)  [线程池执行]
       └─ run_yaml_optimizer(sim_engine, model_name, folder, progress_cb)
             ├─ simulator_engine.load_models([model_name], folder=None)
             │     调用链: SimulatorEngine.load_models
             │           → LoaderEngine.fetch(model_name, folder)
             │           → find_model_file(model_name)   # 支持完整路径
             │           → ModStructure.load_model(file_path)
             │           → simulator_engine.current_model = ModStructure
             │
             ├─ base_model = simulator_engine.current_model
             ├─ opt_block = dict(base_model.optimizer)   # 从 YAML 读取
             ├─ 解析 objectives, constraints, regimen, algo, mc
             ├─ step_size = base_model.simulator['step_size']  # 秒
             ├─ 计算 time_hours（从 start_date/end_date 精确算天数）
             ├─ total_steps = int(time_hours * 3600 / step_size)
             ├─ 构造 evaluate(x) 闭包
             │     每次调用: _clone(base_model) → _run_sim() → _eval_F() + _eval_G()
             └─ _run_nsga2(evaluate, n_var, n_obj, n_con, xl, xu,
                           pop_size, n_gen, seed, objectives,
                           progress_callback=progress_cb)
                   └─ pymoo_minimize(LMProblem, NSGA2(pop_size),
                                     n_gen termination, callback=_ProgressCb)
                         每代 → _ProgressCb.notify(algorithm)
                               → progress_cb({iteration, fitness, n_eval})
                               → job_history.append(entry)
                               → 每5代: _add_log(job, "Gen N: best=X.XXXX")
```

---

## 3. YAML 模型 optimizer 块规范

两种输入变量格式均受支持，**优先使用 `inputs:` 格式（新）**。

### 3.1 inputs: 格式（新，推荐）

```yaml
optimizer:
  method: nsga2

  objectives:
    - variable: output_var_name
      metric: final               # 'final' | 'max' | 'min' | 'mean'
      direction: maximize

  inputs:                         # 替代 regimen:，支持多变量
    - variable: input_var_name    # type: input 变量
      time: "08:00"               # HH:mm
      value: 10.0                 # 默认值（仅在不优化时使用）
      label: "Morning dose"       # 前端展示用标签
      optimize:
        value: [0.0, 50.0]        # [min, max]，有 optimize: 则为决策变量

    - variable: another_var       # 无 optimize: → 固定输入，始终取 value
      time: "20:00"
      value: 5.0

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

- 有 `optimize:` 子块的条目是**决策变量**（加入 x 向量）
- 无 `optimize:` 的条目是**固定输入**（每步按 value 触发）
- 可跨多个变量（多变量优化）

### 3.2 regimen: 格式（旧，向后兼容）

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

**参考实现**：
- `inputs:` 格式：`models/components/medical/test/l1_drug_single_obj.yaml`
- `regimen:` 格式：`models/components/medical/disease/chronic/ckd_protein_muscle.yaml`

---

## 4. 仿真时长计算

```python
# yaml_optimizer.py
step_size = float(base_model.simulator.get('step_size', 86400.0))  # 秒

# 优先：从 simulator.start_date / end_date 精确计算
sd = sim_data.get('start_date', '')
ed = sim_data.get('end_date', '')
if sd and ed:
    sy, sm, sdd_ = [int(x) for x in sd.split('-')]
    ey, em, edd_ = [int(x) for x in ed.split('-')]
    if sy >= 1:
        total_days = (date(ey, em, edd_) - date(sy, sm, sdd_)).days  # 精确
    else:
        total_days = (ey-sy)*365 + (em-sm)*30 + (edd_-sdd_)  # 古代日期近似
    time_hours = max(1.0, total_days * 24.0)
else:
    # 回退：total_time（步数）× step_size / 3600
    time_hours = float(base_model.simulator.get('total_time', 1)) * step_size / 3600.0

total_steps = max(1, int(time_hours * 3600.0 / step_size))
```

`simulator.step_size` 由 Loader 从 `metadata.step_size{value, unit}` 自动换算为秒。
`start_date`/`end_date` 从 YAML `simulation:` 块读取（兼容 `simulator:` 关键字）。

---

## 5. 进度回调数据格式

**每代一条**（来自 `_ProgressCb.notify`）：

```python
{
    'iteration': algorithm.n_gen,          # 当前代数（int）
    'fitness':   float(np.min(F)),         # 当前 Pareto 前沿最优 F（按 pymoo 最小化约定）
    'n_eval':    algorithm.evaluator.n_eval  # 累计评估次数
}
```

**每5代一条日志**（`_add_log`）：

```python
{'t': unix_timestamp, 'msg': "Gen 5  best=-24.3215  eval=100"}
```

---

## 6. Job 系统接口

### 启动

```
POST /api/optimizer/run_yaml
Body: {
  model_name: str,
  folder: null,
  optimizer_override: null | {     # GUI 状态覆盖 YAML 默认值（可选）
    regimen?: {...} | inputs?: [...],
    objectives?: [...],
    constraints?: [...],
    algorithm?: {...},
    method?: str,
  }
}
返回: {success: true, job_id: "uuid"}
```

`model_name` 使用 `selectedModel.key`（完整相对路径，如 `components/medical/disease/chronic/ckd_protein_muscle.yaml`）。`find_model_file` 对含 `/` 的路径做直接查找，无需 folder。

`optimizer_override` 字段覆盖 YAML `optimizer:` 块中的对应字段（GUI → YAML 优先级）。不提供时完全使用 YAML 配置。前端 `startOptimization()` 当前发送 `regimen:` 格式的 override（从勾选的 `inputEvents` 构建）。

### 轮询

```
GET /api/optimizer/status/{job_id}
返回:
{
  status:    "running" | "completed" | "failed" | "cancelled",
  history:   [{iteration, fitness, n_eval}],
  logs:      [{t: float, msg: str}],
  result:    null | OptResult,
  error:     null | str,
  elapsed:   float  (秒),
  iteration: int,   (== len(history))
  method:    str,
  job_type:  "yaml"
}
```

**OptResult（completed 时）**：

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

### 取消

```
DELETE /api/optimizer/job/{job_id}
```

标记为 cancelled，线程池中的任务继续运行到当前迭代结束（无强制中断）。

---

## 7. 前端轮询逻辑（Simulator.tsx）

```
state:
  optRunning: bool         - 是否在运行（轮询期间为 true）
  optResult: any           - 完成后的 OptResult
  optCurGen: int           - 当前代数（轮询更新）
  optTotalGen: int         - 总代数（从 YAML optimizer.algorithm.n_generations 读取）
  optLogs: [{t, msg}]     - 日志条目（轮询更新）
  optJobId: string|null   - 当前 job_id
  optPollRef: ref          - setInterval handle

startOptimization():
  POST /api/optimizer/run_yaml
  → 得到 job_id
  → setOptRunning(true), setOptJobId(job_id)
  → setInterval(1500ms):
      GET status → 更新 optCurGen, optLogs, progress
      completed → setOptResult(data.result), setOptRunning(false), clearInterval
      failed    → message.error, setOptRunning(false), clearInterval

cancelOptimization():
  clearInterval
  DELETE /api/optimizer/job/{job_id}
  setOptRunning(false)

UI（opt 模式 center panel）:
  optRunning=true  → 显示进度面板（Gen X/N + 日志 + 停止按钮）
  optRunning=false && optResult.pareto_front.length>0 → ParetoChart
  optRunning=false && !optResult → 占位提示
```

---

## 8. 调试检查清单

**症状：点击运行后 log 只有 "Loading model..."，没有 "Gen X"**

1. 模型文件未找到 → 后端日志查 `ERROR:src.loader_engine:模型...未找到`
2. `optimizer:` 块缺失 → 返回 `"No optimizer: block in YAML"`
3. `regimen.variable` 或 `regimen.events` 缺失 → 返回 `"No regimen variable/events defined"`
4. `regimen.variable` 不是 `type: input` → `_apply_regimen_events` 跳过（变量不存在于 model.variables）

**症状：log 有 "Starting optimizer..." 但没有 "Gen X"**

1. pymoo 未安装 → `pip install pymoo`
2. pymoo 版本 < 0.6 → `_ProgressCb.notify` API 不同，需要升级
3. `n_gen=0` 或 `pop_size=0` → 检查 YAML algorithm 配置

**症状：completed 但 optResult.pareto_front 为空**

1. NSGA-II 返回 `res.X = None` → 检查 `job['error']` 字段
2. 前端条件：`optResult?.pareto_front?.length > 0` → 确认 result 是 data.result 而非 data

**症状：轮询返回 404**

1. 后端重启了（job 在内存中，重启清空）
2. job_id 未正确传递给轮询

---

## 9. 关键依赖

| 库 | 用途 | 必要版本 |
|---|---|---|
| `pymoo` | NSGA-II / Callback | ≥ 0.6.0 |
| `scipy` | L-BFGS-B / Nelder-Mead | ≥ 1.7.0 |
| `asteval` | 公式求值 | 任意 |
| `fastapi` | 异步端点 + `create_task` | ≥ 0.100 |

pymoo 0.6+ 正确导入路径：
- `from pymoo.algorithms.moo.nsga2 import NSGA2`
- `from pymoo.core.problem import Problem`
- `from pymoo.core.callback import Callback`
- `from pymoo.optimize import minimize`
- `from pymoo.termination import get_termination`
