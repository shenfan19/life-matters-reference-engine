# 0069 · Embedding optimizer.results in YAML and a stateless service architecture

**Date**: 2026-05-16
**Status**: ✅ Implemented
**Category**: data format / persistence / software architecture

---

## Background

Optimization results (the Pareto front, the optimal regimen) are LM's most valuable computed output, but previously:
- Opt results lived only in frontend React state and were lost when the browser closed
- There was no standard path for saving, resuming, or sharing results
- An earlier implementation (the previous version of ADR 0069, since superseded) persisted results server-side under a `runs/` directory, introducing a SaaS-level storage dependency that isn't maintainable for a scenario hosted by an individual researcher

## Core decision

### 1. Data format: embedded in YAML, results travel with the model

**Decision**: optimization results are written into an `optimizer.results` block, stored alongside the optimizer configuration in the same YAML file.

```yaml
optimizer:
  method: nsga2
  objectives: [...]
  results:                     # ← written after a run completes
    generated_at: "2026-05-16"
    pareto_front:
      - {x: [0.30, 0.29, 0.30], f: [65.8, 47.1]}
    best:
      regimen:
        dietary_protein: {"breakfast protein": 0.30, "lunch protein": 0.29, "dinner protein": 0.30}
      objectives: {muscle_mass: 65.8, GFR: 47.1}
```

**Rationale**:
- Publishing the model is publishing the results — one file contains all the information needed for reproduction
- Human-readable directly, with no post-processing tool required
- YAML flow style (one line per solution) stays around 50 lines for 50 solutions, without hurting file readability
- Fully consistent with the model format's YAML-first direction

**Rejected alternatives**:
- A separate JSON file (results.json): requires managing two files, easy to forget one on publication
- A server-side database: SaaS-level complexity, not maintainable for individual hosting

### 2. Stateless service architecture

**Decision**: the server does no persistent storage of any kind. The data flow:

```
User uploads model.yaml → server computes → user downloads model.yaml (with results) → server forgets
```

**Rationale**:
- For hosting by an individual researcher: no storage cost, no GDPR exposure, no user-account burden
- Scientists naturally trust a "you manage your own files" workflow (consistent with R/Python habits)
- Statelessness lets the server restart at any time without affecting user data

**Distinction from SaaS**: this is a "stateless compute service," analogous to Binder/RStudio Cloud, not a Notion/Figma-style SaaS.

### 3. Handling simulation results

**Decision**: simulation results (time series) are only offered as a CSV export; they are not saved to the server and cannot be re-imported to resume.

**Rationale**: simulation results are cheap (can be rerun at any time), and CSV is the format scientists find most universally usable (opens directly in Excel/R/Python). Checkpoint-and-resume adds little value for sim — "keep running after changing a parameter" is effectively equivalent to "rerun with the new parameter."

### 4. Warm start

**Decision**: when loading a model containing `optimizer.results`, the GUI automatically uses the `pareto_front`'s `x` vectors as the initial population for NSGA-II.

**Implementation**:
```python
# optimizer_engine.py _run_nsga2()
if warm_x:
    warm = np.clip(np.array(warm_x), xl, xu)
    fill = xl + rng.random((pop_size - len(warm), n_var)) * (xu - xl)
    sampling = np.vstack([warm, fill]) if len(warm) < pop_size else warm[:pop_size]
    algo = NSGA2(pop_size=pop_size, sampling=sampling)
```

**Advantage**: more flexible than a pickle checkpoint — pop_size or the generation count can be changed, and even the objectives can be slightly modified, instead of rigidly continuing from a prior exact state.

---

## Implementation scope

### New endpoint
- `POST /api/optimizer/write-results` — writes the `results` block back into the model YAML

### Modules changed
| File | Change |
|------|------|
| `optimizer_engine.py` | `_run_nsga2` gains a `warm_x` parameter; `run_optimizer` extracts `optimizer.results.pareto_front` |
| `api_server.py` | adds the `write-results` endpoint |
| `Simulator.tsx` | `exportSimCSV` (CSV download), `saveOptResults`, `downloadModelYAML`; `startOptimization` injects warm_start |
| `SimOptTab.tsx` | "save results to model" button, "download model" button, warm-start hint banner |

### Model files updated
All 5 published models with an optimizer block gained an `optimizer.results` sample:
- `paper1/fatty_liver_a1_p1` — single objective, demonstrates the format
- `paper2/ckd_protein_a4_p2`, `hypertension_gout_a5_p2` — two objectives
- `paper3/ckd_protein_pareto_a4_p3`, `hypertension_gout_3obj_a5_p3`, `smoking_stress_a6_p3` — 2-3 objectives, main paper cases

---

## Limitations

- **Opt results are lost on server restart**: if the user hasn't clicked "save results to model," an opt result is lost on server restart. Mitigated by keeping the GUI's Best panel visible after completion, giving the user a chance to save once they've seen the result.
- **No true checkpoint-resume for Opt**: warm-start can only inherit the prior front, not resume from the exact prior population state. This is sufficient for runs under an hour; for very long runs (hours), a pymoo checkpoint could be considered in the future.
- **No checkpoint-resume for Sim**: intentional (results are cheap to reproduce).
- **No history comparison**: each save overwrites the previous one, with no record of multiple runs. A future `history: [...]` list under `best` could store summaries of multiple runs.
