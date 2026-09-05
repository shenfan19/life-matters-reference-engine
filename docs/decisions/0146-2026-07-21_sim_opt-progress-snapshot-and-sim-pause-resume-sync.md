# 0146 — GUI Sessions Scoped by Model: Persisting an Optimization Progress Snapshot Plus Frontend-Backend Sync for Simulation Pause/Resume

**Date**: 2026-07-21
**Status**: ✅ accepted

---

## Background

The GUI lets a user freely switch between multiple models, and each model's session state (`ModelSession`) already persisted `optResult` independently per model — but the live progress panel during an optimization run (the Gen/Eval/Front/Feasible/Mean CV cards and trend chart) had no owner, living only in component-level state, neither cleared nor restored when `selectedKey` changed. When a user switched to a different model, the progress panel kept showing the previous model's leftover numbers; switching back, `optResult` could be restored, but the process data of "how this run arrived at this result" had already been lost.

The same batch of changes also fixed a related state-consistency problem on the simulation side: when the frontend paused a simulation, it only set the local `isRunningRef` to false, never notifying the backend's `session_manager.py`, leaving the backend's `running` flag disconnected from what the frontend displayed — an accidental batch call would silently keep advancing instead of failing fast with a warning.

## Decision

**Persist optimization progress per model**: the `ModelSession` type gained `optHistory`/`optTotalGen`/`optElapsed`/`optMethod`/`optLogs` fields; `useOptimizer.ts` writes these fields together with `optResult` into `modelSessionsRef` when a run completes; when `selectedKey` switches, the progress panel is restored if the target model has a run history, otherwise cleared to an idle state. `optJobId` doesn't participate in this ownership scheme and remains independent of the currently selected model, used to cancel a task still running in the background for a model that's since been switched away from.

**Frontend-backend sync for simulation pause/resume**: `pauseSimulation`/`resumeSimulation` gained calls to the already-existing backend endpoints `POST /api/simulation/pause` and `POST /api/simulation/resume` (`session_manager.py`'s `pause_session`/`resume_session`, introduced alongside ADR 0129's concurrent-resource protection), fire-and-forget, not blocking the frontend's own pause/resume feedback; `resetSimulation` likewise notifies the backend to pause before resetting. These two backend endpoints already existed but had never actually been called by the frontend.

## Scope of impact

- `gui/src/components/opt_tab/useOptimizer.ts`: the progress-snapshot save/restore logic on model switch.
- `gui/src/types.ts`: `ModelSession` gained 5 optional fields.
- `gui/src/components/sim_tab/useSimulation.ts`: `pauseSimulation`/`resumeSimulation`/`resetSimulation` gained backend-sync calls.

## Result

- After switching models, the progress panel shows that model's own history, no longer carrying over the previous model's leftover data; switching back fully restores the process view, not just the final Front/Solutions result.
- When the frontend pauses or resets a simulation, the backend's `running` flag now stays consistent with the frontend's state, eliminating the silent inconsistency where the frontend had paused but the backend kept advancing.
