# 0093 — The Sim/Opt Runtime Log Panel: Content Tiers and Implementation

**Date:** 2026-06-05
**Status:** Implemented
**Category:** UI / Engine Interface

---

## Background

After a simulation or optimization run finishes, users need to know "what just happened" — which imports the model loaded, which variables it output, whether there were numerical anomalies — but there was nowhere this information was summarized. The Opt tab already had a basic log panel (recording only per-generation progress); the Sim tab had no logging at all.

---

## Decision

### What gets logged (two tiers)

**Always logged** (present on every run):

| Content | Example |
|------|------|
| Model name + variable/formula counts | `Model: ckd_protein_a4 (31 vars, 12 formulas)` |
| List of resolved imports | `Imports: references/medical/physiology/glucose_regulation_2026_mw` |
| Simulation configuration (start date, step size, total steps) | `Sim: start=2026-01-01, step=1 day, 365 steps` |
| List of output variables (up to 8, with a "+N more" marker beyond that) | `Outputs (5): GFR, muscle_mass, lm_score, ...` |
| Regimen variables (from user GUI input) | `Regimens: dietary_protein` |
| MC configuration (shown only when MC is active) | `MC: 30 runs, seed 42` |
| Elapsed time + total steps (on completion) | `Done in 2.3s — 365 steps` |
| Schedule hit counts (on completion, shown only when input variables exist) | `Schedule hits: dietary_protein=1095` |

**Logged as warranted** (appears as needed, without flooding the panel):

| Content | Example | Limit |
|------|------|------|
| NaN / Inf detection | `⚠ NaN/Inf in 'GFR' at step 45` | Once per variable, on first occurrence |
| Bounds violation | `⚠ Bounds: 'blood_glucose'=310.5 ∉ [0, 300] at step 12` | Once per variable, on first occurrence |
| Variables in `output_variables` that don't exist (an existing mechanism, surfaced as an output warning) | — | — |

### What is not logged (excluded by decision)

- **Every variable's value at every step:** this is simulation output data, not a log; it's already covered by CSV export.
- **Python internal call stacks / INFO-level engine messages:** these appear only in debug mode; the log panel is aimed at modelers, not developers.

### Opt log additions

On top of the existing per-generation progress log, a matching model-info and configuration summary is appended at the start of an optimization run:

```
Starting optimizer...
Model: ckd_protein_a4 (31 vars, 12 formulas)
Imports: references/medical/physiology/glucose_regulation_2026_mw
Objectives (2): ↑GFR(final), ↑muscle_mass(final)
Decision vars (3 dims): dietary_protein
Algorithm: nsga2, pop=50, gen=80
Gen 1  best=-47.1  eval=50
...
```

---

## Implementation

### Backend (`session_manager.py` / `optimizer_engine.py`)

- **Session log:** `session['logs']` stores a list of `{t: unix_timestamp, msg: str}`, initialized by `start_session()` and appended to by `batch_steps()`.
- **NaN/Inf / bounds checks:** after each batch call, the batch's output is checked; the `session['warned_vars']` set ensures each variable is warned about only once.
- **Schedule hits:** counted only when `completed=True` (scans `session['data']`, counting non-zero values for input variables).
- **Opt log:** `run_optimizer()` gained an optional `log_cb` parameter; `routes/optimizer.py` passes in `lambda msg: add_log(job, msg)`.

### Frontend

- **Sim tab:** `simLogs` state lives in `Simulator.tsx`; `useSimulation` updates it from the `logs` field in the `/api/simulation/start` and `/api/simulation/batch` responses; `SimPlotTab` renders a collapsible log panel at the bottom (with copy/download buttons, auto-scrolling to the latest entry).
- **Opt tab:** already had a log panel, no UI change; only the backend content written to it was expanded.
- **Log transport:** carried in the `logs` field of the existing API response bodies (`start` / `batch`); no new polling endpoint was added.

---

## Alternatives

| Alternative | Reason rejected |
|------|---------|
| Add a `GET /api/simulation/session/{id}/logs` endpoint | Requires extra polling and adds frontend complexity; logs are small, so piggybacking them on the batch response costs essentially nothing |
| Log every step | Log volume grows linearly with step count, and the panel becomes sluggish after a few thousand steps; most per-step information has no value to modelers |
| Log only in the CLI, leave the GUI unchanged | GUI modelers need the same ability to quickly spot NaN/out-of-bounds issues, rather than having to check the server terminal |
