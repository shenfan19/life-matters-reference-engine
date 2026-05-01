# ADR 0049 — Optimizer 异步 Job 系统 & 实时进度 UI
**日期**：2026-05-02  
**状态**：已实施（前端轮询可见，backend 进度回调待验证）

---

## 背景

优化器原实现（`/api/optimizer/run` 和 `/api/optimizer/run_yaml`）在 FastAPI `async def` handler 中直接调用同步阻塞函数（NSGA-II 可跑数分钟），导致：

1. **阻塞 event loop**：uvicorn 单线程事件循环被占满，其余请求（包括健康检查）全部排队，GUI 显示 offline。
2. **零进度反馈**：前端显示 "calculating"，无任何迭代进展，用户无法判断是否在运行。
3. **pymoo 导入路径错误**：`optimizer_engine._pymoo_optimize()` 中 `from pymoo.dynamics.problem import Problem` 模块不存在，触发 `ModuleNotFoundError`，被误捕获为"pymoo 未安装"。

---

## 决策

### 决策一：Job 系统（后端）

引入全局 `optimizer_jobs: Dict[str, Dict]`，每次优化请求：

1. 同步步骤（毫秒级）：创建 `job_id`、初始化 `job_history: List[Dict]`、写 `optimizer_jobs[job_id]`
2. 返回 `{success: True, job_id}` 给前端
3. `asyncio.create_task(_run_optimizer_job(job_id, fn))` 启动后台协程
4. 后台协程用 `loop.run_in_executor(None, fn)` 在线程池执行同步优化函数

Job 状态字段：
```python
{
    'status': 'running' | 'completed' | 'failed' | 'cancelled',
    'history': List[{iteration, fitness, fitness_std?, n_eval?}],
    'logs':    List[{t: float, msg: str}],
    'result':  None | Dict,           # 最终结果
    'error':   None | str,
    'start_time': float,
    'job_type': 'yaml' | 'standard',
    'method':  str,
}
```

### 决策二：新增端点

| 端点 | 方法 | 作用 |
|------|------|------|
| `/api/optimizer/run` | POST | 启动标准优化，返回 job_id |
| `/api/optimizer/run_yaml` | POST | 启动 YAML optimizer，返回 job_id |
| `/api/optimizer/status/{job_id}` | GET | 轮询进度（1.5s 间隔） |
| `/api/optimizer/job/{job_id}` | DELETE | 标记取消 |

### 决策三：进度回调

**yaml 路径**（`run_yaml_optimizer` → `_run_nsga2`）：
- pymoo `Callback` 子类每代调用 `progress_callback({iteration, fitness, n_eval})`
- 每 5 代写一条 log

**standard 路径**（`optimizer_engine.optimize`）：
- `optimize()` 接收 `history_out: list` 参数
- `self.history = history_out`（共享同一 list 对象）
- `_multi_eval_objective()` 每次迭代 `self.history.append(...)` 即实时可读

### 决策四：修复 pymoo 导入路径

```python
# optimizer_engine._pymoo_optimize()
# 改前（错误）：
from pymoo.dynamics.problem import Problem
# 改后（正确）：
from pymoo.core.problem import Problem
```

### 决策五：前端重写（Optimizer.tsx）

- 取消旧轮询仿真 batch 模式（用 simulation 端点模拟优化）
- 新增 Canvas fitness 曲线图（fitness vs iteration/generation，含 std 阴影带）
- 新增 LogConsole（时间戳 + 自动滚底）
- 状态栏：status badge + elapsed + iteration count + current best
- 1.5s 轮询 `/api/optimizer/status/{job_id}`

---

## 结果

```
sim_engine/src/api_server.py
  optimizer_jobs: Dict 全局变量
  _add_log(job, msg): 向 job['logs'] 追加带时间戳条目
  _run_optimizer_job(job_id, fn): async，在线程池执行 fn，更新 job status
  /api/optimizer/run: 改为 job 模式，返回 job_id
  /api/optimizer/run_yaml: 改为 job 模式 + progress_cb，返回 job_id
  GET /api/optimizer/status/{job_id}: 轮询端点
  DELETE /api/optimizer/job/{job_id}: 取消端点

sim_engine/src/optimizer_engine.py
  optimize(): 新增 history_out 参数
  _pymoo_optimize(): pymoo 导入路径修复

sim_engine/src/yaml_optimizer.py
  run_yaml_optimizer(): 新增 progress_callback 参数
  _run_nsga2(): 新增 _ProgressCb (pymoo Callback)，每代回调
  _run_scipy(): 新增 _iters 计数，每次函数评估回调

sim_gui/src/components/Optimizer.tsx
  完整重写：OptChart (canvas) + LogConsole + 轮询逻辑 + 结果面板
```

---

## 待验证问题

详见 `docs/opt_impl.md`。主要疑点：

1. YAML model 是否真正包含完整的 `optimizer:` 块（尤其 `regimen:` 子段）
2. `run_yaml_optimizer` 的 `load_models` 调用是否能找到模型文件
3. pymoo callback 是否在 run_executor 的 thread 中正确触发
