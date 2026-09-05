# 0085 · 2026-05-25 · Sim · Removing the lock mechanism, free model switching, and a running indicator

**Supersedes**: ADR 0082 (session-state design for lock/unlock/model switching, sections D3-D5)

---

## Background

ADR 0082 established the two-layer state-separation architecture (modelContent / modelSession) and, on top of it, introduced "locking" as a validation gate before a run. In practice, the lock mechanism exposed the following problems:

1. **Adds pointless friction**: the lock icon had to be clicked before every run, while the lock's actual effect (saving the session) was already handled automatically by ADR 0082's architecture.
2. **Model switching gets intercepted**: clicking another model while a run is in progress pops up an "abort and switch" confirmation, preventing the user from freely browsing other models.
3. **A running task gets terminated unexpectedly**: `loadFileContent` unconditionally called `stopAllJobs()` when switching models, so a task would simply stop once the user switched away.
4. **Cloud constraints expressed the wrong way**: the single-thread limit (SCS mode) was expressed as "switching forbidden," but what actually needs limiting is "can't start two runs at once," not "can't view other models."

---

## Decision

### D1: completely remove the lock/unlock mechanism

Delete all lock-related state and UI:

- Remove `isLocked`, `setIsLocked`, `handleValidateAndLock`
- Remove the `validateModelFile` call (the backend endpoint is kept, but no longer forced into the main flow)
- Remove the `LockOutlined`/`UnlockOutlined` icons
- A selected tree node shows only a highlighted background bar, no icon at all

> The lock's only value was "preventing edits from being lost on switch," a problem already solved by ADR 0082's modelSession architecture.

### D2: model switching becomes completely free

`handleSelect` and `onSelectSessionModel` switch directly, no longer passing through the `guardedSwitch` interceptor.

`loadFileContent` no longer calls `stopAllJobs()`:

```ts
// old: kill the background task on switch
const loadFileContent = async (filePath, opts) => {
  if (selectedKey && selectedKey !== filePath) stopAllJobs(); // <- removed
  ...
};
```

After switching, the background task keeps running, `runningModelKey` stays unchanged, and the running indicator stays visible.

### D3: the running indicator

A new visual cue replacing the lock icon: when a model is running, an animated double arrow appears to the left of that model's label in the tree.

**Layout rules**:
- The arrows use `position: absolute; right: 100%` relative to the text `span`, taking up no flow space
- Every model's text left-edge stays aligned, with the arrows protruding to the left of the text column (using the tree's indentation gap)
- Font size `fontSize: '1em'`, scaling automatically with the user's font-size setting

**Animation**: CSS keyframes with two `CaretRightFilled` icons offset by 0.25s, producing a rightward wave effect:

```css
@keyframes lm-arrow-run {
  0%, 100% { transform: translateX(0); opacity: 1; }
  50%       { transform: translateX(3px); opacity: 0.4; }
}
.lm-running-arrow  { animation: lm-arrow-run 0.8s ease-in-out infinite; }
.lm-running-arrow2 { animation: lm-arrow-run 0.8s ease-in-out 0.25s infinite; }
```

**Four render locations** (each clickable, jumping to the running model):
1. The tree view: to the left of the leaf-node title
2. The session list: to the left of the model name
3. The flat-list view: to the left of the model name (the `BookOutlined` icon is removed at the same time, for consistent alignment)
4. The top running strip: at the leftmost position of the entry, in a slightly larger font

### D4: run interception in cloud mode

In SCS mode, when another model is running, starting a new run on the current model is disallowed, but **switching is not disallowed**:

```ts
const blockIfRunning = (): boolean => {
  if (!scsMode || !runningModelKey || runningModelKey === selectedKey) return false;
  Modal.confirm({
    title: t('sim.run.blocked_title'),   // "Cannot start a run"
    content: t('sim.run.blocked_content'), // "Another model is currently running; stop it first before starting"
    okText: t('sim.run.goto_running'),   // "Go stop it"
    onOk: navigateToRunning,
  });
  return true;
};
```

- `startSimulation`, `runAllPlans`, and `startOptimization` all call this at the top
- `isOtherRunning = scsMode && !!runningModelKey && runningModelKey !== selectedKey`
- The run button is `disabled` when `isOtherRunning`, with a Tooltip reading "Please stop the run on 'X' first before starting here"
- The button shows "Run" (rather than Pause/Stop), since the running state belongs to another model, unrelated to the current one

### D5: dead code removed

| Removed item | Note |
|--------|------|
| The `isLocked` / `setIsLocked` state | no longer needed without a lock |
| The `validating` / `validationResult` state | used only by the lock icon |
| `handleValidateAndLock()` | the lock entry point function |
| The `validateModelFile` import | used only by this function |
| `guardedSwitch()` | the switch interceptor |
| The `LockOutlined` / `UnlockOutlined` import | in SimModelTree |
| The `BookOutlined` import | in SimModelTree's flat list (icon removed) |
| `isLocked` / `setIsLocked` in `LoaderProps` / `SimulatorProps` | in types.ts |

---

## Files affected

- `sim_gui/src/types.ts` — removed `isLocked`/`setIsLocked` from `LoaderProps`/`SimulatorProps`
- `sim_gui/src/App.tsx` — removed the `isLocked` state and its prop passing
- `sim_gui/src/components/SimPlotTab.tsx` — removed the `isLocked` prop
- `sim_gui/src/components/SimModelTree.tsx` — the indicator fully rewritten; new CSS keyframes; the lock icon removed
- `sim_gui/src/components/Simulator.tsx` — the lock logic removed; new `runningModelKey`, `blockIfRunning`; `loadFileContent` no longer calls `stopAllJobs`
- `sim_gui/public/locales/sim/*.json` — added `sim.run.blocked_title/content/goto_running`; removed `sim.tree.lock_tip/unlock_tip*` (kept but no longer used)

---

## Rejected approaches

**Keep the lock but make it optional**: the lock itself provides no real protection, so an optional lock is equivalent to no lock, adding UI noise for nothing.

**Pause rather than continue on switch**: pausing a simulation during background polling would require introducing a suspend/resume mechanism, adding complexity, and the user expects "runs to completion in the background" rather than "pauses on switching away."

**Forbid switching in SCS mode (the old behavior)**: an inaccurate way to express the constraint — what needs limiting is the "concurrent run count," not "whether other models can be viewed."
