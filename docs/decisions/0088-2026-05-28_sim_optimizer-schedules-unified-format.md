# ADR 0088 — Unified format for optimizer.schedules (updated by ADR 0109 to optimizer.startpoint.schedules)

**Date**: 2026-05-28
**Status**: accepted
**Scope**: sim_engine · sim_gui · models/

---

> **Status update (2026-06-17)**: the `optimizer.schedules` path in this ADR has been superseded by **ADR 0109**, migrated to `optimizer.startpoint.schedules`. The `startpoint` wrapper makes the semantics clearer: it expresses that the optimization searches starting from this initial protocol description.

## Background

The YAML representation of optimizer decision variables went through three stages:

1. **regimen** (oldest): a single-variable dict, `events[].dose_bounds`.
2. **optimizer.inputs** (an intermediate stage): a multi-variable list, where an entry with an `optimize:` block is a decision variable and one without is a fixed quantity; but a fixed background quantity was stored separately under `optimizer.schedules`, splitting the same variable's configuration across two sections.
3. T2/T3/T4 were enabled inconsistently: T2 relied on a top-level `time_window:` plus `optimize.time: true`; T3 relied on a top-level `days_options:` plus `optimize.days: true`; T4 relied on a top-level `date_start_window:` plus `optimize.date_start: true` — field names were split between the top level and the `optimize:` sub-block.

This produced three concrete problems:

- **One GUI card != one YAML entry**: a decision variable went into `inputs`, a fixed background quantity went into `schedules`, splitting the same model variable's configuration across two locations.
- **Unclear tier semantics**: is `time: true` an activation flag or a time value? A reader can't directly see T2's search interval; `opt_step` sits at the top level while `time: true` sits inside `optimize:`, a confusing split of field ownership.
- **The backend had to maintain two parallel parsing paths**, with no way to detect a format inconsistency.

---

## Decision

**Deprecate `optimizer.inputs` and all the old-style tier fields, switching to a single unified `optimizer.schedules` list.**

### Core rule

| Condition | Meaning |
|---|---|
| An entry has no `optimize:` block | a fixed background quantity (not searched) |
| An entry has an `optimize:` block | a decision variable |
| `optimize.value: [lo, hi]` | T1 activated |
| `optimize.time: ["HH:MM", "HH:MM"]` | T2 activated |
| `optimize.time_step: "1h"\|"15min"` | the T2 step size (defaults to 1h) |
| `optimize.days_pool: [...]` + `optimize.days_n: [min, max]` | T3 activated |
| `optimize.date_range: [[lo,hi],[lo,hi]]` | T4 activated (both groups required) |

### The mutual-exclusion principle

If a field appears inside `optimize:`, the corresponding top-level field is **not written**:

- T2 activated -> don't write the top-level `time:`
- T3 activated -> don't write the top-level `days:`
- T4 activated -> don't write the top-level `date_range:`

A fixed-value field only ever lives at the top level; a search interval only ever lives inside `optimize:`; the two never overlap.

### The T3 encoding change

The old format required the modeler to enumerate every candidate pattern (`days_options`); the new format only needs the candidate day-set (`days_pool`) and a count range (`days_n`) declared, with the backend automatically enumerating every legal combination (`itertools.combinations`) and encoding it as an integer dimension. This gives the optimizer more search freedom and removes the redundancy of hand-written candidate lists.

### T4 requires both groups

The old format's `date_start_window` only expressed the start-day search window, implicitly inheriting `simulation.end_date` for the end day, leaving the intent unclear. The new format requires both groups in `date_range`: `[[start_lo, start_hi], [end_lo, end_hi]]`; when the end day is fixed, the same date is written twice.

---

## Impact

### Deprecated fields

| Old field | Location | Replacement |
|---|---|---|
| `optimizer.inputs` | YAML top level | `optimizer.schedules` |
| `time_window: "A~B"` | entry top level | `optimize.time: ["A","B"]` |
| `opt_step: 1h` | entry top level | `optimize.time_step: "1h"` |
| `days_options: [[...]]` | entry top level | `optimize.days_pool + optimize.days_n` |
| `date_start_window: "A~B"` | entry top level | `optimize.date_range: [[...],[...]]` |
| `date_end_window: "A~B"` | entry top level | `optimize.date_range`'s second group |
| `optimize.time: true` | inside `optimize:` | `optimize.time: ["A","B"]` |
| `optimize.days: true` | inside `optimize:` | `optimize.days_pool + days_n` |
| `optimize.date_start: true` | inside `optimize:` | `optimize.date_range` |
| `optimize.date_end: true` | inside `optimize:` | `optimize.date_range`'s second group |
| `regimen:` (the oldest) | inside `optimizer:` | `optimizer.schedules` |

### Files migrated

- **14 paper YAML files** (`models/papers/s1-s4/`): all migrated.
- **All references/ + scenarios/ + temp/ + test/ YAML files** (~64 files): `inputs:` -> `schedules:`; the T2/T3/T4 test files under test/ were migrated in the same pass.
- **Backend** `optimizer_engine.py`: all legacy parsing paths removed, reading only `optimizer.schedules`.
- **Frontend** `types.ts`: `InputEvent`'s opt fields replaced (`timeWindowStart/End/Step`, `daysPool/NMin/NMax`, `optimizeDateRange/dateStartLo/Hi/dateEndLo/Hi`).
- **Frontend** `Simulator.tsx`: both override construction and model loading use the new fields.
- **Frontend** `OptSetupTab.tsx`: the T2/T3/T4 UI updated.
- **Documentation** `docs/model.md`: the schema updated to the new format.

### Not backward compatible

The backend no longer parses the old format's fields. A YAML with `optimizer.inputs` or an old tier field will error with `No optimizer.schedules defined`.

---

## Alternatives considered

**Keep `optimizer.inputs` and add `optimizer.schedules`**: having the two coexist increases the cognitive burden of understanding the format; rejected.

**Keep the boolean flags** (`time: true`): would still require an extra field to describe the interval, so the semantics wouldn't be self-consistent; rejected.

**Enumerate T3 candidate combinations explicitly** (`days_options`): limits the optimizer's search freedom and requires the modeler to maintain the list by hand; rejected.
