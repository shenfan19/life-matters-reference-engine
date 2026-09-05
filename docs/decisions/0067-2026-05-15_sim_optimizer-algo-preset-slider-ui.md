# ADR 0067 — Optimizer Algorithm Parameter Presets and Slider UI

## Status

✅ Implemented

## Date

2026-05-15

## Background

Optimizer runs took extremely long (over half an hour), rooted in the GUI defaults `pop=100, gen=200`, which produce 20,000 simulation evaluations. Users have no intuition for the `population_size` / `n_generations` parameters and no way to judge the speed/precision tradeoff, and the original controls were just two bare `InputNumber` fields with no guidance at all.

At the same time, the single-objective algorithms `L-BFGS-B` and `Nelder-Mead` don't use the population/generation concept, so the existing controls were meaningless noise under those two algorithms.

## Decision

### 1. Tighten the defaults

`Simulator.tsx`'s initial state changes from `pop=100, gen=200` (20,000 evaluations) to `pop=50, gen=80` (4,000 evaluations), matching the "Standard" tier.

### 2. Three preset buttons

Below the algorithm selector, add Fast / Standard / Fine preset buttons; clicking one updates the slider and input box in sync:

| Tier | pop | gen | Total evaluations | Use case |
|------|-----|-----|-----------|---------|
| Fast | 20  | 40  | 800       | debugging, quick checks |
| Standard | 50  | 80  | 4,000     | everyday use (default) |
| Fine | 100 | 200 | 20,000    | publication-grade precision |

Values outside the presets can be entered directly in the input box; the slider caps its display at 200.

### 3. Slider + input box, linked

The original two `InputNumber` fields are replaced with a `Slider + InputNumber` combination:

- The parent state updates only when a drag ends (`onChangeComplete`), avoiding a re-render on every pixel of movement, which was causing jank
- The input box commits only on blur or Enter, avoiding value jumps mid-typing
- Local state (`localPop` / `localGen`) holds the draft value and syncs to the parent component on commit

### 4. Shown/hidden by algorithm type

The population/generation controls are shown only under NSGA-II and MOEA/D; they're hidden when L-BFGS-B or Nelder-Mead is selected, avoiding meaningless parameter exposure.

## Files affected

- `sim_gui/src/components/SimSetupTab.tsx`
- `sim_gui/src/components/Simulator.tsx` (defaults)
- `sim_gui/public/locales/sim/zh-CN.json`, `en.json`, `zh-TW.json` (new preset keys)
