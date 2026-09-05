# 0005 — Client-side state persistence: localStorage

**Status**: implemented
**Date**: 2026-04-02

## Background

A page refresh (F5) or an accidental browser close wiped out all simulation state — selected scene, input settings, run results. Users trust a web UI less than a desktop exe, since the browser itself is less stable, and the risk of losing a completed run is unacceptable.

## Decision

Use `localStorage` on the client to persist two categories of data:

**Configuration (written immediately on every change):**
- `selectedKey` — the currently selected scene path
- `mode` — sim / opt
- `inputEntries` — input schedule entries
- `isLocked` — whether validation is locked
- `openSections` / `sectionWeights` — the left accordion's expanded state and height ratios
- `timeValue / timeUnit / stepValue / stepUnit` — duration and step-size settings

**Simulation results (written only when status changes, skipped while running):**
- `simulationData` — the full array of data points
- `status / currentStep / progress`

Restoration strategy:
- On refresh, read from localStorage first, skipping the model's default-value overrides
- If status is `paused`, restore it as `completed` (the backend session is gone by then and cannot be resumed, but the data can still be viewed)
- After a scene is selected, wait for the file tree to finish loading before triggering the model load, to keep restoration timing correct

Storage key: `sim_persist`, a single JSON object, with no version control.

**2026-04-06 addendum:** the `sim_prefs` key was expanded to cover more persisted fields.

Previously `sim_prefs` only stored `isDarkMode` and `fontSize`; `simMode` was read separately from `sim_persist`, and `page` (the current tab) was not persisted at all (it reset to `simulator` on every refresh).

Now everything is written to `sim_prefs` uniformly:

```typescript
localStorage.setItem('sim_prefs', JSON.stringify({ isDarkMode, fontSize, page, simMode }));
```

On restore, `readPrefs()` reads these back, with each field falling back via `?? default`. The `mode` field in `sim_persist` is kept for compatibility (still used internally by the Simulator component), so the two keys coexist.

**2026-06-05 addendum:** the single `sim_persist` key does not distinguish between models, so when the model is switched, the GUI proactively clears `simulationData`, `dataPerRun`, and `status`, preventing the previous model's data from showing up as zero-valued curves on the new model's charts. Simulation data is isolated between models.

## Consequences

- State is fully recovered after an F5 refresh or an accidental close
- Run results (chart data) persist until the next Reset or model switch
- The implementation is purely front-end, requiring no backend changes
- Limited to a single browser on a single device; data is lost on a device change or cache clear
- With large data volumes (long simulations plus many variables), storage can approach the 5MB limit
- There is no version-compatibility handling, so old localStorage data can cause anomalies after a model structure upgrade (requires manual cleanup or a schema version number)
- Cloud deployment / multi-user scenarios will need backend persistence instead (see TODO)
