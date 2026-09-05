# ADR 0045 — Probabilistic simulation and Monte Carlo architecture: parameter distribution expressions, multi-run engine, front-end rendering

**Date**: 2026-04-30 (decided 2026-04-24, recorded retroactively); 2026-06-04 addendum: sim/opt MC separation design
**Status**: implemented

**Partially superseded 2026-07-10**: decision two, "the GUI's simRuns/mcSeed no longer read from optimizer.mc," was superseded by
[ADR 0130](0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md) —
the Opt tab now has its own `optMcRuns`/`optMcSeed`, genuinely bound to `optimizer.mc`. That same ADR 0130 also
records a more serious, independent finding: `optimizer.mc.runs>1` had never actually taken effect, due to a
`reset_simulation()` timing bug, affecting 19 paper models.

---

## Background

Models contain individual variation (e.g. `cognitive_efficiency`, `plague_susceptibility`, `insulin_sensitivity`), which requires a mechanism to express parameter uncertainty and make that uncertainty visible across multiple simulation trajectories.

---

## Decision

### Decision one: `parameter` variables support distribution expressions

The `value` field of a `type: parameter` variable can hold a distribution string:

| Syntax | Meaning |
| --------------------- | -------------- |
| `normal(μ, σ)` | normal distribution |
| `uniform(a, b)` | uniform distribution |
| `lognormal(μ, σ)` | log-normal distribution |

- **Deterministic mode** (MC=1): uses the mean, equivalent to `value: μ`
- **MC mode** (MC>1): each run samples once with its own `np.random.default_rng(seed)`, and uses that sampled value throughout the run

```yaml
insulin_sensitivity:
  value: "normal(1.0, 0.25)"
  type: parameter
  bounds: [0.2, 2.5]
```

### Decision two: separating Sim MC from Opt MC (2026-06-04 update)

Sim and Opt MC configuration are fully separated, each with its own `mc:` block:

**Sim MC** (`simulation.mc`): controls the number of runs and seed for GUI visualization.

```yaml
simulation:
  mc:
    runs: 30      # absent or runs=1 = deterministic mode
    seed: 19      # optional; absent = random each time
```

**Opt MC** (`optimizer.mc`): controls the number of inner runs and the seed used each time the optimizer evaluates a candidate.

```yaml
optimization:
  mc:
    runs: 5       # run N times per candidate evaluation and average; absent or runs=1 = single evaluation
    seed: 19      # optional; absent = random each time
  algorithm:
    seed: 19      # NSGA-II genetic-algorithm seed, unrelated to MC
```

**Key separation principle**:

- `algorithm.seed` only governs NSGA-II population initialization and mutation randomness — it is **not** a fallback for mc.seed
- `simulation.mc.seed` and `optimizer.mc.seed` are entirely independent and do not inherit from each other
- Each seed lives alongside its own `mc:` block, so its meaning is self-evident

**Old format (deprecated)**:

```yaml
# deprecated format (no longer used)
optimization:
  mc:
    enabled: true     # replaced by the presence/absence of runs
    sim_runs: 20      # split into simulation.mc.runs and optimizer.mc.runs
```

### Decision three: front-end chart rendering

- N=1: a single solid line
- N>1: N semi-transparent thin lines (opacity ≈ 0.25) plus one bold mean line (opacity = 1.0)

### Decision four: Opt mode — multiple expectation iterations

Each time the optimizer evaluates a set of parameters, it runs `optimizer.mc.runs` simulations and takes the **mean** as the objective-function value, avoiding the generalization problems of a single fixed-seed run.

| Parameter | Default | Range |
| --------------------- | ------ | ------- |
| `optimizer.mc.runs` | 1 | 1-20 |

### Decision five: random seed management

**Sim path seed hierarchy (1 master seed → N lines)**:

- At session start: `session_seed` (master) → derives `[seed_1, ..., seed_N]` → each run samples independently
- All N curves are fully determined by 1 master seed; the user does not need to manage multiple seeds
- `session_seed` is returned from the start API, stored in front-end state, and shown in the toolbar Tooltip

**Users can set a fixed seed**:

- YAML `simulation.mc.seed` (integer) → read on the front end as `mcSeed` → passed as the `seed` field of `POST /api/simulation/start`
- `mcSeed = null` (the YAML field omitted) → the backend generates a random `session_seed` each time
- `mcSeed = <integer>` → the backend uses that value directly; the same seed plus the same model produces exactly the same N trajectories
- The opt engine reads `optimizer.mc.seed` (it does not fall back to `algorithm.seed`)
- Front-end toolbar: an MC× count input next to a "seed" label and seed input box (`placeholder="random"`)

**UI state lifecycle for `mcSeed` / `simRuns`**:

- On first model load: read from YAML `simulation.mc.seed` / `simulation.mc.runs`
- After a user edit: written into `ModelSession` (localStorage), at the same status as fields like `simStartDate`, `stepValue`
- Switching back to the same model: the user's edited value is restored from the session (not overwritten by the YAML default)
- Switching to a new model with no session: read from that model's YAML (both load paths are covered: with a session / without a session / without an mc block)

### Decision six: MC branch-visibility principle

MC branching **only appears in variables directly or indirectly affected by an MC parameter**. When building a model, ensure:

- A parameter with `normal(...)` must appear in the expression of at least one equation
- When observing branching, choose an output variable that this parameter feeds into computationally (not a schedule-driven deterministic variable)

---

## Outcome

```
sim_engine/src/optimizer_engine.py
  mc_runs read from optimizer.mc.runs (the enabled field removed; implicit: absent or runs=1 = single evaluation)
  mc_seed read from optimizer.mc.seed (no fallback to algorithm.seed)
  algorithm.seed used only for the NSGA-II genetic algorithm

sim_engine/src/session_manager.py
  start_session() supports sim_runs + an optional seed, pre-generates the seed list, runs N runs sequentially
  batch_steps() returns N sets of trajectory data plus a mean set

sim_gui/src/components/Simulator.tsx
  simRuns / mcSeed read from YAML simulation.mc.runs / simulation.mc.seed (no longer from optimizer.mc)
  mcSeed read unconditionally from YAML across every model-loading path

docs/model.md
  simulation.mc schema gains runs / seed fields
  optimizer.mc schema: enabled field removed, sim_runs → runs
  algorithm.seed annotated as "NSGA-II genetic-algorithm seed, unrelated to MC"

models/papers/**/*.yaml, models/test/**/*.yaml
  all optimizer.mc blocks migrated to simulation.mc blocks (for models with enabled=true)
  mc blocks removed for models with enabled: false (runs=1 or absent is already deterministic mode)
```
