# 0082 · 2026-05-21 · Sim · Session-state design for lock/unlock/model switching

**Partially superseded**: sections D3-D5 (lock-icon behavior, running-time unlock confirmation, lock not persisted) have been superseded by [ADR 0085](0085-2026-05-25_sim_remove-lock-free-switch-running-indicator.md). D1-D2 (the two-layer separation architecture, modelSession persistence) remain valid. D3 (refresh to the YAML default) has been updated by [ADR 0089](0089-2026-05-30_sim_session-refactor-warm-start-dirty-active-model.md) D9.

## Background

Original problem: after a user edits inputEvents in the GUI and clicks lock, the edits get reset to the YAML default values.
Root cause: `inputEvents` (the user session) and `selectedModel` (the model structure) were coupled inside the same `useEffect`; any operation that triggered a `selectedModel` change (including the YAML re-read on locking) would unconditionally reset the user's state.

Two additional problems surfaced during the discussion:
- While a run was in progress, the lock could be unlocked via the tree view's lock icon with no interception or prompt
- Switching to another model and back lost all previously edited data

## Core architectural decision: two-layer separation

The Simulator's state is split into two layers of differing character:

```
Layer 1  modelContent[key]   YAML structure (refreshed by loadFileContent, read-only)
Layer 2  modelSession[key]   the user session (driven by user edits, persisted to localStorage)
```

**Layer 2's content (the ModelSession type):**
- `inputEvents` / `plans` / `activePlanId`
- `simStartDate` / `simEndDate` / `stepValue` / `stepUnit`
- `objectives` / `constraints` / `optAlgo` / `optPop` / `optGen`

**Implementation:**
- `modelSessionsRef = useRef<Record<string, ModelSession>>(initModelSessions())`
  reads from localStorage (`lm_model_sessions`) at component init, and migrates the old global `inputEvents` format.
- Continuous update: whenever a session field changes, it's written into `modelSessionsRef.current[selectedKey]` and synced to localStorage.
- `useEffect([selectedModel])` was refactored into three parts:
  1. Always runs: parses the model structure into `inputParams`, `stateVariables`, `optRanges`
  2. Always runs: preloads opt results (Pareto-chart data) from the YAML
  3. If a session exists -> restore it; if not -> initialize from the YAML (first load)

## D1: preserving user edits on lock

**The old approach (deprecated)**: patching in a `skipInputReinitRef` flag.

**The new approach**: locking calls `loadFileContent`, which triggers `useEffect([selectedModel])`, but `modelSessionsRef.current[key]` already holds the latest user state, so it's restored directly — the YAML default no longer takes effect.
The flag is no longer needed; the architecture resolves this naturally.

## D2: preserving the session when returning to a switched-away model

The session is continuously written to `modelSessionsRef`; when switching to a new model, the old model's session stays in the map.
Switching back to the old model, `useEffect` finds the session and restores it directly — no data is lost.

## D3: refreshing to the YAML default

> **Updated**: see [ADR 0089 D9](0089-2026-05-30_sim_session-refactor-warm-start-dirty-active-model.md). What follows is the original description, which still applies to plain file-based models; session models now have a separate path.

The toolbar's "reload" button (`⟳`) calls `reloadFromYAML()`:
first `clearSession(key)` (equivalent to the old `delete modelSessionsRef.current[key]`), then branching by model type:
- **A plain file-based model**: calls `loadFileContent(key, { preserveTab: true })`
- **A session/ model**: calls `setConfirmedModel(sessModel)` again to trigger a YAML re-parse

Both paths cause `useEffect` to find no session and fall into the YAML-initialization path. `sessionEditedRef` is cleared at the same time, and the `(edited)` marker disappears from the model tree.

## D4: a confirmation dialog for unlocking while running

`SimModelTree` gained an `isSimulating` prop.
An unlock click now uniformly goes through `handleUnlock()`:
- `isSimulating` is false -> unlock directly
- `isSimulating` is true -> a `Modal.confirm` pops up ("Unlocking will terminate the simulation, confirm?"), and `onUnlock` only runs after the user confirms

## D5: the lock state does not persist across a refresh

The YAML may have been modified externally during the interval, so restoring the old lock state would bypass validation.
After a page refresh, the state always starts unlocked, and the user must click the lock icon again to re-validate.

## Rejected approaches

**Keep using `skipInputReinitRef`**: treats the symptom rather than the cause, and every new scenario would need a new flag.

**Keep the session in memory only, without writing to localStorage**: data would be lost on a page refresh, a worse persistence experience than game's.

**Disable the button outright when unlocking while running**: the user may genuinely need to abort urgently; a confirmation dialog is better than an outright disable.
