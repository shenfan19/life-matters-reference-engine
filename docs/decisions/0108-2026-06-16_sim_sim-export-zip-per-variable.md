# ADR 0108 — Sim Export Redesign: a Per-Variable-CSV ZIP Bundle for Multi-Plan Output

**Date:** 2026-06-16
**Status:** Implemented
**Context:** sim_gui — the Sim tab control-bar download button
**Revises:** ADR 0094 (the Sim export-behavior part)

---

## Background

The Sim CSV export designed by ADR 0094 read from `state.simulationData` (the currently running time series).
ADR 0073/0076 subsequently introduced multi-plan simulation: once a user runs "Run All Plans," the data moves into `comparedPlans`, and `simulationData` gets cleared.
This produced a bug: **clicking the download button did nothing** (`simulationData.length === 0`, and the function returned early).

In addition, the "Export Result CSV" button in the summary bar was a redundant entry point left over from before ADR 0094, overlapping with the control-bar button.

---

## Decision

### 1. Data scope: cover all plans, including imported runs

The export function was moved from `useSimulation` into `Simulator.tsx`, where the full dataset is accessible:

- `simulationData` (the current run)
- `comparedPlans` (results from Run All Plans)
- `importedSimRuns` (historical curves imported from CSV)

The combination logic exactly matches the `comparedPlans` prop received by SimPlotTab.

### 2. Export format branches automatically on plan count

| Case | Format | Filename |
|------|------|--------|
| No comparison curves (single plan) | Wide-format CSV, columns = `step, time, var1, var2 …` | `modelName_startDate_endDate.csv` |
| Comparison curves present (multiple plans) | ZIP, one CSV per variable | `modelName_startDate_endDate.zip` |

Multi-plan CSV format (one file per variable):

```
time_s,time_h,Plan A label,Plan B label,…
0,0.0000,5.0,4.8,…
3600,1.0000,5.2,5.1,…
```

Rationale: all plan curves for the same variable are gathered into one file, so they can be compared directly side by side in Excel/pandas without any manual merging.

### 3. Button state

The download button's disabled condition was tightened from `!selectedModel` to `!selectedModel || !hasSimData`, where
`hasSimData = simulationData.length > 0 || comparedPlans.some(p => p.data.length > 0) || importedSimRuns.length > 0`.

### 4. Remove the redundant download button in the summary bar

The "Export Result CSV" button at the top of SimPlotTab's summary bar was removed;
the per-variable download button inside each variable's Collapse panel (`exportVarCSV`) is unchanged.

---

## Implementation

- `sim_gui/src/components/Simulator.tsx`: added `handleExportSimCSV`; introduced `fflate` for ZIP creation
- `sim_gui/src/components/sim_tab/useSimulation.ts`: removed `exportSimCSV`
- `sim_gui/src/components/sim_tab/SimControlBar.tsx`: added the `hasSimData` prop
- `sim_gui/src/components/sim_tab/SimPlotTab.tsx`: removed the `onExportCSV` prop and the summary-bar button
- `sim_gui/package.json`: added the `fflate ^0.8` dependency

---

## Impact

- Single-plan users: no perceptible change, download behavior is the same as before
- Multi-plan users: upgraded from "can only download the current run" to "one click downloads the full comparison data across all plans"
- File format: for multiple plans, the format changes from `.csv` to `.zip`, unzipping into one CSV per variable
