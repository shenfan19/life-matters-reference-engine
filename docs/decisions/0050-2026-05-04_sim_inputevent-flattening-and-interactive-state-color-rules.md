# ADR 0050 — InputEvent flattening, Run button fix, tree labels, interactive state color rules

**Date**: 2026-05-04
**Status**: implemented

---

## Background

This ADR covers a batch of concentrated changes made on 2026-05-04, spanning four independent issues:

1. **InputEvent flattening**: the original `Regimen / RegimenOpt` nested structure caused multiple events to share `valueBounds`, and the UI took too many rows and was not intuitive.
2. **Run button unresponsive**: in opt mode, both `!isLocked` and `status === 'completed'` disabled the button, so the first click did nothing.
3. **Wrong tree-panel labels**: the header of the left-hand list showed "Scenarios," the group name "MODELS" pointed at the `components/` folder, and the order was reversed.
4. **Inconsistent interactive-state colors**: the Segmented control and tree-node selected state used gray (`#2a2a2a`), inconsistent with other active states (green), making it visually unclear.

---

## Decision

### 1. InputEvent flattening (Simulator.tsx)

**Deprecate** the three-tier nested `Regimen / RegimenEvent / RegimenOpt` structure, and introduce a single `InputEvent` interface:

```ts
interface InputEvent {
  id: string;
  variable: string;    // the name of a type: input variable
  time: string;        // "HH:mm"
  timeEnabled: boolean; // whether the time field is shown (a UI toggle)
  value: number;
  label: string;
  daysEnabled: boolean;
  days: boolean[];     // [Mon..Sun]
  validRangeEnabled: boolean;
  validStart: string; validEnd: string;
  optimizeValue: boolean;  // whether this is treated as an optimization decision variable
  valueBounds: [number, number]; // [lo, hi]
}
```

**New UI layout** (`renderInputsContent`):
- Row 1: `[variable dropdown] [value pill, gray] [time pill] [days pill] [range pill]` — 4 pill toggles + `[× delete]` (right-aligned, separated by `flex:1`)
- Row 2: `[value InputNumber] [unit] [☑ opt] [lo ~ hi]` (visible in opt mode)
- Row 3 (combined): `[time HH:mm]?  [seven-day buttons]?  [start/end dates]?` (shown merged when any toggle is on)

`timeEnabled` only controls UI visibility; the `time` field is always passed to the backend as part of the regimen payload.

**Pre-filling `optimizeValue` from optimizer.inputs** (on loading a new model):
The model-loading `useEffect`, after a fresh init, automatically sets `optimizeValue = true` and `valueBounds = optimize.value` on the corresponding `inputEvents` entry whenever a YAML `optimizer.inputs` entry contains `optimize.value`.

### 2. Run button fix

**Original problem**:
```js
disabled={!isLocked || (mode==='opt' && (optRunning || status==='completed'))}
```
Opt mode required `isLocked` (just like sim), and once `status='completed'` after the first optimization run, the button was permanently disabled.

**Fix**:
```js
// new
disabled={mode === 'opt' ? optRunning : (!isLocked || status === 'completed')}
```
- Opt mode: disabled only while `optRunning`; no lock required; can be run again after completion.
- Sim mode: original behavior kept (requires locking, disabled when completed).

The optimization-completion callback changed from `set('status', 'completed')` to `set('status', 'idle')`, preventing the mode-switch Segmented control from getting stuck disabled.

### 3. Tree-panel label fix

| Location | Old value | New value |
|------|------|------|
| Panel header (locale key `sim.scene.header`) | Scenarios / 场景 | Models / 模型库 |
| The `components/` folder's group label | MODELS | COMPONENTS |
| Group order | SCENARIOS on top | COMPONENTS on top, SCENARIOS below |

### 4. Interactive-state color rules

**Principle**: green = active/selected, gray = unselected, red = danger.

| State | Color scheme |
|------|----------|
| Active/selected | foreground `c.primary`, background `c.activeBg`, border `c.primary` |
| Hover | background `c.navHover` (primary color at 8% opacity) |
| Unselected | foreground `c.textSec`, background transparent |

**Specific changes** (`App.tsx` → `academicTheme.components`):
```js
Segmented: {
  itemSelectedBg:    isDark ? '#1a3a22' : '#e8f5e9',
  itemSelectedColor: isDark ? '#52c41a' : '#007A33',
  trackBg:           isDark ? '#1a1a1a' : '#f0f0f0',
},
Tree: {
  nodeSelectedBg: isDark ? '#1a3a22' : '#e8f5e9',  // was #2a2a2a (barely visible)
  nodeHoverBg:    isDark ? 'rgba(82,196,26,0.08)' : 'rgba(0,122,51,0.06)',
},
```

The rule is also recorded in `docs/global_prompt.md § 2.1, Interactive State Color Rules`.

---

## Files changed

```
sim_gui/src/components/Simulator.tsx
  InputEvent interface: added timeEnabled
  renderInputsContent: entirely new pill-toggle layout, delete button right-aligned
  startOptimization: status='idle' on completion, button no longer requires isLocked
  loadFileTree: COMPONENTS moved first, labels corrected
  init useEffect: pre-fill optimizeValue from optimizer.inputs

sim_gui/src/App.tsx
  academicTheme.components: new Segmented token, corrected Tree token
  StatusBar: three-state indicator (running=amber, online=green, offline=red)
  health check: skip polling while simState.status==='running'

sim_gui/public/locales/sim/{en,zh-CN,zh-TW}.json
  sim.scene.header: "Scenarios" → "Models" / "模型库"

docs/global_prompt.md
  §2.1 Interactive State Color Rules (new)

models/source/medical/test/
  l1_drug_single_obj.yaml: added type:model, description annotated with [TEST L1]
  l2_drug_pareto.yaml:     added type:model, description annotated with [TEST L2]
  l3_two_drug_mc.yaml:     new file, two-variable two-objective with MC, pop=20 gen=25
```

---

## Outcome and verification

- Clicking Run in opt mode: no longer requires locking first, and can be clicked again after optimization completes — confirmed
- Segmented sim/opt switch: the selected item shows a green background (consistent with other active elements) — confirmed
- Tree-node selection: a green background (`#1a3a22` dark / `#e8f5e9` light), no longer gray — confirmed
- The left-hand header shows "Models / 模型库" — confirmed
- The COMPONENTS group appears above SCENARIOS — confirmed
- Test models display the `model_type: "model"` purple tag — confirmed
- InputEvent row 1 + row 2 = minimum 2 rows, expanding toggles add at most 3 rows (time/days/range merge into one row) — confirmed
- There is `flex:1` spacing between the delete button and the toggles, reducing accidental clicks — confirmed
