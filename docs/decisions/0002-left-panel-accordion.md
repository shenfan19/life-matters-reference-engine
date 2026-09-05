# 0002 — Left panel accordion (VSCode-style)

**Status**: implemented
**Date**: 2026-04-01
**Supersedes**: none (new)

## Background

The left control area originally used an Ant Design Tab (only one section visible at a time), then switched to Ant Design Collapse (multiple sections could be expanded simultaneously, but scrolling was global and heights were fixed). Neither approach made it easy to view input parameters and variable state at the same time.

## Decision

Replace Ant Design Collapse with a custom flex accordion:
- Each section has a header (fixed height 26px) plus content (scrolls independently)
- When multiple sections are expanded, remaining height is distributed by flex weight
- A draggable divider sits between adjacent expanded sections (similar to the VSCode Explorer)
- Collapsed sections sink to the bottom; expanded sections automatically fill the available space

Sections covered: scenes, inputs, variables, equations, schedules, optimizer (opt mode only).

## Consequences

- No global scrollbar; each module scrolls independently
- Any two modules can be viewed at the same time
- Dragging adjusts the height ratio between modules, approaching VSCode's level of comfort
- The implementation is fairly complex, roughly 80 lines of custom flex logic
- Flex weights preserve their ratio as container height changes, but pixel heights still shift with the window
