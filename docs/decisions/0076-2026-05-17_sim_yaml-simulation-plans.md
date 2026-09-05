# ADR 0076 — simulation.plans: Predefining Multiple Plans at the YAML Level

**Date**: 2026-05-17
**Status**: decided
**Supersedes/revises**: partially supersedes ADR 0073 ("Plan does not go into YAML")

---

## Background

ADR 0073 designed Plan as a pure GUI session object, not persisted to YAML. That decision made sense for the GUI's internal logic, but it overlooked the needs of paper models (papers/):

- Paper authors need to pre-set multiple comparison plans in YAML (e.g. representative points on a Pareto front), so a reader can reproduce the paper's figures just by opening the model
- The Pareto front already stores x/f vectors in `optimizer.results.pareto_front`, but lacks a corresponding expanded schedule form, so the GUI cannot load it directly as a runnable Plan
- "Plan does not go into YAML" leaves a published model missing key information: someone downloading the YAML has no way to know which plans the paper actually used

## Decision

Add an optional field `plans` to the `simulation` block, letting modelers pre-set multiple named plans.

### Format

```yaml
simulation:
  plans:
    - id: "kidney_protect"        # unique id (lowercase with underscores)
      label: "Kidney-protective priority"          # GUI display label
      schedules:                  # same format as simulation.schedules
        - variable: dietary_protein
          time: "08:00"
          value: 0.22
          label: "Breakfast protein"
        ...
    - id: "balanced"
      label: "Clinically balanced plan"
      schedules: [...]
```

### Relationship to simulation.schedules

| Case | GUI behavior |
|------|---------|
| Only `schedules` present | single-plan mode (backward compatible) |
| Only `plans` present | all predefined plans are loaded |
| Both present | `schedules` becomes the default single plan, `plans` is appended |

## Companion revision: optimizer.results.best → reference

The name `optimizer.results.best` implies a single unique optimum, which conflicts with the semantics of multi-objective Pareto optimization — every point on a Pareto front is a non-dominated solution, and there is no objectively "best" one.

Rename `best` to `reference`, meaning "a reference point the modeler has selected from the Pareto front," making clear that the point is a subjective annotation by the modeler and that users should weigh tradeoffs using the full `pareto_front` themselves.

## Design principles

- **YAML stores the initial state**: `plans` is the initial set of plans the modeler pre-configures; once loaded into the GUI, the user can freely add, remove, or edit them without writing back to YAML
- **Paper reproducibility**: models under papers/ should encode the endpoints and balance point of a Pareto front as named Plans, ensuring a paper's figures can be reproduced directly
- **Backward compatibility**: existing models that only have `schedules` behave unchanged

## Consequences

- `docs/model_design.md`: adds the `simulation.plans` schema and a `simulation.plans` section; `optimizer.results.best` → `reference`
- `sim_gui/src/components/Simulator.tsx`: 5 places that read `optimizer.results.reference` from YAML
- `models/papers/**/*.yaml`: 4 paper models gain `simulation.plans`, `best` → `reference`
