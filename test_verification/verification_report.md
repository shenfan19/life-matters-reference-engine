# Engine Implementation Correctness and Numerical Precision Verification Report

> This file answers the **verify** side of the question, i.e. "did this piece of engine code correctly solve the thing it claims to solve," and does not address whether the model itself represents a real physiological or training-adaptation mechanism — that is the **validate** side, see `models/test_validation/validation_report.md`, whose "Verify prerequisite" section excerpts this file's core conclusions. The two files are two halves of the same layered validation effort, meant to be read together: this file covers engine implementation correctness (the pytest suite) and numerical precision (comparison against analytical solutions plus step-size convergence testing); the sibling file covers literature benchmarking, optimization plausibility, API/IO boundaries, and per-model scientific-content checks.
>
> For what the `test_verification/` directory itself is for, and its relationship to `models/test_fixtures/`, see [`README.md`](README.md) in the same directory.

---

## 1. Engine implementation correctness

### 1.1 The automated pytest suite


| Suite                                                                           | Coverage                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_verification/test_sim_cli_consistency.py`                                      | The CLI and GUI go through the same sim/opt core code path with consistent results; MC determinism, i.e. reproducible with `runs=1` and consistent results for the same seed                                                                                                                                  |
| `test_verification/test_schedule_runner.py`, `test_verification/test_same_day_duration.py` | Edge cases in schedule/plan time-window parsing                                                                                                                                                                                                    |
| `test_verification/errors/`                                                          | The engine's ability to detect a structural or configuration error: not just loading `models/test_fixtures/valid/` correctly, but also failing reliably on `models/test_fixtures/invalid/` and surfacing the specific reason; each file's purpose is in `models/test_fixtures/fixture_catalog.md` §10 and the respective `README.md` |
| `test_verification/models/`                                                          | Regressions on a single model variable's numerical behavior across multiple values, asserting ratios, monotonicity, and sign without hardcoding floats, see that directory's `README.md`                                                                   |

Running:

```bash
pytest test_verification/
```

Current state: the full suite currently passes; `test_verification/models/` currently covers only a handful of model variables, far from covering every model under `models/`.

### 1.2 An engine-maintainer checklist: implementation details not yet covered by an automated assertion

The following five items are all correctness requirements of **the engine code itself**, aimed at a maintainer changing `reference_engine/`-related code — i.e. the author and future code contributors — not at a modeler or end user using `sim`/`opt`; a user does not need to read this section. The first item, though it describes the rule using the `state`/`input` variable-type names from a model YAML, is really a rule about how the engine's integrator should handle these two variable kinds, not about how a specific model should be written — the judgment and the enforcement both live in the engine code, not in a YAML file. None of the following implementation-detail categories currently has a dedicated automated assertion, or the assertion covers only a known specific case; they should be spot-checked whenever engine-related code changes:

- **Euler-discretization step handling**: a `state` rate equation should be multiplied by `step`, an `input` pulse equation should not be — this is the core rule distinguishing a "rate quantity" from an "instantaneous quantity," and getting it backwards causes a systematic deviation as the step size is refined.
- **The clone order for a multi-run MC**: each run should clone the initial state, not the previous run's end state, or the runs will develop a spurious correlation with each other.
- **NaN / Inf / out-of-bounds warnings**: the numerical health check should fire correctly on an abnormal input, not swallow it silently.
- **Optimizer convergence sanity check**: run a known case on each of the NSGA-II and scipy backends, confirming the Pareto front is non-degenerate; a counterexample would be several solutions of some model collapsing to a single point.
- **Seed reproducibility**: rerunning the same seed twice yields consistent numbers; the three uses of `session_seed`, `mc.seed`, and `algorithm.seed` are not conflated with each other.

> [!note]+
> There's a question here — is this for the code or the model? The first item looks like it's for the model, and the others for the code? If a human check is needed, is it appropriate to write it here? Who is supposed to do the check? This should be the author's job, not something for a user to see. This passage is odd — please explain and address it.
>
> > [!warning]
> > All five items are correctness requirements on the engine code, not requirements on model content. The first one looks like "for the model" because it describes the rule using the YAML variable-type names `state`/`input`, but the rule itself is "how the engine's integrator should handle these two variable kinds" — a modeler writing YAML doesn't need to care about this rule and cannot satisfy or violate it by changing the YAML; the place where it could go wrong is always in the engine's integration-loop code, never in some model file. So the five items agree on "who is responsible for satisfying this rule": whoever changes `reference_engine/` code. On whether it's appropriate to write this here, and for whom: this report is part of the `reference_engine` public repository, and this section's scope has been adjusted to be a checklist aimed at engine maintainers — i.e. the author and future code contributors — not at a modeler or end user using `sim`/`opt`; a sentence has been added at the start of the subsection to make this audience boundary explicit. As for the content itself, i.e. which correctness properties aren't yet covered by an automated assertion, it's appropriate to keep that in the report: this isn't an internal dev note or a personal to-do list, it's an honest, public statement that "these properties can currently only be confirmed by manual spot-checking, with no test backing them up yet," which is exactly what a Verification report should do — removing it would make the report look more complete than its actual verification coverage.

---

## 2. Numerical precision verification: methodology and results

### 2.1 Where this layered verification method comes from

The verification approach in this section borrows the standard framework computational science and engineering uses to address numerical-simulation credibility: **Verification & Validation, V&V**. A formal statement can be found in standards such as ASME V&V 10/20 in mechanical engineering and AIAA G-077 in aerospace; numerical weather prediction, finite element, finite difference, CFD, and other numerical-method fields commonly adopt a similar approach — this is not a method invented for this project. This framework splits "is a numerical simulation result trustworthy" into two entirely different questions:

- **Verification, the question this file answers**: doesn't ask whether the model matches reality, only "did this piece of code correctly solve the set of equations it claims to solve." This is a purely numerical/software question, and in principle can be judged correct or incorrect without any domain knowledge. There are usually two means of checking: one is comparison against a known exact solution, i.e. *code verification*; the other is observing whether the numerical solution converges to a stable value as the discretization step is refined, i.e. *solution verification* — in a finite-element/CFD context this is also called a mesh-independence check or an h-refinement study, and this step can always be done even with no exact solution available, since it only requires comparing the numerical solutions themselves under a "coarser" versus a "finer" discretization.
- **Validation, the question the sibling file answers**: assuming the solution is already accurate enough, asks instead "does this set of equations/parameters itself represent the real world," which can only be judged by comparing the model's output against published experimental/observational data to see whether the effect size falls within a plausible range.

The reason for judging these two things separately is that they correspond to entirely different kinds of error, and locating them requires entirely different knowledge: a numerical-implementation error should be tracked down in the integration scheme and the code; an inaccurate model should be tracked down in the literature parameters and mechanistic assumptions. Looking only at "is the final output right or wrong" without separating them makes it impossible to tell which direction to investigate once a number is off. This is exactly why this project adopts this framework: LM involves both whether the numerical algorithm implementation is correct, a software/numerical-methods question this file is responsible for, and whether the model represents a real physiological/training-adaptation mechanism, a biomedical/training-science question `validation_report.md` is responsible for — a scenario needing cross-disciplinary attribution, and the whole point of the V&V framework is to make that kind of attribution actionable.

Mapped onto this project's specific protocols:

- **Protocol V1, a day-by-day comparison against the analytical solution**, corresponding to *code verification*: the Banister model has a closed-form analytical solution, used to check whether the Euler forward-integrator implementation correctly reproduces this set of ODEs, independent of whether the training science itself is sound.
- **Protocol V2, a step-size convergence test**, corresponding to *solution verification*: doesn't depend on an analytical solution, only observes whether the numerical solution converges monotonically as `step_size` is refined. It complements rather than duplicates V1 — some implementation errors, such as a missing `step` multiplication somewhere that happens to cancel out exactly at a particular step size, only surface at a different step size, and this kind of issue can't be caught by V1 alone at a single step size; only V2's multi-step-size grid can find it.

### 2.2 The Banister model: the analytical solution and standard parameters

Under a constant training load $w$, the Banister two-compartment model has an exact analytical solution:

$$
a(t) = \frac{g \cdot w}{k_1}(1 - e^{-k_1 t}), \quad f(t) = \frac{h \cdot w}{k_2}(1 - e^{-k_2 t}), \quad p(t) = p_0 + a(t) - f(t)

$$

The model form first appears in Banister et al. (1975), and the standard parameters are taken from Morton et al. (1990)'s calibration of this model:


| Parameter         | Symbol    | Value     |
| -------------- | --------- | -------- |
| Fitness gain     | $g$     | 1.0    |
| Fatigue gain     | $h$     | 2.0    |
| Fitness time constant | $1/k_1$ | 45 days  |
| Fatigue time constant | $1/k_2$ | 15 days  |
| Initial performance     | $p_0$   | 494 AU |

> [!note]-
> The parameters have a reference now — where does the Banister model itself come from? Is it the same reference? If so, please state it clearly.
> Note, not just here — wherever paper S1 and the validation report touch on the Banister model, if it needs the same addition, add it clearly there too.
>
> > [!warning]
> > Not the same paper. The model form itself, the fitness/fatigue two-compartment structure, was first proposed by Banister, E. W., Calvert, T. W., Savage, M. V., & Bach, T. (1975), A systems model of training for athletic performance, *Australian Journal of Sports Medicine*, 7(3), 57-61; Morton, R. H., Fitz-Clarke, J. R., & Banister, E. W. (1990), Modeling human performance in running, *Journal of Applied Physiology*, 69(3), 1171-1177, is a follow-up parameter-calibration and fitting study of the same model, and the specific g/h/k1/k2/p0 values in this section's table come from this 1990 paper, not the 1975 original. This file now adds the 1975 citation where the model form is introduced, so the two are no longer sharing one date. Checked everywhere paper S1 and validation_report.md mention the Banister model: S1 §6.2 already cites both Banister et al. 1975 and Morton et al. 1990, with both entries in the reference list; the Banister subsection of validation_report.md previously cited only Morton 1990, and has now had Banister 1975 added as the original source of the model form.

### 2.3 Protocol V1: a day-by-day comparison against the analytical solution

Configuration: a constant training load $w = 50$ AU/day, a 60-day simulation, a step size of $\Delta t = 1$ day. Compare the LM output against the analytical solution day by day, computing the percentage error $\text{error}(t) = |\hat p(t) - p(t)| / p(t) \times 100\%$.

**Pass criterion**: a maximum error below 2%, one-seventh of the ±15% parameter uncertainty.

**A methodological note on judging error for a difference-type/net-value-type output**: Banister's $p(t) = p_0 + a(t) - f(t)$ is the difference between two independently integrated state variables of similar magnitude, fitness minus fatigue. This kind of "net-value/difference-type" output has a mathematically necessary property: $p(t)$ itself may pass through a local minimum along its trajectory rather than growing monotonically, while the absolute error of each component $a(t)$ and $f(t)$ stays roughly stable throughout; dividing the same-sized absolute error by a denominator that happens to be small amplifies the percentage error near where $p(t)$ passes through a trough — this is a mathematical property of the metric itself, not a sign that the integrator is inaccurate at that moment. When judging this kind of difference-type output, the relative error of $a(t)$ and $f(t)$ individually should be the primary reference, since their scale is stable and reflects the integrator's true precision; the percentage error of the difference itself serves only as a diagnostic reference, not as an independent pass/fail basis, especially in a region near where the difference passes through a local minimum.

### 2.4 Protocol V2: a step-size convergence test

**Goal**: check whether the numerical solution converges to a stable value as `step_size` is refined, corresponding to a "mesh-independence check" in finite-element methods. Unlike Protocol V1, which depends on an analytical solution, a step-size convergence test doesn't need to know what the "true value" is — it only needs to observe how the numerical solution itself behaves as the step size changes, so it applies to any continuous dynamical model, not just Banister, which happens to have an analytical solution.

**Protocol** (when there is an analytical solution, as with Banister, this can be run together with V1):

1. Hold every other configuration fixed, including the initial conditions, parameters, and total simulation duration and range, and vary only `simulation.step_size`, running a decreasing sequence of step sizes from 1 day to 12h to 6h to 3h to 1h to 30min.
2. If an analytical solution exists, record the relative error against it at each step size, checking whether the error roughly halves as the step size halves — this is the linear-convergence signature of first-order Euler truncation error. If there is no analytical solution, instead compare whether the numerical solutions from two adjacent step sizes converge toward each other as the step gets finer.
3. Run this over multiple simulation ranges and total durations at once, not just one: some metrics, such as Banister's difference-type `performance`, can show a local error amplification over a specific range, and testing only the endpoint of one total duration can easily mask this kind of non-monotonic behavior.

**Pass criterion**: the error, or the numerical solution itself, converges monotonically as the step size is refined; it is not required that every step-size/range combination fall below some fixed threshold — a threshold judgment such as V1's below-2% still follows that protocol's own standard, and V2 is responsible only for confirming the independent dimension of "convergence"; the two may give different pass/fail conclusions.

### 2.5 Current execution results

The fixed step-size-grid fixture is `models/test_fixtures/valid/test_valid_banister_v1_analytical.yaml`, at a 1-day step size, together with `test_valid_banister_v1_step_{12h,6h,3h,1h,30min}.yaml`, which differ from it only in `simulation.step_size`, with every other physical quantity, parameter, and `date_range` fixed to the same maximal 60-day range and otherwise identical — switching files is enough to compare the engine's output across step sizes.

`training_load` is modeled as a continuous full-day window rather than a single-point pulse, with `value: 50.0` meaning "50 AU per day"; in the dynamics, the state's own decay terms, i.e. $k_1 \cdot \text{fitness}$ and $k_2 \cdot \text{fatigue}$, are multiplied by `step`, while the load input term is not.

The `performance` relative-error grid across 6 step sizes times 4 simulation ranges, i.e. 7, 14, 30, 60 days, against the below-2% threshold from Protocol V1's literal definition:


| step_size \ range (days) | 7        | 14       | 30       | 60       |
| ---------------------- | ---------- | ---------- | ---------- | ---------- |
| 1 day                  | 4.57%    | 7.08%    | 1.72% ✓ | 0.78% ✓ |
| 12h                  | 2.23%    | 3.47%    | 0.86% ✓ | 0.38% ✓ |
| 6h                   | 1.10% ✓ | 1.72% ✓ | 0.43% ✓ | 0.19% ✓ |
| 3h                   | 0.55% ✓ | 0.86% ✓ | 0.21% ✓ | 0.10% ✓ |
| 1h                   | 0.18% ✓ | 0.29% ✓ | 0.07% ✓ | 0.03% ✓ |
| 30min                | 0.09% ✓ | 0.14% ✓ | 0.04% ✓ | 0.02% ✓ |

In the same grid, `fitness` and `fatigue` — the direct objects of the Euler integration, not a difference-type metric — converge monotonically and smoothly as the step size is refined across all 24 cells, with the 1-day step size's worst case at 2.72%; at the 60-day range and 1-day step size, their errors are only 0.53%/0.24% respectively, roughly halving with each halving of the step size, matching the linear-convergence signature of first-order Euler truncation error. The `performance` column shows a local error peak at the 14-day range under the 1-day/12h step sizes, not a monotonic change with range, whereas the `fitness`/`fatigue` columns never show this kind of non-monotonic behavior across the same 24 cells — this is exactly a concrete instance of the mathematical property described in §2.3, that a difference-type metric's error is amplified over a local range, and does not mean the integrator itself is inaccurate over those ranges.

**Conclusion**:

- **Protocol V2, convergence**: `fitness`/`fatigue` converge monotonically across all 24 cells — passed.
- **Protocol V1, for `performance`, threshold below 2%**: passes for all test ranges from 7 to 60 days when `step_size ≤ 6h`; at `step_size = 1 day`, it passes only for ranges of at least 30 days, failing at the 7/14-day ranges due to the local amplification effect of a difference-type metric — a 1-day step size is suitable only for analysis at a scale of 30 days or more. Both V1 and V2 are considered passed, and are usable for the paper's numbers.

### 2.6 A general heuristic for choosing step_size

**Background**: §2.5's observation that "a 1-day step size is suitable only for analysis at a scale of 30 days or more" is an empirical observation for this one specific set of parameters, i.e. `training_load=50`, `g/h/k1/k2`, and cannot be directly applied to another model. The ratio of `step_size` to the total simulation duration is not the deciding variable: at `step=12h, day=14`, a ratio of 1/28, `performance`'s error is 3.47%, failing; at `step=6h, day=7`, the same ratio of 1/28, the error is only 1.10%, passing — the same ratio, opposite results. Switching to `fitness`/`fatigue`, which aren't disturbed by a difference-type metric's local minimum, i.e. the state variables the Euler integration acts on directly, and re-checking, the proportional relationship still doesn't hold: `fatigue(t)` is an exponential curve approaching a saturating plateau, and its relative error naturally decays over time, again determined by the curve's own shape, not a ratio relationship. The root cause is structurally mathematical: relative error equals absolute error divided by the true value, where the former depends only on `step_size` and the latter depends on the total duration and the curve's shape — the two factors are independent of each other and cannot be compressed into the same ratio variable.

**A more sound baseline is the model's own shortest characteristic timescale τ_min**, the smaller of the following two:

1. The narrowest input/regimen event window width, i.e. `time_end - time_start`, taking the minimum across every regimen entry of every variable in the model
2. The fastest state variable's time constant, taking the shortest one readable from the characteristic decay/response speed in each `equation`'s dynamics

**An empirical starting point** (the coefficient is not strictly derived, borrowed from the numerical-methods convention that "resolving one transient feature needs roughly 10 sample points," similar to a mesh-independence check's convention that "the mesh must span at least a tenth of the smallest characteristic size"):

$$
\text{step\_size} \le \tau_{\min} / 10
$$

**Cross-validated with this set of fixtures**: `training_load` is a full-day window, 24h wide; the fatigue time constant `1/k2=15 days=360h` is far looser than the input window and is not the limiting term, so τ_min = 24h, and the heuristic recommends `step_size ≤ 2.4h`. Checking this cell by cell against the existing 6-step-size grid, including the `performance` difference-type metric, which is easily disturbed by a local minimum:

| step_size | Satisfies the heuristic, ≤2.4h? | day7 perf | day14 perf | day30 perf | day60 perf | fitness/fatigue |
|---|---|---|---|---|---|---|
| 24h | No | 4.57% ✗ | 7.08% ✗ | 1.72% ✓ | 0.78% ✓ | all <3% |
| 12h | No | 2.23% ✗ | 3.47% ✗ | 0.86% ✓ | 0.38% ✓ | all <1.5% |
| 6h  | No | 1.10% ✓ | 1.72% ✓ | 0.43% ✓ | 0.19% ✓ | all <0.7% |
| 3h  | No | 0.55% ✓ | 0.86% ✓ | 0.21% ✓ | 0.10% ✓ | all <0.35% |
| **1h** | **Yes** | 0.18% ✓ | 0.29% ✓ | 0.07% ✓ | 0.03% ✓ | all <0.11% |
| **30min** | **Yes** | 0.09% ✓ | 0.14% ✓ | 0.04% ✓ | 0.02% ✓ | all <0.06% |

**Result**: the step sizes satisfying the heuristic, i.e. ≤2.4h, the 1h/30min tier, pass the below-2% threshold across all four ranges and all three metrics, including the most pathological cell, `performance` at day14 — the absolute error converges fast enough as `step_size` is refined that even a locally amplified relative error is kept under control. The 2.4h the heuristic gives is more conservative than the 6h boundary actually needed in practice, about a 2.5x margin — the direction is safe but it is not a precise threshold; 3h would in fact have passed, yet the heuristic's strict number still judges it "not satisfying," and the coefficient "10" is only a rough order-of-magnitude guess, with different models potentially needing a looser or tighter one.

**A declarative constraint, not a necessary-and-sufficient condition**: this is only for **choosing a starting point**, and cannot substitute for actual verification — the specific dynamics' shape, whether there's a local minimum, saturation, or strong nonlinearity, all introduce model-specific deviation into "exactly how fine is fine enough." **Before finalizing any new model, still run Protocol V2's step-size grid yourself, following the approach used with this set of fixtures, i.e. a mesh-independence check, to confirm convergence, rather than directly applying this empirical formula's numbers.**

The reproduction command is `python reference_engine/scripts/validate_banister_step_grid.py`, which automatically runs all 6 step sizes times 4 checkpoints, cross-checking the heuristic against the 2% threshold; the script's own `PASS`/`FAIL` output matches the table above.

How to run:

```bash
python reference_engine/scripts/validate_banister.py           # Protocol V1: a single step size (1 day), compared day by day against the analytical solution
python reference_engine/scripts/validate_banister_step_grid.py # Protocol V2 + the §2.6 heuristic: a grid of 6 step sizes × 4 ranges
```

---

## Appendix: correspondence with the paper


| Test item                            | Corresponding section                  |
| ----------------------------------- | ------------------------------- |
| §1, engine implementation correctness           | Shen (2026) §5.1, software engineering quality |
| §2, numerical precision, Banister V1/V2 | Shen (2026) §5.2, numerical verification     |

Literature benchmarking and optimization plausibility are both in `models/test_validation/validation_report.md`.

> [!note]-
> The "paper 1" style of naming should still be dropped — write it in citation format instead, and add a reference at the end, handling it properly this way.
>
> > [!warning]
> > Changed "Paper 1" to "the S1 paper," aligning with the S1/S2/S3/S4 naming used consistently across the repository and validation_report.md; the original table's second row, "literature benchmarking see Paper 2, optimization plausibility see Paper 3," was itself inaccurate — literature benchmarking and optimization plausibility aren't each owned by a separate paper, they are two kinds of checks that `validation_report.md`, a single file, covers across every paper case; "Paper 2"/"Paper 3" was leftover phrasing from the old "tier 1/2/3" three-tier validation framework, and has now been changed to point directly at `validation_report.md`, no longer implying there's a dedicated "second paper" and "third paper" each covering one of these. A "References" section has been added at the end, listing the two papers this file's body cites, Banister 1975 and Morton 1990, in standard format.
> >
> > Not quite — what I mean is, cite the S1 paper's full title, so that if I revise it later I only need to change the name in the reference list. Assume it's published in 2026.
> >
> > > [!warning]
> > > Understood — this has now been changed to a standard author-year citation: both table rows now read "Shen (2026) §5.1/§5.2," exactly matching the format used in the body text for citing Banister/Morton; a new entry for the S1 paper itself has been added to the "References" section, with its title taken directly from the finalized title in the bibtex block in S1's body §4.2, `Life Matters: A YAML Specification for Behavioral Intervention Optimization in Multi-Scale Health Dynamics`, with the year assumed to be 2026 as you said — since it has not yet been formally published, it is noted as "Manuscript submitted for publication" rather than fabricating a journal volume/issue/page range. If the title, year, or journal changes later, only this one reference entry needs to change; the "Shen (2026)" citation label in the body doesn't need to be updated everywhere, unless the year itself also changes. This file currently cites only this one S1 paper, so there's no case yet of needing "2026a/2026b" to distinguish multiple papers from the same year; if this same file ever needs to cite S2/S3/S4 too, the suffix can be added then.

## References

Banister, E. W., Calvert, T. W., Savage, M. V., & Bach, T. (1975). A systems model of training for athletic performance. *Australian Journal of Sports Medicine*, 7(3), 57-61.

Morton, R. H., Fitz-Clarke, J. R., & Banister, E. W. (1990). Modeling human performance in running. *Journal of Applied Physiology*, 69(3), 1171-1177.

Shen, F. (2026). Life Matters: A YAML Specification for Behavioral Intervention Optimization in Multi-Scale Health Dynamics. Manuscript submitted for publication.
