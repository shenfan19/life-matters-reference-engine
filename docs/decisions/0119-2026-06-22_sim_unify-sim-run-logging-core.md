# ADR 0119 — Sim run-logging core merge: CLI/GUI share content generation, IO output stays separate

**Date**: 2026-06-22
**Status**: Accepted
**Scope**: sim_engine (new `run_logging.py`; `simulator_engine.py`, `session_manager.py` updated to call it), sim_cli (`runner.py`)

---

## Background

ADR 0118 prompted a broader follow-up question: has the CLI's and GUI's log/error-message channel as a whole already converged? The audit found:

- **Error messages**: already converged — both sides pass through the same `result['error']` (the same `str(e)`) returned by the engine layer, via different channels (CLI writes to a log file plus stdout, GUI converts it to `HTTPException`/`message.error()`) but with identical content; no change needed.
- **Opt process text logs** ("Model: ...", "Objectives (...): ...", "Algorithm: ..."): `run_optimizer()` already had a `log_cb` parameter to push this content out, and the GUI route (`routes/optimizer.py`) consumed it, but `sim_cli/runner.py::run_opt()` did not pass `log_cb` when calling `run_optimizer()`, so the CLI could not see any of this information — this was "a channel already designed, just not wired up on the CLI side," which had already been patched in a prior change by adding `log_cb=logger.info`.
- **Sim process text logs** (variable/formula counts, the output variable list, NaN/out-of-range warnings, completion time, schedule hit counts): the audit found a deeper problem than the opt case — **this content only ever existed in `session_manager.py` (GUI-only code)**, and `simulator_engine.py::run_simulation()`/`run_simulation_mc()` (the CLI path) had no equivalent mechanism at all. This was not "the channel isn't wired up" but "the content-generation logic itself was never shared." The user explicitly asked for the same code to generate the content, with only the IO output differing — not the CLI and GUI each independently writing their own copy.

## Decision

**Add `sim_engine/src/run_logging.py`, separating "what content to generate" from "where the content is written":**

- Content-generation functions only accept data (`model`/`output_variables`/`outputs`, etc.) and a `log_cb: Callable[[str], None]` output parameter, with no awareness of whether the caller is the CLI or the GUI:
  - `build_initial_logs(...)` — run header: model size, imports, start/end/step/total step count, output variable list, output validation warnings, schedule variable names, MC seed
  - `check_value_warnings(...)` — NaN/Inf and out-of-range warnings (each variable reported at most once)
  - `log_completion(...)` — completion time plus schedule hit counts (hit counts are precomputed by the caller and passed in, since the CLI and GUI store data differently: the GUI retains a full dict row history throughout, while the CLI processes in chunks and does not retain full history; two helper functions, `input_variable_hits()`/`accumulate_hits()`, adapt to each respectively)
- **IO output is implemented separately for each side**:
  - GUI (`session_manager.py`): `log_cb=lambda msg: session['logs'].append(_make_log(msg))` (`_make_log` wraps the message in `{t, msg}` for the log panel, kept as-is)
  - CLI (`simulator_engine.py`): a new `log_cb: Optional[Callable[[str], None]] = None` parameter, threaded through `run_simulation()` → `run_simulation_mc()` → `run_simulation_all_plans()`, with `sim_cli/runner.py` passing in `logger.info`; when not passed (other callers/tests), behavior is unchanged and this information is not produced
- This is fully consistent with the `log_cb` pattern `run_optimizer()` already had — this change just brings the sim path into the same shape, not inventing a new mechanism.

## Outcome

```
sim_engine/src/run_logging.py          new: build_initial_logs / check_value_warnings /
                                        log_completion / input_variable_names /
                                        input_variable_hits / accumulate_hits / fmt_step
sim_engine/src/session_manager.py      _fmt_step/_check_value_warnings/_log_completion turned into
                                        thin wrappers delegating to run_logging.py; removed the now-unused
                                        math import
sim_engine/src/simulator_engine.py     run_simulation()/run_simulation_mc()/
                                        run_simulation_all_plans() gained a log_cb parameter, calling
                                        run_logging.py to generate the same content
sim_cli/runner.py                      run_sim() now passes log_cb=logger.info when calling
                                        run_simulation_all_plans(); run_opt() passes log_cb=logger.info
                                        (the opt half of this was already patched during ADR 0118)
```

Verification: all 8 tests in `pytest tests/` passed; running the CLI on a real model (banister, 4 plans), the log file shows `Model:`/`Sim:`/`Outputs:`/`Regimens:`/`Done in ...`/`Schedule hits:` for every plan, matching line-for-line the `logs` list obtained by directly calling the GUI path (`start_session`/`batch_steps`) — only the output form differs (log file vs. an in-memory list of `{t, msg}`).

## Follow-up cleanup

During the audit it was confirmed that `simulator_engine.py`'s `pause_every`/`interactive`/`pause_callback`/`_interactive_pause()` (a local synchronous interactive-pause mechanism, never enabled by `sim_cli/main.py`) was dead code with no callers; the chunk loop that existed only to support it (`chunk_size`/`self.running`) was consequently simplified into a single `advance_steps` call. This wasn't the problem this "log-channel merge" set out to solve, but it was cleaned up in passing during the same audit; it does not affect the items listed below as out of scope.

## Out of scope for this change

- The CLI currently never passes `log_cb` by default (`sim_cli/main.py` exposes no `--verbose`-style switch) — `run_sim()`/`run_opt()` internally always pass `logger.info`, so this information already reaches the log file, it just isn't printed to stdout in real time. Whether to add a CLI switch controlling simultaneous stdout display is left for when there is a need, and is not part of the "convergence" this ADR addresses.
- No change to the error-message channel (ADR 0118 already confirmed it has converged; no change needed).
- No change to the opt generation-by-generation progress bar mechanism (`progress_callback`, already shared by both sides — see ADR 0113).

## Related

- ADR 0118 — upfront date/time field validation (another category of problem found during the same audit: the error-message channel)
- ADR 0113 — Sim execution-core merge (the shared `advance_steps` is the precondition allowing this change to directly reuse the same `outputs` row shape)
- ADR 0111 — Sim/CLI consistency regression test suite (the existing means of verifying both paths behave consistently)
