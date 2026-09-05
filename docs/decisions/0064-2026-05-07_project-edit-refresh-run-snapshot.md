# ADR 0064 — Edit State Refreshes the Source File, Run State Freezes a Snapshot

## Status

✅ Implemented (sim); the game repo follows the same principle

## Date

2026-05-07

## Background

When a user edits a YAML file externally, if the GUI keeps reusing an already-loaded copy of the model content, the page's selections and run state stop reflecting reality until the browser is refreshed. On the other hand, users also want their working state and run results to survive a disconnect or page refresh.

These two needs can conflict: edit state should show the latest source file as soon as possible, while run state must stay reproducible and must not be corrupted by a YAML file changing mid-run.

## Decision

Adopt a unified principle:

> Edit state always refreshes from the source file; run/session state freezes a snapshot taken at start.

### Simulator

- The frontend retains UI state: the selected model, left-tree expansion, active tab, input configuration, font size, dark mode, etc.
- The frontend does not treat model content as a long-lived source of truth: selecting a model, restoring a selected model, and manual refresh all re-read the YAML and resolved imports.
- The backend's `LoaderEngine.fetch()` gains a `use_cache` parameter; the GUI's resolved model and any new simulation session use `use_cache=False` to guarantee the latest YAML is read.
- Once a simulation starts, the session holds onto the resolved model object captured at start time. An existing session is unaffected by subsequent YAML edits.
- The frontend persists `sessionId`, and re-attaches via `GET /api/simulation/session/{session_id}` after a refresh or disconnect.
- If the session still exists, progress, existing trajectories, output variables, Monte Carlo run data, and the seed are all restored; if the session no longer exists, only the last local result is kept for viewing, and the run cannot be resumed.

### Game

The game repo follows the same boundary:

- Story/Card selection and edit state read the latest YAML.
- At the start of a game, the story/card definition snapshot is frozen and its source hash or version recorded.
- On page recovery, the game state is restored: hand, deck, discard pile, cards in play, turn, resources, and random seed.
- Updates to the source YAML do not affect the current game, only new games.
- A cloud version should store saves/sessions in a server-side database rather than relying solely on localStorage.

## Consequences

- After external YAML edits, reselecting the model or clicking refresh shows the latest resolved model in the GUI.
- New simulations read the latest YAML; existing simulations keep the snapshot taken at start, so results stay reproducible.
- Tree expansion and selection persist across a page refresh.
- In-memory sessions are lost on backend restart; this is an acceptable limitation during local development. Moving to the cloud will require session TTLs and persistent storage.

## Follow-up

- Add `source_hash` / `updated_at` to the resolved-model API, so the frontend can prompt for revalidation after a locked model changes.
- When the game repo implements save snapshots, record `source_hash`, and prompt "this game is on an old snapshot; new games will use the updated version" once the source file changes.
