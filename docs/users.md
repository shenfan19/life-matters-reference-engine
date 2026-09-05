# Users and Deployment Modes

## Current deployment shape

Life Matters Simulator supports two deployment modes, controlled by the environment variable `SCS_MODE`:

| Mode | How to start | Write operations | CLI |
|------|---------|--------|-----|
| **Local mode** (default) | `uvicorn ...` (SCS_MODE not set) | Full permissions | Available |
| **SCS mode** (cloud demo) | `SCS_MODE=true uvicorn ...` | Writing to server files forbidden | Not applicable |

Both modes share the same `reference_engine/` and `gui/`; the only difference is write-operation protection.  
See [ADR 0078](decisions/0078-2026-05-18_project_scs-mode-design.md) for detail.

---

## Local user data layout

```
models/          <- model definitions (git-managed, public)
output/          <- CLI run results (gitignored, locally private)
  *_sim_YYYYMMDD_HHMM.csv
  *_opt_YYYYMMDD_HHMM.csv
  *_{mode}.log
```

See [`data_flow.md`](data_flow.md) for the complete data flow.

---

## GUI simulation session lifecycle

A GUI simulation session (`ReferenceEngine.sessions`, `session_manager.py`) is automatically destroyed after 30 minutes of inactivity, regardless of its `running` state (whether it is auto-playing); closing a browser tab or a user abandoning it midway are both reclaimed within about 35 minutes at most (a 30-minute timeout plus up to a 5-minute wait for the next background scan), preventing zombie sessions from piling up and exhausting server memory in a public multi-user scenario. Optimization jobs (`app_state.optimizer_jobs`) time independently and are unaffected by this.  
See [ADR 0128](decisions/0128-2026-07-10_sim_gui-session-idle-timeout.md) for detail.

---

## User account system

The current version does not introduce a user-account system. SCS mode achieves safe multi-person sharing without accounts, through write protection alone.  
If an account system is introduced in the future, an authentication layer will replace `SCS_MODE`, and this file will be updated accordingly at that time.
