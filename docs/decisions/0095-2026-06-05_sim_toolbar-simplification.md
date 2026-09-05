# ADR 0095 — Sim Toolbar Simplification: Remove Step, Restrict Reset

**Date:** 2026-06-05
**Status:** Accepted
**Context:** sim_gui — SimControlBar

---

## Context

SimControlBar originally had three run-control buttons: Run/Pause, Step (single-step), and Reset.
Step was a carryover from engineering habit, and Reset developed a side effect once auto-snapshot was introduced.

---

## Decision

### 1. Remove the Step button

LM's simulation characteristics make single-step debugging of no practical value:

- **Step sizes are minutes/hours/days:** stepping once shows something like "blood glucose changed from 5.20 to 5.21 mmol/L" — there's no interpretable information in that
- **Time horizons are months to years:** debugging should be done by shortening `end_date` and running the full trajectory, not by clicking step by step
- **Euler discrete integration:** formulas are mathematical expressions with no "breakpoints" or discrete state transitions, so single-stepping is meaningless
- **The backend is an API call:** single-stepping means one HTTP request per step, mismatched with the model's scale

Fully removed: `runSingleStep` in `useSimulation.ts`, plus the JSX, interface prop, and icon import for it in SimControlBar.

### 2. Reset is available only while running

After auto-snapshot was introduced, Reset in the `completed` state would clear the current result **without triggering a snapshot**, creating a data-loss trap.

New rule: `disabled={!isRunning && !isPaused}`

| State | Reset state | Semantics |
|------|-----------|------|
| idle | disabled | nothing to reset |
| running / paused | **enabled** | aborts and clears the current, incomplete run |
| completed | disabled | use Run to start the next run (auto-snapshots the current result) |

### 3. Sim / Opt toolbar symmetry

Each tab keeps two run controls:

| | Primary action | Secondary control |
|---|---|---|
| **Sim** | Run / Pause (same button) | Reset (only while running) |
| **Opt** | Run / Stop (same button) | Continue-from-previous checkbox |

Opt's checkbox is a pre-run configuration; Sim's Reset is an in-run abort. The semantics differ, but visually each side has two controls, keeping them symmetric.

---

## Consequences

### Removed
- The `runSingleStep` function (`useSimulation.ts`)
- The Step button and its `sessionId` prop (the latter was only used to disable the Step button)
- The `StepForwardOutlined` icon import

### Changed
- The Reset button's disabled condition: `status === 'idle'` → `!isRunning && !isPaused`
