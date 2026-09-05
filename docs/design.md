# Software Design

> **Decision navigation**: the key decisions in this file are summarized in [DECISIONS.md](DECISIONS.md) (⭐⭐ marks a core constraint).  
> Key ADRs: K×4 -> [0038](decisions/0038-2026-04-20_sim_regimen-k4-input-scheduling.md); MC simulation -> [0045](decisions/0045-2026-04-30_sim_mc-probabilistic-simulation-and-random-parameter-architecture.md) (implementation detail in [mc.md](mc.md)); Simulator decomposition -> [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md);
> Sub-day time-interval unification -> [0100](decisions/0100-2026-06-11_sim_unify-pulse-sustained-time-interval.md);
> sustained `value` filled independently per matched day (replacing 0099) -> [life-matters-models 0131](../../life-matters-models/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md);
> `delivery: total | level` -> [life-matters-models 0132](../../life-matters-models/docs/decisions/0132-2026-07-14_model_sustained-delivery-total-vs-level.md);
> the `delivery` judgment rule plus the day-lumped map anti-pattern -> [life-matters-models 0133](../../life-matters-models/docs/decisions/0133-2026-07-15_model_delivery-judgment-principle-and-day-lumped-map.md)

## Simulation/optimization: mathematical structure
### A Regimen's K×4 parameter space
A **Regimen** describes **a repeating plan for one behavior**, analogous to a recurring event in a phone calendar. Every Regimen consists of exactly four dimensions:

| Field | Meaning | Can it be turned off? |
|---|---|---|
| `time_start`/`time_end` the time interval | executed within `[time_start, time_end)` every day (`time_end == time_start` is a single-point pulse) | No |
| `value` the intake amount | the amount per execution, paired one-to-one with the time interval | No |
| `days` the execution days | which days of the week it executes on | No (all selected = every day) |
| `valid_range` the validity period | which date span this plan is active over | **Can be turned off** -> active for the entire simulation period |

**Key: `value` is the total amount within a single hit window** (such as 0.5 kg, 10 IU, 45 min), not a rate (not kg/h). When `time_start == time_end` it degenerates into a pulse: a fixed amount is taken instantaneously at that moment; when the interval has nonzero width (sustained), `N_steps` = that window's own duration divided by `step_size` (unrelated to how many days `date_range`/`days` matched), and each matched day independently accumulates `value / N_steps` per step ([ADR 0131](../../life-matters-models/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md), replacing ADR 0099's earlier rule of spreading the total across the whole active window). The single-day cumulative contribution still equals `value`, regardless of `step_size` or how many days matched. When `value` semantically expresses a level that should be held constant (such as sleep duration or treatment intensity, rather than a total accumulating over time), a regimen entry can set `delivery: level` so each matched step delivers `value` itself directly, with no `N_steps` division ([ADR 0132](../../life-matters-models/docs/decisions/0132-2026-07-14_model_sustained-delivery-total-vs-level.md)); when unset, the default is `delivery: total`, i.e. the spreading rule above. This invariant under `delivery: level` holds only when the downstream equation is written at native granularity (a `step_unit` no coarser than `simulation.step_size`); using a coarser `step_unit` to compute the net change over several steps at once and then repeatedly redistributing it to each finer step via `delivery: level` keeps the reading from drifting, but the equation then never converges to a more accurate solution as the step size is refined, which is a wrong choice of variable primitive, not a problem with the `delivery` field (the day-lumped map anti-pattern, [ADR 0133](../../life-matters-models/docs/decisions/0133-2026-07-15_model_delivery-judgment-principle-and-day-lumped-map.md)).

**The semantics of turning off `valid_range`**: an everyday habit (eating, drinking, sleeping) needs no start/end date, and turning it off means "from day 0 to the end of the simulation." A phased behavior (medication during postoperative recovery, wartime combat duty) is what needs it turned on.

#### Typical examples

```
Breakfast eating (a pulse, time_start == time_end):
  Validity period:  off (permanently active)
  Time interval:    07:30 ~ 07:30
  Intake amount:    0.5 kg
  Execution days:   every day (all selected)

Insulin injection (once each morning and evening, both pulses):
  Validity period:  2024-02-01 ~ 2024-06-30
  Time interval:    08:00~08:00   20:00~20:00
  Intake amount:    10 IU         8 IU      <- the interval and value lists are the same length, matched position by position
  Execution days:   every day

Aerobic exercise (a pulse):
  Validity period:  off
  Time interval:    07:00 ~ 07:00
  Intake amount:    45 min
  Execution days:   Monday, Wednesday, Friday

Daytime rescue intensity (sustained, delivery: level, delivering the level directly):
  Validity period:  1945-08-06 ~ 1945-08-11
  Time interval:    08:00 ~ 20:00
  Intake amount:    4.0     <- with delivery: level, each matched step delivers value itself directly, with no N_steps division
  Execution days:   every day

Training load (sustained, delivery: total by default, the window's total spread across the window's own duration):
  Validity period:  off
  Time interval:    08:00 ~ 20:00
  Intake amount:    288.0   <- the window's own 12h / step=1h -> N_steps=12, writing 24.0 per step;
                       each matched day independently accumulates 288.0, regardless of how many days matched
  Execution days:   every day
```

K Regimens together make up a complete intervention plan; each has the four dimensions above, and each dimension can independently be set to **locked** (a fixed value) or **optimized** (given a search range, left to the optimizer to search).

### Expanding a Regimen into optimizer parameters

The optimizer uniformly accepts a real vector $\theta \in \mathbb{R}^d$. In each Regimen, a dimension marked "optimize" expands into a segment of $\theta$'s components:

| Field | Expansion | Contributed dimensions |
|---|---|---|
| `time` a time point (the $i$-th time point) | $\tau_i \in [\tau_{\min}, \tau_{\max}]$, in hours | $n_r$ (the number of time points) |
| `value` the intake amount (the $i$-th one) | $d_i \in [d_{\min}, d_{\max}]$ | $n_r$ |
| `days` the execution days | a continuous relaxation $w_j \in [0,1]$, $j=1\ldots7$; during simulation, $w_j \ge 0.5$ is treated as executed | 7 |
| `valid_range` the validity period (when turned on) | $(t_{\text{start}},\, t_{\text{end}}) \in$ the date range | 2 |

**Total search dimensionality**:

$$d = \sum_{r=1}^{K} \Bigl[ n_r \cdot \bigl(\mathbb{1}[\text{B optimized}] + \mathbb{1}[\text{C optimized}]\bigr) + 7 \cdot \mathbb{1}[\text{D optimized}] + 2 \cdot \mathbb{1}[\text{A optimized and on}] \Bigr]$$

**Two ways to handle the weekly-days dimension (D)**:

1. **Continuous relaxation** (default): $w_j \in [0,1]$, and after optimization the days with $w_j \ge 0.5$ are taken as the execution days. Suits NSGA-II (no exact gradient needed).
2. **Constrained enumeration** (when the user gives an "at least N days" constraint): add the constraint $\sum_j w_j \ge N$; continuous relaxation is still usable.

**The time-ordering constraint on the time-point sequence (B)**: if a Regimen has multiple time points, optimization must ensure $\tau_1 < \tau_2 < \cdots < \tau_{n_r}$. A continuation trick:

$$\tau_i = \sum_{k=1}^{i} \text{softmax}(\alpha)_k \cdot T_{\text{day}}, \quad \alpha \in \mathbb{R}^{n_r} \text{ unconstrained}$$

The optimizer searches over $\alpha$, converting back to $\tau_i$ before simulation, so ordering is automatically satisfied.

### An iCal two-way conversion tool (not implemented)
**The tool's value**: a user could design their own behavior plan directly in a phone calendar app, export it as iCal, and import it into an LM simulation with one click.

**Current state**: there is no iCal/ics-related code anywhere in `gui/src/`; this tool has never been implemented and is not within the current Simulator's development scope ([ADR 0117](decisions/0117-2026-06-21_sim_regimen-vs-recommended-final-naming.md)'s "not in this round's scope" section already records this gap between the documentation and the implementation). iCal export no longer appears in the interaction mockups below; the actual Opt-to-Sim handoff is described in the "Opt -> Sim: an N-to-N recomposition architecture" section further down.

### Evidence variables: values sourced directly from the literature

A random event (combat death, surgical risk, disease onset) and other literature-derived statistics enter the model through the **`evidence_type`** field on a `variables:` entry (8 subtypes: `rr`/`or`/`hr`/`ard`/`cohens_d`/`ir`/`beta`/`pk`; `type` is still `parameter`). The Loader completes the conversion automatically at load time, and the Simulator sees only the converted effective value. **It never enters any optimization search space.**

For the conversion equations and the traceability fields (`evidence_type`/`evidence_raw_value`), see [evidence/conversion.md](evidence/conversion.md) (the authoritative implementation description, with known implementation details); for the `applies_to` mechanism that automatically wires a conversion result into some state variable's dynamics, see [evidence/applies_to.md](evidence/applies_to.md); for the YAML field declaration, see `docs/LM_format_1.0.md` §2.4 and `docs/authoring/variables_and_equations.md` in the `life-matters-models` repository.

**Deterministic handling in the simulation** (no random sampling done):

```
survival(t) = ∏(1 − ir_effective × step_size)
```

This directly yields the deterministic expected-survival-rate trajectory, which is reproducible and adequate for Pareto optimization. Distributional sampling (MC) applies only to `parameter` variables, a separate matter from evidence conversion; see [mc.md](mc.md).


## The dual-loop optimization architecture

LM's optimization system is made of two independent optimization loops, with entirely different goals and tools:

### The outer loop: Regimen search (the current main focus, implemented in the Simulator)

| Item       | Description                                    |
| -------- | ------------------------------------- |
| **Search target** | the Regimen plan of an `input` variable (time, dose, execution days, validity period) |
| **Goal**   | finding the behavior/medication plan that optimizes the `state` output |
| **Algorithm** | NSGA-II (multi-objective) / L-BFGS-B, Nelder-Mead (single-objective, scipy), full detail in the "Optimization objectives and methods" section below |
| **Output**   | a Pareto front: a batch of non-dominated Regimen plans |
| **User**   | a doctor, patient, or researcher, concerned with "what's the best thing to do" |
| **Current status** | ✅ designed, in implementation |

### The inner loop: parameter calibration (future, implemented in the Modeller)

| Item       | Description                                      |
| -------- | --------------------------------------- |
| **Search target** | a `parameter` variable (a mechanistic coefficient, such as Bergman's p1/p2/p3) |
| **Goal**   | fitting the simulated curve to literature-observed data (minimizing MSE / AIC) |
| **Algorithm** | L-BFGS-B / Nelder-Mead / Bayesian Opt   |
| **Output**   | a set of `parameter` values that fit the model to real data              |
| **User**   | a model developer, concerned with "how accurate is the model"                      |
| **Current status** | ⏳ reserved in the design, the Modeller tool not yet implemented                   |

### The relationship between the two loops

```
The inner loop (Modeller)       The outer loop (Simulator)
   ↓ calibrating parameter         ↓ searching for the optimal input
model.yaml ─────────────────→ story.yaml ──→ a Pareto front
  parameter values set by the inner loop     the input's Regimen searched by the outer loop
```

Once `parameter` is calibrated by the inner loop, it is written into `model.yaml` and fixed; the outer loop searches the `input` space with `parameter` held fixed. The two loops don't interfere with each other and can run independently.

An `evidence` variable never enters either optimization loop; it is a constraint given by the literature, used directly as a constant by the equations after the Loader converts it.

---

## The GUI Working State Layer

> Corresponds to requirement F-1; the architectural decisions are ADR 0074, ADR 0109/0110 (mandatory plans normalization), ADR 0115 (simplification after removing daily_inputs).

### Concept

The GUI Working State Layer is the collection of `inputEvents[]` in the Sim panel — the user-visible, user-editable input configuration, representing "what values this simulation run actually uses."

```
The loading flow:
  a YAML file → the Loader parses self.plans → the frontend restores inputEvents per plan ← edited by the user / injected by an Opt result
                                     ↓
                  a session starts: inputEvents is sent to the backend as the regimens field
                                     ↓
                              every step: apply_schedules(session['regimens'])
```

The problem ADR 0074 was addressing at the time (the old `daily_inputs`/`_apply_schedules` overwriting a GUI edit with the YAML value at the end of every step) no longer exists: the whole `daily_inputs` mechanism was removed in ADR 0115, `simulation.plans[*].regimens` is now the only place input is declared (ADR 0109), and the GUI's `inputEvents` is itself the editable instance of that plan's content — the two are no longer two paths that can conflict. A GUI session calls `apply_schedules()` exactly once per step, the input is `inputEvents`, and there is no "who overrides whom" priority question.

### Initialization rules

| Event | The change to inputEvents (the GUI layer) |
|------|--------------------------|
| Loading a new model | parsed from `simulation.plans[*].regimens` (`self.plans[plan_id]`), populating inputEvents per plan |
| Loading a model containing `optimization.results.recommended.x` | asks the user whether to prefill the recommended solution; choosing "yes" actually only overwrites the **Opt Tab**'s `optInputEvents` (`useModelInit.ts`'s `Modal.confirm.onOk`), leaving the Sim `inputEvents` defined by this table untouched — it makes sense for the recommended solution to serve as the starting point of the Opt decision variables, so only the wording here is being corrected |
| Opt completes, the user clicks "run the simulation with this solution" | writes the solution's `x` into inputEvents according to the `optimization.startpoint.regimens` decision-variable mapping |
| The user edits manually | modifies inputEvents directly |

### The F-MPLAN extension

With multiple plans, each Plan has its own independent `inputEvents[]`, corresponding to an independent session, isolated from and unaffected by other plans.

---

## Opt -> Sim: an N-to-N recomposition architecture

> Corresponds to requirements F-5, F-2, F-3.

### Design principle

Opt produces N input combinations (a Pareto front); Sim is downstream and must be able to accept all N. The software layer is responsible for the recomposition, and the Opt result keeps its raw format (an `{x, f}` vector).

```
YAML: optimization.startpoint.regimens   pareto_front[i].x
(the decision variables containing optimize:)              ↓
           ↓           xToInputEvents(x, optimizerSchedules, baseInputEvents)
                                        ↓
                           Plan[i].inputEvents[]   →   an independent session → simulation curve i
```

### The xToInputEvents function

**Responsibility**: restoring a Pareto solution's `x` vector into a Sim-executable `InputEvent[]`.

**Input**:
- `x: number[]`, the decision-variable values of some Pareto solution
- `optimizerRegimens: object[]`, the list of entries containing an `optimize:` block within the current YAML's `optimization.startpoint.regimens`
- `baseInputEvents: InputEvent[]`, the current Sim's base inputEvents (supplying non-optimized fields such as `days` and `valid_range_enabled`)

**The mapping rule** (exactly matching the order the Python backend builds the x vector in):

```
For each entry in optimization.startpoint.regimens that has an optimize: block (in list order):
  the enabled tiers contribute dimensions in order: T1(value) + T2(time_slot) + T3(days_combo) + T4(date_offsets)
  x[idx++] → matches the baseInputEvent where variable=varName AND time=event.time, updating that field
```

**Output**: a new `InputEvent[]`, with only the value of the `optimizeValue=true` events updated, everything else unchanged.

**Call sites**:

| Scenario | How it's called |
|------|---------|
| Loading a model, prefilling the recommended solution | `xToInputEvents(recommended.x, yaml.optimization.startpoint.regimens, current)` |
| "Run the simulation with this solution" | the same as above, the result set as the current Sim Plan's inputEvents |
| Run Compared (N Pareto solutions) | called for each checked solution, yielding N Plans |

### The quantitative relationship

| | 1-to-1 (the MVP) | N-to-N (the target) |
|--|------------|------------|
| Opt -> Sim | reference.x -> 1 inputEvents | pareto_front[0..N-1].x -> N Plans |
| Running Sim | 1 session | N parallel sessions |
| The chart | 1 curve | N curves (F-MPLAN) |
| The code difference | `xToInputEvents` × 1 | `xToInputEvents` × N + a multi-curve SimChart |

The `xToInputEvents` function itself is shared; N-to-N only adds "calling it N times" and multi-dataset SimChart rendering over 1-to-1. The SimChart rework is necessary work for F-MPLAN regardless of 1-to-N. So **the extra cost of implementing N-to-N is minimal**, and N-to-N is done directly.

---

## Optimization: the shape of Pareto output

### What a Pareto front is
For a two-objective optimization, the output is a **trade-off curve** (50-200 non-dominated solutions), each point representing the optimal Regimen plan under one trade-off:
```
Objective 1: the reduction in liver fat (bigger is better)
                ↑
              * |
           *    |         each * is a specific, executable Regimen plan
        *       |
     *          |
  *             |
                +——————————————→
                  Objective 2: the peak ALT enzyme level (smaller is better)

Top left = an aggressive exercise plan (maximum fat loss, but high ALT risk)
Bottom right = a conservative rest plan (safe ALT, but little fat loss)
The bend in the middle = the recommended best trade-off plan
```

### How the user works with the Pareto output

The actual interaction is the Solutions table in the Opt Tab's result area, not the "click a point / preference slider / iCal export" envisioned earlier in this section:

1. `ParetoChart` shows the Pareto scatter plot; hovering over a point shows that plan's objective-value tooltip (no click-selection logic, no plan-preview panel).
2. The Solutions table lists each Pareto solution's decision variables and objective values row by row, with the reference solution (`recommended`/`best_x`) highlighted as a ★ row.
3. The user checks one or more plans via the row-leading checkbox and clicks "Send to Sim", not "export as iCal" — this calls `xToInputEvents` to write the checked solutions back to the Sim Tab, each solution generating its own independent Plan (the N-to-N architecture, see the "Opt -> Sim: an N-to-N recomposition architecture" section above, which matches the code).

## Simulation/optimization: interface layout
### The core design idea

Sim and Opt are two fully independent top-level Tabs (`centerTab: 'simulation' | 'optimization'`), each mounting its own independent Setup/ControlBar/result components (`SimSetupTab`+`SimControlBar` / `OptSetupTab`+`OptControlBar`); their layouts mirror each other but their state is fully isolated — there is no "Opt embedded as a toggle at the top of Sim" mode ([ADR 0084](decisions/0084-2026-05-23_sim_sim-opt-separation.md) already overturned this earlier idea).

### The overall layout (a two-column 4:6 split, no third column)

The Sim Tab and the Opt Tab mirror each other internally, both a `WorkspacePage` fixed 4:6 two-column split ([ADR 0079](decisions/0079-2026-05-18_sim_workspace-layout-4-6-split.md)):

```
┌───────────────────────────────────────────────────────────┐
│  [Simulation] [Optimization]               ← the top-level Tab switch  │
├───────────────────────────────────────────────────────────┤
│  [Story selector]  [duration]  [step size]    [▶Run][⏸Pause][⏹Stop]│ ← each Tab's independent ControlBar
├─────────────────────┬─────────────────────────────────────┤
│  Left column 40%: input area  │  Right column 60%: result area                   │
│                     │                                     │
│  Sim: Variables /   │  Sim: curve chart + Log                 │
│  Regimens / Evidence│  Opt: progress chart + Pareto scatter          │
│  Opt: the same, each dimension  │       + the Solutions table              │
│  markable 🔒/🔀        │                                     │
├─────────────────────┴─────────────────────────────────────┤
│  Progress bar ████████░░ 80%                                     │
└───────────────────────────────────────────────────────────┘
```

### The Sim Tab's left column: the input area in detail

The left column has three collapsible blocks: VARIABLES (initial state values), REGIMENS (the intervention plan list), EVIDENCE (read-only literature values). The Parameters panel belongs to the Modeller tool (not yet implemented) and is not shown in the Simulator.

Each Regimen, once expanded, shows its four dimensions. The `value` field displays a **one-time intake amount** with a unit, not a rate.

```
┌─── VARIABLES ──────────────────────────────────────┐
│  liver_fat_percentage    initial value: [15.0] %           │
│  body_weight             initial value: [72.0] kg          │
└────────────────────────────────────────────────────┘

┌─── REGIMENS ───────────────────────────────────────┐
│                                          [+ Add]  │
│                                                    │
│  ▼ Breakfast eating                              [×Delete]   │
│  ┌──────────────────────────────────────────────┐  │
│  │ Validity period: [Off ▼]                             │  │
│  │                                              │  │
│  │ Time / intake amount:               [+ Add a time]   │  │
│  │   [07:30]  →  [0.5 kg]      [×]             │  │
│  │                                              │  │
│  │ Weekly: ☑Mon ☑Tue ☑Wed ☑Thu ☑Fri ☑Sat ☑Sun          │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ Insulin injection                            [×Delete]   │
│  ┌──────────────────────────────────────────────┐  │
│  │ Validity period: [2024-02-01] ~ [2024-06-30]  [✓On] │  │
│  │                                              │  │
│  │ Time / intake amount:               [+ Add a time]   │  │
│  │   [08:00]  →  [10 IU]       [×]             │  │
│  │   [20:00]  →  [ 8 IU]       [×]             │  │
│  │                                              │  │
│  │ Weekly: ☑Mon ☑Tue ☑Wed ☑Thu ☑Fri ☑Sat ☑Sun          │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ Aerobic exercise                              [×Delete]   │
│  ┌──────────────────────────────────────────────┐  │
│  │ Validity period: [Off ▼]                             │  │
│  │                                              │  │
│  │ Time / intake amount:               [+ Add a time]   │  │
│  │   [07:00]  →  [45 min]      [×]             │  │
│  │                                              │  │
│  │ Weekly: ☑Mon ☐Tue ☑Wed ☐Thu ☑Fri ☐Sat ☐Sun          │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

┌─── EVIDENCE ───────────────────────────────────────┐
│  (read-only, already converted by the Loader, affecting the dynamics but not entering optimization)   │
│  combat_death_rate   ir   0.008 / day              │
│  smoking_rr          rr   14.0                     │
│  obesity_or          or   1.65  → effective 1.43   │
└────────────────────────────────────────────────────┘
```

### The Opt Tab's left column: the input area in detail

The Opt Tab shares the same underlying data structure as the Sim Tab's REGIMENS panel, but each dimension can be marked locked or optimized:

**🔒 = locked** (a fixed value, not searched)　**🔀 = optimized** (a range given, searched by the optimizer)

Toggle granularity: can be switched per whole Regimen, or per individual time row, or per validity period, or per weekly-days set.

```
┌─── REGIMENS (optimization mode) ────────────────────────────┐
│                                                    │
│  ▼ Breakfast eating                                        │
│  ┌──────────────────────────────────────────────┐  │
│  │ Validity period: 🔒 [Off]                            │  │
│  │                                              │  │
│  │ Time / intake amount:                               │  │
│  │   Time:   🔒 [07:30]                         │  │← the time is fixed
│  │   Intake amount: 🔀 [0.3 kg ~ 0.8 kg]              │  │← the amount is to be searched
│  │                                              │  │
│  │ Weekly: 🔒 ☑Mon ☑Tue ☑Wed ☑Thu ☑Fri ☑Sat ☑Sun       │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ Insulin injection                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Validity period: 🔒 [2024-02-01 ~ 2024-06-30]        │  │
│  │                                              │  │
│  │ Time 1 / intake amount 1:                             │  │
│  │   Time:   🔀 [06:00 ~ 10:00]                │  │← both the time and the amount are searched
│  │   Intake amount: 🔀 [5 IU ~ 20 IU]                 │  │
│  │                                              │  │
│  │ Time 2 / intake amount 2:                             │  │
│  │   Time:   🔒 [20:00]                         │  │← the evening time is fixed
│  │   Intake amount: 🔀 [4 IU ~ 15 IU]                 │  │
│  │                                              │  │
│  │ Weekly: 🔒 ☑All selected                              │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ Aerobic exercise                                        │
│  ┌──────────────────────────────────────────────┐  │
│  │ Validity period: 🔒 [Off]                            │  │
│  │                                              │  │
│  │ Time / intake amount:                               │  │
│  │   Time:   🔀 [06:00 ~ 09:00]                │  │
│  │   Intake amount: 🔀 [20 min ~ 90 min]              │  │
│  │                                              │  │
│  │ Weekly: 🔀 [3] ~ [5] days (the optimizer chooses which days)      │  │← a day-count range search (daysNMin~daysNMax)
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

┌─── OBJECTIVES ──────────────────────────┐
│  + Add an objective                                        │
│  ① liver_fat_percentage    direction: [Minimize ▼]  [×]  │
│  ② alt_enzyme_level        direction: [Minimize ▼]  [×]  │
└────────────────────────────────────────────────────┘

┌─── CONSTRAINTS ─────────────────────────────┐
│  + Add a constraint                                        │
│  alt_enzyme_level   ≤  [120]  U/L                 │
│  weekly_exercise    ≥  [60]   min                 │
└────────────────────────────────────────────────────┘

┌─── Algorithm configuration ────────────────────────────────────────┐
│  Algorithm: [NSGA-II ▼]    Population: [100]    Generations: [200]   │
│  Current search dimensionality: d = 9 (computed and displayed automatically)              │
└────────────────────────────────────────────────────┘
```

**Real-time computation of the search dimensionality d**: the UI automatically counts every 🔀 dimension and displays the current $d$ value, helping the user gauge the problem size (a hint to increase the population when $d > 20$).

### The Sim Tab's right column: the result area in detail

```
┌─── The simulation curve ──────────────────────────────┐
│  [liver_fat%] [alt_level] [glucose] + Add     │  ← variable selection
│                                                 │
│  100%│                                          │
│      │  ╲                                       │
│   50%│    ╲___                                 │
│      │        ╲___________                     │
│    0%└──────────────────────→ time (days)          │
│        0      30      60      90               │
└─────────────────────────────────────────────────┘

▼ Log  [Copy] [Download]
  12:34:05 Model: ckd_protein_a4 (31 vars, 12 equations)
  12:34:05 Imports: references/medical/physiology/glucose_regulation_2026_mw
  12:34:05 Sim: start=2026-01-01, step=1 day, 365 steps
  12:34:05 Outputs (5): GFR, muscle_mass, lm_score, ...
  12:34:07 Done in 2.3s — 365 steps
  12:34:07 Schedule hits: dietary_protein=1095
```

The Log panel appears at the bottom of the curve area (collapsible), shown only when there is log content.  
For the detailed content-layering rule, see [ADR 0093](decisions/0093-2026-06-05_sim_runtime-log-panel.md).

### The Opt Tab's right column: the result area in detail

Progress is shown while optimization is running; on completion, a Pareto scatter plot (hover tooltip only, no click-selection/preview panel) plus the Solutions table (multi-select checkboxes plus Send to Sim, interaction detail in the "Optimization: the shape of Pareto output" section above) are shown:

```
┌─── Optimization progress ────────────────────────────────────┐
│  Generation 45/200  ████████░░░░░░░  the population is converging  │
└─────────────────────────────────────────────────┘

┌─── The Pareto front ──────────────────────────────────┐
│  Objective 1: the reduction in liver_fat (↑ better)                  │
│   ↑                                              │
│   │        *  *        (a hover tooltip shows the objective values)    │
│   │      *                                       │
│   │    *                                         │
│   │  *                                           │
│   └────────────────────→ Objective 2: the peak ALT (← better)  │
└───────────────────────────────────────────────────┘

┌─── Solutions (the Pareto solution list) ───────────────────────┐
│ ☑ #  x1     x2    …  liver_fat  ALT                │
│ ☑ ★  0.42   06:30 …  -42%       98                 │  ← the reference solution highlighted
│ ☐ 2   0.38   07:00 …  -35%       85                 │
│ …(80 rows maximum)                                     │
│ [Send to Sim (2)]  [Clear]              [Download]  │
└───────────────────────────────────────────────────┘
```

The "right-column metadata area" envisioned early on (a model's cited literature / constraint status ✅⚠️ / parameter confidence ★) was never implemented, and no ADR or code trace shows it was ever on the development plan — the two-column 4:6 layout evolved directly from an earlier single-column scheme in ADR 0079, with no intervening three-column stage, so that description is not kept here.

---

> For the YAML model format specification, see [`model_design.md`](model_design.md).

## Optimization objectives and methods

The full specification of the optimization-objective format (`optimization.objectives`) and the algorithm-selection/parameter-expansion is in [opt.md](opt.md) and not duplicated in this section.

Key points: an objective is not a preset name string, but an `objectives: [{variable, metric, direction}]` list; there are only two algorithm backends — `NSGA-II` (for multi-objective or when explicitly specified, the `pymoo` library, outputting a Pareto front) and `scipy` (`L-BFGS-B`/`Nelder-Mead`, single-objective continuous optimization).

The GUI's algorithm dropdown (`OptSetupTab.tsx`) actually offers four options: NSGA-II / MOEA-D / L-BFGS-B / Nelder-Mead. Of these, **MOEA-D is currently an alias for the NSGA-II backend**, not an independent implementation — `optimizer_engine.py` routes both `method: moea/d` and `nsga2`/`nsga-ii` to the same `_run_nsga2` (`optimizer_backends.py` has only one multi-objective algorithm, NSGA-II); the GUI side has not yet labeled this accurately.

---

## Result exchange: CSV and YAML (ADR 0094)

### The core principle

**CSV is the universal result-exchange format.** Importing a CSV is the only operation that needs to be understood; its consequence follows naturally from the nature of whichever tab it happens in:

| Tab | Exporting CSV | Importing CSV → the automatic consequence |
|--------|---------|---------------------|
| **Sim** | see "the Sim CSV export format" below | adds a labeled comparison curve |
| **Opt** | the Pareto front (x0…xN, obj1…objN) | merges into the current front, automatically turning on a warm start |
| CLI --sim-only | automatically outputs `_sim.csv` | — |
| CLI --opt-only | automatically outputs `_opt.csv` | `--opt-continue [TIMESTAMP]` |

"Multi-curve comparison" and "warm start" are not separate features; they are the direct consequence of importing a CSV in their respective contexts, needing no separate learning.

### The Sim CSV export format (ADR 0108)

The export covers every plan (the current run plus the Run All Plans result plus any historical curve imported from a CSV):

| Case | Format | File name |
|------|--------|--------|
| No comparison curve (a single plan) | a wide-table CSV, columns = `step, time, var1, var2 …` | `model_start_end.csv` |
| With a comparison curve (multiple plans) | a ZIP, one CSV per variable | `model_start_end.zip` |

With multiple plans, each variable's CSV format:

```
time_s,time_h,Plan A,Plan B,…
0,0.0000,5.0,4.8,…
```

All plan curves for the same variable are gathered into one file, for convenient side-by-side comparison. The download button is disabled when there is no simulation data at all.

### The Sim simulation history curve

Every time **Run** is clicked, if a completed simulation result already exists, the engine automatically snapshots it as a labeled history curve (label format: `Sim 2026-01-01 · 1h`), kept in the chart's comparison area. The new simulation is overlaid on top of it.

Comparison-curve behavior:
- **Source**: a CSV import or an automatic snapshot on Run, both going into the same list
- **Label**: a CSV source uses its file name; an automatic snapshot uses the format `Sim {start date} · {step size}`
- **Closing**: every curve has a × button on its switch bar, clicking it removes that curve from the comparison area
- **Lifecycle**: switching models or clicking reload clears both the current simulation result (simulationData) and every comparison curve at once; simulation data is isolated between models and never reused across models

### YAML download (save as)

A YAML download **never overwrites the source file** (save-as semantics), and the Sim and Opt tabs behave identically:

- **With an opt result** → automatically writes the `optimization.results` block into the copy and downloads it, telling the user the number of included solutions via `message.success`
- **Without an opt result** → downloads the plain model definition, likewise reported via `message.success`

### Report and image export (ADR 0122)

The report-export button (`ReportButton.tsx`) is an independent shared component, mounted in the toolbar slot of both SimControlBar and OptControlBar. Export formats:

| Format | Trigger | Behavior |
|------|------|------|
| **HTML preview** | a menu option | opens in a new tab, with images embedded inline as base64, self-contained with no network needed |
| **MD export** | a menu option | downloads a `.zip` containing `report.md` (referencing images by relative path) plus an `images/` directory (PNG files) |

MD export uses a ZIP rather than a single file because the Markdown standard does not support base64 data URLs — none of the mainstream viewers (GitHub, Obsidian, VS Code, etc.) can render an embedded base64 image; a ZIP plus relative paths is the only universal solution.

**The image-generation rule**: one PNG is generated per variable per plan, with no curves overlaid on top of each other. The file name format is `{varName}_{planLabel}.png`. With multiple plans, a `**— Plan name —**` separator is inserted before each image's group in the MD body.

**The three-tier data-source fallback** (`effectiveSimData`): `simulationData` (the current simulation) → the last entry of `importedSimRuns` (a historical archive) → the first plan with data in `comparedPlans` (a Pareto-solution simulation). The third tier guarantees the Overview and the report never show "No data" once an opt workflow finishes.

**Per-variable PNG download**: in each variable's Collapse header row, the `extra` slot in SimPlotTab provides two side-by-side download buttons, PNG and CSV. With a single plan, a single PNG downloads directly; with multiple plans, a ZIP containing each plan's own image downloads.

### Removed

`saveResultsToFile()` (writing a result directly over the source file) has been permanently removed. A result now flows only through CSV (exchange) or a YAML save-as (archiving/publishing).
