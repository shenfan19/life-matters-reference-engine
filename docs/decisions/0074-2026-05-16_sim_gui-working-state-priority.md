# ADR 0074 — GUI Working State Layer: GUI Takes Priority Over the YAML Schedule

**Date**: 2026-05-16
**Status**: adopted
**Scope**: simulation engine `simulator_engine.py` + `simulation.py`

---

## Background

ADR 0053 established that "the YAML schedule takes priority over the GUI regimen." The intent of that rule was to protect a model's defined temporal behavior from being accidentally overwritten by the user.

In practice, however:

1. A YAML schedule is already parsed into `inputEvents` when loaded on the frontend, and what the user sees and edits in the GUI is exactly those values.
2. After a user edits inputEvents, or an Opt result is injected into inputEvents, the engine's `_apply_schedules()` still overwrites those values at the end of every step, meaning any GUI edit for a variable with a YAML schedule has no effect at all.
3. Both F-OPT-SIM (applying a Pareto solution to Sim) and F-MPLAN (multi-plan comparison) depend on GUI values actually reaching the engine — under the existing priority rule, both features are broken for any model that has a YAML schedule.

## Root cause

The engine's per-step execution order:

```python
# simulator_engine.py batch-step loop
self._apply_regimens(model, session['regimens'], ...)  # 1. GUI values are written in
model.step(_native_step)                               # 2. internally calls:
    └── _apply_schedules()                             #    the YAML overwrites the GUI values ← the problem
    └── formulas execute                               #    using the YAML value, not the GUI value
```

`_apply_schedules()` already has a `manual_overrides` skip mechanism (`simulation.py:74`), but it had never been activated for the GUI-regimen scenario.

## Decision

**Reverse ADR 0053's priority rule for GUI-controlled variables**:

- A variable with a GUI regimen: the GUI takes priority (`_apply_schedules` skips it)
- A variable without a GUI regimen: the YAML schedule applies as before (backward compatible)

**Implementation**: when a session starts in `simulator_engine.py`, write every variable with a GUI regimen into `base_model.manual_overrides`:

```python
# right after input_params is applied, at session start
for reg in (regimens or []):
    var = reg.get('variable', '')
    if var in base_model.variables:
        base_model.manual_overrides[var] = 'gui'
```

In MC mode, each `run_model` is a clone of `base_model`, and the clone method (`_clone_model`) already copies `manual_overrides` (`simulator_engine.py:1039`), so no extra handling is needed.

## Relationship to ADR 0053

The following rule from ADR 0053 **is modified by this ADR**:

> "The YAML schedule takes priority over the GUI regimen (`inputEvents`)."

Revised semantics:

> "The YAML schedule is the source of default values at load time; once the user has configured a regimen for a variable in the GUI, that variable is fully controlled by the GUI for the rest of the session, and the YAML schedule no longer applies to it."

ADR 0053's priority rule for the `optimizer` path (the optimizer's regimen takes highest priority) is unchanged.

## Consequences

| Scenario | Before | After |
|------|--------|--------|
| User edits GUI inputEvents for a variable that has a YAML schedule | edit has no effect, overwritten by YAML | edit takes effect |
| An Opt result is injected into inputEvents (F-OPT-SIM) | had no effect | takes effect |
| F-MPLAN multi-plan, each plan with its own inputEvents | all plans ran the same YAML schedule | each plan is independent |
| A variable with no GUI regimen | YAML schedule applies | unchanged (compatible) |

## Out of scope

- Permanently modifying the schedule value in YAML (the GUI layer is session-scoped and is not written back to YAML)
- Changing the priority of the optimizer path (the optimizer regimen already has its own independent implementation)
