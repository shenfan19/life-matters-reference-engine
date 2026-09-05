# ADR 0112 — A Fidelity Fix for Opt Startpoint Parsing (a Hardcoded Seed Plus a Dropped T4 date_range)

**Date**: 2026-06-19
**Status**: accepted
**Scope**: sim_gui (`Simulator.tsx` / `optUtils.ts`), sim_engine (test-suite extension)

---

## Background

[ADR 0110](0110-2026-06-17_sim_unify-plan-schedule-parsing.md) resolved the dual-parsing problem for plan/schedule on the sim side. When checking whether the opt (optimizer) side had the same problem, the situation turned out to be worse:

Every time the GUI clicks "Run optimization," the `startpoint.schedules`, `objectives`, `constraints`, and `algorithm` re-parsed and reassembled by the frontend in `useOptimizer.ts::startOptimization()` are bundled wholesale into `optimizer_override` and sent to the backend's `run_optimizer()` unconditionally; the backend's merge logic is "whenever a key exists in the override, replace the YAML's own value for that whole section" (`optimizer_engine.py` lines 164-168). The CLI's `--opt`, by contrast, overrides only `warm_start`, reading everything else straight from the YAML. In other words, **when the GUI runs an optimization, the YAML's `optimizer:` block itself was never directly used by the backend, even when the user hadn't edited a single field** — what actually runs is always the version the frontend reassembled.

`buildOptInputEventsFromYAML` (parsing YAML into a frontend-editable state) and the T1-T4 decision-variable parsing inside `optimizer_engine.py` (`run_optimizer()` lines 195-309) are two independent implementations (Python plus TypeScript) of the same YAML semantics; the complexity of T1-T4 (four independent syntaxes — a numeric range, a time window, a weekday pool, a date range) far exceeds the sim side's schedules, so converting all of it to ADR 0110's "single backend parse" pattern is a large undertaking. This round instead does a **fidelity test** first: run a real model through "YAML -> frontend parse -> editing state -> frontend re-serialization" and check whether the original YAML is reproduced exactly when nothing is edited.

### Two real bugs found

Tested against four fixtures — `models/test/test_opt_t1_single.yaml` (T1), `test_opt_t2.yaml` (T2), `test_opt_t3.yaml` (T3), and `test_opt_t4.yaml` (T4):

1. **`algorithm.seed` was hardcoded to `42`** (in `useOptimizer.ts`'s original code), never reading the YAML's own `optimizer.algorithm.seed`. NSGA-II is sensitive to the seed, meaning that even when the YAML specifies a different seed, the GUI's result would never match the CLI's (the CLI reads the seed straight from the YAML).
2. **T4 (`optimize.date_range`) had its entire search dimension silently dropped**: when `buildOptInputEventsFromYAML` computed `validRangeEnabled` (deciding whether to write the date range back into the reconstructed JSON), it looked only at the fixed `s.date_range`/`valid_start`/`valid_end` fields, not at `s.optimize.date_range` (T4's own search-range field). When a model's date-search range is written only in `optimize.date_range` (with no separate fixed date_range — the normal way to write it, since no one would write both a fixed range and a search range at once), `validRangeEnabled` computed to `false`, and the block in `buildOptSchedules` that writes `optimize.date_range` was skipped entirely. **This T4 decision dimension disappears on the GUI side, and the optimizer actually searches a space one dimension smaller than the YAML defines, with no error or warning of any kind.**

T1 (a numeric range) and T3 (a weekday pool) round-tripped exactly (differing only in field order, not values — not a bug). T2 (a time window) round-tripped with one extra written-in default value, `time_start/time_end: "08:00"` — verified to be harmless: the frontend's default (`normalizeTimeInterval`) and the backend's default (`optimizer_engine.py::_build_regimen_events`'s `e0.get('time_start', '08:00')`) happen to be the same `"08:00"`, so the decoded result is identical; but this is a fragile agreement — "both sides happen to hardcode the same default" — not a guaranteed one, and it is left unchanged this round, noted here for future attention.

## Decision

**Fix the two real bugs above, and turn the "fidelity test" into a repeatable automated test rather than a one-off manual check.**

### 1. The seed is no longer hardcoded

`useOptimizer.ts`'s `optimizerOverride.algorithm.seed` now reads `optSeed` (sourced from the YAML's `algorithm.seed`, read in at load time; defaulting to `42` when the YAML doesn't specify one, consistent with `optimizer_engine.py`'s own fallback). Accompanying this: `types.ts`'s `ModelSession` gains an `optSeed` field, and `Simulator.tsx` keeps this value in sync at both YAML load and session restore.

### 2. T4's `validRangeEnabled` also checks `optimize.date_range`

```ts
const hasT4Range = Array.isArray(s.optimize?.date_range) && s.optimize.date_range.length === 2;
...
validRangeEnabled: !!(validStart || validEnd) || hasT4Range, validStart, validEnd,
```

An edge case discovered along the way but **not fixed this round**: when the `days` field selects all 7 days (`[Mon,...,Sun]`), `hasDays` evaluates to `false`, causing the fixed `days` field to be dropped entirely — currently harmless (`apply_regimens` treats "no `days` field" and "`days` = all 7 days" as semantically identical, both meaning "active every day"), filed as a future incidental fix rather than mixed into this round's real bugs.

### 3. Turning the "fidelity test" into an automated regression test

`buildOptInputEventsFromYAML` was originally a local closure function inside `Simulator.tsx`, unimportable by a standalone test file. It was moved to `optUtils.ts` (where `buildOptSchedules` already lives, a natural place for it) and made a named export; `parseDaysMask`/`DAY_STR_MAP` were moved along with it (removing three duplicate definitions inside `Simulator.tsx`).

sim_gui previously had no JS unit-test framework at all; `vitest` (Vite-native, zero-config) was added as a devDependency, and `sim_gui/src/components/sim_tab/optUtils.test.ts` was added: it round-trips "YAML schedules -> buildOptInputEventsFromYAML -> buildOptSchedules" for the four T1-T4 fixtures, comparing against the original YAML with `toEqual` (a structural comparison, unaffected by field order). The two known-harmless differences (T2's `time_start`/`time_end` default, and `days` = all 7 days being equivalent to no `days` field) are explicitly normalized before comparison, to avoid a false failure on a harmless difference — but genuine fields such as `optimize.date_range` are not normalized, ensuring T4's real bug is still caught.

Before the fix, this test failed on the T4 case (`optimize.date_range` disappeared entirely); after the fix, it passes.

## Out of scope for this round

- Converting the full T1-T4 decision-variable parsing to a single backend parse (fully aligning with the ADR 0110 pattern): T4's specific bug has already been fixed at a much lower cost (a one-line condition plus an automated test), so the payoff of a full rewrite is no longer urgent, and it's kept as an option for if a new divergence is found in the future.
- The edge case where `days` = all 7 days gets dropped: see above, known to be harmless, recorded but not fixed.

## Result

```
sim_gui/src/components/sim_tab/optUtils.ts        added parseDaysMask, buildOptInputEventsFromYAML (with the T4 fix)
sim_gui/src/components/sim_tab/optUtils.test.ts   added, the fidelity regression test (4 T1-T4 fixtures)
sim_gui/src/components/Simulator.tsx              removed the duplicate definitions, now imports from optUtils
sim_gui/src/components/opt_tab/useOptimizer.ts    algorithm.seed now reads optSeed (no longer hardcoded to 42)
sim_gui/src/types.ts                               ModelSession gains optSeed
sim_gui/package.json                               added the vitest devDependency plus a test script
tests/test_sim_cli_consistency.py                  added an opt consistency test case (see ADR 0113)
```

## Related

- ADR 0072 — a test imports the engine-layer functions directly, not going through the CLI's parsing layer
- ADR 0100 — the pulse/sustained time-interval unification (the basis for T2's `_width_min` decoding)
- ADR 0110 — a single source of truth for Plan/Schedule parsing (the same category of problem on the sim side; this is the corresponding fix on the opt side)
- ADR 0111 — the Sim/CLI consistency regression test suite (its conclusion that "opt showed no divergence" is corrected in this ADR — at the time it only confirmed "both sides call the same function," without checking further whether the arguments passed in were actually equivalent)
- ADR 0113 — merging the Sim execution core plus adding MC capability to the CLI (another part of the same round of investigation)
