# ADR 0116 — Internal naming unification: `regimen_runner.py` → `schedule_runner.py` (amends 0115)

**Date**: 2026-06-21
**Status**: Accepted
**Scope**: sim_engine (`schedule_runner.py` and its callers), sim_gui (`useSimulation.ts`/`useModelInit.ts`), sim_cli/build.spec, docs

---

## Background

ADR 0115 removed the entire legacy `daily_inputs`/`Simulation._apply_schedules()`/`manual_overrides` mechanism. Before that, the codebase had long used the word `regimen` to name the "plan-based input execution core" (`regimen_runner.py`, `apply_regimens()`, `_build_regimen_events`), while the YAML spec used `schedule` to name the same data (`simulation.plans[*].schedules`). This terminology split was **not arbitrary**: prior to ADR 0115, the `Simulation` class had a genuinely distinct method, `_apply_schedules()` (handling the legacy `daily_inputs`); renaming `apply_regimens` to `apply_schedules` at that time would have collided with it directly, conflating two execution paths with different semantics.

Once ADR 0115 removed `_apply_schedules()`, that collision risk disappeared — `apply_regimens` (now `apply_schedules`) is the repository's only input execution path, with no second same-named/near-named function competing for it. The user then asked to carry out the "pure internal naming" unification per the previously evaluated plan.

## Decision

**Unify internal implementation naming to `schedule`, without changing the API contract field names shared across frontend and backend:**

| Change target | regimen → schedule |
|---------|---------------------|
| `sim_engine/src/regimen_runner.py` | renamed to `schedule_runner.py` |
| `apply_regimens()` | → `apply_schedules()` |
| `precompute_sustained_divisors`/`advance_steps`'s `regimens` parameter | → `schedules` |
| `_n_active_days`/internal loop variable `reg` | → `sched` |
| `optimizer_engine.py`'s `_build_regimen_events` closure | → `_build_schedule_events` |
| `optimizer_eval.py`'s `regimen_events_by_var`/`regimens_list` | → `schedule_events_by_var`/`schedules_list` |
| `simulator_engine.py`'s `schedule_regimens` (already a half-converted mixed name) local variable | → `schedules` |
| Frontend `buildRegimenPayload`/`varRegimens` | → `buildSchedulePayload`/`varSchedules` |
| `sim_cli/build.spec`'s hiddenimport | `'regimen_runner'` → `'schedule_runner'` |

**Not changed (API contract / cross-frontend-backend field names, kept as-is):**

- HTTP request field `SimulationStartRequest.regimens`, `start_session(regimens=...)`, `session['regimens']`
- Pydantic classes `RegimenData`/`RegimenEventData` (corresponding to the `regimens` field above)
- Response fields `result['regimen_variable']`/`result['regimen_event_labels']` (keys read by the frontend's `useModelInit.ts`/`SimOptTab.tsx`)
- YAML `optimizer.results.reference.regimen` (the persisted field written to and read back from model files)
- The "GUI Regimen" phrasing used in the documentation (a concept-level term, left for separate later evaluation — see below)

Rationale: these are contract names crossing the frontend-backend/process boundary; renaming them would require synchronizing both ends or dealing with YAML backward compatibility, which is unrelated to the goal of "eliminating two terminologies inside the engine" and is out of scope here.

## Outcome

```
sim_engine/src/regimen_runner.py → schedule_runner.py   apply_regimens → apply_schedules,
                                                          regimens parameter/local variables → schedules
sim_engine/src/optimizer_engine.py    _build_regimen_events → _build_schedule_events
sim_engine/src/optimizer_eval.py      regimen_events_by_var/regimens_list → schedule_events_by_var/schedules_list
sim_engine/src/simulator_engine.py    imports updated; schedule_regimens local variable → schedules
sim_engine/src/session_manager.py     imports updated
sim_engine/src/model_structure/{loader,core}.py   comments updated (apply_regimens → apply_schedules)
sim_cli/build.spec                    hiddenimports: regimen_runner → schedule_runner
sim_gui/src/components/sim_tab/useSimulation.ts        buildRegimenPayload → buildSchedulePayload
sim_gui/src/components/Simulator/useModelInit.ts       varRegimens → varSchedules
sim_gui/.../optUtils.test.ts, simUtils.ts              comments updated
docs/cli.md, docs/opt.md, docs/coding_conventions.md   function name references updated
docs/sim_design.md   the "GUI Working State Layer" section rewritten to match the post-ADR-0115 state
                      (manual_overrides/_apply_schedules no longer exist; there is no longer a
                      "who overrides whom" precedence question)
```

Verification: all 8 tests in `pytest tests/` passed; `sim_gui`'s `tsc --noEmit` reported zero errors; `vitest run` passed in full.

## Out of scope for this change

- Whether the concept-level naming of the API fields `regimens`/`RegimenData`/`regimen_variable`/`regimen_event_labels` and the YAML `reference.regimen` should also be unified to `schedule` — this touches the frontend-backend contract and the YAML persistence field, and whether to do it is left for separate evaluation, not bundled into this "pure internal naming" change.

## Related

- ADR 0115 — the direct precondition for this rename (it removed the colliding `_apply_schedules`)
- ADR 0109/0110 — the origin of the term `schedule` in the YAML spec
- ADR 0117 — confirms that the API/YAML contract layer listed as "out of scope" in this ADR remains unchanged (`regimens`/`RegimenData` stay as-is); it also renames `optimizer.results.reference.regimen` to `recommended` and removes the decoding dictionary — line 44 of this document is now superseded; see ADR 0117 for the current state
