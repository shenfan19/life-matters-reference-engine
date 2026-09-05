# 0054 — Unifying the sim/opt regimen execution function into `_apply_regimens`

**Date**: 2026-05-04
**Status**: implemented

---

## Background

The optimizer (`optimizer_engine.py`) and the simulator (`simulator_engine.py`) each maintained their own regimen event-execution logic:

- `optimizer_engine._apply_regimen_events`: accepted a `dict[var → events]` format and overwrote the variable value event by event (a "last event wins" semantics).
- `simulator_engine._apply_regimens`: accepted a `list[{variable, events}]` format, with pulse reset plus accumulation semantics.

The two implementations were inconsistent, so the same regimen produced different behavior between simulation and optimization. This was especially visible for multiple events on the same variable within a day: the simulation result accumulated them, while the optimization result overwrote them.

---

## Decision

**Delete `optimizer_engine._apply_regimen_events`; have the optimizer import and call `SimulatorEngine._apply_regimens` directly.**

Before calling it, the optimizer converts its `dict[var → events]` format into the `list[{variable, events}]` format, then passes it into the unified function.

The semantics of `_apply_regimens` are fixed as:
1. **Pulse reset**: at the start of every step, all variables controlled by a regimen are reset to zero.
2. **Accumulated triggering**: all events triggered within that step have their values summed (rather than overwritten).

---

## Rationale

- Simulation and optimization use the same physical engine, so their semantics must be consistent.
- Pulse reset plus accumulation is the correct calendar-scheduling semantics (three meals' worth of protein equals the sum of three pulses, not the last meal overwriting the others).
- A single implementation means a bug fix applies everywhere at once.

---

## Consequences

- The optimizer's regimen-execution behavior now exactly matches simulation.
- The optimizer needs one format conversion (`dict → list`) inside `_run_sim`, roughly 5 lines of code.
- The original `_apply_regimen_events`, about 45 lines of code, was deleted.
