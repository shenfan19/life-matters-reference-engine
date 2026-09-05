# Optimizer Documentation

> **Decision navigation**: the key decisions in this file are summarized in [DECISIONS.md](DECISIONS.md) (⭐⭐ marks a core constraint).  
> Key ADRs: the asynchronous job system -> [0049](decisions/0049-2026-05-02_sim_optimizer-async-job-system-design.md); the three-tier validation framework -> [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md); the Regimen format -> [0052](decisions/0052-2026-05-04_sim_schedule-format-unification-and-opt-regimen-support.md)

---

## 1. Requirements

### 1.1 Functional requirements

| ID  | Requirement                                               |
| --- | ------------------------------------------------ |
| R1  | The optimization objectives, decision variables, and constraints are driven entirely by the YAML `optimization:` block, with no objective function hardcoded |
| R2  | Supports a multi-objective algorithm (NSGA-II) and single-objective algorithms (L-BFGS-B, Nelder-Mead) |
| R3  | Decision variables and fixed background inputs are defined together in the `optimization.startpoint.regimens` list; an entry with an `optimize:` block is a decision variable, otherwise it is a fixed background |
| R4  | An optimization task runs asynchronously; the API returns a `job_id` immediately, without blocking the main thread |
| R5  | The frontend can poll for live progress (the current generation, logs, fitness) |
| R6  | The GUI can override the YAML's optimization configuration via `optimizer_override` |
| R7  | Supports task cancellation (marking it cancelled, stopping after the current iteration finishes) |
| R8  | **T2**: supports optimizing a dosing/eating time within a modeler-specified time window (`time_window`), with `opt_step` granularity of `1h` (default) or `15min` |
| R9  | **T3**: supports choosing one pattern from a modeler-predefined list of candidate weekday patterns (`days_options`), rather than searching the full 2^7 space |
| R10 | **T4**: supports optimizing an intervention's start date within a modeler-specified date window (`date_start_window`) |
| R11 | T2/T3/T4 can be combined arbitrarily with T1 (value optimization); the x vector automatically concatenates every enabled dimension |
| R12 | T2/T3/T4 use continuous relaxation (float bounds, rounded at evaluation time), keeping the NSGA-II code unchanged |
| R13 | **Not yet implemented** (rechecked 2026-07-17, no corresponding logic in the code): search-feasibility constraints: T2's slot count <= 9, T3's candidate-pattern count <= 6, T4's window length <= 365 days; a single-objective algorithm (L-BFGS-B / Nelder-Mead) should auto-switch to NSGA-II with a warning when encountering T2/T3/T4. Currently `optimizer_engine.py:341,384`'s algorithm selection only looks at `method_raw`/`n_obj>=2`, without checking `var_specs`'s dimension types, and has no upper-bound validation at all — `method: l-bfgs-b` combined with a large-range T2/T3/T4 runs directly with scipy's continuous relaxation, with no error and no switch |
| R14 | The `optimization` block can independently declare an evaluation time window (`start_date`/`end_date`/`step_size`), used to shorten the evaluation period or guarantee reproducibility; defaults to inheriting the `simulation` / `metadata` settings (ADR 0083) |
| R15 | The GUI toolbar's time-control values are passed into the engine via `optimizer_override`, taking priority over the YAML's static values; a change takes effect live |
| R16 | Sim's and Opt's input lists are fully separated: `InputEvent[]` (sim) contains no optimization field at all; `OptInput[]` (opt decision variables) is managed independently (ADR 0084) |
| R17 | `optimization.startpoint.regimens` acts as the fixed background input for an opt evaluation (entries with no `optimize:` block); this field is declared independently and, when absent, does **not** inherit `simulation.plans[*].regimens`, erroring directly instead (`optimizer_engine.py:83-85`) |
| R18 | The GUI provides a "<- Import from Sim" button: converting the current sim inputEvents into opt decision variables and auto-filling their bounds |

### 1.2 Dependencies

| Library         | Purpose                     | Minimum version    |
| --------- | ---------------------- | ------- |
| `pymoo`   | NSGA-II / Callback     | >= 0.6.0 |
| `scipy`   | L-BFGS-B / Nelder-Mead | >= 1.7.0 |
| `asteval` | Equation evaluation                   | any      |
| `fastapi` | Async endpoints plus `create_task`   | >= 0.100 |

The correct import path for pymoo 0.6+:
```python
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import Problem
from pymoo.core.callback import Callback
from pymoo.optimize import minimize
from pymoo.termination import get_termination
```

---

## 2. Design

### 2.1 Architecture: the single optimization path

The system has only one optimization path, driven entirely by the YAML's `optimization:` block.

| Item | Description |
|------|------|
| Frontend entry point | `Simulator.tsx`'s `startOptimization()` |
| Endpoint | `POST /api/optimizer/run_yaml` |
| Core modules | `reference_engine/src/optimizer_engine.py` (the main flow) plus `optimizer_parsing.py`/`optimizer_eval.py`/`optimizer_backends.py` (split by responsibility, see 3.1) |
| Algorithm | NSGA-II (multi-objective) / L-BFGS-B / Nelder-Mead (single-objective) |
| Optimization target | Entries in YAML `optimization.startpoint.regimens` containing an `optimize:` block (T1-T4 decision variables) |
| Objective-function source | YAML `optimization.objectives` |
| Progress callback | A pymoo `Callback` called once per generation |
| Progress display | The frontend polls `/api/optimizer/status/{job_id}` every 1.5s |

### 2.2 REST API

**Starting a task**
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
Returns: {success: true, job_id: "uuid"}
```

`model_name` uses `selectedModel.key` (the complete relative path, e.g. `components/medical/disease/chronic/ckd_protein_muscle.yaml`).  
`optimizer_override` overrides the corresponding field in the YAML's `optimization:` block; when not supplied, the YAML configuration is used entirely as-is.

**Polling status**
```
GET /api/optimizer/status/{job_id}
Returns: {
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

**Cancelling a task**
```
DELETE /api/optimizer/job/{job_id}
```
Marks it cancelled; the task in the thread pool keeps running until the current iteration finishes.

### 2.3 The OptResult structure

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

> **Note**: `best_x`/`best_f` are API-response-level fields (taking the Pareto front's first solution). The canonical representation at the YAML level is `optimization.results.recommended` (containing only `x` and `f`; the decoded human-readable dict is no longer stored, with decoding done on the fly via `xToInputEvents`), written back by the GUI's "Save results to the model."

### 2.4 The frontend state machine

```
state:
  optRunning: bool         - whether it's running (true while polling)
  optResult: any           - the OptResult once finished
  optCurGen: int           - the current generation (updated by polling)
  optTotalGen: int         - the total number of generations (read from YAML optimization.algorithm.n_generations)
  optLogs: [{t, msg}]     - log entries
  optJobId: string|null   - the current job_id
  optPollRef: ref          - the setInterval handle

startOptimization():
  POST run_yaml -> gets job_id -> setOptRunning(true)
  -> setInterval(1500ms): GET status -> updates progress
    completed -> setOptResult(data.result), clearInterval
    failed    -> message.error, clearInterval

cancelOptimization():
  clearInterval -> DELETE job/{job_id} -> setOptRunning(false)

UI:
  optRunning=true            -> a progress panel (Gen X/N plus logs plus a stop button)
  !optRunning && pareto_front -> ParetoChart
  !optRunning && !optResult  -> a placeholder prompt
```

### 2.5 T2/T3/T4 scheduling-granularity optimization (ADR 0080/0088/0100)

The x vector expands in the order of the `optimization.startpoint.regimens` list, with each entry contributing dimensions in the order
`[value?, time_start?, time_end?, days?, date_start?, date_end?]`:

| Tier | YAML field | x dimensions | Type (continuous relaxation) |
|------|----------|-------|--------------|
| T1 value | `optimize.value: [lo, hi]`, optionally `value_step` | 1 | float, discretized into a grid once `value_step` is declared |
| T2 time window (1D) | `optimize.time_start: [lo, hi]`, `time_step` | +1 | float -> a slot index |
| T2 time window (2D) | additionally declaring `optimize.time_end: [lo, hi]` | +2 | float -> a slot index x2 |
| T3 weekday pattern | `optimize.days_pool` plus `days_n` | +1 | float -> a pattern index |
| T4 start date | `optimize.date_range` (two window sets) | +1~2 | float -> a day offset |

`OptResult.pareto_front`'s `x` vector's dimensionality grows accordingly. In T2's 1D form (only `time_start`), the interval width (`time_end - time_start`) stays fixed, and the searched `time_end` is derived from that fixed width; declaring `optimize.time_end` at the same time makes it 2D, with the start and end searched independently (see the `life-matters-models` repository's `docs/authoring/regimens_and_optimization.md` for the x-vector encoding rule in detail).

T1's `optimize.value` searches within the continuous interval `[lo, hi]` by default, and without `value_step` declared, a solution can carry arbitrary decimal precision; once `value_step` is declared, the decoding stage snaps the internal continuous real number onto a grid anchored at `lo` with a spacing of `value_step`, clamping any grid point outside `[lo, hi]` back to the boundary — this is the same "continuous internal representation plus discretization at decode time" pattern as T2's `time_step`, just anchored at `lo` rather than the window's start, suited to a scenario needing a clinically/engineering-readable precision, e.g. a feeding amount in steps of 5 mL, or a metabolic equivalent in steps of 0.1 MET-h.

---

## 3. Implementation

### 3.1 The complete call chain

```
Simulator.tsx  startOptimization()
  └─ POST /api/optimizer/run_yaml
        ├─ creates job_id, job_history: List[Dict]
        ├─ progress_cb(entry) -> job_history.append plus writing a log every 5 generations
        ├─ fn = functools.partial(run_yaml_optimizer, ...)
        ├─ asyncio.create_task(_run_optimizer_job(job_id, fn))
        └─ returns {success: True, job_id}

_run_optimizer_job(job_id, fn)
  └─ await loop.run_in_executor(None, fn)   # a thread pool, does not block the event loop
       └─ run_optimizer(engine, model_name, folder, progress_cb)
             ├─ engine.load_models([model_name], folder=None)
             ├─ base_model = engine.current_model
             ├─ opt_block = dict(base_model.optimizer)
             ├─ parses objectives, constraints, inputs/regimen, algo, mc
             ├─ computes time_hours / total_steps (see 3.3)
             ├─ constructs the evaluate(x) closure
             │     _clone(base_model) -> _run_sim() -> _eval_F() + _eval_G()
             └─ _run_nsga2(evaluate, ..., progress_callback=progress_cb)
                   └─ pymoo_minimize -> _ProgressCb.notify each generation -> progress_cb
```

### 3.2 The YAML optimization-block specification

Decision variables and fixed background inputs are written together in a single flat list, `optimization.startpoint.regimens` (R3/R17): an entry's structure matches `simulation.plans[*].regimens` (`variable`/`time_start`/`time_end`/`value`/`days`/`date_range`/`delivery`, see [design.md](design.md)'s K x 4), with an `optimize:` sub-block optionally added — if present, the entry's corresponding dimension becomes a decision variable; if absent, the whole entry participates in the simulation as a fixed background input.

```yaml
optimization:
  method: nsga2
  objectives:
    - variable: output_var_name
      metric: final            # 'final' | 'max' | 'min' | 'mean'
      direction: maximize
  constraints:
    - variable: constraint_var
      condition: "<= 250"    # metric omitted by default: the whole trajectory is checked step by step (a trajectory-wide max/min)
    - variable: another_constraint_var
      condition: ">= 10"
      metric: mean            # 'final' | 'mean' | 'max' | 'min'; when metric is written explicitly, the
                               # trajectory is first collapsed to a single value by that convention before comparing
                               # (e.g. mean means "overall/on-average meeting the target," not "must never fall below
                               # the threshold at any step," allowing a planned brief dip, such as a scheduled full rest day)
  startpoint:
    regimens:
      - variable: input_var_name
        time_start: "08:00"
        time_end: "08:00"
        days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
        label: "Morning dose"
        optimize:
          value: [0.0, 50.0]   # T1: a value interval -> a decision variable
      - variable: another_var
        time_start: "20:00"
        time_end: "20:00"
        value: 5.0              # no optimize: -> a fixed input, not searched
  algorithm:
    population_size: 10
    n_generations: 15
    seed: 19                    # the NSGA-II genetic-algorithm seed, unrelated to MC
  mc:                           # optional; absent or runs=1 means a single evaluation (the default)
    runs: 5                     # the number of inner-loop MC runs per candidate evaluation
```

Besides T1 (`value: [lo, hi]`), the `optimize:` sub-block also supports T2 (`time_start`/`time_end` interval search), T3 (`days_pool` plus `days_n`, a candidate weekday pattern), and T4 (`date_range`, a start/end date window); the four can be combined arbitrarily on the same entry, see 3.6 for detail.

When `optimization.startpoint.regimens` is not provided, it does not fall back to `simulation.plans` — the two are independent fields, and a missing `optimization.startpoint` errors directly (see 3.5).

Reference implementation: `models/papers/s1/banister/banister_opt.yaml` in the `life-matters-models` repository.

### 3.3 Evaluation-time-window configuration (ADR 0083)

The optimizer's evaluation time window and step size can be declared independently in the `optimization` block, taking priority over the `simulation` / `metadata` defaults. The GUI toolbar's date and step-size controls are passed in via `optimizer_override`, taking the highest priority.

```yaml
optimization:
  start_date: "YYYY-MM-DD"   # optional; defaults to simulation.start_date
  end_date:   "YYYY-MM-DD"   # optional; defaults to simulation.end_date
  step_size:                  # optional; defaults to metadata.step_size
    value: 1
    unit: day
```

**Read priority** (highest to lowest):
1. `optimizer_override.start_date / end_date / step_size` (the GUI toolbar's live value)
2. `optimization.start_date / end_date / step_size` (the YAML's static declaration)
3. `simulation.start_date / end_date` plus `metadata.step_size` (the default inheritance)

### 3.3.1 Simulation-duration calculation

```python
# step_size: the opt block takes priority, otherwise the simulation block
_opt_step_cfg = opt_block.get('step_size')
if _opt_step_cfg and isinstance(_opt_step_cfg, dict):
    _unit_to_sec = {'minute': 60.0, 'hour': 3600.0, 'day': 86400.0}
    step_size = float(_opt_step_cfg.get('value', 1)) * _unit_to_sec.get(
        str(_opt_step_cfg.get('unit', 'minute')).lower(), 60.0)
else:
    step_size = float(base_model.simulator.get('step_size', 86400.0))  # seconds

sd = opt_block.get('start_date') or sim_data.get('start_date', '')
ed = opt_block.get('end_date')   or sim_data.get('end_date', '')
if sd and ed:
    sy, sm, sdd_ = [int(x) for x in sd.split('-')]
    ey, em, edd_ = [int(x) for x in ed.split('-')]
    if sy >= 1:
        total_days = (date(ey, em, edd_) - date(sy, sm, sdd_)).days  # exact
    else:
        total_days = (ey-sy)*365 + (em-sm)*30 + (edd_-sdd_)          # an ancient-date approximation
    time_hours = max(total_days, 1) * 24.0   # clamp the day-count lower bound first, then multiply by 24, fixing an
                                              # unreachable-schedule bug for single-day/sub-day-step models (the old
                                              # form max(1.0, total_days*24.0) gave a non-multiple-of-24 value when
                                              # total_days<1, missing the hit window)
else:
    time_hours = float(base_model.simulator.get('total_time', 1)) * step_size / 3600.0

total_steps = max(1, int(time_hours * 3600.0 / step_size))
```

### 3.4 The progress-callback data format

One entry per generation (`_ProgressCb.notify`):
```python
{'iteration': algorithm.n_gen, 'fitness': float(np.min(F)), 'n_eval': algorithm.evaluator.n_eval}
```

One log entry every 5 generations (`_add_log`):
```python
{'t': unix_timestamp, 'msg': "Gen 5  best=-24.3215  eval=100"}
```

### 3.5 A debugging checklist

**Symptom: after clicking run, the log only shows "Loading model...", with no "Gen X"**
1. The model file was not found -> check the backend log for `ERROR:src.loader_engine:Model ... not found`
2. `optimization.objectives` is missing -> returns `"No objectives configured (add optimization: block in YAML or set targets in UI)"`
3. `optimization.startpoint.regimens` is missing -> returns `"No optimization.startpoint.regimens defined"`
4. No entry in `optimization.startpoint.regimens` carries an `optimize:` sub-block -> returns `"No entries with optimize: sub-block in optimization.startpoint.regimens"`

**Symptom: the log shows "Starting optimizer..." but no "Gen X"**
1. pymoo is not installed -> `pip install pymoo`
2. The pymoo version is below 0.6 -> `_ProgressCb.notify`'s API differs, an upgrade is needed
3. `n_gen=0` or `pop_size=0` -> check the YAML's algorithm configuration

**Symptom: completed, but optResult.pareto_front is empty**
1. NSGA-II returned `res.X = None` -> check the `job['error']` field
2. A frontend condition: `optResult?.pareto_front?.length > 0` -> confirm the result is `data.result`, not `data`

**Symptom: polling returns 404**
1. The backend restarted (jobs live in memory and are cleared on restart)

### 3.6 The T2/T3/T4 implementation (ADR 0080, 2026-05-20)

**Backend (`optimizer_engine.py`)**

- `_expand_time_window(window, opt_step)` -> a list of slots
- The `run_optimizer` inputs-parsing section: for each entry, appends a `var_specs` entry and bounds per T1/T2/T3/T4
- `_build_regimen_events(x)`'s two-step decoding: first merging by `id(entry)` for the same entry, then writing `time`/`days`/`valid_start`
- `schedule_runner.apply_schedules`'s event loop gained a check on `ev.valid_start` (a T4 start-date filter)

> **R13 (a search-space upper bound plus auto-switching a single-objective algorithm to NSGA-II) is not yet implemented**, see the table annotation in 1.1; the T1-T4 decoding this section describes is itself already implemented, missing only the feasibility guardrail.

**Frontend (`types.ts` / `Simulator.tsx` / `SimSetupTab.tsx`)**

- `InputEvent` gained 7 new optional fields: `timeWindow`, `optStep`, `optimizeTime`, `daysOptions`, `optimizeDays`, `dateStartWindow`, `optimizeDateStart`
- `xToInputEvents` fully rewritten: fixed a bug in the original function's parsing of list-format inputs, decoding T1-T4 in `var_specs` order
- The init useEffect: reads all T2/T3/T4 fields in from the YAML's `inputs:` block
- `startOptimization`: switched from the `regimen:` format to the `inputs:` format (supporting multiple variables), passing T2/T3/T4 fields through
- In `SimSetupTab`'s opt mode, T2/T3/T4 rows are added below the value bounds (shown only when the YAML has the corresponding fields)
2. job_id was not passed correctly to the polling
