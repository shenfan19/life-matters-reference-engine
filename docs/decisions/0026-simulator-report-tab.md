# 0026 — Simulator report tab: left-column checkboxes + right-side collapsible preview

**Status**: implemented (DOCX export is a placeholder, to follow)
**Date**: 2026-04-13
**Author**: shenfan19

---

## Background

After a simulation finishes, users need to assemble the results into a document for sharing or archiving. The existing workflow required manually taking screenshots of charts and the console and pasting them together, with no structured export path.

Requirements:
- Selectable output sections (not everyone needs the full report)
- A way to preview content before export, to confirm the data is correct
- Support for at least one open format that requires no additional tools

## Decision

Add a third tab, "Report," to the simulator's center column, after "Configuration" and "Charts."

### Layout structure

```
[ HTML preview ] [ ↓ export .md ] [ ↓ export .docx (pending) ]  ← top action bar
─────────────────────────────────────────────────────
Left column (fixed 168px)  │  Right side (scrollable)
Section checklist          │  Collapsible preview panel for selected sections
```

**Left column**: one checkbox row per section, highlighted with a green left border when selected. Checking a box adds the section to the export and auto-expands its preview on the right; unchecking does both in reverse. Disabled items ("Trajectory Data" when there is no simulation data, "Optimization Results" outside optimization mode) show a Tooltip explaining why, rather than a persistent warning banner.

**Right-side collapsible panel**: each selected section has a collapsible card. The header row shows the section name and a count summary (e.g. "Variable Summary · 12 items"); expanding it renders a formatted table/list (not raw markdown), and the summary remains readable when collapsed. The collapsed state is decoupled from the checked state: a section can be checked but not expanded, or expanded but not checked (in which case it is not exported).

### Optional sections

| Section | Content | Disabled when |
|------|------|----------|
| Model Overview | Name, description, tags, variable/equation counts | never |
| Simulation Configuration | Duration, step size, batch size, input parameter table | never |
| Variable Summary | All variables: type, initial value, final value, unit | never |
| Equation List | Equation name, activation condition, affected variables | never |
| Trajectory Data | Sampled time series (roughly 15-20 rows) | simulation not completed |
| Optimization Results | Objective function, constraints, algorithm parameters | not in optimization mode |

Checked by default: Model Overview, Simulation Configuration, Variable Summary, Trajectory Data.

### Export formats

**Markdown (implemented)**: downloaded directly as a browser Blob, with the filename auto-generated as `report_<model-name>_<timestamp>.md`. No backend needed, no path selection needed.

**HTML preview (implemented)**: opened via `window.open()` in a new tab, writing an HTML string with inline styles. Nothing is saved to disk; it clears when closed.

**DOCX (placeholder, pending)**: the button exists but is disabled, with a Tooltip saying "in development." Planned to be implemented on the backend with `python-docx`, with the API path reserved as `/api/report/export-docx`.

## Design tradeoffs

**Why Markdown instead of DOCX directly**: MD has no dependencies, can be generated entirely on the front end, opens in any editor, and can be converted to PDF/DOCX. DOCX is more formal but needs backend support, making it a better fit as a later extension.

**Collapsible preview instead of a single large text box**: the prototype version used a `<pre>` block to display raw markdown. The problem: with a lot of content, it was hard to scan and impossible to quickly check whether a given section was correct. The collapsible panel lets users expand sections on demand, and a summary badge lets them judge whether a section has content even while collapsed.

**Tooltip instead of a persistent warning banner**: a hint like "run a simulation first" is only useful when the user hovers over the disabled item. Displaying it permanently on the page creates visual noise, and it would remain confusingly visible even after the simulation completes.
