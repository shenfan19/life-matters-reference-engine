# 0007 — Unifying the Sim / Game title bar

**Status**: implemented
**Date**: 2026-04-04

## Background

`sim_gui` (port 5173) and `game` (port 5174) are two sub-applications of the same product, but their title bars were inconsistent:

- Sim has a full title bar: the LM logo, the "Life Matters" main title, page navigation, language selection, and dark/light toggle.
- Game's CardGame page (during play) has a minimal title bar with only the LM waveform logo, the current story name, and a back button, lacking language and dark/light controls.
- Game's StorySelect page (level selection) already has a full title bar, but CardGame did not inherit it.

## Decision

Align the CardGame title bar with StorySelect by adding:
- the LM waveform logo + "Life Matters" main title (`Georgia` font, 20px)
- a vertical divider
- the current story name (already present, adjusted to the secondary color `textSec`) + the time period (already present)
- on the right: a back button, a language `<select>`, and a dark/light toggle button

Title bar height is unified from 42px to 50px, matching StorySelect.

Implementation: `App.tsx` adds an `onToggleDark` prop passed into CardGame; inside CardGame, `setLanguage` is obtained through the existing `useI18n()` hook, so no additional prop is needed.

## Consequences

- Users moving from the level-select page into a game see a visually consistent title bar and can switch language or theme at any time
- No additional state lifting is required; CardGame manages its own language switching
- Switching language mid-game does not reset game state (the `langAtLoad` ref keeps the language fixed at load time), but the UI text updates immediately
