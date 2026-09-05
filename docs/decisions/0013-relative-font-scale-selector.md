# 0013 — Relative font-scale system + font-size selector

**Status**: implemented
**Date**: 2026-04-05

## Background

Both applications previously had a large number of hardcoded font sizes (`fontSize: 12`, `fontSize: 16`, etc.), which caused:
1. Font sizes could not be adjusted uniformly, so the desktop and mobile experience diverged sharply
2. Design changes required editing sizes one by one, which was easy to miss
3. `sim_gui` once had a font-size dropdown selector, which was later removed (ADR 0008) and needed to be restored in a better form

## Decision

### 1. The `makeFontScale(base)` arithmetic-offset system

Anchored on a base font size `base` (default 16px), all font sizes are defined by an offset from it:

```typescript
function makeFontScale(base: number) {
  return {
    xs:   base - 5,   // helper text, badges
    sm:   base - 3,   // secondary labels, buttons
    md:   base,       // body text
    lg:   base + 2,   // subheadings
    xl:   base + 4,   // headings
    card: base + 8,   // card names (emphasized, low information density)
    eff:  base - 1,   // card effect text (compact)
  };
}
```

Offsets were chosen over ratios (e.g. `base * 1.2`) because offsets stay more linear across small font-size changes and are easier to reason about mentally — a designer can directly think "3px smaller than body text."

The card font size is deliberately set to `base + 8` (much larger than body text), since a card game requires the card name to be readable at a glance, with little but precise information.

### 2. The three-step font selector `FontSizer`

Replaces the old dropdown list with three "A" buttons of increasing visual size:

```
[A]  [A]  [A]
14   16   18
```

- Clicking switches immediately, with the current step highlighted by the theme-color border
- The component is driven by three props: `fontSize`, `onFontSize`, `c` (color tokens)
- Both applications place it in the top toolbar's right-side area

### 3. State lifted to the App root component

`fontSize` state is lifted to the root `App` component in both applications, passed down via props, and persisted to `localStorage`:

- Game: stored under the `game_persist` key
- Sim: stored under the `sim_prefs` key

Ant Design ConfigProvider's `fontSize` token also changes dynamically, affecting the font size of all antd components.

## Consequences

- Any font-size adjustment only requires a single change, and all child components follow automatically
- The three-step selector is more intuitive than a dropdown, with a larger click target suited to touchscreens
- Persistence means user preferences survive a refresh
- `base - 5` (i.e. 9px) may be too small when base=14; a lower bound could be added later
- The card font size `base + 8` becomes 26px at base=18, which needs attention for line wrapping given the narrow card width (132px)
