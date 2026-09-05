# Life Matters CLI (`lm-sim`)

`cli/` supplies a command-line batch-run interface, suited to automated simulation, script scheduling, development debugging,
and an **AI agent** (such as Claude Code) directly running a model and reading a structured result.  
The formal user interface aimed at human researchers is still the GUI (`gui/`); the CLI does not cover the GUI's interactive features (charts, drag-and-drop, history archiving, etc.).

See [`data_flow.md`](data_flow.md) for the complete data flow.

---

## Aimed at AI / automation scenarios

The CLI's input and output are both text/files, suited to being called by a script or an AI agent:

- **Input**: a model YAML file path plus an optional step flag (`--sim-only` / `--opt-only`, both run by default), needing no interaction.
- **Output**: structured CSV (a simulation time series / a Pareto front) plus a log file, with the path printed to stdout when the run finishes, parseable directly.
- **Exit code**: `0` on success, `1` on a simulation/optimization failure (`batch.py` judges by whether any step of any model in the whole batch failed, not at single-model granularity).
- **No graphical environment needed**: it can run in a headless container, CI, or an SSH session.

The archive shipped with each code release includes a directly runnable `lm-sim` (a PyInstaller build artifact), usable without installing Python (see "Compiling into a standalone executable" below).

---

## Installation and running

### Running directly (requires a Python environment)

Run from the project root:

```bash
# A single model (main.py)
python cli/main.py <model.yaml>                # runs both sim and opt
python cli/main.py <model.yaml> --sim-only
python cli/main.py <model.yaml> --opt-only
python cli/main.py <model.yaml> --opt-only --opt-continue
python cli/main.py <model.yaml> --opt-only --opt-continue output/masld_insulin_a7_s2/2026-06-06_13-00-34_opt.csv

# Batch (batch.py, walking a folder, a summary report, see "Batch running" below for detail)
python cli/batch.py --input-dir models/papers --sim-only
```

### Compiling into a standalone executable

```bash
pyinstaller cli/build.spec
```

Produces `dist/lm-sim.exe` (Windows). When distributing it, the `models/` folder must sit in the same directory as the exe.

> `build.spec` currently only packages `main.py` (the single-model entry point). `batch.py` has no corresponding exe yet;
> a user needing batch runs still needs `python cli/batch.py` (requiring a local Python environment).

---

## Path configuration

The model-library root, the output root, and SCS mode are all resolved uniformly by `reference_engine/src/paths.py`; the GUI backend (`api_server.py`)
and the CLI (this document) share the same logic, rather than each maintaining its own set of defaults:

| Environment variable | Default | Description |
|---------|--------|------|
| `LM_MODELS_PATH` | `<project root>/models` | The model-library root |
| `LM_OUTPUT_PATH` | `<project root>/output` | The CLI output root (the GUI does not write to disk for now, see "Relationship with the GUI") |
| `SCS_MODE` | `false` | The write-protection switch for a cloud multi-user deployment, see [ADR 0078](decisions/0078-2026-05-18_project_scs-mode-design.md) |

Copy `.env.example` in the project root to `.env` and edit it (`.env` is already in `.gitignore`, so it won't be committed);
when not set, the defaults in the table above are used, and local development usually needs no `.env` at all.

---

## Command parameters

The "which steps to run" parameters are identical across both entry points: `--sim-only`/`--opt-only` are mutually exclusive, and when neither is passed, both run by default.

### `main.py` (a single model)

| Parameter | Default | Description |
|------|--------|------|
| `<model.yaml>` | (required) | The model file path (absolute, or relative to the project root) |
| `--sim-only` | (runs sim plus opt) | Runs only the simulation, skipping the optimizer. Mutually exclusive with `--opt-only`. If the model defines `simulation.plans`, each plan is run once, outputting multiple CSVs (`<stem>__<plan_id>.csv`); otherwise a single `<stem>.csv` is output |
| `--opt-only` | (runs sim plus opt) | Runs only the optimizer (NSGA-II), skipping the simulation. Mutually exclusive with `--sim-only` |
| `--opt-continue` | (no warm start) | Warm-starts by continuing the search from the model YAML's embedded `optimization.results`. Requires the optimizer step to run (cannot be passed together with `--sim-only`) |
| `--opt-continue PATH` | — | Warm-starts by loading a Pareto front from the specified `_opt.csv` file (a relative path counted from the project root, or an absolute path) |
| `--output-dir PATH` | `output/` | Specifies the output root (relative to the project root, or absolute). Results are written to `<PATH>/<model name>/` |

> The simulation step and the optimization step each write their own log file (`*_sim.log` / `*_opt.log`), never mixed together; when both steps run, they execute in "sim then opt" order, and if sim fails, opt does not run.

> **Silently skipping a step a model doesn't declare**: under the default invocation (neither `--sim-only` nor `--opt-only` passed), if a model has no `simulation:`/`simulator:` block, sim is skipped, and if it has no `optimization:` block, opt is skipped — a line is printed, this does not count as an error, and the exit code is still `0` (both `main.py` and `batch.py` have this `model_declares_step()` gate). If both steps are skipped, it counts as an error (exit code `1`). Explicitly passing `--sim-only`/`--opt-only` bypasses this gate, and a missing corresponding step is treated directly as a failure.

> **Passing `--opt-continue` together with `--sim-only`**: errors with `Error: --opt-continue requires the optimizer step (remove --sim-only).`, exit code `1`.
> **A model with no `optimization:` block but `--opt-continue` explicitly passed** (without `--opt-only`/`--sim-only`): the silent-skip gate is bypassed, and the optimizer is attempted as usual, very likely erroring for lacking an `optimization:` configuration — this is expected behavior (the user has explicitly requested the optimizer step), not a bug.

> **How many times Monte Carlo runs is not a CLI parameter**: the number of simulation runs and the seed come from the model's own `simulation.mc.runs`/`simulation.mc.seed` (see `model.md`); the CLI simply runs what the YAML says, offering no override switch like `--mc-runs`/`--seed` — following the same rule as `optimization.mc.*` (the optimizer's MC configuration, likewise only in YAML, with no corresponding CLI flag ever): to change the run count, edit the model file, not the command line. `mc.runs` absent or 1 means deterministic mode (taking the distribution mean, ADR 0045); above 1, the output is `<stem>__run{i}.csv` (or `<stem>__<plan_id>__run{i}.csv` for multiple plans).

### `batch.py` (batch, walking a folder)

| Parameter | Default | Description |
|------|--------|------|
| `--input-dir PATH` | `models/` (the whole model library) | The model folder to scan (recursively finding `*.yaml`). **A relative path is counted from `models/`** (the same root-directory convention as the GUI's file tree/`model_key`, see "Path configuration" above), e.g. `--input-dir test_fixtures/valid` is equivalent to `models/test_fixtures/valid`; an absolute path is unaffected. **Note**: everything under `models/test_fixtures/invalid` is a deliberately broken error-detection fixture, and every file there is expected to FAIL — when scanning the whole model library (no `--input-dir` passed) or `--input-dir test_fixtures`, these FAILs appearing in the report is by design, not a regression |
| `--output-dir PATH` | `output/` (the project root) | The root path of the batch directory (relative to the project root, or absolute); the actual output lands under `<PATH>/<timestamp>/<model name>/` |
| `--sim-only` | (runs sim plus opt) | Runs only the simulation, skipping the optimizer. Mutually exclusive with `--opt-only` |
| `--opt-only` | (runs sim plus opt) | Runs only the optimizer, skipping the simulation. Mutually exclusive with `--sim-only` |

> Running `batch.py` with no parameters is equivalent to `--help` (avoiding accidentally running the default folder).
> The difference from `main.py`: the input is a folder (`--input-dir`) rather than a single model file, and there is no `--opt-continue` (a batch scenario does not support warm-starting, since multiple models could never share one warm-start CSV);
> **within a single model, a sim failure does not stop that model's opt from running** (sim/opt each have their own independent `try/except`, with the two steps' results not affecting each other, unlike `main.py`'s "sim fails, opt does not run" sequential-execution semantics) — in a batch scenario, seeing each step's genuine result matters, so opt still runs even when sim is already known to have failed.
> Monte Carlo likewise runs according to each model's own YAML `mc.runs`, not a batch parameter — meaning that if some model declares a large `mc.runs`, the batch test will slow down according to that model's actual configuration.

---

## Output files

All output is written to the `output/{model name}/` directory (`output/` is already in `.gitignore`, with the directory itself tracked in git);
`--output-dir` can change the root, without changing the model-subdirectory nesting rule.  
The filename format: `{model name}_{YYYY-MM-DD_HH-MM-SS}_{mode}.{extension}`

| File | Description |
|------|------|
| `*_sim.csv` | A simulation time series, one output variable per column; if the model defines multiple `simulation.plans`, it becomes `*_sim__<plan_id>.csv` (one file per plan) |
| `*_opt.csv` | A Pareto-front table, one solution per row (x columns plus f columns); overwritten live after each generation finishes, nothing lost on interruption |
| `*_{mode}.log` | The run log (including the feasible ratio per generation) |

The CLI does not output a YAML copy. To publish a result, import the CSV in the GUI's opt tab and click "Save results to the model," writing the Pareto front back into the original YAML's `optimization.results` block.

---

## Runtime output

```
  Life Matters CLI
  Model : masld_insulin_a7_s2.yaml
  Mode  : opt
  Log   : masld_insulin_a7_s2_2026-06-01_14-23-05_opt.log

  Type  q + Enter  at any time to stop and save current results.

  Gen  10 | eval:   999 | feasible:  23% | best_f: [12.1, 2.8, 76.0]
  Gen  20 | eval:  1999 | feasible:  61% | best_f: [9.3,  2.3, 74.2]
```

**What the `feasible` field means**: the fraction of the current generation's population satisfying every hard constraint.  
If it stays at 0%, the constraints are too tight, or the initial state itself violates a constraint, and the model design should be checked.

---

## Early stopping and warm-starting

While an optimization is running, typing `q` plus Enter (works in any terminal):

1. Stops after the current generation finishes
2. Writes the Pareto front found so far into `_opt.csv`
3. Records a line at the end of the log, `Optimizer complete (stopped early): N solutions` (`main.py`'s stdout
   also prints `(stopped early — resume with --opt-continue)`; `batch.py` does not listen for `q`, so this early stop never triggers there)

> **Auto-saved every generation**: `_opt.csv` is overwritten live at the end of every generation, so progress is never lost even if the terminal closes unexpectedly.

There are two ways to continue from where it stopped next time:

```bash
# 1. Warm-start from a specified _opt.csv file (recommended: an explicit path, independent of whether the model file has since changed)
python cli/main.py <model.yaml> --opt-only --opt-continue output/masld_insulin_a7_s2/2026-06-06_13-00-34_opt.csv

# 2. Warm-start from the model YAML's embedded optimization.results (requires first saving the result to the model in the GUI)
python cli/main.py <model.yaml> --opt-only --opt-continue
```

---

## Input validation

Before the simulation/optimization actually starts executing, both the CLI and the GUI validate the format of every date field (`start_date`/`end_date`/
`valid_start`/`valid_end`/`date_range`) and time field (`time_start`/`time_end`) in the model
(`reference_engine/src/validation.py`, ADR 0118). When the format is invalid, it errors and stops directly, never silently continuing with a default value:

```
Simulation failed: Invalid date for simulator.start_date: '2026-13-99' (expected YYYY-MM-DD)
```

This validation shares the same engine-layer code as the sim/opt execution core (see "Relationship with the GUI" below), so for the same bad input, the CLI's error message
and the GUI's error message (shown in an on-screen prompt box) are exactly identical. On the CLI side, this message is also written into
the log file and standard output described in "Runtime output."

---

## Logging design

The log file records:
- The CLI's own progress messages (`Gen N | eval | feasible | best_f` per generation, the steps completed for each plan)
- Simulation/optimization run information — model scale (number of variables/equations), imports, start/end date and step size, the output-variable list,
  schedule/regimen variable names, NaN/out-of-bounds warnings, completion time and schedule-hit count (sim); objectives/constraints/decision variables/
  algorithm configuration (opt). This content is generated by `reference_engine/src/run_logging.py` (sim) and `optimizer_engine.py`'s
  `log_cb` mechanism (opt), the same code output the GUI's runtime log panel displays, just landing through a different channel
  (the CLI writes a log file, the GUI stores it in an in-memory session) — see ADR 0119.
- Engine-level WARNING / ERROR

The log and the CSV use the same timestamp for naming, making them easy to match up.

---

## Relationship with the GUI

| Feature | GUI | CLI |
|------|-----|-----|
| Interactive parameter adjustment | Yes | No |
| Pareto-front visualization | Yes | No |
| Batch/automated running | No | Yes |
| Result-file output | Manual export | Automatic (`output/<model name>/`) |
| Warm-starting | Yes (a UI checkbox or importing a CSV) | `--opt-continue` |
| Importing a CLI result into the GUI | — | The GUI opt tab's "Import CSV" |
| Multiple Monte Carlo runs | Yes (the UI can temporarily change sim_runs/seed, overriding the YAML without writing back) | Strictly runs per the model YAML's `mc.runs`/`mc.seed`, with no override switch |

The CLI and the GUI share the same engine layer (`reference_engine/src/`), with a consistent result format, and are interoperable — the sim execution core
(the loop from `apply_schedules` to `model.step()`) and MC seed derivation are the same code (see ADR 0113),
not two separately implemented copies that happen to agree. This consistency is automatically regression-tested by `test_verification/test_sim_cli_consistency.py`
(see ADR 0111/0112/0113).

### Split by data flow: what's shared, what's independent

Breaking the whole pipeline apart (input -> validation -> execution -> logging/error -> result output), a more precise boundary is:

| Step | GUI-only | CLI-only | Shared |
|---|---|---|---|
| Entry point/trigger | The HTTP API, asynchronous, session/job polling | argparse, synchronous and blocking | Both land on `ReferenceEngine`'s methods |
| Parameter source | The request body can override regimens/MC runs at runtime, not written back to YAML | Strictly read-only from YAML | Once parsed, both land on the same set of `ModelStructure` fields |
| Model loading/validation | — | — | `LoaderEngine.fetch()`; `validation.py` (ADR 0118) |
| MC sampling | — | — | `mc_utils.py` |
| The sim execution core | Runs in batches (`batch_steps`), supporting pause/resume | Runs straight through to the end in one go | `schedule_runner.advance_steps` (ADR 0113) |
| The opt execution core | An asynchronous job, cancellable | Synchronous and blocking, `q`+Enter to stop early | The entire `optimizer_engine.run_optimizer()` function |
| Progress/log content | — | — | `run_logging.py` (sim) plus `log_cb` (opt), see ADR 0119 |
| Where progress/logs land | The in-memory `session['logs']`/`job['logs']`, shown in a frontend panel | Written to a `<stem>.log` file | The content comes from the same code, just a different exit channel |
| Error handling | `HTTPException` -> the frontend's `message.error()` | `logger.error()` plus exit code 1 | The same `{"success": False, "error": str(e)}` |
| Result output | Manual export | Automatically written to `output/<model name>/` | The CSV field format is consistent |

Pause/resume control is the one place that is "reasonably and expectedly independent" — the CLI executes synchronously and blocking, the GUI polls asynchronously, and the two execution models don't share the same pause mechanism to begin with. Every other difference is just the expected IO/triggering difference between "a batch tool" and "an interactive service"; the logical core (validation, the execution core, log content, error format) is already unified.

---

## Batch running (`cli/batch.py`)

`cli/batch.py` walks every YAML under a folder, running the simulation and the optimizer for each model in turn (both by default, narrowable with `--sim-only`/`--opt-only`), summarizing the results into a Markdown report.
Belonging to `cli/` alongside `main.py`, it's a pure Python implementation with no dependency on bash, and can run in the same environment as the PyInstaller-built `lm-sim`.
See "Command parameters" above for a run example and the parameters.

Each run creates a batch directory named with a second-level timestamp (`<output-dir>/YYYY-MM-DD_HH-MM-SS/`),
further split into per-model subdirectories inside it following `lm-sim`'s standard convention (`<model name>/`), with every CSV, log, and `batch_report.md` placed in that batch directory. Running multiple processes concurrently causes no conflict.

### The report

`batch_report.md` has one row per model, with Sim and Opt columns:
- Actually ran and succeeded: `[PASS](./<model name>/xxx.csv)` (linking to the result CSV)
- Actually ran but failed: `FAIL`, with the error-summary column carrying the last ERROR message from the engine log
- A step that didn't run: `SKIP` — this may be because `--sim-only`/`--opt-only` was passed, or because the model itself doesn't declare
  the corresponding `simulation:`/`simulator:` or `optimization:` block (see "Silently skipping a step a model doesn't declare" above)

A single model crashing does not interrupt the whole batch run; the summary section gives an overall PASS/FAIL count (per model, counted as PASS only if every step that actually ran for that model succeeded).

---

## Directory structure

```
cli/
  main.py       # the single-model entry point, argparse, dispatch
  batch.py      # the batch entry point: walks a folder, calls the runner per model, generates batch_report.md
  runner.py     # run_sim / run_opt, calling the engine
  output.py     # output-directory/CSV writing and log configuration
  progress.py   # live progress display and stop-signal listening
  build.spec    # the PyInstaller build configuration

output/                     # the CLI output root (content gitignored, the directory itself tracked in git)
  <model name>/              # subdirectory per model
    <timestamp>_sim.csv
    <timestamp>_opt.csv
    <timestamp>_<mode>.log
```
