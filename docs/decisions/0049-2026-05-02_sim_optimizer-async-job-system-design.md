# ADR 0049 — Optimizer async job system and real-time progress UI
**Date**: 2026-05-02
**Status**: implemented (front-end polling verified; backend progress callbacks pending verification)

---

## Background

The original optimizer implementation (`/api/optimizer/run` and `/api/optimizer/run_yaml`) called a synchronous, blocking function directly inside a FastAPI `async def` handler (NSGA-II can run for several minutes), causing:

1. **Blocking the event loop**: uvicorn's single-threaded event loop was fully occupied, so every other request (including health checks) queued up and the GUI showed offline.
2. **Zero progress feedback**: the front end showed "calculating" with no visible iteration progress, leaving the user unable to tell whether it was actually running.
3. **A wrong pymoo import path**: `optimizer_engine._pymoo_optimize()` imported `from pymoo.dynamics.problem import Problem`, a module that does not exist, raising `ModuleNotFoundError`, which was mistakenly caught as "pymoo not installed."

---

## Decision

### Decision one: a job system (backend)

Introduce a global `optimizer_jobs: Dict[str, Dict]`. For each optimization request:

1. Synchronous steps (millisecond-scale): create a `job_id`, initialize `job_history: List[Dict]`, write to `optimizer_jobs[job_id]`
2. Return `{success: True, job_id}` to the front end
3. `asyncio.create_task(_run_optimizer_job(job_id, fn))` starts a background coroutine
4. The background coroutine runs the synchronous optimization function on a thread pool via `loop.run_in_executor(None, fn)`

Job status fields:
```python
{
    'status': 'running' | 'completed' | 'failed' | 'cancelled',
    'history': List[{iteration, fitness, fitness_std?, n_eval?}],
    'logs':    List[{t: float, msg: str}],
    'result':  None | Dict,           # final result
    'error':   None | str,
    'start_time': float,
    'job_type': 'yaml' | 'standard',
    'method':  str,
}
```

### Decision two: new endpoints

| Endpoint | Method | Purpose |
|------|------|------|
| `/api/optimizer/run` | POST | start a standard optimization, return job_id |
| `/api/optimizer/run_yaml` | POST | start a YAML optimizer, return job_id |
| `/api/optimizer/status/{job_id}` | GET | poll progress (1.5s interval) |
| `/api/optimizer/job/{job_id}` | DELETE | mark as cancelled |

### Decision three: progress callbacks

**YAML path** (`run_yaml_optimizer` → `_run_nsga2`):
- A pymoo `Callback` subclass calls `progress_callback({iteration, fitness, n_eval})` each generation
- A log line is written every 5 generations

**Standard path** (`optimizer_engine.optimize`):
- `optimize()` accepts a `history_out: list` parameter
- `self.history = history_out` (sharing the same list object)
- `_multi_eval_objective()` calls `self.history.append(...)` on every iteration, making it readable in real time

### Decision four: fixing the pymoo import path

```python
# optimizer_engine._pymoo_optimize()
# before (wrong):
from pymoo.dynamics.problem import Problem
# after (correct):
from pymoo.core.problem import Problem
```

### Decision five: front-end rewrite (Optimizer.tsx)

- Remove the old polling-based simulation-batch mode (which simulated optimization using the simulation endpoint)
- Add a Canvas fitness curve chart (fitness vs. iteration/generation, with a std shaded band)
- Add a LogConsole (timestamped, auto-scroll to bottom)
- Status bar: a status badge + elapsed time + iteration count + current best
- Poll `/api/optimizer/status/{job_id}` every 1.5s

---

## Outcome

```
sim_engine/src/api_server.py
  optimizer_jobs: a global Dict variable
  _add_log(job, msg): appends a timestamped entry to job['logs']
  _run_optimizer_job(job_id, fn): async, runs fn on a thread pool, updates job status
  /api/optimizer/run: switched to job mode, returns job_id
  /api/optimizer/run_yaml: switched to job mode + progress_cb, returns job_id
  GET /api/optimizer/status/{job_id}: the polling endpoint
  DELETE /api/optimizer/job/{job_id}: the cancel endpoint

sim_engine/src/optimizer_engine.py
  optimize(): new history_out parameter
  _pymoo_optimize(): pymoo import path fixed

sim_engine/src/yaml_optimizer.py
  run_yaml_optimizer(): new progress_callback parameter
  _run_nsga2(): new _ProgressCb (pymoo Callback), called back each generation
  _run_scipy(): new _iters counter, called back on each function evaluation

sim_gui/src/components/Optimizer.tsx
  fully rewritten: OptChart (canvas) + LogConsole + polling logic + results panel
```

---

## Open questions pending verification

See `docs/opt_impl.md` for detail. The main open questions:

1. Whether the YAML model actually contains a complete `optimizer:` block (in particular the `regimen:` subsection)
2. Whether `run_yaml_optimizer`'s call to `load_models` can locate the model file
3. Whether the pymoo callback fires correctly from within the run_executor thread
