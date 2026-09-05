# ADR 0115 — Removing `daily_inputs` / `_apply_schedules` / `manual_overrides` (Cleaning Up Leftover Code Now That Plans Are Mandatory)

**Date**: 2026-06-21
**Status**: accepted
**Scope**: sim_engine (`model_structure/` · `mc_utils.py` · `session_manager.py` · `optimizer_eval.py` · `regimen_runner.py`), model.md (the `daily_inputs` section)

---

## Background

ADR 0109 already made `simulation.plans[*].schedules` the sole legal location for a simulation's input plan. But the code still carried an older input mechanism, independent of plans:

- The `daily_inputs` YAML field (specifying input values per day) -> parsed by the loader into `self.schedules: Dict[str, InputSchedule]` (`base.py`'s `InputSchedule`/`SchedulePoint`).
- `Simulation._apply_schedules()`: consumed `self.schedules` inside `model.step()` every step, writing variable values via pulse/step/linear interpolation.
- `manual_overrides`: introduced by ADR 0074, with the sole purpose of letting `_apply_schedules()` skip a variable already taken over by a GUI regimen (otherwise `daily_inputs`'s value would overwrite the GUI-edited value every step).

Current-state check:

1. **No YAML file anywhere under `models/` uses `daily_inputs`.**
2. After the plans mandate (ADR 0109), `daily_inputs` and `simulation.plans[*].schedules` were two parallel, semantically overlapping ways of declaring input — the former being an earlier, simpler version that supports neither multiple plans, nor GUI editing, nor the optimizer.
3. `manual_overrides`'s only read site was `_apply_schedules()` (`simulation.py:71/74`); `apply_regimens()` (`regimen_runner.py`, handling plan-based schedules) never read it. Once `_apply_schedules()` is deleted, `manual_overrides` has no reader left anywhere in the repository, and the entire ADR 0074 "GUI Working State Layer" mechanism loses its reason to exist.

## Decision

**Remove the whole thing, with no compatibility layer kept:**

| What's removed | Location |
|---------|------|
| The `SchedulePoint` / `InputSchedule` dataclasses | `model_structure/base.py` |
| The `self.schedules` initialization plus `daily_inputs` parsing | `model_structure/core.py` / `loader.py` |
| `Simulation._apply_schedules()` and its call inside `step()` | `model_structure/simulation.py` |
| The `self.manual_overrides` initialization, its cloning in `clone_model()`, and its writes in `optimizer_eval.py`/`session_manager.py` | `core.py` / `mc_utils.py` / `optimizer_eval.py` / `session_manager.py` |
| The YAML `daily_inputs` section (the `accumulators` section is kept, the two were never coupled) | `life-matters-models/docs/model.md` |

`apply_regimens()`/`regimen_runner.py` (the plan-based schedule execution core) is unaffected — it is the sole currently supported input-execution path.

## Out of scope for this round

- `accumulators` is left unchanged: it integrates from an arbitrary `source` variable, doesn't depend on `daily_inputs`, and is an independent feature.
- No rename of `apply_regimens`/`regimen_runner.py` (a regimen-to-schedule naming unification was previously evaluated and shelved because it would have collided with the then-still-existing `_apply_schedules`; recorded internally — that collision risk is now gone after this deletion, but a rename is still out of scope here).
- Historical ADRs (0053, 0074, 0100, 0110, etc.) that mention `daily_inputs`/`_apply_schedules`/`manual_overrides` are not retroactively edited — an ADR is a point-in-time record, not something rewritten after the fact.

## Result

```
sim_engine/src/model_structure/base.py        removed SchedulePoint / InputSchedule
sim_engine/src/model_structure/core.py        removed the self.schedules / self.manual_overrides initialization
sim_engine/src/model_structure/loader.py      removed the daily_inputs parsing block plus the related import
sim_engine/src/model_structure/simulation.py  removed the _apply_schedules() method plus its call inside step()
sim_engine/src/mc_utils.py                    clone_model() no longer clones schedules or inherits manual_overrides
sim_engine/src/optimizer_eval.py              removed the manual_overrides write (had no consumer left)
sim_engine/src/session_manager.py             removed the manual_overrides write plus the related comment
sim_engine/src/regimen_runner.py              removed a stale comment referencing the now-gone _apply_schedules
life-matters-models/docs/model.md                      removed the daily_inputs section, accumulators now its own standalone section
```

Verification: all 8 tests in `pytest tests/` pass; a full import of the `sim_engine` module works normally.

## Related

- ADR 0074 — the direct precondition for this removal (the manual_overrides mechanism it introduced now has no consumer)
- ADR 0109 — the plans mandate, the root reason daily_inputs became a redundant path
- ADR 0110 — a single source of truth for Plan/Schedule parsing
