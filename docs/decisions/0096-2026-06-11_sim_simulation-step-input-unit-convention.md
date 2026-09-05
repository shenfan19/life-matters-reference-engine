# ADR 0096 — The Input-Unit Convention for `Simulation.step()`: Seconds

**Date:** 2026-06-11
**Status:** Accepted
**Context:** sim_engine — `model_structure/simulation.py`, `simulator_engine.py`, `optimizer_engine.py`, `session_manager.py`

---

## Context

`Simulation.step(step_size)` in `model_structure/simulation.py` needs two differently-unitized versions of the step size internally:

- **Seconds:** used for accumulating `self.time`, for `_apply_schedules` (pulse-mode window checks), and for `_update_accumulators`.
- **The model's declared unit (`time_unit`, e.g. day/hour/month):** used for the `step`/`step_size`/`dt`/`t`/`time` symbols in formulas (formula authors write "1 day = 1," not "86400 seconds = 1").

`step()` accepts only a single `step_size` argument, so one of the two units must be chosen as the "input convention," with the other derived internally. This convention had never previously been written down explicitly anywhere, which led to two consecutive, opposite-direction bugs between 2026-06-10 and 2026-06-11:

1. **Before commit a9e2f07 ("fix step bug," 2026-06-10):** `step()` treated its input as the "declared unit," computing `step_size_sec = step_size * unit_sec` (multiply) internally. But the `--sim` path (`simulator_engine.py`) passed in `model.simulator['step_size']` — a value that, per `loader.py`, is always in **seconds** (`step_sec = raw_step * unit_sec`). So `--sim` was passing "seconds" in as if it were the "declared unit," and `step()` multiplied by `unit_sec` again internally, inflating the per-step time advance by a factor of `unit_sec` (e.g. 86,400× for a day-scale model) — the simulation would hit its cap after a single step (the "hits the cap" bug).

2. **After a9e2f07, before this session:** to fix the above, a9e2f07 reversed `step()`'s input convention to "seconds," computing `declared_step = step_size_sec / unit_sec` (divide) internally. This was correct for `--sim` (which already passed seconds). But `optimizer_engine.py::_run_sim` and `session_manager.py` (the `start_session`/`batch_steps` functions for the GUI's interactive session) were written for the **old convention** at the time: each of them first computed `native_step = step_size_sec / unit_sec` (divide) before passing it to `step()`. Under the old convention, "the caller divides once, then `step()` multiplies once internally" canceled out and was self-consistent; once a9e2f07 changed `step()`'s internal operation from multiply to divide, this became "the caller divides once, then `step()` divides again internally" — a double division, driving `declared_step ≈ 0`. Every time-advancing quantity in formulas that depends on `step`/`dt` (e.g. `days_elapsed`) froze, and the simulation result stayed near its initial value (the `--opt` path) / the simulation "advanced" but state barely changed (the GUI session path).

a9e2f07 touched only `simulation.py` and `loader.py`, without updating the two call sites in `optimizer_engine.py::_run_sim` and `session_manager.py` that still followed the old convention — that mismatch was the direct cause of the regression. This session (2026-06-11) fixed both of those call sites as well.

---

## Decision

**Establish and document a unified convention: the `step_size` argument to `Simulation.step(step_size)` is always in "seconds."**

- Inside `step()`: `step_size_sec = step_size`; `declared_step = step_size_sec / unit_sec` is what formulas use via `step`/`step_size`/`dt`/`t`/`time`.
- Anywhere `model.step(...)` is called, the value passed in must be `model.simulator['step_size']` (or the equivalent seconds value computed by `loader.py` as `metadata.step_size.value * TIME_UNIT_SECONDS[unit]`) — it must **not** be pre-divided by `unit_sec` before being passed in.

Call sites already conforming to this convention:

| Call site | File | Status |
|---|---|---|
| CLI `--sim` main loop | `simulator_engine.py:151` | Was already correct (passes `step_size` directly); remained correct after a9e2f07 |
| CLI `--opt` fitness function `_run_sim` | `optimizer_engine.py:85` | Fixed this session: removed `native_step = step_size_sec/unit_sec`, now passes `step_size_sec` directly |
| GUI session `batch_steps` (both single-run and MC multi-run paths) | `session_manager.py` | Fixed this session: removed the two instances of `_native_step = step_size/_unit_sec`, now passes `step_size` directly |
| CLI `run_with_csv_inputs` | `simulator_engine.py:308` | `dt = curr_time - prev_time`, and the CSV time column itself is already in seconds by convention, so no problem found |

---

## Consequences

- Any new call site for `model.step(...)` must pass a seconds value directly (typically `model.simulator['step_size']`, or a `step_size_sec` computed from the same source within a session/fitness function), with no `/unit_sec` or `*unit_sec` pre-conversion.
- `optimizer_engine.py` no longer needs to import `TIME_UNIT_SECONDS`; `session_manager.py` had the same import removed.
- Affected historical models have been re-run through `--opt` regression checks (results for ad0228/ad1910/ad1847/ad1945 match the recorded documentation; ad1941 was the first model sensitive enough to this bug to expose it — see the corresponding `*_opt.md` in its output directory). After the GUI session-path fix, ad1941 was also smoke-tested with a 10-step `batch_steps` run, and `days_elapsed`/`health`/`nutritional_status` evolved day by day as expected.
