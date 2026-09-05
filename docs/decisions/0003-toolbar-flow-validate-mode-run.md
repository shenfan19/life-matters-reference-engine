# 0003 — Toolbar operation flow: validate → mode → run

**Status**: implemented
**Date**: 2026-04-01

## Background

The early toolbar had two rows: the first showed the model name plus a mode switch (Segmented), the second held the run controls. The validate/lock button sat in the left scene-tree area, visually separated from the run button, which made the operation flow unintuitive.

## Decision

Merge everything into a single-row toolbar, laid out left to right in operation order:

```
[Sim|Opt] | [▶ Run / ⏸ Pause / ▷ Continue] [Step] [Reset] | duration step-size | progress
```

The validate/lock button moves back to the header-extra area of the scene panel, showing two states:
- `pending validation` (yellow dashed) → clicking triggers validation; once it passes, it becomes `locked`
- `locked` (green solid) → clicking unlocks it

Mode switch (Segmented): disabled while running, paused, or after completion; the user must Reset before switching modes (to keep the mode consistent with the data).

Run/Pause/Continue is a single toggle button:
- idle → Run (start from scratch, clear data)
- running → Pause (pause the batch loop, keep the session)
- paused → Continue (reuse the sessionId, resume runBatch)
- completed → button disabled, only Reset is available

## Consequences

- The workflow is linear: select scene → validate → select mode → run
- The number of buttons drops from 5 to 3
- Validation status is shown right next to the scene, so its meaning is unambiguous
- The toolbar carries a fair amount of content, so overflow needs attention on narrow windows (handled via flexShrink: 0 + whiteSpace: nowrap)
