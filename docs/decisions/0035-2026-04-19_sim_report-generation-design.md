# Sim Report Generation Design (ADR)
**Date**: 2026-04-19  
**Status**: implemented  
**Files touched**: `sim_gui/src/components/Simulator.tsx`

---

## Background

The Simulator's Report Tab originally had only a trajectory-data sample table and a model overview, lacking a complete academic-report structure. It needs to support exporting a standalone-shareable HTML preview and an .md file.

---

## Decision 1: report section order

**The fixed order**: introduction -> model overview -> equation list -> variable summary -> simulation configuration -> plot curves -> optimization results -> references

**Rationale**: equations and variables are the model's core definitions, taking priority over configuration parameters; the plot curves come after all the data presentation; references always come last. The simulation configuration is placed after variables because a configuration only makes sense once the variables' meanings are understood.

Each section can be individually checked off in the left checklist. Trajectory data is not a section; it becomes a standalone "↓ trajectory .csv" export button at the top instead (see Decision 3).

---

## Decision 2: the source of the meaning explanation

**The equation table** gains a "Meaning" column, reading YAML's `formulas[name].description`.  
**The variable table** gains a "Meaning" column, reading YAML's `variables[name].description`.  
**The simulation configuration**'s input parameters gain a "Meaning" column, looking up the corresponding variable's `description` from `variables`.

**Rationale**: the `description` field already exists in the YAML, so there is no need to maintain it separately; when the report has no description, it can trace back to the YAML to fill it in, forming a single source of truth.

---

## Decision 3: trajectory data downloads as a separate CSV

The full trajectory table is **not** embedded in the report; a "↓ trajectory .csv" button in the top action bar is used instead.

**Rationale**:
- Trajectory data can run to thousands of rows, and embedding it would bloat the file and hurt readability
- CSV is the standard format for data analysis, directly usable by downstream tools (Excel, Python, R)
- The report's audience is a reader (a person), while CSV's audience is a tool (a machine), so the responsibilities are kept separate

The CSV column-header format is `varName(description)`, preserving the meaning information.

---

## Decision 4: plot curves export as inline base64 PNGs

Both the HTML preview and the .md export embed images inline as `data:image/png;base64,…`, with no external file dependency.

**Rationale for choosing PNG over SVG**:
- Canvas's `toDataURL('image/png')` is a native API, needing no hand-written SVG generator
- The mainstream markdown renderers (VS Code, GitHub, Obsidian, Typora) all support base64 PNGs
- Self-contained in a single file, with no path issues when sharing

**Export resolution**: 680×160 px at 2x DPR, white background, fixed light mode (the report is aimed at printing/sharing scenarios).

### Implementation

The drawing logic inside SimChart is extracted into a module-level function `drawChartOnCtx(ctx, W, H, varName, data, isDark, lineColor)`, called by both:
- SimChart's `useEffect` (live drawing onto the DOM canvas)
- `varToDataUrl(varName, colorIndex)` (generating a PNG data URL on an offscreen canvas)

avoiding duplicated logic.

### A canvas first-render fix

When SimChart is conditionally rendered inside an accordion (`{isOpen && ...}`), `offsetWidth` is still 0 right after the canvas mounts, so an immediately-run `useEffect` produces a blank canvas. The fix: defer the drawing inside `useEffect` by one frame using `requestAnimationFrame`, drawing only after DOM layout has completed.

---

## Decision 5: an IEEE-numbered reference system

**Data sources** (three tiers, collected in display order):
1. `metadata.references` / `metadata.reference` (a model-wide reference)
2. `variables[name].reference` (a variable-level reference)
3. `formulas[name].reference` (an equation-level reference)

**Numbering rule**: numbered uniformly in order of first appearance, with automatic deduplication. Format: an inline `[N]` marker at the end of the Meaning column, with the full entries listed in a standalone `## References` section at the end.

**Format**: the IEEE numeric style `[1] Author et al. (Year) Title. Journal Vol(No):pp.` (the content comes from the raw YAML string, with no secondary formatting).

**When there is no reference**: a prompt is shown, guiding the user to fill in the corresponding YAML field.

---

## Decision 6: an accordion overlap fix

The Report section's custom accordion uses `flexDirection: column` plus `gap: 6`; on expand/collapse, the flex reflow caused adjacent items to briefly overlap. The fix: add `flexShrink: 0` to every accordion item, preventing flex from compressing it.

---

## Out of scope for this ADR

- DOCX export (not implemented, the button is a grayed-out placeholder)
- A multi-variable overlaid curve chart (currently each variable gets its own independent chart)
- BibTeX export of references
