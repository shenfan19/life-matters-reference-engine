# ADR 0074 — Single-Level Tab Navigation and a Dynamic Builder Tab

**Date**: 2026-05-16
**Status**: adopted
**Scope**: LM-Simulator frontend navigation structure + model-library edit entry point

---

## Background

The original navigation structure had two levels:

1. **Top-level navigation** (title bar): Tools | Simulator
2. **Central panel tabs**: Overview / Simulation / Optimization / Report

Users had to track two levels of structure when switching between "tools" and "simulation," and the ModelBuilder (model-library editor) existed as a separate page, completely disconnected from the simulation workflow — modelers had to leave the simulation context to edit a model.

---

## Decision

### 1. Remove the top-level navigation, keep a single tab group

The top-level Tools / Simulator navigation tabs are removed entirely from the title bar. After the app starts, it always stays in the simulation view, and the title bar keeps only the brand mark and a settings button.

The single point of navigation is the central panel's four fixed tabs:

```
Overview | Simulation | Optimization | Report
```

### 2. Builder tab: appears dynamically, disappears when editing finishes

ModelBuilder is no longer a separate page; instead it mounts as a **dynamic tab** to the right of the central panel's tab bar.

**Lifecycle**:

| Action | Trigger | Result |
|------|--------|------|
| Click the Edit button (✎) on a node in the left directory tree | user | the Builder tab appears and becomes the active tab |
| The other four tabs are locked (grayed out, with a hint on hover) | system | edit mode takes exclusive control of the central area |
| Click the × on the Builder tab | user | the tab disappears, returning to whichever tab was active before, and the directory tree auto-refreshes |

This is a "contextual editing" pattern, similar to Word's "Table Tools" contextual ribbon that appears when a table is selected.

**Key constraint on edit mode**: only one Builder tab can exist at a time (no concurrent editing sessions).

### 3. Unified left directory tree: single-select / multi-select dual mode

The left-hand `SimModelTree` component supports two behavior modes, controlled by a `builderMode` prop:

| Mode | Trigger condition | Behavior |
|------|---------|------|
| **Single-select** (default) | Builder tab closed | clicking a file loads it into the simulation context; lock/unlock buttons are visible |
| **Multi-select** (Builder) | Builder tab open | file nodes show a checkbox; the header shows New / Merge action buttons |

Both modes share the same component and the same tree data (`storyTree`), with a consistent visual style. Merge and New operations are completed through a modal dialog at the Simulator layer, calling the existing `/api/merge` and `/api/file-new` endpoints.

### 4. The directory tree renders the disk structure directly, with no wrapping

`loadFileTree` calls `convert(modelsNode.children)` directly, rendering every subdirectory under `models/` at its original level, with no artificial GROUP HEADER wrapper nodes.

**Before**: each top-level subdirectory was wrapped in an uppercase GROUP header (e.g. `MODELS/PUBLISHED`), and empty directories were filtered out.
**After**: directory names keep their original case, every directory (including empty ones like `temp/`) is visible, and the font size matches file nodes.

---

## Tradeoffs

| Approach | Pros | Cons |
|------|------|------|
| **Dynamic tab (this approach)** | can switch to another tab mid-edit to check something; mode boundaries are clear; closing it means you're done | the other tabs are locked while editing, so you can't browse simulation results at the same time |
| Builder as a permanent fixed tab | always accessible | adds cognitive load, and implies simulation and editing can run in parallel (which they shouldn't) |
| Inline editing within Overview | no extra tab | complex operations like YAML merging are hard to express inline |

**Rationale for locking the other tabs**: model-library-level operations (merge, create, reorganize) are semantically mutually exclusive with running a simulation — a user shouldn't be merging model files while a simulation is running. Locking makes this mode boundary visible at the UI level.

---

## Out of scope

- Multiple concurrent Builder tabs (not needed)
- Persisting the Builder tab (an "in-progress edit" state is not saved to localStorage)
- Diffing model file content across versions (handled by git)
