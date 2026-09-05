# ADR 0118 — Upfront date/time field validation, eliminating the silent fallback shared by CLI/GUI

**Date**: 2026-06-22
**Status**: Accepted
**Scope**: sim_engine (`simulator_engine.py`, `session_manager.py`, `optimizer_engine.py`, new `validation.py`), sim_cli (`runner.py`)

---

## Background

An audit of the current error-detection mechanism found that `schedule_runner.py`, `optimizer_engine.py`, and `sim_cli/runner.py` each treat date/time string parse failures as "normal" in multiple places — `except ValueError: pass`, `except Exception: return <default>` — so a malformed `start_date`/`end_date`/`time_start`/`valid_start` field does not raise an error; instead it silently falls back to a default value (epoch 1900-01-01, the `total_time` fallback, a full day of 86400 seconds) and execution continues. Neither the CLI nor the GUI surfaces this, and tests do not catch it either: mistype a YAML field, and the simulation "appears to run fine" while actually running on something other than the user's intended input.

Representative locations:

- `schedule_runner.py`'s `_time_range_day_seconds`/`_n_active_days`/`apply_schedules` have five separate occurrences of `date.fromisoformat(...)` wrapped in either `except ValueError: pass` or `except Exception: return 86400.0`.
- When `optimizer_engine.py::run_optimizer()` computes the total duration corresponding to `sim_start_date`/`end_date`, the whole block is wrapped in `except Exception` — a **missing** date (legitimate, since `total_time` is a valid alternative configuration) and a **malformed** date (a user input error) are swallowed by the same code, both resulting in a silent fallback to `total_time`. This is the highest-risk finding of the audit: the optimizer would run to completion on a time window entirely different from the configured intent, with no error or warning of any kind.
- `sim_cli/runner.py::_time_hours()` is the CLI's own duplicated legacy logic for computing total duration, exhibiting the same error-swallowing pattern.

## Decision

**Add `sim_engine/src/validation.py`, called once each by the CLI and the GUI "right before execution actually begins," reusing the existing `{"success": False, "error": str(e)}` error channel (already shared by all three of the CLI's log/stdout, the API's `HTTPException.detail`, and the frontend's `message.error()` — see `routes/simulation.py` converting `result['error']` into an `HTTPException`, and `useSimulation.ts` displaying it via `message.error(e.message)`. No new error channel is introduced here; the swallowed errors are simply surfaced through this existing channel.**

`validation.py` provides three functions:

| Function | What it validates | Strictness |
|---|---|---|
| `validate_simulator_dates` | `simulator.start_date`/`end_date` (including `optimizer.start_date`/`end_date`) | Lenient: tolerates a `year == 0` "epoch date" placeholder (explicitly supported by the total-duration approximation logic in loader.py/optimizer_engine.py), while still checking month/day validity (validating `02-29` against leap years) and confirming `end_date` is not before `start_date` |
| `validate_schedule_list` | schedule/event-level `valid_start`/`valid_end`/`time_start`/`time_end` (the same shape used by the CLI's `schedule_entries` and the GUI's `regimens` parameter) | Strict: matches the `date.fromisoformat()` requirement actually used by the consumer, `schedule_runner.py` |
| `validate_optimizer_regimens` | `optimizer.startpoint.regimens` fixed values and the `optimize:` search window (`time_start`/`time_end`/`date_range`) | Strict, same as above |

Call sites (all before entering the step-wise hot loop, validating once upfront; a validation failure is converted into the standard failure dict):

- `simulator_engine.py::run_simulation()` / `run_simulation_mc()` (CLI simulation path)
- `session_manager.py::start_session()` (GUI simulation path)
- `optimizer_engine.py::run_optimizer()` (the CLI/GUI-shared optimizer entry point, ADR 0113)
- `sim_cli/runner.py::_time_hours()` (the CLI's own independent total-duration estimate; its error-swallowing pattern got its own dedicated patch)

The `try/except` inside the hot loop (`schedule_runner.py`) is **left as-is** and not removed — in theory it should no longer trigger once upfront validation passes, and it remains as a defensive fallback.

## Outcome

```
sim_engine/src/validation.py              new: 3 validation functions
sim_engine/src/simulator_engine.py        validation added at the start of run_simulation()/run_simulation_mc()
sim_engine/src/session_manager.py         validation added at the start of start_session()
sim_engine/src/optimizer_engine.py        two validations added to run_optimizer() (regimens definition + time-window dates)
sim_cli/runner.py                         _time_hours() now validates and raises; run_sim() catches it and follows the existing failure path
```

Verification: all 8 tests in `pytest tests/` passed; running a real model (banister) through the CLI sim/opt path showed no regression; deliberately corrupting a model's `start_date` or a regimen's `time_start`, both the CLI and a direct call to `start_session()` now surface the same clear error before execution, rather than "appearing to finish."

## Out of scope for this change

- The `try/except` fallbacks that remain inside `schedule_runner.py`/`optimizer_engine.py` themselves — kept as defensive code, not the target of this validation pass, and there is no plan to remove them.
- Deeper validation of "format-legal but semantically unreasonable" cases (e.g. a schedule's `valid_range` not overlapping the simulation's overall time window at all, or `optimize.date_range` search window width being 0) — beyond the scope of "format validation," left for evaluation as needed.
- The existing `/api/validate` endpoint (static YAML structural validation) — this is runtime parameter validation, a different goal, and the two are not merged.
- GUI frontend display logic — the existing `message.error()` channel already passes the `error` field through; no new component is needed.

## Related

- ADR 0100 — pulse/sustained time-interval unification (the origin of the `time_start`/`time_end` field semantics)
- ADR 0113 — Sim execution-core merge: CLI/GUI share `advance_steps`/`run_optimizer`, and this validation is added at their shared upstream entry point, avoiding the need to write it twice
- ADR 0111 — Sim/CLI consistency regression test suite: validation guarantees both paths raise the same error under the same bad input, rather than each silently arriving at a different erroneous result
