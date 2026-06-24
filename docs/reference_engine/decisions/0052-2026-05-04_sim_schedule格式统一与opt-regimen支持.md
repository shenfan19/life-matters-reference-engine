# ADR 0052 — Schedule Format Unification & optimizer.regimen Support

**Date**: 2026-05-04  
**Status**: Implemented

---

## Background

Three interrelated bugs were found during opt-mode testing:

1. **`optimizer.regimen` not read by frontend**: The init `useEffect` only handled `optimizer.inputs` (new format) but not `optimizer.regimen` (legacy format used by CKD). Result: CKD's `protein_intake` was never marked `optimizeValue=true`.

2. **Time/label fields not carried from YAML to InputEvent**: Even for models using `optimizer.inputs`, the event time (e.g., "12:00" for noon dose) and label were not transferred from the YAML to the `InputEvent`. Every event defaulted to "08:00" and empty label. This caused the noon/evening doses in L2 to show "08:00" rather than their actual scheduled times.

3. **`simulation.schedules` format mismatch**: The YAML `simulation.schedules` used a legacy seconds-based format `{varName: {points: [{time: 28800, value}]}}` that was neither human-readable nor consistent with the "HH:MM" string format used by `optimizer.regimen`. The user wanted a single canonical format for both.

---

## Decisions

### 1. Canonical Schedule Format

**New `simulation.schedules` format** — flat list, same field names as `InputEvent`:

```yaml
simulation:
  schedules:
    - variable: dose_mg
      time: "08:00"          # 24h string, same as optimizer.inputs/regimen
      value: 10.0            # default value for sim mode
      label: "Daily dose"    # optional, shown in GUI
      days: [Mon, Wed, Fri]  # optional; absent = all days
      valid_start: "2025-01-01"  # optional
      valid_end:   "2025-12-31"  # optional
```

Rules:
- Same variable can appear multiple times (one entry per event/slot)
- `days` is a string list using three-letter abbreviations Mon–Sun
- Absent `days` means every day
- This format is identical in structure to what `InputEvent` stores and what the backend `_apply_regimens` expects

**Backward-compatible**: the frontend still reads the old `{varName: {points: [{time_secs, value}]}}` format if `schedules` is an object (not an array).

### 2. Frontend Schedule Parsing (Simulator.tsx)

`init useEffect` now distinguishes:

```
rawSchedules is array → new flat-list format → filter by variable, create one InputEvent per entry
rawSchedules is object → legacy dict format → read .points[], deduplicate by time, convert secs→HH:MM
rawSchedules absent → default single event at "08:00", timeEnabled=false
```

The flat-list path also reads `days`, `valid_start`, `valid_end`, `label` from the YAML into the InputEvent.

### 3. Opt Flags: handle both `inputs:` and `regimen:`, carry over time/label

**Before** (only `inputs:`, no time/label copy):
```js
if (Array.isArray(optBlock.inputs)) {
  setInputEvents(prev => prev.map(ev => {
    const inp = withOpt.find(e => e.variable === ev.variable);
    if (!inp) return ev;
    return { ...ev, optimizeValue: true, valueBounds: [...] };  // time NOT updated
  }));
}
```

**After** (both formats, time + label also updated):
```js
if (Array.isArray(optBlock.inputs)) {
  // inputs: format
  setInputEvents(prev => prev.map(ev => {
    const inp = withOpt.find(e => e.variable === ev.variable);
    if (!inp) return ev;
    return { ...ev,
      time: inp.time ?? ev.time,           // ← carry time
      timeEnabled: inp.time ? true : ev.timeEnabled,
      label: inp.label ?? ev.label,        // ← carry label
      optimizeValue: true,
      valueBounds: [inp.optimize.value[0], inp.optimize.value[1]],
    };
  }));
} else if (optBlock.regimen?.variable && Array.isArray(optBlock.regimen?.events)) {
  // regimen: format (legacy — used by CKD model)
  const regVar = optBlock.regimen.variable;
  setInputEvents(prev => prev.map(ev => {
    if (ev.variable !== regVar) return ev;
    const regEv = regEvs.find(e => e.time === ev.time) ?? regEvs[0];
    if (!regEv?.dose_bounds) return ev;
    return { ...ev,
      time: regEv.time ?? ev.time,
      timeEnabled: regEv.time ? true : ev.timeEnabled,
      label: regEv.label ?? ev.label,
      optimizeValue: true,
      valueBounds: [regEv.dose_bounds[0], regEv.dose_bounds[1]],
    };
  }));
}
```

### 4. Test Model Redesign (L3)

L3 was redesigned from "one variable per weekday" (architecturally broken — formula summed all days every step) to **"five time slots per day"** (correct — each slot is a separate input variable with its own absorption rate):

| Slot | Time | Absorption | Context |
|------|------|-----------|---------|
| `slot_6am` | 06:00 | 72% | Fasting on waking |
| `slot_8am` | 08:00 | 60% | After breakfast starts |
| `slot_12pm` | 12:00 | 55% | After lunch |
| `slot_5pm` | 17:00 | 50% | After dinner |
| `slot_10pm` | 22:00 | 65% | Bedtime, fasting |

Formula: `plasma += (Σ slot_i × bioavailability_i − plasma × clearance) × step`

This is medically realistic (circadian rhythm + meal effects) and architecturally correct (all variables contribute to the same step's dynamics).

### 5. YAML Updates

Added `simulation.schedules` (new flat-list format) to:
- `l1_drug_single_obj.yaml`: 1 entry (`dose_mg` at 08:00)
- `l2_drug_pareto.yaml`: 3 entries (`morning_dose` 08:00, `noon_dose` 12:00, `evening_dose` 20:00)
- `l3_two_drug_mc.yaml`: 5 entries (`slot_6am`–`slot_10pm`)
- `ckd_protein_muscle.yaml`: 1 entry (`protein_intake` at 08:00, value=0.8)

---

## Files Changed

```
sim_gui/src/components/Simulator.tsx
  init useEffect: new schedule parsing (flat list + legacy dict + default)
  init useEffect: opt flags handle regimen: format, carry time/label/timeEnabled

models/source/medical/test/l1_drug_single_obj.yaml
  simulation.schedules: [{variable: dose_mg, time: "08:00", value: 10.0}]

models/source/medical/test/l2_drug_pareto.yaml
  simulation.schedules: 3 entries with correct times 08:00/12:00/20:00

models/source/medical/test/l3_two_drug_mc.yaml
  Complete rewrite: 5 time-slot variables + simulation.schedules + optimizer.inputs

models/source/medical/disease/chronic/ckd_protein_muscle.yaml
  simulation.schedules: [{variable: protein_intake, time: "08:00", value: 0.8}]
```

---

## Verification

| Scenario | Expected | Mechanism |
|----------|----------|-----------|
| Load L1 → opt mode | `dose_mg` at 08:00, ☑ opt, bounds [0,50] | inputs: format + time carry |
| Load L2 → sim mode | 3 rows: morning 08:00, noon 12:00, evening 20:00 | flat list schedules |
| Load L2 → opt mode | same 3 rows, all ☑ opt | inputs: format + time carry |
| Load L3 → opt mode | 5 rows (06–22h), all ☑ opt | inputs: format + time carry |
| Load CKD → opt mode | `protein_intake` at 08:00, ☑ opt, bounds [0.3,2.0] | regimen: format |
| Load CKD → sim mode | `protein_intake` at 08:00, value=0.8 | flat list schedules |
