# 0083 · 2026-05-22 · Sim · Independent configuration for the optimizer's evaluation time window

## Background

The optimizer runs one simulation internally for every fitness evaluation. Previously, the evaluation time window and step size were hardwired to the YAML's `simulation.start_date`/`end_date` and `metadata.step_size`, which caused two problems:

1. **GUI time controls had no effect**: the Opt tab toolbar's date and step-size controls were bound to the `simStartDate`/`simEndDate`/`stepValue`/`stepUnit` state, but when `startOptimization()` built the `optimizer_override`, **it did not include these fields**, so the engine always read the YAML's static values and GUI changes had no effect.

2. **Results were not reproducible**: `optimizer.results` recorded the Pareto front, but the YAML did not declare which time window and step size had been used, so the result couldn't be independently reproduced after publication.

## Decision

### D1: three new optional fields on the `optimizer` block

```yaml
optimizer:
  start_date: "YYYY-MM-DD"   # the evaluation window's start; defaults to simulation.start_date
  end_date:   "YYYY-MM-DD"   # the evaluation window's end; defaults to simulation.end_date
  step_size:                  # the evaluation step size; defaults to metadata.step_size
    value: 1
    unit: day
```

The engine's read priority is: the `opt_block` over the `simulation` block / `metadata.step_size`.

### D2: `optimizer_override` always includes the current time settings

`startOptimization()` includes the following when building `optimizerOverride`:

```js
start_date: simStartDate,
end_date:   simEndDate,
step_size:  { value: stepValue, unit: stepUnit },
```

This way the GUI toolbar's live value takes effect, at a higher priority than the YAML's static value.

### D3: extending the engine's override merge

The override-merge loop in `optimizer_engine.py` gained three new keys, `'start_date'`, `'end_date'`, and `'step_size'`, so that D2's values are correctly passed through.

## What stays unchanged

- The GUI's Sim tab and Opt tab share the same set of time state (`simStartDate` / `simEndDate` / `stepValue` / `stepUnit`) — they are not split apart. In a simple scenario the two tabs stay consistent; when a different time window is genuinely needed, the YAML statically declares the evaluation window while the GUI control overrides the visualization window.
- Writing `optimizer.results` does **not** automatically write the current GUI time settings back into the YAML — the modeler manually confirms the time settings before download and writes them into `optimizer.start_date`/`end_date`.

## Impact

- `sim_engine/src/optimizer_engine.py`: override merging plus reading the time parameters
- `sim_gui/src/components/Simulator.tsx`: `startOptimization()` now passes in the time settings
- `docs/model.md`: new fields in the optimizer schema
- The internal LM format spec draft: the optimizer block schema kept in sync
- `docs/opt.md`: a new section on the evaluation time window
- Case model YAML files: `ckd_protein_pareto_a4_p3`, `hypertension_gout_3obj_a5_p3`, `smoking_stress_a6_p3` gained `start_date`/`end_date`
