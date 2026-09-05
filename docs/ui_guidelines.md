# Global UI/UX Design Guidelines

> This file is the global design convention for both frontend applications, gui and game.  
> All new components, new pages, and new features should follow the rules below.  
> **Priority**: this file > local component comments > personal preference.

---

## 1. Responsive layout — width-adaptive, overflow forbidden

### 1.0 The Global Full-Width Rule

**Every tab's content area and every navigation/control bar must fill 100% of its parent container's width; relying on shrink-to-content is not allowed.**

- **A tab's content area** (Overview / Simulation / Optimization / Report, and any new tab): the outer container must explicitly set `width: '100%'`, not rely on flex-column's default stretch behavior (which can fail across different browsers/nesting levels).
- **The top navigation/tab bar**: likewise must have `width: '100%'`, ensuring the `borderBottom` line spans the full width rather than only the tab-button area.
- **A control bar (toolbar)**: a `flexShrink: 0` toolbar such as SimControls or OptControls must also declare `width: '100%'`, rather than relying solely on the parent's flex-stretch.
- **A split-column layout** (e.g. a setup-plus-result two-column layout): column widths use `flex: '0 0 X%'` (e.g. `'0 0 40%'` / `'0 0 60%'`), not fixed pixels; both columns must set `minWidth: 0` to prevent a flex child's minimum-width constraint from breaking out of the container; the row container must use symmetric `padding: '6px 10px'`, and a single-sided padding plus child-compensation approach is forbidden. See ADR 0079 for detail.
- **A flex item must declare `flex: 1` or `width: 100%`**: without `flex: 1`, a flex item in a row-flex parent degenerates to its intrinsic content width, causing the whole component to shrink with its content. Any top-level container inside a row-flex parent (such as the Simulator's root div) must explicitly set `flex: 1, minWidth: 0`.
- **Acceptance criterion**: at any screen width, every tab's bottom divider line and toolbar background should span the entire central panel's width, with no unexplained blank space on the right.

- **Every content area must support wrapping**: a row of inline elements uses `display: flex; flexWrap: 'wrap'`, not a fixed-width single-row layout.
- **A toolbar**: must add `flexWrap: 'wrap'`, so buttons/controls wrap automatically on a narrow screen, with no horizontal scrollbar allowed.
- **A three-column/multi-column block layout**: use `flex-grow` ratios (e.g. 3:3:4) with a `minWidth` fallback, collapsing to a single column automatically on a narrow screen.
- **Forbidden**: constraining the overall content area with a fixed pixel width (such as a centered `maxWidth: 800px` layout) — it should fill the full width.
- **Input controls**: a text box, date box, etc. should use `flex: 1` or a `minWidth` plus `flex-grow` combination, never a hardcoded width.

### 1.1 Control width and multilingual adaptiveness

- **The mature approach**: don't guess text length with a fixed pixel width; prefer `minWidth`, `width: 'max-content'` / `fit-content`, `ch` units, `flex: '1 1 auto'`, and a `flexWrap: 'wrap'` container.
- **Select / Segmented / Button**: when a label comes from i18n, the width must accommodate the longest option. Use `minWidth` as a fallback, letting the control grow with its content; hardcoding an overly narrow width for a unit, mode, or enum option (e.g. `width: 62`) is forbidden.
- **A number-plus-unit combination**: a number box uses `ch` units to express the expected digit count, e.g. `width: '7ch'`; a unit-selection box uses `minWidth: '9ch'` or more, and may use `width: 'max-content'`.
- **Date / time / ID**: a date box uses a semantic width of about `12ch`, a time box about `7ch`; a technical ID may be elided but must have a `title` or `Tooltip` showing the full value.
- **A compact toolbar**: a control group should set `flexShrink: 0`, and the parent container must have `flexWrap: 'wrap'`. Wrap when space is insufficient, rather than compressing text to the point of unreadability.
- **Tables / lists**: ellipsis may be used in a display-only column; an editable control must never become unobservable or unmodifiable due to eliding its current value.
- **Acceptance criterion**: check both Chinese and English; the longest label is never truncated, an input's value can always be fully observed, and controls wrap rather than overflow horizontally on a narrow screen.

---

## 2. Color — restrained, semantic, no more than 5 functional colors

- **Primary color**: used only for the main action button, emphasis highlights, and a selected state. One app uses one primary color.
  - gui: a green family (`#007A33` / `#52c41a`)
  - game: refer to the primary-color token `c.primary`
- **Functional colors** (at most 4, each with a clear meaning):
  - Danger/error: red (antd `danger`)
  - Warning: orange/yellow (antd `warning`)
  - Success: green (antd `success`)
  - Info: blue (antd `processing`)
- **Forbidden**: using more than 5 different Tag/Badge colors on the same page; using color to distinguish "peer-level" content — use position and layout instead.
- **Background/border/text** use token variables (`c.panel`, `c.border`, `c.text`, `c.textMute`, `c.textSec`); hardcoding a color string is forbidden.

### 2.1 The Interactive State Color Rule

**Core principle: green = active/selected, gray = unselected, red = danger**

| State | Foreground | Background | Border/underline |
|------|--------|--------|------------|
| Active/selected | `c.primary` | `c.activeBg` | `c.primary` |
| Hovered but not selected | `c.text` | `c.navHover` | none |
| Inactive | `c.textSec` | transparent | none or `c.border` |
| Disabled | `c.textMute` | transparent | `c.border` (lowered opacity) |

**Token values** (defined in `getC(isDark)` / the `C` object):

| Token | Dark | Light |
|-------|-----------|------------|
| `c.primary` | `#52c41a` | `#007A33` |
| `c.activeBg` | `#1a3a22` | `#e8f5e9` |
| `c.navHover` | `rgba(82,196,26,0.08)` | `rgba(0,122,51,0.06)` |

**Scope of application (any element representing "currently active" must follow this)**:
- A central-panel tab (Overview / Simulation / Optimization / Report, and a dynamic Builder tab)
- A mode-switch control (the Sim / Opt Segmented control)
- A selected node in the left tree (the Tree's `nodeSelectedBg`)
- A selected tab on the left (Inputs / Vars / Equations)
- A small pill toggle button (an hour/day/range toggle)

**Out of scope (the following elements do not use the primary color; use `c.border` / `c.panel` uniformly)**:
- A list item / data row (such as an input event card, a variable row, an equation row) — these are data display, not a navigation state
- A field's value within a data row (such as `optimizeValue=true`) should not turn the whole row green; the opt state is expressed by the row's own checkbox

**Forbidden**:
- Using a gray background (such as `#2a2a2a`) to represent a "selected" state
- Using green to represent a danger/delete action (reserved for `danger` red)
- Hardcoding a selection color directly outside the antd ConfigProvider
- Highlighting a data row/list item with the primary color (a data row always uses `c.border` plus `c.panel`)

**The corresponding antd ConfigProvider configuration** (`academicTheme.components`):
```js
Segmented: {
  itemSelectedBg:    isDark ? '#1a3a22' : '#e8f5e9',  // c.activeBg
  itemSelectedColor: isDark ? '#52c41a' : '#007A33',  // c.primary
  trackBg:           isDark ? '#1a1a1a' : '#f0f0f0',
},
Tree: {
  nodeSelectedBg:  isDark ? '#1a3a22' : '#e8f5e9',    // c.activeBg
  nodeHoverBg:     isDark ? 'rgba(82,196,26,0.08)' : 'rgba(0,122,51,0.06)',
},
Tabs: {
  itemSelectedColor: c.primary, inkBarColor: c.primary,
},
```

---

## 3. Light/dark mode — fully compatible, no hardcoded colors

- Every color must come through an `isDarkMode` condition or the color-token object `c`; hardcoding `#ffffff`, `#000000`, `#333`, etc. is forbidden.
- Text contrast: under dark mode, body text >= 4.5:1, large headings >= 3:1 (the WCAG AA standard).
- Background layering: distinguish at least three layers (`c.bg` the page background -> `c.panel` a panel -> `c.inputBg` an input area), distinguished by lightness difference (not hue).
- Icons, borders, and dividers all use tokens, avoiding a case visible only in light mode and disappearing in dark mode.
- Testing principle: after finishing each new component, take a screenshot in both light and dark mode and visually check contrast.

---

## 4. Typography — professional, with moderate information density

- **Base font size**: 14px (already the gui default). Body content is never smaller than 12px, an annotation/auxiliary note never smaller than 11px, and using a font size below 10px for formal content is forbidden.
- **Monospace font**: a value, variable name, code, ID, date, time, or other technical content must use `fontFamily: 'monospace'`.
- **Font-weight hierarchy**:
  - A main heading: 700 (bold)
  - A subheading/group label: 600 (semibold)
  - Body text: 400 (normal)
  - An auxiliary note: 400 plus the `c.textMute` color
- **Line height**: body text 1.5, a compact list 1.3, a table cell 1.2.
- **An all-caps label** (such as a section header): pair it with `letterSpacing: '0.08em'`, a font size <= 11px, and the `c.textMute` color.
- **Forbidden**: more than 3 different font sizes appearing on the same page at once; using italics for emphasis (Chinese italics look bad and hurt readability).

---

## 5. Multilingual support (i18n) — every user-visible string must be internationalized

- **Principle**: a component must not contain a hardcoded Chinese or English user-visible string (button text, a label, a hint, etc.); always fetch it via `t('key')`.
- **Exception**: technical content (a variable name, a unit symbol, a math symbol such as `~` or `->`) needs no translation.
- **A new component**: add the corresponding key to `gui/public/locales/zh-CN.json` and `en-US.json` first, then reference it in the component.
- **A placeholder**: when a translation key hasn't been added yet, degrade with `t('key') || 'a default in Chinese'`; never hardcode Chinese directly.
- **Language switching**: should take effect live (no page refresh needed). The UI layout must display correctly at both Chinese and English text lengths (English is typically 30-50% longer than Chinese).

---

## 6. Time and date input — a unified YYYY-MM-DD date range

- **A simulation time range**: expressed as "a start date to an end date" (`YYYY-MM-DD ~ YYYY-MM-DD`), not an "N hours/days/months/years" quantity-plus-unit combination.
- **A regimen's validity period**: the same, start and end dates side by side, separated by `~`.
- **Step size**: still a number plus a unit (minute/hour/day), because step size is a computational-precision parameter, unrelated to the calendar.
- **A date input box**: use an antd `Input` (text type), with a placeholder of `YYYY-MM-DD`, `fontFamily: 'monospace'`.
- **Time calculation**: `time_hours = (Date(end) - Date(start)) / 3_600_000`, with a negative or zero value treated as invalid, clamped to a minimum by the backend.

---

## 7. Component design principles — simple, local, composable

- **Each component does one thing**: don't mix "configuration" and "result display" in the same Card.
- **State-lifting principle**: state shared across multiple components is lifted to their nearest common ancestor; don't use global state management (Redux/Zustand) unless truly necessary.
- **Persistence principle**: a choice the user actively makes (a dropdown option, an axis/grouping toggle, a filter condition, a view configuration, etc.) should by default be treated as needing to "survive a page refresh, and survive switching models and switching back" — it cannot be stored only in a component's `useState`, since a component remounting or a page refresh would silently revert this kind of state to its default, which the user perceives as "my settings got lost." gui already has a mechanism in place for this: fold it into the existing per-model session persistence (the `ModelSession` type in `types.ts` plus `localStorage`'s `lm_model_sessions`, chained through `useSession.ts` / `usePersistedUI.ts` / `useModelInit.ts`: defining the field, writing it persistently, and restoring it session-first/YAML-fallback when a model loads); when adding a new selectable/configurable state, extend this same chain directly rather than starting a new, non-persistent local state. If game has no equivalent mechanism, build an equivalent persistence channel following the same principle.
  - Exception: a genuinely transient display state need not be persisted, such as a hover tooltip, a drag intermediate state, or a loading spinner.
- **A delete action**: use a red icon button (`danger`); a confirmation dialog is not required (a low-risk operation), but the action must be undoable or re-addable.
- **An empty state**: every list/data area must show `<Empty>` when there is no data; a blank area is not allowed.
- **A loading state**: an API request must show loading feedback (`Spin` or a skeleton) while in flight; silently waiting is not allowed.
- **A collapsible sidebar**: a sidebar (such as the left model library) must support collapse/expand, and **the button that expands it must remain visible while collapsed** — typically placed in a fixed area on the opposite side (such as the leftmost edge of the central tab bar), not inside the sidebar itself (which disappears once collapsed). The collapsed state uses a directional arrow icon (`◀`/`▶`) paired with a Tooltip explaining its function.

---

## 8. Spacing and density — fairly high information density, with necessary breathing room

- **Padding inside a component**: `8px 12px` inside a card, `6px 8px` inside a compact card.
- **Gap between components**: `gap: 4~8px` for controls on the same row; `gap: 12~16px` between different sections; `gap: 8~12px` between top-level areas.
- **Divider versus gap**: when two columns/blocks of content already have their own rounded-corner frame, use `gap: 8px` instead of a `borderRight`/`borderBottom` divider; a divider is only for flat content with no frame.
- **A divider**: use `1px solid c.border` between related content groups; don't use a thick line or a color block as a divider.
- **Card corner radius**: `borderRadius: 8px` for an outer card, `borderRadius: 6px` for a nested block, `borderRadius: 4px` for a small tag.

---

## 9. Interaction feedback — timely, clear, unobtrusive

- **A successful action**: use `message.success()`, lasting 2s, non-blocking.
- **A failed action**: use `message.error()` or an `Alert` (an `Alert` for a persistent error), giving the specific reason — never just say "failed."
- **Progress**: a long-running operation (over 1s) must have a progress bar or a spinner.
- **A disabled state**: a disabled button must be visually distinct (lowered opacity or grayed out), with the reason explained in a `Tooltip`.
- **A hover hint**: an icon button (one with no text label) must have a `Tooltip` explaining its function.

---

## 10. Other conventions

- **Emoji**: never use an emoji as a functional icon in the UI; use an antd icon or SVG uniformly. (Emoji are fine in documentation/comments.)
- **Animation**: use only for a state transition (expand/collapse, a progress bar); never for pure decoration. A transition should last 150-300ms.
- **z-index**: Tooltip/Popover 100; Modal 200; a global Toast 300; never use `z-index: 9999` arbitrarily.
- **Scrolling**: a content area sets `overflow: 'auto'`; page-level horizontal scrolling is forbidden; vertical scrolling is allowed but should have a visible indicator (don't hide the scrollbar).
