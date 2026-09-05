# ADR 0077 — Session Model Import: Atomic Upload + localStorage Persistence

**Date**: 2026-05-17 (revised 2026-05-18)
**Status**: decided
**Scope**: LM-Simulator frontend + simulation-engine API

---

## Background

Users need to import a local YAML file into the simulator without committing it to the server's `models/` directory. Typical scenarios:

- A researcher uploading a model they're debugging locally for a quick check
- SCS (cloud service) scenarios: a user uploads a custom model without touching the shared model library
- The model may reference existing components in `models/` via `imports:`

---

## Constraints

1. An uploaded YAML must be able to resolve its `imports` (referencing files in the server's `models/`)
2. Uploads must not be able to modify the shared model library (security isolation)
3. The session model must remain accessible after a page refresh
4. **Multi-user concurrency safety**: two different users uploading files with the same name must not overwrite each other

---

## Decision

### Upload flow (atomic operation)

```
Frontend POST /api/model/upload-temp { text, filename }
    ↓
Backend: writes models/temp/{uuid}_{safe_name}.yaml
Backend: loader_engine.fetch() resolves imports → produces the resolved model
Backend: deletes the temp file (guaranteed by a finally block)
Backend: returns { success, raw, resolved, filename }
    ↓
Frontend: builds a ModelFile directly from the response, key = "session/{filename}"
Frontend: writes to localStorage lm_session_imports
```

**Key design points**:

- A UUID prefix (`{uuid}_{safe_name}`) ensures concurrent uploads of same-named files never collide
- The temp file is deleted in a `finally` block, so by the time the response is returned the file no longer exists — the server achieves **zero persistence**
- The frontend no longer needs a second request (the original `loadFileContent(key)` → `/api/models/`)
- `raw`: the raw YAML parse result (imports not yet merged); `resolved`: the fully merged model after the loader

### Key naming for session models

Session models use `session/{filename}` as their key (instead of the earlier `temp/{safe_name}`), making the semantics explicit: this key doesn't correspond to any file on the server, and all subsequent operations come from localStorage.

### Frontend refresh button

> **Updated**: see [ADR 0089 D9](0089-2026-05-30_sim_session-refactor-warm-start-dirty-active-model.md). The original rule below has been deprecated.

~~When `selectedKey.startsWith('session/')`, the tree's top-bar "reload" button is hidden.~~

**Current behavior**: the refresh button is visible for every model, including session models. Clicking it calls `reloadFromYAML()`; for a session model, this re-triggers YAML re-parsing by resetting `confirmedModel`, with the same effect as "clear session and reload" for a regular file-backed model.

### localStorage persistence

- Key name: `lm_session_imports`
- Stores: the `ModelFile[]` for successfully uploaded and resolved models
- Cap: 10 at most, evicting the oldest on a FIFO basis
- After a page refresh: restored from localStorage and shown in a dedicated section at the top of SimModelTree

---

## Rejected approaches

### Option B: client-only storage, no server upload

Keep the full YAML content in localStorage without resolving `imports`.

**Rejected because**: it can't resolve imports, which defeats much of the purpose.

### Option C: temp files in a per-user session-isolated directory

Create a dedicated `models/temp/{session_id}/` subdirectory per user.

**Rejected because**: the files would still be persisted, just avoiding collisions; a fully atomic operation is simpler than this.

### Original approach (deprecated): a two-step process

The original implementation wrote the file persistently to `models/temp/{safe_name}.yaml`, then issued a second request via `loadFileContent` to load it. Problems: same-named files from different users would overwrite each other; the temp directory would accumulate indefinitely; the file had to survive until the second request completed.

---

## Consequences

- `sim_engine/src/api_server.py`: `POST /api/model/upload-temp` becomes an atomic operation, returning `{raw, resolved}`
- `sim_gui/src/components/Simulator.tsx`: `handleImportFile` builds a `ModelFile` directly from the response
- `sim_gui/src/components/SimModelTree.tsx`: session-key check, refresh button hidden
- `models/temp/`: only exists briefly during request handling; a persistent directory is no longer needed (can be kept around for orphan-file cleanup)

---

## Notes

- If the server crashes after the fetch completes but before the finally block runs, an orphaned UUID file is left behind. Extremely rare, and can be handled by scheduled cleanup
- Session models are not part of the `/api/files` tree scan; they are presented only via localStorage
