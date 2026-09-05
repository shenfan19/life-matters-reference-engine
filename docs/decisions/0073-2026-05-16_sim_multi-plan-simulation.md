# ADR 0073 — Multi-Plan Simulation: Terminology, Data Model, and MC Interaction

**Date**: 2026-05-16
**Status**: adopted (the "Plan does not go into YAML" part has been superseded by ADR 0076)
**Scope**: LM-Simulator frontend + simulation-engine API

---

## Background

Pareto-front optimization produces a set of non-dominated solutions, each corresponding to a complete input time schedule (a regimen). Modelers need to run and visualize multiple regimens' simulation trajectories simultaneously, in order to compare tradeoffs directly.

This raises two questions that need an explicit decision:

1. **Terminology**: "inputs" already refers to input variables (YAML variables with `type: input`), so we need an unambiguous word for "one complete input configuration."
2. **MC interaction**: in multi-plan mode, how should Monte Carlo probabilistic perturbation interact with each plan?

---

## Terminology decision

### Existing terminology

| Term | Existing meaning | Layer |
|------|---------|------|
| Input | a YAML variable of `type: input` (e.g. `carb_intake`) | variable layer |
| Regimen | a time schedule (time → value) for one input variable | schedule layer |
| Schedule | a single time-event entry in YAML `simulation.schedules` | event layer |

### New term: Plan

**Decision**: introduce **Plan** as the standard term for "the complete input configuration behind one simulation run."

| Term | Chinese | Meaning |
|------|------|------|
| Plan | 方案 | a complete regimen configuration driving one simulation run |
| Multi-plan simulation | 多方案仿真 | running and comparing multiple Plans within the same chart |

**Why this word**:
- "Plan" semantically means "how one intends to feed inputs," which naturally maps onto the regimen concept, and doesn't clash with "input variable"
- "Strategy" is too broad semantically and easily confused with optimization objectives
- "Case" is commonly used in a testing context and would be ambiguous
- "Scenario" already has a specific meaning in LM-Game, so its reuse is avoided

**Naming convention**:
- Code layer: `Plan` (type name), `plans` (array), `activePlanId`
- UI layer (Chinese): 方案, 方案列表, 添加方案, 删除方案
- UI layer (English): Plan, Plans, Add Plan, Remove Plan

---

## Data model

A Plan is a frontend runtime object and is not persisted to YAML (a plan is a debugging/analysis tool, not part of the model definition).

```typescript
interface Plan {
  id: string          // unique id, e.g. "plan-1"
  label: string       // user-editable name, e.g. "High-protein plan"
  color: string       // the chart's distinguishing color, assigned from a preset palette
  inputEvents: InputEvent[]  // reuses the existing InputEvent structure (same as a single-plan regimen)
}
```

**Shared fields** (shared across all Plans, not owned by any single Plan):
- Model path (`modelPath`)
- Time range (`startDate` / `endDate`)
- Step size (determined by the model YAML)
- MC settings (`mcEnabled`, `mcRuns`, `mcSeed`)

**Single-plan degeneration**: when `plans.length === 1`, the UI does not show a plan list, and behavior is identical to the existing single-plan behavior.

---

## MC's interaction with multiple plans

**Decision**: MC perturbation runs **independently per plan**; each plan uses the same MC parameter configuration (runs, seed), but produces its own independent set of random samples.

**Rationale**:

| Question | Decision | Rationale |
|------|------|------|
| Does each plan run MC? | Yes, independently | the difference between plans is itself "the effect of different behavioral strategies under the same distribution of individual variation," which needs its own uncertainty band per plan |
| Same seed across plans, or different seeds? | Same seed | a shared seed keeps the randomly sampled population consistent, so differences between plans more purely reflect strategy differences rather than random-sampling noise |
| Are uncertainty bands overlaid? | Yes | within the same chart, each plan shows a mean curve plus a semi-transparent confidence band, colored to match the plan's color |

**Visualization rules**:
- Deterministic mode: one curve per plan
- MC mode: one mean curve plus one confidence band (default 5th-95th percentile) per plan

---

## Interaction with F-OS (Opt → Sim pass-through)

When running "in Sim" from the Opt panel:
- If there is currently only one Plan, that Plan's inputEvents are replaced with the selected solution's regimen
- If the user chooses "add as a new plan," a new Plan is appended to the existing Plans, with its label defaulting to the solution's index (e.g. "Pareto #3")

---

## Out of scope

- Saving plan configurations to YAML or a local file (a plan is a session-scoped object)
- Statistical significance testing between plans
- Comparing plans across different models (all plans must share the same model)
- More than 6 plans (the UI's color-distinguishability limit)
