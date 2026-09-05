# ADR 0109 — Enforced Location for `schedules`: sim→plans, opt→startpoint

**Date:** 2026-06-17
**Status:** Accepted
**Scope:** sim_engine · sim_gui · models/ (repo-wide)

---

## Background

After several rounds of evolution in the LM format, the `schedules` field existed in three different locations in YAML:

| Location | Historical semantics |
|------|---------|
| `simulation.schedules` | Legacy single-plan default input (before ADR 0076) |
| `simulation.plans[*].schedules` | New multi-plan input (introduced by ADR 0076) |
| `optimizer.schedules` | Optimizer decision variables + fixed background (unified by ADR 0088) |

Having these three formats coexist created two problems:

1. **`simulation.schedules`** (top-level): ADR 0087 already noted that this field has no effect on the GUI once `plans` is present, but structurally it could still exist on its own, leaving modelers confused about "where should a single-plan model's schedule go."
2. **`optimizer.schedules`**: the `startpoint` concept was missing — the optimizer needs an explicit "starting-point description" block, rather than having decision-variable definitions scattered directly under `optimizer:`. Attaching `schedules` directly under `optimizer:` neither matches the semantics of "search starting from some initial plan" nor is it easy to extend (a future need might be to add fields like `variable_values` or `seed` under `startpoint`).

---

## Decision

**Enforce a unique, non-negotiable location for each context:**

| Context | Sole legal location |
|--------|------------|
| Simulation input plan | `simulation.plans[*].schedules` |
| Optimizer decision starting point | `optimizer.startpoint.schedules` |

### Deprecated locations

| Deprecated field | Deprecated as of | Replacement |
|---------|---------|------|
| `simulation.schedules` (top-level) | 2026-06-17 | `simulation.plans[*].schedules` |
| `optimizer.schedules` (top-level) | 2026-06-17 | `optimizer.startpoint.schedules` |

### Semantics of `optimizer.startpoint`

The `startpoint` block describes the optimizer's "starting state": optimization starts from the plan structure defined here and searches for optimal values for each `optimize:` parameter. Placing `schedules` under `startpoint` makes explicit that "this is the initial protocol description, with certain dimensions of it marked for search," and leaves room for future extension (e.g. `startpoint.variable_values` overriding initial variable values).

```yaml
optimizer:
  startpoint:
    schedules:
      - variable: training_load
        time_start: "09:00"
        optimize:
          value: [40.0, 120.0]   # T1 search range
```

### `simulation.plans` for a single-plan model

A model with no multi-plan need uses a single plan (`id: default`):

```yaml
simulation:
  plans:
    - id: default
      label: "Baseline plan"
      schedules:
        - variable: protein_intake
          time_start: "08:00"
          value: 1.5
```

---

## Migration Scope

| Type | File count | Change |
|------|-------|------|
| `optimizer.schedules` migration | 115 | → `optimizer.startpoint.schedules` |
| `simulation.schedules` migration | 49 | → `simulation.plans[0].schedules` |

The migration was performed by an automated script, preserving all comments, data, and indentation style.

---

## Code Change Summary

| File | Change |
|------|------|
| `sim_engine/src/optimizer_engine.py` | `opt_block.get('schedules')` → `opt_block.get('startpoint', {}).get('schedules')` |
| `sim_gui/src/components/opt_tab/useOptimizer.ts` | `optimizerOverride.schedules` → `optimizerOverride.startpoint.schedules` |
| `sim_gui/src/components/sim_tab/simUtils.ts` | `optimizerConfig?.schedules` → `optimizerConfig?.startpoint?.schedules` |
| `sim_gui/src/components/Simulator.tsx` | Two instances of `optBlock.schedules` → `optBlock.startpoint?.schedules` |

---

## No Backward Compatibility

- Old format `optimizer.schedules`: the backend errors with `No optimizer.startpoint.schedules defined`
- Old format `simulation.schedules` (without `plans`): the backend loader ignores it (no longer parsed), and the GUI shows empty events

All models have already been migrated; there is no historical carryover.
