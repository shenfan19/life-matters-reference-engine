# ADR 0089 — Session refinement: separating `useSession`, `userEdited` tracking, warm-start dirty detection, and inactive-model opt isolation

**Date**: 2026-05-30
**Status**: implemented
**Scope**: the LM-Simulator frontend (`sim_gui/`) plus the simulation engine (`sim_engine/`)
**Revises**: ADR 0082 section D3 (refresh to YAML), ADR 0077 (the session model's reload button)

---

## Background

This round of changes addresses four independent but related problems:

1. **Session logic scattered around**: `readMS`, `writeMS`, `initModelSessions`, `modelSessionsRef`, `sessionReadyRef` were all written directly in `simUtils.ts` and `Simulator.tsx`, with unclear responsibility boundaries and poor maintainability.

2. **No way to distinguish "original" from "edited"**: when a user opens a model just to look, versus when the user has actually run a simulation or modified inputEvents, localStorage recorded no distinction — the model tree gave no visual feedback, and the user had no way to tell which models carried local modifications.

3. **No degradation notice for warm-start**: once a user had run an optimization, if they then changed the objective function, a constraint, or a decision variable's search range, "continue computing" would still show green, giving no indication that the previous front no longer matches the current problem definition. In addition, the "continue computing" checkbox only appeared when `hasExistingResults` was true, so the state couldn't be sensed ahead of time on first load.

4. **Confusing Opt-tab display for an inactive model**: when a user switched to model B to browse it while model A's optimization was still running, model B's Opt tab would show model A's live generation counter and log, causing confusion.

Separately, warm-start in some scenarios failed to correctly read `optimizer.results` from the YAML, so a model with existing results still loaded with the warm-start checkbox left at false.

---

## Decision

### D1: `useSession.ts` — session management factored into its own Hook

All the session-related logic in `simUtils.ts` is migrated into `sim_gui/src/components/sim_tab/useSession.ts`:

**Exported API:**

```ts
// utility functions (module-level, importable independently)
readMS(): Record<string, ModelSession>
writeMS(sessions): void

// the Hook
useSession() -> { modelSessionsRef, sessionReadyRef, persistSession, clearSession, getSession }
```

| Method | Responsibility |
|------|------|
| `persistSession(key, session)` | writes to the ref, then to localStorage |
| `clearSession(key)` | deletes from the ref, then from localStorage |
| `getSession(key)` | reads a session from the ref |

`initModelSessions()` stays in `useSession.ts`, responsible for restoring from localStorage on first load and migrating the old format (the global `sim_persist` inputEvents).

`simUtils.ts` drops its `readMS`, `writeMS`, and `initModelSessions` exports, avoiding duplicate maintenance.

---

### D2: the `userEdited` flag — distinguishing "original" from "edited" sessions

**New field:** `ModelSession.userEdited?: boolean`

`sessionEditedRef = useRef(false)` is set to `true` when any of the following occur:
- adding / modifying / deleting an inputEvent
- clicking "run simulation" (`startSimulation`)
- clicking "run optimization" (`startOptimization`)

Every time a session is saved, `userEdited: sessionEditedRef.current` is written along with it.

**The model tree's `(edited)` marker:**

`Simulator.tsx` computes `sessionKeys`: from all localStorage sessions, it filters the keys where `userEdited === true` and passes them to `SimModelTree`. The tree shows a small `(edited)` label after the model name (in `c.primary` color, italic, `0.75em`), purely a visual cue with no functional effect.

```tsx
const sessionKeys = new Set(
  Object.entries(readMS())
    .filter(([, s]) => !!(s as any)?.userEdited)
    .map(([k]) => k)
);
```

---

### D3: warm-start dirty detection

**A problem-definition signature:**

```ts
buildProblemSignature(objectives, constraints, inputEvents) -> string
```

Built by concatenating the objective function, the constraints, and every decision variable's search range (the T1/T2/T3/T4 parameters) into a single string.

**State:**

- `lastRunSignature`: the signature recorded the last time "run optimization" was clicked
- `warmStartDirty = lastRunSignature !== null && currentSignature !== lastRunSignature`

**UI behavior:**

| State | Checkbox display |
|------|--------------|
| No existing results | gray, disabled, with a Tooltip explaining warm-start is unavailable |
| Results exist, problem unchanged | a green "continue computing" |
| Results exist, problem has changed | an orange "⚠ continue computing," with a Tooltip warning about reduced match quality |

The "continue computing" checkbox is changed from "shown only when `hasExistingResults`" to **always visible** (disabled when there are no results), so the user can sense the warm-start state before running.

**Reset:** `lastRunSignature` is cleared when switching models.

---

### D4: `isActiveModel` — isolating the Opt tab for an inactive model

`SimOptTab` gained an `isActiveModel?: boolean` prop (defaulting to `true`).

When `isActiveModel === false` (that is, the model currently being viewed is not the model with a running optimization):

```ts
const activeRunning = isActiveModel && optRunning;  // the live running state
const activeHistory = isActiveModel ? optHistory : [];  // the live history
const activeLogs    = isActiveModel ? optLogs    : [];  // the live log
const activeCurGen  = isActiveModel ? optCurGen  : 0;
```

Effect: an inactive model's Opt tab shows an empty log, an empty history chart, and a generation count of 0, but **keeps the already-completed `optResult`** (from the session or the YAML) — it shows no other model's live data.

---

### D5: warm-start result reading falls back to `rawContent` (a bug fix)

In some scenarios (a model resulting from an import merge), `selectedModel.content.optimizer` had no `results` block, while `rawContent.optimizer.results` did.

Fix:

```ts
const rawResults = optBlock?.results ?? selectedModel?.rawContent?.optimizer?.results;
```

All related `optBlock.results` references are uniformly switched to `rawResults`:
- the warm-start checkbox's initialization
- the warm-start modal's `reference.x` reading
- the `optBlock` parameter passed to `xToInputEvents` gained the fallback

---

### D6: SimModelTree simplification

Two UI elements judged to be more noise than value were removed:

1. **The running-status strip**: the green "XX is running" bar at the top of the tree, whose function overlapped with the tree node's left-side double-arrow indicator (ADR 0085 D3); removed.

2. **The close button (x) on a session model**: a user-uploaded session model can be cleaned up via "reload" or simply ignored; an active close button added unnecessary risk of accidental clicks; removed.

---

### D7: reordering the OptControlBar buttons

The new order (left to right):

```
[Run/Stop] [continue computing checkbox] [Gen count] ... [parameter controls] | [Save results] [Reload] | [YAML download]
```

The original order was `[YAML download] [Reload]`, adjusted to save results before downloading, matching the user's workflow (run -> save -> download).

The "Save results" button (`SaveOutlined`):
- `scsMode = true`: saves to the session (`message.success`)
- `scsMode = false`: calls `saveResultsToFile` (writes back to the YAML)
- disabled when there is no optResult

---

### D8: opt-log copy/export

`SimOptTab`'s Log panel gained two buttons (top right):
- **Copy** (`CopyOutlined`): `navigator.clipboard.writeText(logText)`
- **Export .txt** (`DownloadOutlined`): filename `opt_log_<ISO timestamp>.txt`

Both buttons are disabled when `activeLogs.length === 0`.

---

### D9: the session-model `reloadFromYAML` path

The "refresh to the YAML default" flow described in ADR 0082 D3 now has a separate handling path for `session/` models:

```ts
const reloadFromYAML = () => {
  clearSession(selectedKey);
  sessionReadyRef.current = false;
  sessionEditedRef.current = false;
  if (selectedKey.startsWith('session/')) {
    // a session model: call setConfirmedModel again to trigger a YAML re-parse
    const sessModel = sessionModels.find(m => m.key === selectedKey);
    if (sessModel) { setConfirmedModel({ ...sessModel }); onModelSelect({ ...sessModel }); }
  } else {
    loadFileContent(selectedKey, { preserveTab: true });
  }
};
```

The rule from ADR 0077 that "the reload button is not shown for session/ models" is **now deprecated**: the reload button is visible for every model (session models included), and the behavioral difference is handled internally by `reloadFromYAML`.

---

### D10: backend module decoupling (sim_engine)

`optimizer_engine.py` no longer depends on `SimulatorEngine`'s private methods:

| Old call | New call |
|--------|--------|
| `SimulatorEngine._apply_regimens(...)` | `apply_regimens(...)` from `regimen_runner` |
| `SimulatorEngine._collect_param_distributions(...)` | `collect_param_distributions(...)` from `mc_utils` |
| `SimulatorEngine._apply_parameter_sampling(...)` | `apply_parameter_sampling(...)` from `mc_utils` |
| `simulator_engine._clone_model(m)` | `clone_model(m)` from `mc_utils` |

The optimizer no longer needs to hold a `SimulatorEngine` instance just to access these utility functions, lowering module coupling.

---

## Files affected

| File | Change |
|------|------|
| `sim_gui/src/components/sim_tab/useSession.ts` | **new**: session logic factored into its own hook |
| `sim_gui/src/types.ts` | `ModelSession.userEdited?: boolean` |
| `sim_gui/src/components/Simulator.tsx` | uses `useSession`; `sessionEditedRef`; `sessionKeys`; the two-path `reloadFromYAML`; the `rawContent` fallback |
| `sim_gui/src/components/sim_tab/simUtils.ts` | removed `readMS`, `writeMS`, `initModelSessions` |
| `sim_gui/src/components/sim_tab/SimModelTree.tsx` | the `(edited)` marker; removed the running-status strip; removed the session close button; the reload button unified via `onReloadModel` |
| `sim_gui/src/components/sim_tab/SimOptTab.tsx` | the `isActiveModel` prop; log copy/export buttons |
| `sim_gui/src/components/opt_tab/OptControlBar.tsx` | reordered buttons; the `warmStartDirty` prop; "continue computing" always visible; `scsMode`/`onSaveResults` |
| `sim_gui/src/components/opt_tab/useOptimizer.ts` | `buildProblemSignature`; `lastRunSignature`; `warmStartDirty` |
| `sim_engine/src/optimizer_engine.py` | removed the dependency on `SimulatorEngine`'s private methods (see D10) |

---

## Rejected approaches

**Automatically forcing a cold start whenever `warmStartDirty`**: too aggressive — the user might have only tweaked a constraint slightly and still want the speed of a warm start. Changed to a warning rather than a forced action.

**Fully disabling the Opt tab when inactive**: the Opt tab is also a result-viewing area; even when not the active running model, the user still needs to view that model's historical Pareto results, so only the "live data" is isolated while the "static results" are kept.

**Keeping the close button on a session model**: a session model is persisted via localStorage, so "closing" doesn't mean "deleting" — visually closing it and then having it reappear on refresh is confusing behavior. Removing it is clearer — a session model's lifecycle is governed by upload/reload.
