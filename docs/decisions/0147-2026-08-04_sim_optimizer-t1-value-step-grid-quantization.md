# 0147 — Adding value_step Grid-Quantization Decoding to the Optimizer's T1 Decision Variable

**Date**: 2026-08-04
**Status**: ✅ accepted

---

## Background

The optimizer's T1 decision variable `optimize.value: [lo, hi]` previously only supported an arbitrary decimal solution within a continuous interval, which was unfriendly to scenarios that need a value taken at clinical/engineering-readable precision (such as a feed volume in 5 mL increments, or a metabolic equivalent in 0.1 MET-h increments) — the search algorithm's solution might come out as something unactionable like `12.347`. T2's time window already had a precedent for this — "a continuous internal representation, discretized to a grid at decode time" — via `time_step`, but T1 lacked the equivalent field.

## Decision

`optimizer_parsing.py` gained `_snap_to_step(raw, lo, hi, step)`: it rounds a continuous real number to the nearest multiple of `step` anchored at `lo`, clamps the result back into `[lo, hi]`, and finally runs one `round()` pass at `step`'s decimal precision to clear binary floating-point noise. Anchoring at `lo` rather than `0` keeps the grid aligned with the search interval even when `lo` itself isn't an integer multiple of `step` (e.g. `[0.9, 1.0]`).

`optimize.value` gained an optional `value_step` field: once declared, the decoding stage uses `_snap_to_step` to convert the internal continuous value into the executed value; when not declared, behavior is unchanged, still a continuous solution.

**An accompanying fix**: the `pareto_front`/`best_x` recorded by the algorithm backend had always held the raw pre-snap continuous value, inconsistent with the post-snap value `evaluate()` actually used to run the simulation — meaning the x shown in the results table didn't match the x that was actually simulated. The fix re-snaps every component with a `value_step` in `pareto_front`/`best_x` once more after the result is produced, guaranteeing the recorded value matches the simulated value.

## Scope of impact

- `reference_engine/src/optimizer_parsing.py`: added `_snap_to_step`.
- `reference_engine/src/optimizer_engine.py`: T1 decoding now uses `value_step`; `pareto_front`/`best_x` are re-snapped after the result is produced.
- `docs/opt.md`: the T1 row's description gained `value_step`, with a note drawing the analogy to T2's `time_step`.
- `gui/src/components/opt_tab/OptSetupTab.tsx`, `gui/src/types.ts`, `gui/src/components/sim_tab/optUtils.ts`: the GUI form gained a `value_step` input and its parsing.
- The four locale files gained multilingual text for the corresponding field.

## Result

- T1's decision variable can optionally be discretized to a readable precision, the same design pattern as T2's `time_step`, adding no extra cognitive burden for the user.
- The x vector in the recorded results now stays consistent with the x vector actually used in the simulation, eliminating the previous risk of "the number in the table doesn't match the number that was actually run."
