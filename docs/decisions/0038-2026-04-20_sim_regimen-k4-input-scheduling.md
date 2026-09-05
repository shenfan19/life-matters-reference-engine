# Regimen K×4 input scheduling design (ADR)
**Date**: 2026-04-20
**Status**: implemented
**Files involved**:
- `sim_gui/src/components/Simulator.tsx`
- `sim_engine/src/simulator_engine.py`
- `sim_engine/src/api_server.py`
- `docs/sim_design.md`
- `models/scenarios/social/ad1666_uk_issac_newton.yaml`

---

## Background

The Simulator's input panel originally offered only a flat "variable → value" mapping table, unable to express time-scheduled behavior like "eat 120g of bread at 8:00, then 150g at 12:00 each day." This is a core requirement for lifestyle-optimization scenarios (nutrition, medication, sleep/wake schedules).

---

## Decision one: input model — Regimen K×4

**Rejected approach**: a Type-R/B/P/S (rate/boolean/pulse/schedule) four-type separated design. Analysis found this design overly complex, and it conflated "rate" with "intake amount," which did not match how the model was actually used.

**Adopted approach**: a single Regimen structure, with each Regimen containing four fields:

| Field | Meaning | Can be disabled |
|------|------|--------|
| `time[]` | The times of day at which it executes (HH:mm) | No, at least one required |
| `value[]` | The intake amount for each execution, paired one-to-one with time | No |
| `days` | Which days of the week it executes (7 booleans) | Yes → every day |
| `valid_range` | The date range within which this schedule is active | Yes → active indefinitely |

**Rationale**:
- `value` is the intake amount per event (a discrete event quantity), not a rate. Its unit is `g`, `ml`, etc., not `g/min`.
- Multiple (time, value) pairs express several executions within the same day, e.g. "breakfast 120g + lunch 150g."
- Disabling `days` means executing every day, matching the default intuition of "this event happens daily."
- Disabling `valid_range` means it is active indefinitely, avoiding forcing a new user to fill in dates.

---

## Decision two: GUI layout — three flexWrap blocks, ratio 3:3:4

Each Regimen card has a header (variable dropdown + delete button) plus a body (three blocks laid out horizontally, wrapping automatically when the screen is too narrow):

- **Block 1 (flex-grow 3)**: the time → intake-amount event list, rows can be added/removed, capped at 6 entries
- **Block 2 (flex-grow 3)**: execution days, Switch off = every day, Switch on = shows Monday-through-Sunday tags
- **Block 3 (flex-grow 4)**: the validity period, a Switch controls whether it's enabled, the date input boxes are always shown (dimmed when disabled), start and end dates laid out side by side

The validity-period date boxes are designed to always be shown rather than hidden until the switch is toggled on, because this lets the user see and fill them in immediately when they enable the switch, rather than going through a three-step "switch on → appears → fill in" sequence.

---

## Decision three: backend scheduling — `_apply_regimens` triggered step by step

Before each step in `batch_steps` executes, `_apply_regimens(model, regimens, prev_time, next_time)` is called:

1. The event time `HH:mm` is converted to a seconds-of-day offset `ev_sec`
2. It is checked whether `ev_sec ∈ [prev_sec_of_day, next_sec_of_day)` (both segments are checked when the step crosses midnight)
3. After filtering by validity period and execution days, matched events call `model.set_variable_value(variable, value)`

The simulation start date is fixed at 1900-01-01 as a relative baseline (independent of the real calendar); scenarios with an actual start date can extend this later.

---

## Decision four: YAML units — intake amount per event, not a rate

The units of the food-input variables in the Newton YAML were changed from `g/min`/`ml/min` to `g`/`ml`, with the value ranges and default values adjusted accordingly to real per-meal intake amounts (e.g. bread 0-300g, default 120g).

**Rationale**: `g/min` implies a continuous-flow semantics that users cannot intuitively interpret as "how many grams of bread eaten per minute"; `g` is a discrete event quantity, consistent with the Regimen model's semantics.

---

## Follow-up

- The Newton YAML formulas still use the old rate semantics; numerical results need to be re-verified (see `pending_improvements.md`, issue 2)
- When multiple Regimens write to the same variable, the current behavior is last-write-wins; whether they should accumulate instead is still to be confirmed (see `pending_improvements.md`, issue 1)
