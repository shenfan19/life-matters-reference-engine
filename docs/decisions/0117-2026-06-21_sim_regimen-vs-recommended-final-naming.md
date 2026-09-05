# ADR 0117 — API/YAML concept-layer naming stays `regimen`; `optimizer.results.reference` → `recommended`, decoding dictionary removed

**Date**: 2026-06-21
**Status**: Accepted
**Scope**: sim_engine (routes/simulation.py, session_manager.py, optimizer_engine.py, model_structure/loader.py),
sim_gui (useSimulation/useModelInit/usePlans/useOptimizer/SimOptTab/optUtils/simUtils),
models/ (132 files containing `plans[*].regimens` or `optimizer.startpoint.regimens` + 64 files containing
`optimizer.results`), life-matters-models/docs/model.md, sim_code's docs/sim_design.md, docs/opt.md

---

## Background

ADR 0116 unified "pure internal implementation naming" to `schedule` (`regimen_runner.py`→`schedule_runner.py`, etc.), explicitly keeping the API contract layer (the `regimens` request field, the `RegimenData` class, the `regimen_variable`/`regimen_event_labels` response fields) and the YAML `simulation.plans[*].schedules`/`optimizer.startpoint.schedules`/`optimizer.results.reference.regimen` unchanged, on the grounds that "these are contract names crossing the frontend-backend boundary; this change only touches internal naming."

The user then pointed out that the project **has not yet been released**, so the rationale of "avoiding rename cost" does not hold. Both the API contract layer and the two core YAML fields above were consequently, on an interim basis, also renamed to `schedule`/`schedules` (to match the internal naming from ADR 0116). Two problems surfaced after making that change:

1. **`regimen` is actually this formalism's proper name in the paper/spec**: `life-matters-models/docs/LM_format_1.0.md` §7 defines "K×4 Regimen" as the LM format's standard input formalism, and it is already used extensively in the paper draft and in outreach emails. Renaming the API/YAML to `schedule` was in fact drifting away from a term already used externally, not "unifying" anything — what the internal implementation is called affects no one, but a contract name crossing the boundary should align with the already-published concept term.
2. **`optimizer.results.reference.regimen`/`objectives` were stale artifacts**: examining `useOptimizer.ts::buildResults()` (the current, sole implementation of "save results to model") found that it only writes `{x, f}` and has never generated the decoded `regimen`/`objectives` dictionaries; the frontend's "load Sim from opt result" feature also only reads `x` (decoding it on the fly via `xToInputEvents`), never reading these two dictionaries. These two dictionaries in the 64 model files were written by an earlier version of the save logic and are now completely unmaintained and unconsumed — the same category of problem as the `daily_inputs` removed in ADR 0115.

Separately, the name `reference` itself is ambiguous: `variables.<name>.reference`/`formulas.<name>.reference` are literature-citation fields (DOI/PMID), while `optimizer.results.reference` is "the modeler-annotated recommended Pareto point" — the same YAML file uses "reference" for two entirely unrelated concepts, which is easily misread by academic readers as a literature citation.

## Decision

### 1. Revert the API contract layer and core YAML fields to the state from ADR 0116 (`regimen`/`regimens`)

| Field/identifier | Final state |
|------|---------|
| HTTP request field | `SimulationStartRequest.regimens`, `start_session(regimens=...)`, `session['regimens']` |
| Pydantic classes | `RegimenData`/`RegimenEventData` |
| Optimization result response field | `result['regimen_variable']`/`result['regimen_event_labels']` |
| YAML | `simulation.plans[*].regimens` (132 files), `optimizer.startpoint.regimens` |
| `optimizer_engine.py` internal closure | `_build_regimen_events` (kept in sync with the contract field — crosses ADR 0116's "pure internal" boundary; see below) |

`sim_engine/src/schedule_runner.py` (the pure internal execution core created by ADR 0116: `apply_schedules()`, `precompute_sustained_divisors`, etc.) is **not reverted** back to `regimen_runner.py` — this part was never exposed at the API/YAML boundary, so it keeps ADR 0116's outcome. `_build_regimen_events` is the exception: it maps directly to the contract layer's `regimen_variable`/`regimen_event_labels` output, so it is renamed back along with the contract layer, which does not count as breaking ADR 0116's "internal naming" boundary.

Net effect: this went in a circle (renamed to `schedule` first, then back to `regimen`), and the API/YAML concept layer ends up exactly where it was right after ADR 0116 was written — this exploration did not change the contract-layer naming, but it did rule out the option of "aligning with the K×4 Regimen paper terminology" that had been on the table, and recording the decision here prevents the same proposal from being raised again later.

### 2. `optimizer.results.reference` → `recommended`, decoding dictionary removed

```yaml
# Before
reference:
  x: [...]
  f: [...]
  regimen: {...}      # stale artifact: never read by any code, no longer produced by the save logic
  objectives: {...}   # stale artifact: same as above

# After
recommended:
  x: [...]
  f: [...]
```

- `reference` → `recommended`, to avoid colliding with `variables.<name>.reference`/`formulas.<name>.reference` (literature citations).
- Remove the `regimen`/`objectives` decoding dictionaries: both the human-readable display and the "send to Sim" feature decode `x`/`f` on the fly via `xToInputEvents`; there is no need to persist a copy in advance that would only go stale.

This step is independent of item 1 and **not reversible** (unlike item 1's "going in a circle"): the old dictionaries have been physically deleted from the 64 model files.

## Out of scope for this change

- The naming of the "K×4 Regimen" formalism itself in `LM_format_1.0.md` §7, and the use of "Regimen" as a concept brand word in `sim_impl.md`/`sim_requirements.md`/`ui_guidelines.md` — one premise of this decision (that "it should align with the paper terminology") depends on this word staying as-is, but whether the brand word itself needs adjustment is not this decision's subject.
- The YAML example for `optimizer.results.reference.regimen` in `LM_format_1.0.md` §6/§7 (including the conceptual description of "exportable as iCal") — this is now inconsistent with the implementation (the field has been renamed to `recommended`, the decoding dictionary has been removed, and iCal export was never implemented), but because the example is embedded in the formal definition of K×4 Regimen, it is left for the same reason as above, to be followed up later.
- The more general question the user raised about `regimen`/`schedule` singular/plural naming conventions ("changing `plan.regimen` to `regimens.regimen`, more consistent with `formulas.formula`") — the discussion pivoted to the `reference` issue midway and has not reached a final conclusion.

## Outcome

```
sim_engine/src/routes/simulation.py         RegimenData/RegimenEventData/regimens field
sim_engine/src/session_manager.py           start_session(regimens=...)/session['regimens']
sim_engine/src/optimizer_engine.py          result['regimen_variable']/['regimen_event_labels'];
                                             _build_regimen_events; optimizer.startpoint.regimens parsing
sim_engine/src/model_structure/loader.py    plan.get('regimens', [])
sim_engine/src/optimizer_eval.py            doc comments synced to _build_regimen_events
sim_cli/output.py                           comments synced to optimizer.startpoint.regimens
sim_gui/.../useSimulation.ts                buildRegimenPayload; payload field regimens
sim_gui/.../useModelInit.ts                 optBlock.startpoint.regimens; regimen_event_labels
sim_gui/.../usePlans.ts, useOptimizer.ts    buildOptRegimens; startpoint: { regimens }
sim_gui/.../optUtils.ts, optUtils.test.ts   buildOptRegimens; test fixture path startpoint.regimens
sim_gui/.../simUtils.ts                     regimenOptEntries; optimizerConfig.startpoint.regimens
sim_gui/.../SimOptTab.tsx                   optResult.regimen_event_labels
models/**/*.yaml (132 files)                 plans[*].schedules / optimizer.startpoint.schedules
                                             → regimens (both fields renamed)
models/**/*.yaml (64 files)                  optimizer.results.reference → recommended;
                                             regimen/objectives decoding dictionaries removed
life-matters-models/docs/model.md                    entire document synced to the regimens field name + recommended field description
docs/sim_design.md, docs/opt.md,
docs/coding_conventions.md                  field path references synced
tests/test_sim_cli_consistency.py           start_session(regimens=...) kwarg
```

Verification: `pytest tests/` 8/8 passed; all 161 model YAML files pass `yaml.safe_load`; `sim_gui`'s `tsc --noEmit` reported zero errors, `vitest run` 4/4 passed.

## Related

- ADR 0115 — removed `daily_inputs`/`_apply_schedules`/`manual_overrides` (the same category of "still in the spec but with zero consumers" cleanup)
- ADR 0116 — unified internal naming to `schedule`; this ADR confirms that the API/YAML contract layer it listed as "out of scope" remains unchanged
