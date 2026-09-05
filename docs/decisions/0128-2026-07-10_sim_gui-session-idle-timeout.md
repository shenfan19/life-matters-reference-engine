# 0128 — Automatic GUI Session Destruction on Idle Timeout

**Date**: 2026-07-10
**Status**: ✅ accepted

---

## Background

A pre-launch checklist review (`2026-06-25_task_prelaunch-publish-verification-checklist.md` §4) confirmed:
`reference_engine/src` had no session-timeout logic at all. Once a GUI simulation session (`ReferenceEngine.sessions`,
managed by `SessionManagerMixin`) was created, it would only disappear if the frontend explicitly called some destroy endpoint — but closing a browser tab or a user abandoning it partway through would never trigger destruction. In a public multi-user deployment, zombie sessions would pile up without bound; each session holds a complete model copy (including independent clones for multi-run MC), and running for a long time would exhaust the server's memory.

`app_state.optimizer_jobs` (optimization tasks) is a completely separate dictionary unaffected by this problem, and this change doesn't touch it either.

## Decision

1. **The timeout threshold**: 30 minutes of inactivity (`SESSION_IDLE_TIMEOUT_SECONDS = 1800.0`, defined in
   `session_manager.py`), with destruction judged by "time since last activity," independent of the session's
   `running` flag (whether it's currently auto-playing) — a session with `running=True` that no one has polled `batch_steps` on for over 30 minutes is likewise treated as a zombie (covering the closed-browser-tab scenario).
2. **The definition of "activity"**: `start_session` writes `last_active` on creation; the six access points `batch_steps`/`pause_session`/
   `resume_session`/`reset_session`/`export_session_csv`/`get_session_info` each refresh it. A read-only access (`get_session_info`/`export_session_csv`) also counts as activity — the rationale being that these calls are themselves proof someone is interacting with the session; counting only "stepping" as activity would wrongly kill a session where a user is viewing results but hasn't clicked "continue" for a while.
3. **How cleanup is triggered**: rather than an inline check on every request (which would pay the cost of a full-table scan on every single request), an independent `asyncio` background task is started in `api_server.py`'s
   `lifespan`, scanning once every `SESSION_CLEANUP_INTERVAL_SECONDS = 300` (5 minutes) and calling `ReferenceEngine.cleanup_stale_sessions()`. The scan interval is clearly smaller than the timeout threshold, guaranteeing a zombie session lives at most about 5 minutes past the 30-minute line, never lingering long-term.
4. **Isolation from optimization jobs**: `cleanup_stale_sessions()` only operates on `self.sessions`, never physically touching
   `app_state.optimizer_jobs`, naturally satisfying the requirement that "timeout logic must not affect a running optimization job" with no extra exclusion logic needed.

### Why not an inline per-request check

An inline check (scanning for expired sessions before every session access) would make request latency depend on the total session count, and would couple the "should we clean up" decision into every business-logic call stack. A separate background task decouples "when to clean up" from "whether business logic needs to care about expiry," and `cleanup_stale_sessions()` itself can be called directly by a test without simulating a request context.

## Result

- `reference_engine/src/session_manager.py`: added the `SESSION_IDLE_TIMEOUT_SECONDS` constant,
  the `last_active` field (set on creation, refreshed at the six access points), and the `cleanup_stale_sessions(idle_seconds=...)` method
- `reference_engine/src/api_server.py`: `lifespan` starts a background cleanup loop via `asyncio.create_task`,
  with `cleanup_task.cancel()` on application shutdown
- `tests/test_session_cleanup.py`: three cases — an expired session gets cleaned up, an active session is kept,
  and `batch_steps` refreshes the timer so a session escapes cleanup

## Open items

- ~~P1-P4 (concurrent-resource protection: an optimization-job cap, a simulation-session cap, IP rate limiting, a queuing system) are still not implemented~~
  **P1/P2 were implemented on 2026-07-10, see ADR 0129** (later the same day). P3 (IP rate limiting) / P4 (a queuing system)
  were judged unnecessary at the current deployment scale, implemented only if needed — see ADR 0129's "things not done."
- The 30-minute threshold and the 5-minute scan interval are currently hardcoded constants, not exposed as environment variables/config — if it turns out after actual deployment that these two numbers need to be tuned by traffic, externalizing them can be reconsidered then.
