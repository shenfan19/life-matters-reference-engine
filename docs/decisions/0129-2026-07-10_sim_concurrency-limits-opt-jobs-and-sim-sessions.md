# 0129 — Concurrent-Resource Protection: Global Caps on Optimization Jobs and Simulation Sessions (P1/P2)

**Date**: 2026-07-10
**Status**: ✅ accepted

---

## Background

ADR 0128 solved the problem of zombie sessions piling up (P0), but didn't limit **simultaneously active** resource consumption — the
`2026-06-25_task_prelaunch-publish-verification-checklist.md` §4 estimate: 5 concurrent large optimization tasks could saturate
10-20 cores. `SCS_MODE` only protects filesystem write operations; the simulation/optimization computation itself had no concurrency cap at all before this, and in a public multi-user deployment, a burst of concurrent requests — malicious or not — could exhaust the server's resources, and previously the system "silently accepted every request until it was overloaded" rather than "explicitly rejecting and suggesting a retry."

## Decision

1. **Two independent caps**: `LM_MAX_CONCURRENT_OPTS` (default 2) limits how many `app_state.optimizer_jobs` may simultaneously have
   `status == 'running'`; `LM_MAX_CONCURRENT_SIMS` (default 5) limits the total count of `ReferenceEngine.sessions`
   (regardless of whether they're currently auto-playing — a paused session still occupies the memory of a model copy, which is exactly the resource being protected here, not CPU usage). The two are physically independent of each other, consistent with ADR 0128's isolation principle.
2. **Rejecting once the limit is exceeded, returning 503**: when a new request would exceed the cap, the routing layer directly
   `raise HTTPException(503)`, with no queuing and no silent dropping — the frontend can use this to show "the service is busy, please retry later," which is more honest than failing silently or letting requests pile up. The check sits at the very front of the routing layer (`app_state.check_optimizer_capacity()` /
   `app_state.check_sim_capacity()`, right after the `engine is None` check and before entering business logic), not inside
   `session_manager.py`/`optimizer_engine.py` — these two modules don't depend on FastAPI, and putting the check in the routing layer lets it directly reuse `HTTPException`, which also fits better with "this is an API-boundary guard, not a business rule."
3. **Where the defaults come from**: taken directly from the recommended values in `2026-06-25_task_prelaunch-publish-verification-checklist.md` §4
   (`MAX_CONCURRENT_OPTS=2`); the simulation-session cap follows the same document's P2 item's recommendation
   (`MAX_CONCURRENT_SIMS=5`). Both are made configurable in `paths.py`, overridable via `.env`/environment variables
   (`LM_MAX_CONCURRENT_OPTS`/`LM_MAX_CONCURRENT_SIMS`), not hardcoded constants — unlike ADR 0128's
   30-minute timeout threshold, a concurrency cap strongly depends on the actual deployment machine's core count/memory, needs more adjustment per environment, and externalizing it has a higher payoff.
4. **Only the two user-facing creation entry points are protected**: `routes/simulation.py::/api/simulation/start` and
   `routes/optimizer.py::/api/optimizer/run_yaml`. Inside `plugin_context.py` (where a plugin such as
   `sensitivity_analysis` calls `start_session` a second time to do sensitivity analysis) **is not subject to this cap** — that is a short-lived session internal to the same user request, not "a new concurrent user," and counting it against the same cap would trigger throttling unexpectedly while a plugin is running.

## Things not done (P3/P4, implement if needed)

- **P3 (IP-level rate limiting)**: the judgment is based on "expected public concurrency" — this project's current positioning is a research-tool demo site, not a product facing large-scale anonymous traffic; P1/P2's global caps already prevent the server from being overwhelmed, and the additional benefit IP-level rate limiting would bring (preventing a single user from hogging all the concurrency slots) does not yet outweigh the complexity of introducing IP detection/trusted-proxy headers.
- **P4 (a queuing system)**: same reasoning — a fast 503 failure is sufficient for the currently expected low-concurrency demo scenario; a queuing system fits "occasionally overloaded long-term but worth the wait" scenarios, which doesn't match the current assumption that "overload means the configuration needs adjusting."
- If actual deployment reveals real traffic exceeding expectations, P3/P4 can be layered onto these same two check points at any time, with no need to change the existing design.

## Result

- `reference_engine/src/paths.py`: added `MAX_CONCURRENT_OPTS`/`MAX_CONCURRENT_SIMS`
  (overridable via `.env`/environment variables, defaulting to 2/5)
- `reference_engine/src/app_state.py`: added `check_optimizer_capacity()`/`check_sim_capacity()`,
  following the same pattern as the existing `check_write()` (SCS_MODE)
- `reference_engine/src/routes/optimizer.py`, `routes/simulation.py`: each gained a one-line check at its entry point
- `tests/test_capacity_limits.py`: 6 cases — each of the two check functions' "under the limit, allowed" / "over the limit, 503,"
  plus `optimizer_jobs` counting only `running`-status jobs, and `check_sim_capacity` not misfiring when `engine` isn't initialized
- `.env.example`: documented the two new environment variables (incidentally fixing this file's leftover pre-rename path references
  `sim_engine`/`sim_cli`, see ADR 0121)
