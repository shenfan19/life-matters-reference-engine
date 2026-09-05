# ADR 0078 — SCS Mode: Write Protection for Cloud Multi-User Deployment

**Date**: 2026-05-18 (continuously updated on 2026-05-18)
**Status**: decided
**Scope**: simulation-engine API + every frontend write-operation entry point

---

## Background

LM-Simulator was originally designed as a single-user local tool for the author, with no authentication protecting any API write operation. Plans to open it up to researchers as an SCS (Software-as-a-Cloud-Service) demo mean any visitor could overwrite or delete shared model files under `models/` on the server — a serious security risk.

---

## Constraints

1. The local development experience must not be affected (the author still needs full write access)
2. No user account system should be introduced (too heavyweight at this stage)
3. SCS users should be able to: upload their own YAML, edit it (in memory), download results, and run simulations
4. SCS users should not be able to: modify any file under the server's `models/`

---

## Decision

### The SCS_MODE environment variable

On startup, the backend reads the `SCS_MODE` environment variable (case-insensitive):

```bash
# cloud deployment
SCS_MODE=true uvicorn ...

# local development (default false; simply leave it unset)
```

VSCode's tasks.json injects it via `options.env` rather than shell syntax (for cross-platform compatibility):

```json
"options": { "cwd": "...", "env": { "SCS_MODE": "true" } }
```

`SCS_MODE` stays a boolean and is not expanded into a multi-value enum (see rejected approaches).

### Backend: a 403 guard on write operations

Every endpoint that modifies the server's filesystem calls `_check_write()` as the first line of its function body:

| Endpoint | Operation |
|------|------|
| `POST /api/save-file` | save a structured model |
| `POST /api/file-raw/{path}` | save raw text |
| `POST /api/file-structured/{path}` | save JSON → YAML |
| `POST /api/file-move` | move/rename a file |
| `POST /api/file-new` | create a file from a template (under SCS, the frontend instead creates a session model) |
| `DELETE /api/file/{path}` | delete a file |
| `POST /api/split` | split a model (writes to disk) |

`POST /api/merge` and `POST /api/model/upload-temp` don't return a flat 403; each has its own SCS-specific branch (see below).

### GET /api/config

A new read-only endpoint for the frontend to discover the running mode:

```
GET /api/config → { "scs_mode": true/false }
```

The frontend requests this once when Simulator mounts, stores it in `scsMode` state, and passes it down to FileEditor and SimModelTree.

### Frontend: behavior adaptations in the file editor (FileEditor.tsx)

`ModelBuilder.tsx` (the old 1530-line, full-featured component) has been replaced by `FileEditor.tsx` (~600 lines, containing only the card-editing functionality needed in embedded mode). The old component's left-hand file tree was always hidden in embedded mode, making it dead code.

| Feature | Local mode | SCS mode |
|------|---------|---------|
| Edit model fields | Yes | Yes |
| Save to server | Yes | No, button grayed out, tooltip "available only in local mode" |
| Save session model | Yes | Yes (writes to localStorage, not the server) |
| Download the current draft | Yes | Yes (always available) |
| Delete a file | Yes | No, button hidden |
| Auto-fix (writes to disk) | Yes | No, button hidden |
| Drag to move a file | Yes | No, already moved to SimModelTree, not in FileEditor |

### Frontend: creating a new file (SCS mode)

Under SCS mode, clicking "New" doesn't call `POST /api/file-new`; instead:

1. The dialog only asks for a model name (not a path)
2. The frontend creates an empty template `ModelFile` (key = `session/{name}.yaml`)
3. It opens directly as an edit card in FileEditor, entering edit mode automatically
4. It's registered into `sessionModels` (localStorage)

### Frontend: Merge behavior under SCS

Under SCS mode, the dialog only asks for a filename (not a server path). The backend's `POST /api/merge` doesn't write to disk under SCS mode; it returns the merged result in memory:

```json
{ "success": true, "scs_mode": true, "raw": {...}, "yaml_text": "...", "filename": "merged.yaml" }
```

The frontend builds the result into a session model and opens Builder, entering edit mode automatically.

### Frontend: uploading to Builder

Builder's toolbar gains an upload button (`UploadOutlined`); after upload, `POST /api/model/upload-temp` (an atomic operation, see ADR 0077) creates a session model, which opens automatically as an edit card in FileEditor.

### Frontend: session-model behavior in the tree

- **Normal mode**: clicking a session model loads it as the current sim model (same as a server model)
- **Builder mode**: a session model shows a checkbox (same as a server model in the tree); checking it shows an edit card in FileEditor; no lock icon is shown when selected

### Frontend: run-button restrictions (SCS mode)

Under SCS mode, while another model is running, the current model's Sim/Opt run buttons are disabled, showing a tooltip on hover:

> "Please stop the run in 'X' before starting a new one"

The lock icon was removed by [ADR 0085](0085-2026-05-25_sim_remove-lock-free-switch-running-indicator.md); the run interception now only pops a confirmation dialog when the user actually tries to start a new run, and no longer blocks switching models.

---

## Rejected approaches

### A multi-value MODE enum (LOCAL / SCS / DEMO / ...)

Concerns like resource limits (concurrency caps) and a demo whitelist are unrelated to write protection and are each controlled by their own independent variable. An enum would couple unrelated concerns together and turn into an unmaintainable big switch as requirements grow.

**Decision**: keep the boolean `SCS_MODE`; every other dimension is controlled independently.

### Hiding all write entry points on the frontend (New, Merge, Upload)

The backend already has a 403 fallback, so keeping these buttons lets SCS users complete editing tasks through the session-model workflow.

---

## Consequences

- `sim_engine/src/api_server.py`: `SCS_MODE`, `_check_write()`, `GET /api/config`, the merge endpoint's SCS branch
- `sim_gui/src/components/FileEditor.tsx`: **new file**, replaces ModelBuilder.tsx; `scsMode` prop, session-key saves go to localStorage, fixed `checkedFiles` computation (including session keys), `preloadedMetas` bypasses the server fetch
- `sim_gui/src/components/Simulator.tsx`: `scsMode` fetch, handleMerge's SCS branch, handleCreateFile's SCS branch, handleBuilderSessionUpdate, builderSessionMetas, builderAutoEditKey, builderUploadRef
- `sim_gui/src/components/SimModelTree.tsx`: `scsMode` prop, session models show a checkbox in Builder mode, refresh button hidden for session keys, upload button in Builder's toolbar
- `sim_gui/src/components/ModelBuilder.tsx`: **deleted**
- `.vscode/tasks.json`: controlled via `options.env.SCS_MODE`

---

## Notes

- **SCS_MODE only protects the filesystem**. Limiting compute resources (concurrent simulation/optimization counts) is not yet implemented; see tasks/task_sim.md → the SCS compute-resource-limit item
- **Session-model architecture**: session-key prefix checks are scattered across multiple places, and there's room to improve this. Recorded as tasks/task_sim.md → item AA
- **SaaS path**: once a user-account system is introduced in the future, an auth layer will replace SCS_MODE; at that point the change will span the entire API layer
