# 0023 — Models can be run directly from the GUI file tree

**Status**: implemented
**Date**: 2026-04-12
**Author**: shenfan19

---

## Background

Previously, the simulator GUI's file tree (the left-hand Scenarios panel) only showed scenario files under `models/scenarios/`. To test a standalone model file (e.g. `running.yaml`), a user had to build a separate empty-shell scenario just for it.

This caused two problems:
1. Testing a new model required writing a redundant scenario wrapper, which slowed down iteration.
2. Each model has its own `simulator` configuration (`total_time`, `step_size`, `output_variables`), which could not be triggered outside a scenario.

## Decision

Expose two top-level groups, `SCENARIOS` and `MODELS`, in the GUI file tree, so a model file with a complete `simulator` configuration can be selected, validated, and run directly, without needing a scenario wrapper.

Implementation details:
- `loadFileTree` scans both the `scenarios/` and `models/` directories
- SCENARIOS and MODELS appear as non-selectable group nodes, each with its own file tree beneath it
- Model file nodes are visually distinguished with a purple tag
- `handleValidateAndLock` reads the `standalone` field returned by validation; if it is `false`, a warning is shown (without blocking the run)

## The `standalone` convention

Each model file declares in its `metadata` whether it can run independently, via the `standalone` field:

```yaml
metadata:
  standalone: true   # has a complete simulator configuration, can run directly (default)
  standalone: false  # a library component, depends on being imported by other models; running it alone yields incomplete results
```

A model with `standalone: false` shows the following message during GUI validation:
> "This file is a library component — simulation results may be incomplete without its dependent models"

## Rejected alternatives

- **Building test scenarios only under scenarios/**: too much boilerplate, high maintenance burden, requiring the scenario to be kept in sync every time a model's parameters change.
- **A dedicated test/ tooling page**: high development cost, and largely duplicates the existing simulator's functionality.
- **No distinction, letting every model run**: library components with `standalone: false` (e.g. `diabetes_core`) produce meaningless simulation results when run without their dependencies, which is likely to mislead users.
