# ADR 0094 — Result Exchange: CSV as Universal Format, YAML as Unified Model Download

**Date:** 2026-06-05
**Status:** Accepted (Sim's export behavior revised by ADR 0108)
**Context:** sim_gui — Sim tab, Opt tab, CLI

---

## Context

Users need to compare simulation results across different configurations (step sizes, parameter sets) and reuse optimizer results across sessions. Two related features were being explained as separate concepts: "multi-curve overlay" in Sim and "warm-start" in Opt. This caused unnecessary cognitive load.

The underlying mechanism is the same in both cases: importing a CSV file brings external results into the current session, and each tab responds naturally to that data.

---

## Decision

### 1. CSV is the universal result exchange format

Importing CSV has tab-specific consequences that follow naturally from what each tab does.

| Tab | Export CSV content | Import CSV → automatic consequence |
|-----|-------------------|-------------------------------------|
| Sim | Simulation time series | Adds a new labeled comparison curve |
| Opt | Optimization results (Pareto front) | Merges into the Pareto front, automatically enabling warm-start |
| CLI --sim | Auto `_sim.csv` | — |
| CLI --opt | Auto `_opt.csv` | `--continue [TIMESTAMP]` |

"Multi-curve comparison" and "warm-start" are not separate features — they are the natural, context-specific consequence of importing a CSV, requiring no separate learning.

### 2. Sim historical-curve auto-snapshot

Each time Run is clicked, if a completed simulation result already exists, the GUI automatically snapshots it into a labeled historical comparison curve, labeled `Sim {start date} · {step size}`. Curves imported from CSV go into the same list.

Each curve shows a × button in the legend for individually removing it. The list is cleared on model switch or reload.

This turns "compare step sizes" into: Run → change step size → Run → two curves automatically appear on the chart.

### 3. YAML download is unified across Sim and Opt tabs

Both tabs share the same session (`ModelSession`). The model download button behaves identically regardless of which tab the user is on:

- **Opt results present** → automatically writes the `optimizer.results` block into a copy and downloads it
- **No opt results** → downloads the original model YAML

The user learns what was downloaded (including the solution count, or "no optimization results") via a `message.success`. There's no need for the user to actively choose whether to include results — the session state is the source of truth.

**"Save results to the original file" is permanently removed.** The source YAML is never overwritten from the GUI. Results travel via CSV (exchange) or YAML Save As (archive/publish).

### 3. All file operations notify the user after completion

Every download/upload shows a `message.success` stating what was transferred and how much data:

| Operation | Notification example |
|-----------|----------------------|
| Model download (with results) | "Downloaded model (including 12 Pareto solutions)" |
| Model download (no results) | "Downloaded model (no optimization results)" |
| Simulation result export | "Downloaded simulation time series (1440 data points, CSV)" |
| Optimization result export | "Downloaded optimization results (20 Pareto solutions, CSV)" |
| Simulation result import | "Uploaded simulation time series '…' (1440 data points, added as a comparison curve)" |
| Optimization result import | "Imported N solutions, M total (warm-start enabled)" |

### 4. Toolbar button order (both tabs, end section)

```
Sim:  | Model↓ | ↓Sim | ↑Sim | Reload |
Opt:  | Model↓ | ↓Opt | ↑Opt | Reload |
```

- **Model↓** — YAML "Save As" (unified behavior, same on both tabs)
- **↓Sim / ↓Opt** — CSV export, with labels making the content type explicit (simulation time series vs. Pareto front)
- **↑Sim / ↑Opt** — CSV import, same labeling
- **Reload** — clears the session, resetting both simulation and optimization, and reloads the YAML defaults

Tooltips further explain the format (CSV/YAML) and the consequences of the action.

### 5. Reload mutual lock

Reloading clears both the simulation and optimization session state at once, so:

- **While a simulation is running (running / paused)** → the "Reload" button on the Opt toolbar is disabled, with the tooltip "Simulation is running, cannot reload"
- **While an optimization is running** → the "Reload" button on the Sim toolbar is disabled, with the tooltip "Optimization is running, cannot reload"

Both tabs share the same `ModelSession`, so reload is disallowed while either side is running, to prevent state from being torn apart.

---

## Consequences

### Removed
- `saveResultsToFile()` — directly overwrote the source file.
- The "Save Results" (SaveOutlined) button.
- The with/without-results Dropdown on the Opt YAML download (merged into a unified automatic behavior).

### Added
- Sim CSV import → labeled overlay curve (auto-snapshot on Run + CSV import share same list).
- Sim auto-snapshot: each new Run snapshots the previous completed result into the comparison list.
- × close button on each comparison curve; list clears on model switch or reload.
- Opt CSV export → Pareto front as CSV (symmetric with Sim).
- Sim Reload button (symmetric with Opt Reload).
- `message.success` notifications on all file operations.

### Unchanged
- Opt warm-start checkbox (low-level control; auto-enabled after CSV import).
- CLI behavior.
