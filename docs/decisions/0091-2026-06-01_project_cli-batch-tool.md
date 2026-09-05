# 0091 — `sim_cli/`: a Batch Simulation CLI Tool

**Date:** 2026-06-01
**Status:** Implemented (revised 2026-06-01: dropped `_opt.yaml` output; revised 2026-06-06: timestamp format, `--continue` simplification, batch test script)
**Category:** Architecture / Interface
**Revises:** partially revises ADR 0072 (GUI-only)

---

## Background

ADR 0072 established "the GUI is the sole formal user interface; the CLI is for internal debugging only."
As `optimizer.results` became integrated into the model YAML and the number of model files grew, two new needs emerged:

1. **Batch runs:** running simulations or optimizations across many models in batch — something the GUI cannot automate.
2. **Development debugging:** while running an optimization, developers need to watch the `feasible ratio`, stop early and save intermediate results, and warm-start a continuation — the GUI's interaction model limits debugging efficiency.

---

## Decision

Add a `sim_cli/` module implementing the following capabilities:

| Capability | Description |
|------|------|
| `--sim` | Read a model YAML, run the simulation, output a CSV |
| `--opt` | Run NSGA-II optimization, output a full model YAML with results plus a Pareto CSV |
| `--continue` | Warm start: continue the search from `optimizer.results` already present in the model |
| Early stop | Type `q` + Enter while running; stops after the current generation finishes and saves the current front |
| Live logging | Each generation prints `feasible ratio`, `n_eval`, `best_f` |

---

## IO Design Decisions

### Output file format

| File | Content |
|------|------|
| `*_sim.csv` | Simulation time series |
| `*_opt.csv` | Pareto front (x columns + f columns); overwritten live after each generation |
| `*_{mode}.log` | Run log |

Filenames include a timestamp (`YYYY-MM-DD_HH-MM-SS`, second precision) so repeated runs don't overwrite each other and remain traceable.
All output is written to `output/` (its contents are `.gitignore`d, but the directory itself is tracked in git).

**Revision (2026-06-01):** the original design included `*_opt.yaml` (a full model copy plus results).
On evaluation this overlapped with the "GUI save results to model" feature and introduced ambiguity over "which YAML is authoritative," so it was removed.
The publishing path is now: GUI imports `_opt.csv` → "save results to model" → writes back to the original YAML.

### Results are never written back to the model automatically

The CLI does not modify the original model YAML. Publishing is an explicit user action, not automatic CLI behavior:
- During debugging a model may be run many times, and overwriting each time would pollute the model definition
- The user is the one who judges when a result is worth publishing
- Publishing path: GUI "import CSV" → "save results to model" → git

### The model file remains a single file (not split)

Splitting `optimizer.results` out into a sidecar file was discussed but ultimately dropped in favor of keeping a single-file design.
Rationale: the target users (clinical researchers) share models via email/supplementary materials, where a single file avoids ambiguity.

---

## Early-Stop Mechanism Implementation

`optimizer_engine._ProgressCb` gained:
- `self.latest_front`: saves the current Pareto front after each generation
- when `progress_callback` returns `True`, a `_StopOptimization` is raised
- `_run_nsga2` catches the exception and builds the result from `latest_front`, setting `result["stopped"] = True`

Keyboard input is read via stdin (`q` + Enter), which works across the VSCode integrated terminal, Git Bash, and all platforms.
The `msvcrt.kbhit()` approach was dropped because it gets intercepted by VSCode.

---

## Relationship to ADR 0072

The core constraints of ADR 0072 remain unchanged:
- The GUI is still the sole formal user interface
- The CLI is not advertised to ordinary users and does not promise feature parity
- The "formal" path for automated batch scenarios is still the HTTP API

The CLI added by this ADR is positioned as a **developer/power-user tool**, which can be compiled into a standalone exe and distributed to collaborating researchers who need batch capabilities. It is not covered in the GUI documentation, and its iteration is not driven by feature requests.

**Revision 2026-06-13 (ADR 0101):** the CLI was further upgraded into a publicly released interface aimed at AI/automation scenarios,
shipping `lm-sim.exe` alongside code releases, with its purpose documented in the README/`cli.md`.
The "not covered in the GUI documentation" constraint is unchanged — GUI documentation still targets human users only, and CLI documentation continues to live independently in `cli.md`.

---

---

## 2026-06-06 Revision

### 1. Timestamp format change

The original format `YYYYMMDD_HHMM` (minute precision) was changed to `YYYY-MM-DD_HH-MM-SS` (second precision).
Reason: multiple runs within the same minute would overwrite each other's output files; second precision eliminates the collision and is also more readable.

Scope of impact: `sim_cli/output.py::make_stem()`; the filename examples in `cli.md` were updated accordingly.

### 2. Simplified the `--continue` interface

Removed the original "form two" (`--continue TIMESTAMP`, e.g. `--continue 20260606_1122`).
Retained:
- `--continue` (no argument): warm-start from the `optimizer.results` in the model YAML
- `--continue PATH`: warm-start from a specified `_opt.csv` file (relative to the project root or absolute)

Reason: the timestamp form relied on an implicit convention about filename format, whereas the path form is unambiguous and also works with batch subdirectory layouts.

### 3. `script/test_batch.sh` — a batch test script

Added `script/test_batch.sh` as an orchestration layer on top of the CLI:

- Walks all YAML files in a given folder (default `models/references`)
- Runs `--sim` and `--opt` in turn for each model
- Each run creates an `output/YYYY-MM-DD_HH-MM-SS/` subdirectory holding all the CSVs, logs, and a `batch_report.md`
- Concurrent instances don't conflict (subdirectories are distinguished by the script's own start timestamp)
- Parameters are controlled via environment variables: `MODEL_FOLDER`, `RUN_OPT`

Managing subdirectories is the script's own responsibility; the CLI itself always writes to the `output/` root and is unaware of any batch logic.

**Publicity:** `batch_test.sh` is published with the code (no sensitive content, useful to collaborators maintaining the model library); it is not part of the S1 paper (a pure engineering tool, not a scientific contribution).

**Revision 2026-06-13: migrated to `sim_cli/batch.py` (see below).**

---

## 2026-06-13 Revision: `script/test_batch.sh` → `sim_cli/batch.py`

After ADR 0101 upgraded the CLI into a public interface for AI/release scenarios, `test_batch.sh` exposed two problems:

1. **Bash dependency:** the released `lm-sim.exe` couldn't use the batch feature on a plain Windows environment (no Git Bash), at odds with its "public interface" positioning.
2. **Subprocess + stdout parsing:** the script captured output via `python sim_cli/main.py ... 2>&1` and used `grep` to extract CSV filenames/error messages — fragile, and coupled to `main.py`'s print format.

**Decision:** delete `script/test_batch.sh` and add `sim_cli/batch.py`:

- Pure Python, in the same directory as `main.py`, no bash dependency; usable in the same PyInstaller-compiled `lm-sim` environment
- Calls `runner.run_sim / run_opt` directly via `import`, in-process, without going through a subprocess or parsing stdout
- Each model's run is wrapped in `try/except`, so one model crashing doesn't abort the whole batch (the old bash version got this isolation for free from subprocess; the Python version needs it handled explicitly)
- Error summaries are captured via a temporarily mounted `logging.Handler` at the ERROR level, rather than by grepping text
- Parameters, the batch directory structure (`<output-dir>/<timestamp>/<model-name>/`), and the `batch_report.md` format are kept consistent with the original bash version

The `main.py` rule of "one subdirectory per model plus `--output-dir`" (introduced alongside this same ADR 0101 implementation) applies to both; `batch.py` simply passes the same batch directory as `output_dir` for every model's call.

### `--all-plans` removed: `--sim` always outputs all plans

`--all-plans` was a recently introduced optional switch that made little sense alongside `--sim`: the `run_sim`/`run_sim_all_plans` code paths were nearly duplicates, and "whether to iterate over plans" shouldn't be an extra parameter an AI caller needs to remember.

**Decision:** merge into a single `run_sim` — if the model defines `simulation.plans`, it runs once per plan and outputs `<stem>__<plan_id>.csv`; if not defined (an implicit single plan), it outputs `<stem>.csv` (compatible with the previous naming). Both `main.py` and `batch.py` drop the `--all-plans` parameter.

---

## Related

- `docs/cli.md` — usage documentation
- `sim_cli/` — implementation directory (`main.py` for a single model, `batch.py` for batch runs)
- ADR 0072 — the GUI-only decision (partially revised)
- ADR 0101 — CLI upgraded to a public release interface; the `--output-dir` plus per-model-subdirectory rule; `batch.py` replaces `test_batch.sh`
- `sim_engine/src/optimizer_engine.py` — the `_StopOptimization` + `latest_front` changes
