# ADR 0090 — Remove the `second` Step-Size Unit

**Date:** 2026-05-31
**Status:** Accepted
**Scope:** engine, frontend, docs, models

---

## Background

The framework supported four step-size units: `second | minute | hour | day`. On evaluation, `second` had no scientific value in LM's usage contexts:

**Simulation dimension:** LM targets chronic-disease management and lifestyle interventions, on time horizons from months to years. Biological parameter uncertainty is typically ±10–50%, so second-level precision is false precision — Euler truncation error is far smaller than parameter error, and the extra granularity buys nothing scientifically. Scenarios that genuinely need second-level resolution (cardiac electrophysiology, neural dynamics) fall outside LM's intended scope.

**Optimization dimension:** the full optimization pipeline (NSGA-II + MC + multi-objective Pareto) is computationally infeasible at second-level step sizes. For a one-year simulation, second-level vs. day-level step size differs by a factor of 86,400; combined with MC (30 runs) and pop=50, gen=80, a single optimization run involves 120,000 full simulations, which is simply not runnable at second-level granularity. More fundamentally, the finest resolution of the decision variables themselves (dosing times, exercise schedules) is minutes — a second-level search space contributes nothing to the optimization outcome.

**Code dimension:** keeping backward-compatibility code for `second` is technical debt waiting to happen — it has zero usage across existing YAML models, so removing it costs less than maintaining it, and it can be reintroduced later if an extreme use case ever demands it.

---

## Decision

**Permanently remove `second` as a valid `step_size.unit` option, with no backward-compatibility path retained.**

The finest step-size unit is now `minute`.

---

## Scope of Impact

### Documentation
- `docs/model.md`: legal values for `step_size.unit` changed from `second | minute | hour | day` to `minute | hour | day`; removed the "predefined unit constants (valid when step_size.unit: second)" section (the `SECOND=1` constant)
- `docs/ui_guidelines.md`: removed "seconds" from the step-size-unit description
- `docs/opt.md`: removed `second` from the `_unit_to_sec` dictionary; default changed to `minute`

### Engine (`sim_engine/`)
- `base.py`: removed `'second': 1.0` from `TIME_UNIT_SECONDS`
- `core.py`: default `time_unit` changed from `'second'` to `'minute'`; removed `SECOND` from the asteval symtable
- `loader.py`: `time_unit` default and fallback both changed to `'minute'`
- `simulation.py`: removed `SECOND` from `_STEP_SYMS` and `step_sym_vals`; default fallback changed to `'minute'`
- `validator.py`: removed `SECOND`/`second` from the set of time units, the legal values for `dt_unit`, and the exclude set
- `optimizer_engine.py`: removed `second` from `_unit_to_sec`; default changed to `minute`
- `session_manager.py`: two `time_unit` fallbacks changed to `minute`

### Frontend (`sim_gui/`)
- `types.ts`: removed `'second'` from the `StepUnit` type
- `Simulator.tsx`: removed `second` from `STEP_UNITS`, `toStepUnit`, `UNIT_SEC`
- `useSimulation.ts`: removed `second` from `STEP_UNITS`
- `SimControlBar.tsx`, `OptControlBar.tsx`: removed the second option from the step-size Select
- i18n (en / zh-CN / zh-TW): removed the `sim.step.second` key

### Models
- `models/test/test_step_second.yaml`: deleted (the only YAML testing second-level step size, no longer worth keeping)

---

## Follow-up Convention

- Legal `step_size.unit` values: `minute | hour | day`
- If a YAML specifies `unit: second`, the engine loader will warn and fall back to `minute` (not silently ignore it)
- The `MINUTE`, `HOUR`, `DAY` constants remain in the asteval symtable (holding absolute-second values, for internal computation), but are not recommended to modelers for use in formulas (modelers should use `step`)
