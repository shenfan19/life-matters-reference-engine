# 0130 — Fixing the Opt Inner-Loop MC Silently Zeroed by reset_simulation Plus Decoupling the GUI Control from Sim's MC

**Date**: 2026-07-10
**Status**: ✅ accepted
**Revises**: part of ADR 0045's decision 2 (the GUI's `simRuns`/`mcSeed` state "no longer reads from optimizer.mc")

---

## Background

While reviewing a test added earlier this session (`test_opt_inner_mc_unedited_gui_override_matches_
cli_cold_start`), the user asked a follow-up question: "I designed MC and seed inputs on the frontend, for both sim and opt — did the opt one not work?" Chasing that question down turned up two independent problems, both far more serious than the test itself.

## Finding 1: the GUI's Opt MC control does exist, but was never actually wired to `optimizer.mc`

`OptControlBar.tsx` does have MC×N / Seed input boxes, but the `simRuns`/`mcSeed` state they're bound to is **shared with** the Sim tab
(`Simulator/index.tsx` has both `onSimRunsChange`/`onMcSeedChange` writing to
`setEdited('simRuns', ...)`/`setEdited('mcSeed', ...)`). This shared state is initialized only from
`simulation.mc.runs`/`simulation.mc.seed` when a model loads (`useModelInit.ts`), and never reads
`optimizer.mc`; while `useOptimizer.ts` does receive these two values as parameters, its function body never actually uses them, and they never make it into `optimizer_override`; the backend `run_optimizer()`'s override-merge allowlist doesn't include the
`'mc'` key either. The compounded result of these three layers: a user adjusting MC×N/Seed on the Opt tab has **absolutely no effect** on the optimization run.

Looking back at ADR 0045's decision 2, this turns out **not to be entirely accidental** — that ADR's "Result" section explicitly records "simRuns / mcSeed
read from YAML simulation.mc.runs / simulation.mc.seed (no longer read from optimizer.mc)," meaning the original design from 2026-06-04 was that "the GUI provides no interactive configuration entry for optimizer.mc; this value can only be written in YAML." But the design at the time never clearly explained "so why does the Opt tab's toolbar still show an MC input box that looks like it controls opt" — sitting in the Opt tab, this control reasonably misled users into believing "this controls the optimization process," when its actual semantics were something else entirely. On review, the user confirmed this was not the intended design: the Opt tab's MC×N/Seed should genuinely control
`optimizer.mc`, decoupled from the Sim tab.

## Finding 2: even once wired up, `optimizer.mc.runs>1` itself had never actually taken effect (more serious)

While tracing the value's path, a further discovery: `optimizer_eval.py::_run_sim()` unconditionally calls
`model.reset_simulation()` at the start of every evaluation, and `reset_simulation()` resets every variable to
`variable_history[var_name][0]` — i.e. the value snapshotted at the moment `clone_model()` cloned it, **before sampling**.
`optimizer_engine.py::evaluate()`'s call order is:

```
m = _clone(base_model)              # variable_history[0] is snapshotted here, still the pre-sampling mean
apply_parameter_sampling(m, ...)    # only updates m.variables[x].value and m.asteval.symtable[x]
hist = _run_sim(m, ...)             # its first line, model.reset_simulation(), reverts to the snapshot — the sampling is swallowed
```

In other words: **for any model declaring `optimizer.mc.runs > 1`, every "sample multiple times and average" pass during the optimization search was actually re-evaluating the same deterministic mean value over and over**; `mc.runs`/`mc.seed` never actually affected the optimization result at all, only wasting `mc.runs`-fold the computation time for nothing. Verified directly by experiment: running the same model's optimization with `mc.seed=19` and with
`mc.seed=999` produced bit-identical `best_f` — the expected difference only appeared after the fix.

**Scope of impact** (precisely verified — a script parsing `optimizer.mc.runs` file by file, not an estimate): 19 `*_opt_*.yaml` files under
`models/papers/` declare `optimizer.mc.runs: 5, seed: 19`:
`ckd_protein` (4: joint/joint_largepop/muscle/renal), `fatty_liver` (3: exercise/
hepatology/joint), `bergman_glucose` (3: hba1c/insulin/joint), `ibs_diet` (3:
joint/microbiome/symptom), `masld_insulin` (3: homair/joint/liverfat),
`burnout_allostatic` (3: cvdrisk/joint/workoutput). The optimization results previously published/recorded for these models were, in fact, all computed under conditions where "inner-loop robust optimization" was
in name only, degenerating to a single deterministic evaluation — not the "averaging over parameter uncertainty" result the model authors' declared
`mc.runs: 5` actually intended. This is a category-C (model scientific content) follow-up investigation task; see `life-matters-home/tasks/2026-07-10_issue_opt-inner-mc-never-worked-rerun-needed.md`.

## Decision

### Decision 1: fix `mc_utils.py::apply_parameter_sampling()`

After sampling, write back `model.variable_history[var_name][0] = val` in sync, so this "initial-value snapshot" stays consistent with the value that was just sampled — this way, any subsequent `reset_simulation()` call keeps this MC run's sampled value as the "initial value," rather than reverting to the pre-sampling mean. The fix was made in `apply_parameter_sampling()` rather than by removing the
`reset_simulation()` call in `_run_sim()` — the latter is a defensive design (guaranteeing a clean state before every evaluation); fixing `apply_parameter_sampling()` is the smaller-scoped fix closer to the root cause: the sampled value should have been treated as this clone's "initial state" all along, which is also the more semantically accurate framing.

### Decision 2: decouple the Opt tab's MC×N/Seed from the Sim tab, binding it to the real `optimizer.mc`

Added independent state, `optMcRuns`/`optMcSeed` (`SimulationState`/`ModelSession`), initialized from
`optimizer.mc.runs`/`optimizer.mc.seed` when a model loads (matching the existing "read from the YAML algorithm block" pattern already used by `optSeed`/`optPop`/`optGen`, rather than the "shared single state" pattern used by
`simRuns`/`mcSeed`); `useOptimizer.ts` uses these two values to build `optimizer_override.mc`; the backend's override-merge allowlist gained the
`'mc'` key. **This reverts the part of ADR 0045's decision 2 that said "no longer read from optimizer.mc"** — the design choice at the time may have intended to "avoid maintaining two sets of MC state," but the cost was an Opt tab control that didn't do what it claimed, and once compounded with decision 1's bug,
`optimizer.mc` in effect had no configuration entry point whatsoever (even hand-editing the YAML couldn't be observed to have any effect). Now the two tabs' MC configurations are each independent and each actually take effect, with no interference between them.

## Result

- `reference_engine/src/mc_utils.py`: `apply_parameter_sampling()` now writes back
  `variable_history[var_name][0]` in sync
- `gui/src/types.ts`: `SimulationState`/`ModelSession` gained `optMcRuns`/`optMcSeed`
- `gui/src/App.tsx`: defaults `optMcRuns: 1, optMcSeed: null`
- `gui/src/components/Simulator/useModelInit.ts`: reads from
  `optimizer.mc` when a model loads (including session restore)
- `gui/src/components/Simulator/usePersistedUI.ts`: included in `ModelSession` persistence
- `gui/src/components/Simulator/index.tsx`: `OptControlBar`/`useOptimizer` now wired to
  `optMcRuns`/`optMcSeed`, no longer passing the shared `simRuns`/`mcSeed`
- `gui/src/components/opt_tab/useOptimizer.ts`: added `optimizerOverride.mc`
- `gui/src/components/opt_tab/OptControlBar.tsx`: its Tooltip now uses `sim.opt.mc_tooltip`/
  `sim.opt.mc_seed_tooltip` (new i18n keys, four languages), no longer reusing the Sim tab's wording
- `reference_engine/src/optimizer_engine.py`: the override-merge allowlist gained `'mc'`
- `tests/test_sim_cli_consistency.py`: added
  `test_opt_inner_mc_override_actually_takes_effect` — asserts `best_f` must change under a different `mc.seed` override; this previously falsely "passed" due to decision 1's bug (the two results happened to be bit-identical)

## Open items / follow-up

- The 19 paper models affected by decision 1's bug need `--opt` re-run to verify whether the results change and whether the paper's numbers need updating
  — a category-C scientific-content judgment call, decided by a human; see the corresponding task file.
- ADR 0045 was not rewritten wholesale; only this ADR records the reversal of its decision 2. ADR 0045's original text is kept as a historical record.
