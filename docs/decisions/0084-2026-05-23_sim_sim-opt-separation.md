# 0084 · 2026-05-23 · Sim · Complete separation of Sim and Opt

## Background

In the original design, `InputEvent` carried two kinds of semantics at once:
- Simulation semantics: `value`, `time`, `days`, `validRange`
- Optimization semantics: `optimizeValue` (flagging whether the event participates in optimization), `valueBounds`, `timeWindow`, `optimizeTime`, `daysOptions`, `optimizeDays`, `dateStartWindow`, `optimizeDateStart`, `dateEndWindow`, `optimizeDateEnd`

This "compatibility toggle" design (`optimizeValue`) led to:
- `InputEvent`'s type ballooning to 15+ fields, nearly half of them unrelated to simulation
- `SimSetupTab` needing to render an entirely different UI depending on `mode` when switching between sim/opt
- Optimization's "background input" (a non-decision-variable fixed input) being mixed together with decision variables inside `optimizer.inputs`, blurring the semantics
- The YAML's `optimizer` block lacking an independent `schedules` (fixed background) field

## Decision

### D1: separating InputEvent and OptInput

**`InputEvent`** (sim-tab specific) keeps only pure simulation fields:
```typescript
{ id, variable, time, timeEnabled, value, label,
  daysEnabled, days, validRangeEnabled, validStart, validEnd }
```

**`OptInput`** (opt-tab specific) is an independent type, with `valueBounds` in place of `value`, containing all T1-T4 optimization fields:
```typescript
{ id, variable, label, valueBounds: [lo, hi],
  time, timeEnabled, timeWindow, optStep, optimizeTime,
  daysEnabled, days, daysOptions, optimizeDays,
  validRangeEnabled, validStart, validEnd,
  dateStartWindow, optimizeDateStart, dateEndWindow, optimizeDateEnd }
```

`optInputs: OptInput[]` and `optBackgrounds: InputEvent[]` are added to `ModelSession`, persisted independently.

### D2: a new OptSetupTab component

`OptSetupTab.tsx` contains three collapsible sections:
- **Decision variables** (`optInputs`): full T1-T4 editing, with a "<- Import from Sim" button
- **Background inputs** (`optBackgrounds`): fixed background, not searched
- **Optimizer configuration**: objectives / constraints / algorithm (moved out of SimSetupTab)

`SimSetupTab` keeps only pure sim functionality (inputs plus plans); the `mode` prop and all OPT rendering are removed.

### D3: a new `optimizer.schedules` YAML field

`optimizer.schedules` has the same format as `simulation.schedules`, providing a fixed background input dedicated to opt evaluation.
- Engine priority: `optimizer.schedules` over `simulation.schedules` (implemented through the `manual_overrides` mechanism)
- Default inheritance: if `optimizer.schedules` doesn't exist, `simulation.schedules` is automatically used as the background (backward compatible)

### D4: migration

- An old model with no session, on first load: `optInputs` is built from `optimizer.inputs` (entries with an `optimize:` block), and `optBackgrounds` is built from the fixed entries (no `optimize:` block) plus `optimizer.schedules`
- A model with a session: `optInputs` and `optBackgrounds` are restored directly from localStorage
- `xToInputEvents`: the `ev.optimizeValue` condition is removed, replaced by matching on variable+time; when no match is found, a new event is created automatically

### D5: changes to startOptimization()

```typescript
// Before
const inputs = inputEvents.filter(ev => ev.optimizeValue).map(ev => buildInpFromEv(ev));

// After
const inputs   = optInputs.map(oi => buildInpFromOi(oi));     // decision variables
const schedules = optBackgrounds.map(bg => buildSchedFromBg(bg)); // background
```

### D6: the fallback strategy (explicit rules)

| Resource | Fallback source | When it triggers |
|------|------------|---------|
| `optimizer.start_date` | `simulation.start_date` | the opt block lacks this field |
| `optimizer.end_date` | `simulation.end_date` | same as above |
| `optimizer.step_size` | `metadata.step_size` | same as above |
| `optimizer.schedules` | `simulation.schedules` | `optimizer.schedules` doesn't exist or is empty |
| The `optInputs` session | YAML `optimizer.inputs` | first initialization, no session yet |

## Files affected

- `sim_gui/src/types.ts` — `InputEvent` simplified, `OptInput` added, new fields on `ModelSession`
- `sim_gui/src/components/SimSetupTab.tsx` — the `mode` prop removed, keeping only sim rendering
- `sim_gui/src/components/OptSetupTab.tsx` — a new file, the opt tab's left-side panel
- `sim_gui/src/components/Simulator.tsx` — new state, new CRUD, a new startOptimization, new rendering
- `sim_gui/public/locales/sim/*.json` — new i18n keys
- `sim_engine/src/optimizer_engine.py` — new support for `optimizer.schedules`
- `docs/model.md` — documentation for the `optimizer.schedules` field
- The internal LM format spec draft — the optimizer schema kept in sync

## Rejected approaches

**Keeping the `optimizeValue` flag**: every new opt scenario would need a new field on `InputEvent`, poor extensibility, and it conflates simulation and optimization semantics.

**Forcing an opt block at the GUI level**: requiring the YAML to have `optimizer:` before the opt tab could be used would be too strict for a pure-component model (with no `optimizer:` block). The GUI session should carry a temporary opt configuration instead.
