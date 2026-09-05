# ADR 0081 — LM Score: the Life Matters health-span core metric

**Date**: 2026-05-20
**Status**: Implemented (in + run)

---

## Requirements

### Background

The Life Matters framework's core proposition is "how much healthy time can a behavioral intervention extend or improve." A standardized way is needed to express the core scientific goal of "the duration survived before a metric collapses" or "the cumulative time spent within a safe state," and this quantity needs to be usable as an optimizer objective.

### Functional requirements

**R1**: support using "the cumulative duration during which all key metrics are simultaneously within a safe range" as an optimization objective
**R2**: health conditions are freely defined by the modeler in YAML (an asteval expression, which can AND/OR multiple metrics)
**R3**: support two accumulation semantics: recoverable (cumulative) and irreversible (latch)
**R4**: implemented entirely through YAML variables plus formulas, with no dependence on any engine-specific handling
**R5**: the variable is fully transparent, observable and exportable at every time step

### Constraint requirements

**C1**: the engine must not apply any automatic injection or special filtering to `lm_score`
**C2**: `lm_score` is a conventional variable name; the modeler is free to override or rename it
**C3**: the only special GUI handling is that the objective-variable selector shows a star marker next to `lm_score`, purely for recognition convenience

---

## Design

### Three objective semantics

| Semantics | Implementation | Applicable scenario |
|------|------|---------|
| **Instantaneous value** | `metric: final/max/min/mean` (existing) | A single metric's value at a given moment |
| **Cumulative healthy duration** (recoverable) | `lm_score` plus an if-else formula | Chronic disease, transient symptoms, recoverable states |
| **Duration before first collapse** (irreversible) | `lm_score` plus an `lm_alive` latch formula | Organ failure, a death event |

### Why pure YAML rather than code injection

- asteval already fully supports conditional expressions of the form `lm_score + step if (condition) else lm_score`
- Research software requires variables to be fully transparent; automatically generating variables via code violates this principle
- A YAML template is more flexible: the modeler can adjust the condition, unit, and formula detail without needing to understand the framework's internals
- When merging multiple models, the standard import-override rule is sufficient for most scenarios; a complex AND-merge is written explicitly by the modeler at the top level

### The only permitted code-level handling

**During Builder/Sim import merging** (to be implemented as needed in the future): if multiple sub-models' `lm_score` conditions need to be automatically AND-merged, the import-merge logic could detect multiple `lm_score_update` formulas and merge their conditions. This is not implemented currently; the modeler merges manually.

---

## Implementation

### Files affected

```
docs/model.md                    done: the lm_score section, full YAML syntax plus the two modes plus design principles
docs/decisions/0081 (this file)  done

sim_gui/src/components/
  SimSetupTab.tsx                done: the objective-variable selector shows a star next to lm_score (the only GUI-specific handling)
```

### Files that need no change

```
sim_engine/src/model_structure/loader.py    injects no variable or formula
sim_engine/src/simulator_engine.py          filters no variable, remains fully transparent
sim_gui/src/components/Simulator.tsx        does not auto-prefill an optimization objective
```
