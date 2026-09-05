# ADR 0080 — Optimizer schedule-granularity tier design (T2/T3/T4)

**Date**: 2026-05-20
**Status**: Design (documentation complete, implementation pending)

---

## Requirements

### Background and motivation

The existing optimizer (T1) only supports continuous optimization of an event's **value** (dose/intensity); time, weekday, and start/end dates are all fixed parameters hardcoded into the YAML.

In real intervention scenarios, the timing itself is often the key decision variable:

| Domain | Example scenario | Timing variable |
|------|---------|---------|
| Chrono-nutrition | The effect of an eating window on metabolism (16:8 vs 14:10) | The start time of eating |
| Chronopharmacology | Morning-versus-evening efficacy differences for the same drug (circadian rhythm) | Dosing time |
| Exercise training | A swimming pool open only on weekends, cycling only possible on weekdays | The weekday pattern |
| Clinical treatment | Which post-surgery day chemotherapy starts affects side effects and efficacy | The intervention start day |
| Social scenarios | Intermittent fasting (5:2), famine-relief supply drops | The fasting day, the resource-arrival day |

### Functional requirements

**R1 (T2 time window)**: the optimizer should support searching for the optimal dosing/eating time within a modeler-specified time window (e.g. `07:00~09:00`), with a granularity of `1h` (default) or `15min`.

**R2 (T3 weekday pattern)**: the optimizer should support choosing one pattern from a modeler-predefined list of candidate weekday patterns (e.g. "Monday/Wednesday/Friday", "weekends"), rather than searching the full 2^7 combination space.

**R3 (T4 start date)**: the optimizer should support searching for the optimal intervention start date within a modeler-specified date window (e.g. which day between May 1 and May 30 is best to start).

**R4 (composable)**: T2/T3/T4 can be enabled in any combination on the same `inputs` entry; the x vector automatically concatenates every enabled dimension.

**R5 (backward compatible)**: existing T1-only models are unaffected; all new fields are optional.

### Constraint requirements (search feasibility)

The following constraints are part of the requirements and directly affect design choices — **search feasibility is itself a system-level metric**:

**C1 (bounded search space)**: the T2 slot count = `(window_end - window_start) / opt_step + 1`, typically 2-9; the T3 candidate-pattern count <= 6 (guaranteed by the modeler); the T4 date-offset count <= 365 days. A single model's integer decision-variable dimensionality is expected to be <= 10.

**C2 (collision prevention)**: within the same `inputs` list, entries' time windows are designed not to overlap, preventing multiple events from hitting the same simulation step and accidentally stacking pulses. The engine does not automatically detect collisions; the modeler is responsible for the design.

**C3 (algorithm compatibility)**: T2/T3/T4 produce integer decision variables; NSGA-II (pymoo's `MixedVariableProblem`) supports mixed integers; L-BFGS-B / Nelder-Mead do not, and should auto-switch with a warning when these are enabled.

**C4 (convergence expectation)**: under the standard preset (pop=50, gen=80), a typical T1+T2+T3 combination (about 5 decision variables) should converge within 4,000 evaluations; if the search space is too large, the modeler controls it by reducing the candidate-pattern count.

### Non-functional requirements

**NF1 (YAML readability)**: new fields are named `time_window`, `opt_step`, `days_options`, and `date_start_window`, unambiguous relative to the simulation integration step size `metadata.step_size`.

**NF2 (GUI clarity)**: each tier corresponds to an independently recognizable control; no free-text input is used.

**NF3 (result readability)**: `reference.regimen` stores decoded, human-readable values (`time: "08:00"`, `days: [Sat, Sun]`, `date_start: "2026-05-08"`).

---

## Design

### The four-tier granularity system

| Tier | Optimization target | x-dimension type | Priority |
|------|---------|-----------|--------|
| T1 | Event value (dose/intensity) | continuous real | implemented |
| T2 | Event time (within a time window) | integer (slot index) | high: strong scientific novelty |
| T4 | Intervention start date (within a date window) | integer (day offset) | medium |
| T3 | Weekday pattern (from a candidate set) | integer (pattern index) | low: pure permutation |

### YAML syntax

```yaml
optimizer:
  inputs:
    # T1: value-only optimization
    - variable: drug_dose
      time: "08:00"
      label: "Daily dose"
      optimize:
        value: [5.0, 20.0]

    # T2: value plus time-window optimization
    - variable: meal_carbs
      time_window: "07:00~09:00"
      opt_step: 1h               # defaults to 1h; a fine-grained scenario can set 15min
      label: "Breakfast carbs"
      optimize:
        value: [30, 80]
        time: true

    # T3: value plus weekday-pattern selection
    - variable: exercise_load
      time: "17:00"
      days_options:
        - [Mon, Wed, Fri]
        - [Tue, Thu, Sat]
        - [Sat, Sun]
      label: "Exercise"
      optimize:
        value: [30, 90]
        days: true

    # T4: value plus intervention-start-date optimization
    - variable: caloric_restriction
      time: "08:00"
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      date_start_window: "2026-05-01~2026-05-30"
      label: "Caloric restriction"
      optimize:
        value: [400, 800]
        date_start: true

    # A fixed input (no optimize block)
    - variable: water_intake
      time: "08:00"
      value: 1.5
```

### x-vector encoding

Each `inputs` entry expands in the order `[value?, time?, days?, date_start?]`, with only the enabled tiers contributing dimensions:

| Enabled tier | Dimensions contributed | Variable type |
|----------|---------|---------|
| T1 | 1 (value) | `RealVar(lo, hi)` |
| T2 | +1 (time_slot_idx) | `IntVar(0, N_slots-1)` |
| T3 | +1 (pattern_idx) | `IntVar(0, N_patterns-1)` |
| T4 | +1 (day_offset) | `IntVar(0, D-1)` |
| A fixed input | 0 | — |

**Example**: `meal_carbs` (T1+T2, 3 slots) plus `exercise_load` (T1+T3, 3 patterns):
```
x = [carbs_value, time_slot_idx, exercise_value, pattern_idx]
    [   55.3,           1,            62.0,            2      ]
# time_slot_idx=1 -> ["07:00","08:00","09:00"][1] = "08:00"
# pattern_idx=2   -> [[MWF],[TTS],[SS]][2] = [Sat, Sun]
```

### The reference.regimen format extension

Once T2/T3/T4 are enabled, a leaf value changes from a scalar to a dict; T1-only stays scalar (backward compatible):

```yaml
reference:
  regimen:
    drug_dose:
      "Daily dose": 12.5           # T1-only: scalar
    meal_carbs:
      "Breakfast carbs":
        value: 55.3
        time: "08:00"            # T2 decoded
    exercise_load:
      "Exercise":
        value: 62.0
        days: [Sat, Sun]         # T3 decoded
    caloric_restriction:
      "Caloric restriction":
        value: 620.0
        date_start: "2026-05-08" # T4 decoded
```

---

## Implementation

### Frontend: `InputEvent` type extension (types.ts)

New fields (all optional, without breaking existing entries):

```typescript
interface InputEvent {
  // existing fields
  variable: string;
  time: string;
  value: number;
  label?: string;
  days?: string[];
  date_range?: string;
  optimizeValue?: boolean;
  valueBounds?: [number, number];

  // new for T2
  timeWindow?: string;         // "07:00~09:00"
  optStep?: string;            // "1h" | "15min", defaulting to "1h"
  optimizeTime?: boolean;

  // new for T3
  daysOptions?: string[][];    // [[Mon,Wed,Fri], [Sat,Sun], ...]
  optimizeDays?: boolean;

  // new for T4
  dateStartWindow?: string;    // "2026-05-01~2026-05-30"
  optimizeDateStart?: boolean;
}
```

### Frontend: GUI controls (SimSetupTab.tsx)

For each `InputEvent` row in opt mode, the following are appended after the existing value-bounds control:

**T2 control** (when `timeWindow` is present and `optimizeTime=true`):
- Two TimePickers (start/end, with a step matching `optStep`), showing the window range
- A granularity Select: `1h` / `15min`
- A read-only preview: "3 slots: 07:00 / 08:00 / 09:00"

**T3 control** (when `daysOptions` is present and `optimizeDays=true`):
- A list of candidate patterns, each row a Tag group (e.g. `Mon Wed Fri`)
- Not editable (candidates come from the YAML), with a hint "the optimizer will choose one of these"

**T4 control** (when `dateStartWindow` is present and `optimizeDateStart=true`):
- Two DatePickers (start/end), showing the selectable window
- A read-only preview: "30 day window"

### Frontend: `xToInputEvents` extension (Simulator.tsx)

The existing function only handles T1 (value substitution). It's extended to decode per-entry, dimension by dimension:

```typescript
function xToInputEvents(x: number[], inputs: OptimizerInput[], baseEvents: InputEvent[]): InputEvent[] {
  let xi = 0;
  const result = baseEvents.map(ev => ({ ...ev }));

  for (const inp of inputs) {
    if (!inp.optimize) continue;  // a fixed input, skip

    const idx = result.findIndex(ev => ev.variable === inp.variable && ev.time === inp.effectiveTime);
    if (idx < 0) { xi += dimCount(inp); continue; }

    // T1: value
    result[idx].value = x[xi++];

    // T2: time
    if (inp.optimize.time) {
      const slots = expandTimeWindow(inp.timeWindow, inp.optStep ?? '1h');
      result[idx].time = slots[Math.round(x[xi++])];
    }

    // T3: days
    if (inp.optimize.days) {
      result[idx].days = inp.daysOptions![Math.round(x[xi++])];
    }

    // T4: date_start
    if (inp.optimize.date_start) {
      const [wStart] = inp.dateStartWindow!.split('~');
      const offset = Math.round(x[xi++]);
      result[idx].dateStart = addDays(wStart, offset);
    }
  }
  return result;
}
```

The helper `expandTimeWindow("07:00~09:00", "1h")` -> `["07:00", "08:00", "09:00"]`.

### Backend: `optimizer_engine.py` extension

#### The parsing stage (the `run_optimizer` entry point)

```python
def _parse_inputs(inputs_yaml: list) -> tuple[list, list, list]:
    """
    Returns (var_specs, bounds, var_types)
    var_types elements: 'real' | 'int'
    """
    var_specs, bounds, var_types = [], [], []

    for inp in inputs_yaml:
        opt = inp.get('optimize')
        if not opt:
            continue  # a fixed input

        # T1: value
        lo, hi = opt['value']
        var_specs.append({'kind': 'value', 'variable': inp['variable'], 'inp': inp})
        bounds.append((lo, hi))
        var_types.append('real')

        # T2: time
        if opt.get('time'):
            slots = _expand_time_window(inp['time_window'], inp.get('opt_step', '1h'))
            var_specs.append({'kind': 'time', 'slots': slots, 'inp': inp})
            bounds.append((0, len(slots) - 1))
            var_types.append('int')

        # T3: days
        if opt.get('days'):
            patterns = inp['days_options']
            var_specs.append({'kind': 'days', 'patterns': patterns, 'inp': inp})
            bounds.append((0, len(patterns) - 1))
            var_types.append('int')

        # T4: date_start
        if opt.get('date_start'):
            w_start, w_end = inp['date_start_window'].split('~')
            n_days = (date.fromisoformat(w_end.strip()) - date.fromisoformat(w_start.strip())).days
            var_specs.append({'kind': 'date_start', 'window_start': w_start.strip(), 'n_days': n_days, 'inp': inp})
            bounds.append((0, n_days))
            var_types.append('int')

    return var_specs, bounds, var_types
```

#### Building events (`_build_regimen_events(x, var_specs)`)

```python
def _build_regimen_events(x, var_specs):
    events_by_var = {}
    pending = {}  # variable -> partial event dict

    for i, spec in enumerate(var_specs):
        var = spec['inp']['variable']
        if var not in pending:
            pending[var] = {
                'time': spec['inp'].get('time', '08:00'),
                'days': spec['inp'].get('days'),
                'date_start': None,
            }
        ev = pending[var]

        if spec['kind'] == 'value':
            ev['value'] = float(x[i])
        elif spec['kind'] == 'time':
            ev['time'] = spec['slots'][int(round(x[i]))]
        elif spec['kind'] == 'days':
            ev['days'] = spec['patterns'][int(round(x[i]))]
        elif spec['kind'] == 'date_start':
            offset = int(round(x[i]))
            start = date.fromisoformat(spec['window_start'])
            ev['date_start'] = str(start + timedelta(days=offset))

    for var, ev in pending.items():
        events_by_var[var] = [ev]
    return events_by_var
```

#### pymoo variable-type declaration

```python
from pymoo.core.mixed import MixedVariableProblem
from pymoo.core.variable import Real, Integer

variables = {}
for i, (spec, (lo, hi), vtype) in enumerate(zip(var_specs, bounds, var_types)):
    if vtype == 'real':
        variables[f'x{i}'] = Real(bounds=(lo, hi))
    else:
        variables[f'x{i}'] = Integer(bounds=(lo, hi))

problem = MixedVariableProblem(n_obj=n_obj, n_constr=n_constr, vars=variables, ...)
```

If every variable is `real` (pure T1), it falls back to the existing `FloatRandomSampling` path (backward compatible).

#### The `_expand_time_window` helper

```python
def _expand_time_window(window: str, opt_step: str) -> list[str]:
    start_str, end_str = window.split('~')
    hh0, mm0 = map(int, start_str.strip().split(':'))
    hh1, mm1 = map(int, end_str.strip().split(':'))
    step_min = 60 if opt_step == '1h' else 15
    slots = []
    t = hh0 * 60 + mm0
    end = hh1 * 60 + mm1
    while t <= end:
        slots.append(f"{t//60:02d}:{t%60:02d}")
        t += step_min
    return slots
```

---

## Files affected

```
docs/model_design.md                               done (YAML schema plus section)
docs/decisions/0080-... (this file)                done

sim_gui/src/types.ts                               InputEvent gains new T2/T3/T4 fields
sim_gui/src/components/SimSetupTab.tsx             T2/T3/T4 opt controls
sim_gui/src/components/Simulator.tsx               xToInputEvents mixed-integer decoding
                                                   init useEffect parses new YAML fields

sim_engine/src/optimizer_engine.py                 _parse_inputs, _build_regimen_events
                                                   expandTimeWindow, MixedVariableProblem
```
