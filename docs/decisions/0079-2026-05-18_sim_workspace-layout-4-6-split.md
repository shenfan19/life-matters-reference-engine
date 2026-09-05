# ADR 0079 — Sim/Opt workspace layout: a 4:6 percentage split

**Date**: 2026-05-18
**Status**: decided
**Scope**: LM-Simulator sim_gui — the `WorkspacePage` component

---

## Background

The Simulation and Optimization tabs need to show the control panel (Setup/Inputs) and the result panel (Plot/Opt) side by side.

Historical evolution:
1. Originally used `width: '34%'` (a percentage with a 440px cap) — a reasonable ratio, but with a hardcoded upper bound
2. Changed to a draggable fixed-pixel width via `useResize(390, 220, 700)` — this solved the "too narrow" problem, but introduced a new one: while opt is running, frequent `setState` calls from `optElapsed` / `optHistory` trigger re-renders, and the 34% percentage gets recomputed relative to the container, producing noticeable flickering
3. This round: switched to a fixed flex percentage ratio, dropping the drag handle

---

## Problem

- The fixed pixel width (390px) made the setup panel take up too much space on a narrow screen (a central panel < 700px)
- The draggable divider (`useResize`) produced width flickering under opt's continuous-polling scenario
- The earlier "full-width fix" (completing the whole width chain with `flex: 1`) resolved the root cause at the same time, so a percentage-based layout could now work reliably

---

## Decision

`WorkspacePage` internally adopts a **fixed flex percentage ratio**, provisionally 4:6:

```jsx
// Setup (input and event configuration)
<div style={{ flex: '0 0 40%', minWidth: 0, overflow: 'hidden' }}>

// Result (charts, the Pareto front)
<div style={{ flex: '0 0 60%', minWidth: 0, overflow: 'hidden' }}>
```

The two columns have `gap: 8px`, and the outer container has `padding: 6px 10px`.

### Why 4:6 rather than another ratio

| Ratio | Problem |
|------|------|
| 3:7 | The Setup panel is too narrow, making the input-event list hard to operate |
| 5:5 | The Result panel is on the narrow side, limiting chart display |
| **4:6** | Stays usable at both 1200px and 800px screen widths, verified in practice |

### Dropping the drag handle

The `useResize` drag handle added component state (resize state plus `MouseEvent` handlers), and still carried flicker risk under opt's high-frequency update scenario (even switching to pixels could still trigger it via parent-container repaint). A percentage layout adapts to screen-width changes without needing a drag handle.

If a user-adjustable ratio is needed in the future, a `[0.4, 0.6]` state at the Simulator level could drive the two columns' flex-basis, paired with debouncing to avoid high-frequency refreshes.

---

## Unaffected areas

- The Overview and Report tabs: they don't use `WorkspacePage`, so their layout is unchanged
- The left model panel: still uses pixel-based dragging via `useResize(280, 160, 400)` (a low-frequency operation, no flicker risk)

---

## Impact

- `sim_gui/src/components/Simulator.tsx`: `WorkspacePage` drops the `setupW / startSetupDrag / c` props, hardcoding 40%/60% internally; the corresponding `useResize` call is removed
- `docs/ui_guidelines.md`: §1.0 (the Full-Width Rule) gained a note on the percentage-split convention
