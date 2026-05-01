# Optimizer 实现细节文档
> 供复查与调试使用。版本 2026-05-02。

---

## 1. 两条优化路径总览

系统存在**两条完全独立**的优化路径，共用同一套前端 UI 和 Job 系统，但后端逻辑、YAML 需求、适用场景截然不同。

| | **路径 A：YAML Optimizer** | **路径 B：Standard Optimizer** |
|---|---|---|
| 前端按钮 | NSGA-II 优化 (YAML) | 网格搜索 |
| 端点 | `POST /api/optimizer/run_yaml` | `POST /api/optimizer/run` |
| 核心模块 | `yaml_optimizer.py` | `optimizer_engine.py` |
| 算法 | NSGA-II / L-BFGS-B / Nelder-Mead | Grid Search / pymoo GA |
| 优化对象 | `optimizer.regimen` 中的事件剂量 | 所有 `input`/`parameter` 类型变量 |
| 目标函数来源 | YAML `optimizer.objectives` | 硬编码 `get_objective()` ⚠️ |
| 进度来源 | pymoo Callback（每代） | `_multi_eval_objective`（每次评估） |

---

## 2. 路径 A：YAML Optimizer（推荐路径）

### 2.1 调用链

```
前端 startYamlOpt()
  └─ POST /api/optimizer/run_yaml
        {model_name: str, folder: str|null}
     └─ api_server.run_yaml_optimization()
           ├─ 创建 job_id, job_history: List[Dict], job: Dict
           ├─ 定义 progress_cb(entry: dict) → job_history.append(entry)
           ├─ fn = functools.partial(
           │       run_yaml_optimizer,
           │       simulator_engine,   # SimulatorEngine 全局实例
           │       model_name,
           │       folder,
           │       progress_cb         # 每代回调
           │   )
           ├─ asyncio.create_task(_run_optimizer_job(job_id, fn))
           └─ 返回 {success: True, job_id}

_run_optimizer_job(job_id, fn)  [async coroutine]
  └─ await loop.run_in_executor(None, fn)  → 线程池执行
       └─ run_yaml_optimizer(simulator_engine, model_name, folder, progress_cb)
             ├─ simulator_engine.load_models([model_name], folder)
             │     → simulator_engine.current_model = ModStructure
             ├─ base_model = simulator_engine.current_model
             ├─ opt_block = dict(base_model.optimizer)
             ├─ 解析 objectives, constraints, regimen, algo, mc
             ├─ 构造 evaluate(x) 函数（内部调 _run_sim + _eval_F）
             └─ _run_nsga2(evaluate, n_var, n_obj, n_con, xl, xu,
                           pop_size, n_gen, seed, objectives,
                           progress_callback=progress_cb)
                   └─ pymoo_minimize(problem, NSGA2(pop_size), termination,
                                     seed=seed, callback=_ProgressCb())
                         每代结束 → _ProgressCb.notify(algorithm)
                                   → progress_cb({iteration, fitness, n_eval})
                                   → job_history.append(entry)
```

### 2.2 前端轮询

```
setInterval(1500ms):
  GET /api/optimizer/status/{job_id}
  返回：
    {
      status: 'running'|'completed'|'failed'|'cancelled',
      history: [{iteration, fitness, fitness_std?, n_eval?}],
      logs:    [{t: float(unix timestamp), msg: str}],
      result:  null | {success, method, pareto_front, best_x, best_f, n_solutions, ...},
      elapsed: float (秒),
      iteration: int,
      method: 'nsga2'|'l-bfgs-b'|...,
      job_type: 'yaml'
    }
```

### 2.3 YAML 模型必须包含的 `optimizer:` 块

**最小必要字段**：

```yaml
optimizer:
  method: nsga2          # 'nsga2' | 'l-bfgs-b' | 'nelder-mead'

  objectives:            # 至少一个
    - variable: output_var_name   # model.variables 中存在的变量名
      metric: final               # 'final' | 'max' | 'min' | 'mean'
      direction: minimize         # 'minimize' | 'maximize'

  regimen:               # 必须存在且非空
    variable: input_var_name      # model.variables 中存在的 input 变量
    events:                       # 至少一个
      - time: "08:00"             # HH:mm
        dose_bounds: [0.0, 10.0]  # [min, max]，优化器搜索范围
        label: "Morning dose"     # 可选标签

  algorithm:
    population_size: 50
    n_generations: 80
    seed: 42
```

**可选字段**：

```yaml
  constraints:           # 可选约束
    - variable: constraint_var
      condition: ">= 0"  # 支持 >=, <=, >, <

  mc:                    # Monte Carlo（可选）
    enabled: false
    sim_runs: 1
```

**变量类型要求**：
- `regimen.variable` → 必须是 `type: input` 的变量（存在于 `model.variables`）
- `objectives[*].variable` → 任意已定义变量，被 `_eval_metric()` 读取历史序列
- `constraints[*].variable` → 同上

### 2.4 `_eval_metric(history, metric)` 计算逻辑

```python
# yaml_optimizer.py 第 70-81 行
def _eval_metric(history: List[float], metric: str) -> float:
    if metric == 'final': return history[-1]
    elif metric == 'max':  return max(history)
    elif metric == 'min':  return min(history)
    elif metric == 'mean': return sum(history) / len(history)
    return history[-1]   # 默认 final
```

`history` 是 `_run_sim()` 返回的 `{var_name: [v0, v1, ...]}` 中某变量的完整时间序列。

### 2.5 `_run_sim()` 实现细节

```python
# yaml_optimizer.py 第 84-113 行
def _run_sim(model, regimen_events_by_var, step_size_sec, total_steps):
    """
    参数：
      model               ModStructure 实例（已克隆，独立状态）
      regimen_events_by_var  {var_name: [{time:'HH:mm', value:float}]}
      step_size_sec       步长（秒），来自 base_model.simulator['step_size']
      total_steps         int(time_hours * 3600 / step_size_sec)

    返回：
      {var_name: [v0, v1, ..., vN]}  # 所有变量的完整历史
    """
    unit_sec = TIME_UNIT_SECONDS.get(model.time_unit, 1.0)
    native_step = step_size_sec / unit_sec
    model.reset_simulation()
    # 每步：触发 regimen 事件 → model.step(native_step) → 记录所有变量
```

### 2.6 仿真时长计算

```python
# yaml_optimizer.py 第 186-197 行
# 优先从 simulator.start_date / end_date 计算
sd = sim_data.get('start_date', '2026-01-01')
ed = sim_data.get('end_date', '2026-12-31')
total_days = (ey - sy) * 365 + (em - sm) * 30 + (edd_ - sdd_)
time_hours = max(1.0, total_days * 24.0)

# 回退：simulator.total_time（单位为步数）× step_size / 3600
time_hours = float(base_model.simulator.get('total_time', 1)) * step_size / 3600.0
```

YAML 中 `simulator.start_date` / `end_date` 优先于 `total_time`。

---

## 3. 路径 B：Standard Optimizer

### 3.1 调用链

```
前端 startStandardOpt()
  └─ POST /api/optimizer/run
        {model_names: [str], folder, mode, method, time_hours,
         opt_inner_runs, opt_aggregation, opt_verify_runs}
     └─ api_server.run_optimization()
           ├─ optimizer_engine.load_models(model_names, folder)
           │     → optimizer_engine.current_model = ModStructure
           │     → optimizer_engine.config = model.optimizer (Dict)
           ├─ 创建 job_id, job_history: List[Dict]
           ├─ fn = functools.partial(
           │       optimizer_engine.optimize,
           │       mode='full_params', method='grid',
           │       time_hours=..., opt_inner_runs=...,
           │       opt_aggregation=..., opt_verify_runs=...,
           │       history_out=job_history   # 共享同一 list
           │   )
           ├─ asyncio.create_task(_run_optimizer_job(job_id, fn))
           └─ 返回 {success: True, job_id}

optimizer_engine.optimize(mode, method, time_hours, ..., history_out)
  ├─ 检查 self.config['targets'] 存在
  ├─ self.history = history_out  # 与 job_history 共享
  └─ _optimize_full_params(target, method, time_hours)
        ├─ controllable_vars = model.get_controllable_variables()
        │     → {name: Variable} 其中 type in [input, PARAMETER]
        ├─ bounds = config.get('bounds') 或 var.bounds 或 (0.0, 1.0)
        └─ method == 'grid': _grid_search(objective, bounds)
              └─ scipy.brute(objective, ranges=bounds, Ns=10)
                    每次调用 objective(params):
                      → _multi_eval_objective(params, time_hours)
                         → simulator.fitness_func_with_seed(params, seed, time_hours)
                            → model.reset_simulation()
                            → model.set_parameters(params)
                            → model.run_steps(total_steps, step_size)
                            → model.get_objective(target)  ⚠️ 见下
```

### 3.2 ⚠️ 关键限制：`get_objective()` 硬编码

```python
# simulation.py 第 245-253 行
def get_objective(self, target: str) -> float:
    state = self.get_current_state()
    if target == 'min_error':
        target_values = {'blood_glucose': 100}
        return sum((state.get(k, {'value': 0})['value'] - v) ** 2
                   for k, v in target_values.items())
    elif target == 'max_lifespan':
        return -len(self.variable_history[list(self.variables.keys())[0]])
    return float('inf')   # ← 任何其他 target 名称均返回 inf
```

**后果**：Standard Optimizer 路径只对 `min_error`（blood_glucose 拟合）和 `max_lifespan` 有意义。其他 target 名称返回 `float('inf')`，导致所有候选解评分相同，优化器随机选择。

**修复方向**（待实现）：
```python
def get_objective(self, target: str) -> float:
    if target in self.variables:
        return self.variables[target].value   # 或 -value（最大化）
    # ...
```

### 3.3 YAML 模型需要的 `optimizer:` 块（路径 B）

```yaml
optimizer:
  targets:
    - min_error      # 或 max_lifespan（其他名称当前无效）
  method: grid       # 可被 API 请求覆盖
  bounds:            # 可选，若不填则用 variable.bounds，最后用 (0.0, 1.0)
    - [0.0, 10.0]    # 每个 controllable variable 对应一项，顺序同 get_controllable_variables()
```

**controllable variable** 定义：
```yaml
variables:
  some_input:
    value: 5.0
    type: input      # 或 parameter
    bounds: [0.0, 10.0]
```

### 3.4 `_multi_eval_objective()` 进度写入

```python
# optimizer_engine.py 第 126-157 行
def _multi_eval_objective(self, params, time_hours):
    fitnesses = []
    for _ in range(self.opt_inner_runs):
        seed = int(np.random.randint(0, 2**31))
        f = self.simulator.fitness_func_with_seed(params, seed, time_hours)
        fitnesses.append(f)
    agg = np.mean(fitnesses)  # 或 min/median
    self.iteration += 1
    self.history.append({        # self.history is job_history (shared reference)
        'iteration': self.iteration,
        'params': list(params),
        'fitness': float(agg),
        'fitness_std': float(np.std(fitnesses)) if self.opt_inner_runs > 1 else 0.0,
    })
    return agg
```

---

## 4. Job 系统接口

### 4.1 启动请求

**路径 A**：
```
POST /api/optimizer/run_yaml
Body: {model_name: str, folder: str | null}
返回: {success: true, job_id: "uuid"}
```

**路径 B**：
```
POST /api/optimizer/run
Body: {
  model_names: [str],
  folder: str | null,
  mode: "full_params",   # real_time / full_inputs / full_params
  method: "grid",        # grid / pymoo
  time_hours: float,
  opt_inner_runs: int,   # 默认 5
  opt_aggregation: str,  # mean / min / median
  opt_verify_runs: int   # 默认 20
}
返回: {success: true, job_id: "uuid"}
```

### 4.2 状态轮询

```
GET /api/optimizer/status/{job_id}
返回:
{
  job_id:    str,
  status:    "running" | "completed" | "failed" | "cancelled",
  history:   [{iteration: int, fitness: float|null, fitness_std?: float, n_eval?: int}],
  logs:      [{t: float, msg: str}],     # t 是 Unix 时间戳
  result:    null | OptResult,
  error:     null | str,
  elapsed:   float,                      # 秒
  iteration: int,                        # == len(history)
  method:    str,
  job_type:  "yaml" | "standard"
}
```

**OptResult（路径 A 完成时）**：
```json
{
  "success": true,
  "method": "nsga2",
  "pareto_front": [{"x": [dose1, dose2, ...], "f": [obj1, obj2, ...]}],
  "n_solutions": 42,
  "best_x": [dose1, dose2, ...],
  "best_f": [obj_value],
  "objectives": [{variable, metric, direction}],
  "regimen_variable": "drug_dose",
  "regimen_event_labels": ["Morning dose", "Evening dose"],
  "time_hours": 8760.0
}
```

**OptResult（路径 B 完成时）**：
```json
{
  "success": true,
  "params": [val1, val2, ...],
  "value": float,
  "history": [{iteration, params, fitness, fitness_std}],
  "verification": {
    "verify_runs": 20,
    "mean": float, "std": float, "min": float, "max": float
  }
}
```

### 4.3 取消

```
DELETE /api/optimizer/job/{job_id}
返回: {success: true}
```

注意：取消只标记 `status = 'cancelled'`，线程池中的任务不会立即中断，会运行到当前迭代结束。

---

## 5. 前端轮询逻辑（Optimizer.tsx）

```
状态：
  jobId: string | null          当前 job
  liveHistory: HistoryEntry[]   从轮询更新
  liveLogs: LogEntry[]          从轮询更新
  elapsed: float                从轮询更新
  pollRef: ref to setInterval   轮询 handle

startYamlOpt():
  POST /api/optimizer/run_yaml
  → jobId = data.job_id
  → startPolling(jobId)

startPolling(jid):
  setInterval(1500ms):
    GET /api/optimizer/status/{jid}
    → setLiveHistory(data.history)
    → setLiveLogs(data.logs)
    → setElapsed(data.elapsed)
    → 更新 progress = min(99, iteration/80*100)
    if data.status == 'completed':
      → setState.status = 'completed'
      → setJobResult(data.result)
      → stopPolling()
    if data.status == 'failed':
      → setState.status = 'idle'
      → setJobError(data.error)
      → stopPolling()

Canvas chart (OptChart):
  每次 liveHistory 变化 → drawFitnessChart()
  X 轴：iteration/generation
  Y 轴：fitness
  阴影带：fitness ± fitness_std（如果有 fitness_std）
  
LogConsole:
  自动滚动到最新条目
  时间戳格式：HH:MM:SS
```

---

## 6. 已知问题与调试检查清单

### 6.1 路径 A 问题排查

**症状：点击 NSGA-II 后 log 里没有 "Gen X" 条目，只有 "Loading model..."**

可能原因：
1. `simulator_engine.load_models([model_name], folder)` 找不到模型文件
   - 检查：`model_name` 是否包含 `.yaml` 后缀（`find_model_file` 会自动加）
   - 检查：`folder` 值是否正确（None vs 字符串）
   - 在后端日志中找 `ERROR:src.loader_engine:模型...未找到`

2. `base_model.optimizer` 为空 dict
   - 检查：YAML 是否有 `optimizer:` 顶级字段
   - `run_yaml_optimizer` 会返回 `{"success": False, "error": "No optimizer: block in YAML"}`

3. `regimen.variable` 或 `regimen.events` 缺失
   - 报错：`"No regimen variable/events defined"`

**症状：log 里有 "Starting optimizer..." 但之后没有 "Gen X" 条目**

可能原因：
1. pymoo 未安装或版本不兼容
   - `_run_nsga2` 中 `from pymoo.algorithms.moo.nsga2 import NSGA2` 失败
   - 报错：`"pymoo not installed. Run: pip install pymoo"`

2. `_ProgressCb.notify()` 从未触发（pymoo 版本差异）
   - 确认 pymoo 版本：`pip show pymoo`
   - `Callback` API 在不同版本可能不同（`notify` vs `__call__`）

3. `n_gen=0` 或 `pop_size=0`（来自错误的 YAML algorithm 配置）

**症状：job status 一直是 'running' 但 history 有数据（已完成但状态未更新）**

- `_run_optimizer_job` 中 `result.get('success')` 判断：NSGA-II 返回 None X 时会返回错误
- 检查 `job['error']` 字段

### 6.2 路径 B 问题排查

**症状：fitness 值全是 inf**

- `get_objective(target)` 中 target 名称不是 `min_error` 或 `max_lifespan`
- YAML `optimizer.targets[0]` 填的是什么？
- **根本问题**：`get_objective()` 需要扩展以支持任意变量名

**症状：grid search 运行但无进度**

- `_multi_eval_objective` 写入 `self.history` = `history_out` = `job_history`
- 确认 `history_out=job_history` 在 `functools.partial` 中正确传递
- 确认 `job_history` 是 `optimizer_jobs[job_id]['history']` 的同一对象

**症状："没有可优化的参数"**

- `get_controllable_variables()` 返回空
- 检查：YAML variables 中是否有 `type: input` 或 `type: parameter`（注意大小写）
- `VariableType.PARAMETER` vs `VariableType.input`（enum 值不一致，见代码）

### 6.3 Job 系统问题排查

**症状：轮询 404**

- `optimizer_jobs[job_id]` 不存在
- 可能原因：后端重启了（job 在内存中，重启清空）
- 可能原因：job_id 没有正确传给轮询函数

**症状：status 端点返回空 history 但 job 是 completed**

- `list(job['history'])` 快照在 completed 时刻应包含所有数据
- 如果 history 始终为空：`history_out` 引用没有正确建立

---

## 7. 关键依赖版本

| 库 | 用途 | 必要版本 |
|---|---|---|
| `pymoo` | NSGA-II | ≥ 0.6.0（`pymoo.core.problem.Problem`） |
| `scipy` | brute / L-BFGS-B / Nelder-Mead | ≥ 1.7.0 |
| `asteval` | 公式求值 | 任意 |
| `fastapi` | 异步端点 | ≥ 0.100 |

pymoo 0.6+ 的 `Callback` 基类在 `pymoo.core.callback`，`_evaluate` 方法签名需要 `out` dict。

---

## 8. 待完成工作

| 优先级 | 项目 | 文件 | 说明 |
|--------|------|------|------|
| 🔴 高 | 扩展 `get_objective()` | `simulation.py:245` | 支持任意变量名作为目标，否则路径 B 无意义 |
| 🔴 高 | 验证 pymoo Callback API | `yaml_optimizer.py:298` | 确认 `notify(algorithm)` 在当前 pymoo 版本工作 |
| 🟡 中 | 取消机制 | `optimizer_engine.py` | 在 `_multi_eval_objective` 中检查 cancel flag |
| 🟡 中 | 并发安全 | `optimizer_engine.py` | 全局 `optimizer_engine` 是共享状态，并发请求会互相覆盖 `current_model` 和 `history` |
| 🟢 低 | Job 持久化 | `api_server.py` | 重启后 job 丢失，考虑写入临时文件 |
