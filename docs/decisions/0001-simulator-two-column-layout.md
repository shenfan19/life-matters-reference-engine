# 0001 — Simulator two-column layout and multi-chart scheme

**Status**: implemented
**Date**: 2026-03-28

## Background

The old three-column layout (scene tree | single chart | right-side parameter tabs) had several problems:
- The 280px right panel had insufficient space for optimizer parameters (variable ranges × N + objectives + constraints + algorithm)
- Overlaying multiple variables on a single chart made it impossible to compare cleanly across different units
- Font scaling (`zoom: fontSize/16`) made the fixed-pixel column layout unstable

## Decision

Switch to a two-column layout: left column (380px, resizable) + center column (flex). The right panel is folded into the left-side tabs. Each output variable in the center gets its own chart (SimChart), with its own Y axis and CSV export.

## Consequences

- Sufficient space for parameters, so optimizer configuration can expand fully
- Each chart has an independent unit, making precise verification easier
- Multiple charts stack vertically, requiring scrolling when there are many variables
- Cross-variable comparison now requires visual estimation rather than being immediate on an overlaid chart
