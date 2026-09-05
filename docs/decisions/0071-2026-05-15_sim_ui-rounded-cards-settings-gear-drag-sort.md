# 0071 · Global rounded-card panels + settings-gear popover + drag-to-reorder sections

**Date**: 2026-05-15
**Status**: ✅ Implemented
**Category**: GUI / interaction design

---

## Background

The collapsible sections in SimSetupTab (the left input panel), SimOptTab (the optimization result area), and SimIntroTab (the Overview area) all used a flat `borderBottom: 1px solid` divider style — there was no visual boundary between sections, expanded content blurred into the neighboring section, and users had trouble focusing on the section they were working in.

The three settings controls in the top right (font-size selector, language dropdown, dark-mode toggle) sat permanently side by side in the title bar, taking up horizontal space; font size and language are low-frequency preferences that don't need to stay always visible.

SimSetupTab's section order was fixed, so users couldn't rearrange it to match their own workflow (e.g., checking Optimizer settings before Inputs).

---

## Decision

### 1. Global rounded-card panels

Every collapsible section (the `Section` component) is uniformly replaced with a standalone rounded card:

```
borderRadius: 10px
border: 1px solid c.border
boxShadow: dark 0 1px 5px rgba(0,0,0,0.35) / light 0 1px 4px rgba(0,0,0,0.08)
overflow: hidden
background: c.panel
```

The card container changes from `display: flex; flexDirection: column` (height-split) to a scrolling list:

```
overflowY: auto
padding: 8px
gap: 8px
```

Collapsed sections appear as rounded pills, expanded ones as full cards, with 8px of gap between cards giving a clear Gestalt grouping boundary.

**Scope**: the `Section` component within `SimSetupTab`, `SimOptTab`, and `SimIntroTab`, and each of their container divs. `SimOptTab`'s fixed top summary bar also drops its `borderBottom`.

### 2. Settings-gear popover

The title bar's right side becomes three controls:

```
[⚙ gear]  [🌙/☀ dark mode]  [ℹ About]
```

- The **dark-mode toggle** stays outside because it's the highest-frequency control in demos/real use
- The **font-size selector** (12 / 14 / 16 px) and **language dropdown** (EN / Simplified Chinese / Traditional Chinese / French) move into a `Popover` triggered by the gear icon (`trigger: "click"`, `placement: "bottomRight"`)
- The popover content has two rows: row one is "font size + a three-button group," row two is "language + select"

Uses antd's `Popover` + `SettingOutlined` icon, requiring no extra state management (Popover manages its own open state).

### 3. Drag-to-reorder sections (SimSetupTab)

SimSetupTab's sections can be freely reordered by dragging (only reordering vertically within the same column, not across columns):

- Introduces `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- Each card header gets a `HolderOutlined` (⠿) grip icon on the left
- Drag activation threshold: a drag only starts after 6px of movement (prevents an accidental click from triggering a drag)
- The grip's click handler calls `stopPropagation` so it doesn't affect collapse/expand
- Order state lives in `SimSetupTab`'s local state (`tabOrder`), and resets to the default order automatically on a mode switch (sim ↔ opt)
- The old height-split drag-resize (`startSectionResize`) is removed along with the new card layout; the `sectionWeights` / `SECTION_H` props keep their interface but are no longer used

---

## Rejected approaches

| Approach | Reason for rejection |
|------|---------|
| Free multi-column drag (Grafana-style) | chart components are width-sensitive, rendering poorly when dragged into a narrower column; implementation complexity of 400+ lines |
| A column-count toggle (1-column/2-column) | low flexibility, less intuitive than drag-reordering |
| Also moving font size/language into the gear, and dark mode too | dark mode is a high-frequency demo action; tucking it away lengthens the path too much |
| Persisting section order to localStorage | only 2 sections at present, limited benefit; mode-switch reset logic would get complicated |

---

## Files affected

| File | Change |
|------|------|
| `sim_gui/src/App.tsx` | TitleBar: removes the permanent FontSizer and language-select controls; adds `SettingOutlined` + `Popover`; the popover embeds the font-size button group and language dropdown |
| `sim_gui/src/components/SimSetupTab.tsx` | `Section` becomes a card; container becomes scroll + gap; introduces dnd-kit for reordering; `SortableCard` subcomponent; removes `startSectionResize` |
| `sim_gui/src/components/SimOptTab.tsx` | `Section` becomes a card; container gets `padding: 8, gap: 8`; top summary bar drops `borderBottom` |
| `sim_gui/src/components/SimIntroTab.tsx` | `Section` becomes a card; container gets `padding: 8, gap: 8` |
| `sim_gui/package.json` | adds dependencies `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
