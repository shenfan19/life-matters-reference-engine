# ADR 0122 — Report export rework and per-plan PNG download

**Date**: 2026-07-02
**Status**: Accepted
**Scope**: gui / `SimControlBar`, `OptControlBar`, `ReportButton`, `SimPlotTab`, `SimChart`, `Simulator/index`

---

## Background

The original report button lived on the Overview tab, injected into the toolbar via `createPortal`. After Overview and Report were merged into a single tab (`SimIntroTab`), three problems emerged:

1. **No simulation curves on Overview**: `SimIntroTab` only lists variable names, without rendering charts; meanwhile, after an opt workflow finishes, `simulationData` is empty, so Overview keeps showing "No data."
2. **Awkward report button placement**: users had to switch back to Overview just to export a report, an unintuitive path.
3. **The MD export embeds a giant base64 string**: PNG images are embedded as `data:image/png;base64,...`, which fails to render in any standard Markdown viewer (GitHub, Obsidian, etc.), appearing as garbled text.

---

## Decision

### 1. Extract the report button into a shared component, mounted into the toolbar via a slot

A new `ReportButton.tsx` was created, containing all export logic (Markdown generation, HTML generation, ZIP packaging). Both `SimControlBar` and `OptControlBar` gained a `reportButton?: React.ReactNode` slot prop. `Simulator/index` builds the `reportButton` element at the top level and passes it down uniformly, rather than maintaining it inside `SimIntroTab`.

**Rejected approach**: keeping two separate export implementations (one for the sim side, one for the opt side) — this caused code duplication and inconsistent behavior.

### 2. Three-tier fallback for `effectiveSimData`

The data used by Overview and the report falls back in this priority order:

```
simulationData (the current simulation result)
  → the last entry of importedSimRuns (a historically archived simulation)
  → the first plan with data in comparedPlans (a Pareto-solution simulation)
```

The third tier is key for the opt workflow: after opt completes, `simulationData` is always empty, and the Pareto solution's trajectory lives in `comparedPlans`; without this fallback, Overview and the report would always show "No data" in opt scenarios.

### 3. MD export switched to a ZIP (report.md + an images/ directory)

| Format | Behavior |
|------|------|
| **HTML preview** | Opened in a new tab, images embedded as base64, a self-contained single file, no change needed |
| **MD export** | Downloads a `.zip` containing `report.md` (referencing images by relative path) plus an `images/` directory (PNG files) |

The Markdown standard does not support base64 data URLs (GitHub, Obsidian, VS Code, etc. all fail to render them). A ZIP with relative paths is the only universal approach that makes an MD file display images correctly in any viewer.

### 4. Images generated per variable × per plan, not overlaid

The original approach overlaid every plan's curve onto a single chart with an accompanying legend.

**Reason for rejecting this**: plan names (e.g. `Sim 2026-05-01 · 1h`) are long, so the legend inside the chart takes up more area than the chart itself, severely hurting readability; overlaying multiple curves suits an interactive interface (which has hover tooltips), not a static exported image.

**Adopted approach**:
- Generate one PNG per variable × per plan.
- The filename directly reflects the plan name: `{varName}_{planLabel}.png`.
- With multiple plans, a `**— Plan name —**` separator is inserted in the MD before each image.

`varToDataUrl` gained a `planDatasets?: PlanResult[]` parameter: when a single plan is passed in, it draws a single curve using that plan's color; the legend is only enabled when 2+ plans are passed in for a one-shot overlay of all plans (a path not currently taken).

### 5. Per-variable PNG download button placed in the SimPlotTab Collapse extra slot

All `SimChart` instances render in `hideTitleBar` mode (both SimPlotTab and SimIntroTab), so `SimChart`'s internal title-bar download button is not visible to users. The Collapse panel title row's `extra` slot is where the user actually sees the CSV button, so the PNG button should sit alongside CSV there.

A new `exportVarPNG(varName, colorIndex)` function was added:

- **Single plan**: downloads `{varName}.png` directly.
- **Multiple plans**: downloads `{varName}_charts.zip`, with one PNG per plan (each independent, not overlaid).

---

## Outcome

- `ReportButton.tsx` (new file): contains `buildChartImages()`, `buildMd(sources)`, `buildHtml(md)`, and the JSZip packaging logic.
- `SimControlBar.tsx` / `OptControlBar.tsx`: gained a `reportButton?` slot.
- `SimPlotTab.tsx`: gained `exportVarPNG`; the Collapse extra slot now shows both `[PNG]` and `[CSV]` buttons.
- `SimChart.tsx`: `varToDataUrl` gained a `planDatasets?` parameter, with the early-return condition fixed (`activePlans.length === 0 && data.length === 0`); for a single plan, its plan data is now also passed into `drawChartOnCtx` to use the correct plan color.
- `Simulator/index.tsx`: computes `reportPlanDatasets` (mirroring SimPlotTab's comparedPlans assembly logic) and `effectiveSimData`.

---

## Open items

- PNG export for the Pareto scatter plot (SimOptTab) is not yet implemented; a follow-up should add the same PNG button at the same location (next to the chart title) on the Pareto chart component.
