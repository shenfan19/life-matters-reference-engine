# 0019 — Disclaimer: placement, content, and presentation

**Status**: implemented
**Date**: 2026-04-07

## Background

The project simulates health-related decisions involving real historical figures, and needs to state its academic purpose and boundaries of use to users at the appropriate points, while conforming to academic fair-use principles. Disclaimer text was previously scattered across code strings with no single source of truth, and some placements were missing it entirely.

## Decision

### 1. Placement (4 locations)

| Location | Trigger | Presentation |
|------|------|---------|
| Game first entry (`game/App.tsx`) | First time opening the app, no acceptance record in `localStorage` | Full-screen overlay, dismissed only by clicking confirm, recorded permanently |
| Game story entry (`CardGame.tsx`) | Every time a new story is entered | Full-screen overlay, dismissed by clicking "Start Story" |
| Game About dialog (`AboutModal.tsx`) | Clicking the ⓘ icon | A block at the bottom of the dialog, separated by a divider |
| Sim About dialog (`sim_gui/App.tsx`) | Clicking the ⓘ icon | A block at the bottom of the dialog, separated by a divider |

### 2. Content structure

All locations use the same three-part structure uniformly, sourced from locale keys:

```
disclaimer.title  — title: "Disclaimer"
disclaimer.intro  — a one-sentence summary
disclaimer.points — four bullet points (array)
```

The four points:
1. All simulated content does not represent a moral judgment of any historical figure
2. Historical data has been simplified and does not constitute medical advice
3. Scenarios involving real people are for educational purposes and conform to academic fair-use principles
4. Game/simulation results are model projections, not a reconstruction of historical fact

### 3. Presentation rules

- The **title font size** is larger than body text, without an uppercase small-caps style
- **No bordered box** wraps the disclaimer block; in the About dialog, a `borderTop` divider separates it from the author-info area
- Bullets use `·` (a centered dot), not `•` (a filled circle)
- The status bar at the bottom keeps a single short line (`statusBar.disclaimer`) as a persistent reminder

### 4. Locale file locations

The files actually served live under each application's `public/locales/` directory, **not** the root-level `locales/`:

```
game/public/locales/game/{en,zh-CN,zh-TW}.json
sim_gui/public/locales/sim/{en,zh-CN,zh-TW}.json
```

The root-level `locales/` directory is a backup/reference and is not served by Vite.

## Consequences

- Users must actively confirm the disclaimer before first use
- It appears again on entering each story, catching occasional users
- The About dialog serves as a permanently accessible reference
- All text is managed through i18n, covering English, Simplified Chinese, and Traditional Chinese
