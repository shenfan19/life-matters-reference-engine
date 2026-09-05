# ADR 0110 — A Single Source of Truth for Plan/Schedule Parsing: the Backend's `self.plans`, the Frontend No Longer Re-Parses YAML

**Date**: 2026-06-17
**Status**: accepted
**Scope**: sim_engine · sim_gui

---

## Background

`docs/cli.md` publicly promises that "the CLI and the GUI share the same engine layer, with a consistent, interchangeable result format."
But the `simulation.plans[*].schedules` section of YAML was actually parsed independently by two unrelated pieces of code:

| Path | Parsing code |
|------|---------|
| The CLI (and the GUI backend's `start_session`/`apply_regimens` execution core) | `ModelStructure._parse_schedule_entries()` (`sim_engine/src/model_structure/loader.py`), storing the result into `self.plans[plan_id]` |
| The GUI frontend's plan initialization | when `Simulator.tsx` loads a model, it re-implements the days mask, the `date_range` -> `valid_start`/`valid_end` compatibility, and the time-interval default semantics directly against `selectedModel.content.simulation.plans` |

The two implementations shared no code. Even when a user made no edits at all in the GUI and simply ran a YAML as-is, nothing mechanically guaranteed that "the GUI's default result" matched "the CLI's result" — the two currently agreed numerically only because the two independent implementations' details happened to be written the same way, and any later change on either side could silently make them diverge.

## Decision

**Keep only one implementation for the semantic parsing of Plan/Schedule: Python's `_parse_schedule_entries()`. The frontend no longer parses the days/date_range/pulse-vs-sustained semantics itself, doing only a logic-free field mapping from "the backend's result" to "the UI's editing state."**

1. **The backend**: the response of `GET /api/models/{model_name}` gains a `plans` field, returning `ModelStructure.plans` as-is (`sim_engine/src/routes/models.py`). This dict is already in the regimen-dict format that `apply_regimens` expects (the CLI already uses it), so it can be JSON-serialized directly.

2. **The frontend**: when `Simulator.tsx` initializes the plan list, it still takes `id`/`label` from the raw YAML's `simulation.plans` array (pure display metadata that the backend's parsed result doesn't carry), but each plan's event data now comes from `selectedModel.content.plans[planId]` (the regimen list already parsed by the backend), mapped one regimen-event to one `InputEvent`, with no more self-derived `date_range` fallback, days-length, or time-interval-default semantics.

```
YAML simulation.plans[*].schedules
        │
        ▼
ModelStructure._parse_schedule_entries()   ← the single semantic-parsing point (shared by the CLI and the GUI backend)
        │
        ├──→ self.plans[plan_id]  ──→ CLI: schedule_entries → apply_regimens()
        │
        └──→ the `plans` field of GET /api/models/{name}
                    │
                    ▼
        the frontend's Simulator.tsx: 1 regimen-event → 1 InputEvent (a logic-free mapping)
                    │
                    ▼
        a user edit → buildRegimenPayload() → POST /api/simulation/start
                    │
                    ▼
              start_session() → the shared apply_regimens()
```

## Out of scope for this round

- `simulation.schedules` (the top-level flat format) / `daily_inputs`'s frontend construction of default input events
  (around lines 607-658 of `Simulator.tsx`): this part serves "the default-input display when there are no plans," which is unrelated to `_parse_schedule_entries` and is not part of the duplication being eliminated here.
- Parsing the optimizer path (`optimizer.startpoint.schedules`): this already uses the regimen-dict format (ADR 0088) and is unaffected.

## Result

```
sim_engine/src/routes/models.py
  data gains "plans": model.plans

sim_gui/src/components/Simulator.tsx
  the yamlPlans handling block now looks up selectedModel.content.plans[plan.id ?? `plan_${i}`],
  no longer deriving the days/date_range/time-interval semantics itself
```

## Related

- ADR 0076 — introducing the `simulation.plans` format
- ADR 0100 — the pulse/sustained `[time_start, time_end)` interval convention
- ADR 0109 — enforcing where schedules live
- the "consistent result format" promise in `docs/cli.md`'s "Relationship with the GUI" section
