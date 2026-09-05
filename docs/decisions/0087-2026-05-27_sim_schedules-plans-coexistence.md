# 0087 · 2026-05-27 · Sim · Coexistence semantics of `simulation.schedules` and `plans` (superseded by ADR 0109)

> **Status update (2026-06-17)**: D3 in this ADR (keeping backward compatibility for `simulation.schedules`) has been rescinded by **ADR 0109**. The only legal location for a model's simulation input is now `simulation.plans[*].schedules`; a top-level `simulation.schedules` is no longer allowed. The `optimizer.schedules` fallback chain has likewise been deprecated; see ADR 0109.

## Background

After the `simulation.plans` feature was introduced, two fields describing the simulation-input plan appeared in the YAML:

| Field | Semantics |
|------|------|
| `simulation.schedules` | the old format: the default schedule for a single plan, kept for backward compatibility |
| `simulation.plans` | the new format: a list of named plans, rendered directly by the GUI as parallel simulation plans |

After adding `plans`, all 14 models under papers/ kept `schedules` as well, which led to:
- The GUI never actually reading `schedules` (see the behavior analysis below), leaving it as redundant content
- Modelers mistakenly assuming `schedules` served as a fallback default for `plans`

## Observed GUI behavior (Simulator.tsx)

On a model's first load with no session, the GUI:

1. **Always parses `simulation.schedules` first**, converting it into `newInputEvents`
2. **If `simulation.plans.length > 0`**:
   - each plan builds its own `planEvents` independently from `plan.schedules`
   - `newInputEvents` is discarded (never assigned to any state)
   - the first plan's events become `inputEvents`, and the plans list is initialized
3. **If there are no `plans`**:
   - `newInputEvents` becomes the default single plan, and a single plan is initialized

**Conclusion: when `plans` is present, `simulation.schedules` has no effect on the GUI's simulation tab whatsoever.**

## Decision

### D1: when `plans` is present, `schedules` serves the optimizer, not the GUI sim tab

Making the semantic boundary of the two fields explicit:

| Field | When `plans` is present | When `plans` is absent |
|------|--------------|----------------|
| `simulation.schedules` | serves **only** as the fallback background for `optimizer.schedules`'s default | the GUI sim default single plan, plus the optimizer fallback |
| `simulation.plans` | the source of the GUI sim's multiple plans (the plans list) | — |

### D2: papers/ models are required to be plans-only, dropping the redundant schedules

Paper models have Pareto-front results, so multiple plans are naturally presented on load. Continuing to keep `schedules` around brings:
- YAML bulk the GUI never reads (noise)
- an ambiguous optimizer background source (an implicit fallback that's hard to trace)

Decision: **all models under papers/ drop `simulation.schedules`, keeping only `simulation.plans`.**

These models' optimizer decision variables cover every input variable, so no optimizer background is needed;
after dropping `schedules`, the fallback chain resolves to an empty background, which is correct behavior.

### D3: other models (references/, etc.) keep backward compatibility

Non-papers models are not required to make this change; the `schedules` single-plan mode remains fully legal.
A newly built single-plan model with an optimizer can continue to use `schedules`.

### D4: current GUI behavior is unchanged

The "plans take priority, schedules discarded" behavior is already stable; only the documentation is being filled in.

## The optimizer.schedules fallback chain (the complete rule)

```
Is optimizer.schedules defined?
  |- Yes -> use optimizer.schedules (fully independent)
  |- No  -> use simulation.schedules (backward-compatible fallback)
              |- also absent -> no fixed background (the optimizer uses only its decision variables)
```

The presence of `simulation.plans` does not affect the fallback chain above.

## Files affected

- `docs/model.md` — added a description of "the behavior when both coexist" and made the papers-model convention explicit
- `models/papers/**/*.yaml` (14 files) — removed the `simulation.schedules` block
- No code changes (the behavior already matched expectations; only documentation was missing)
