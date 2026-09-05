# 0056 — Three-tier validation framework (numerical accuracy / literature benchmarking / optimization plausibility)

**Date**: 2026-05-04
**Status**: implemented (framework documented), some automation scripts pending

---

## Background

LM's simulation and optimization results will be used in academic papers. A systematic validation method is needed to demonstrate:

1. The numerical integrator itself has no implementation errors.
2. Model parameters are reasonable and outputs are medically credible.
3. The Pareto front produced by the optimizer makes clinical sense.

Previously there was no clearly defined validation protocol, relying only on visual inspection of curves.

---

## Decision

Adopt a **three-tier progressive validation framework**, documented in `docs/validation.md`:

| Tier | Name | Reference | Automation |
|----|------|--------|--------|
| Tier 1 | Numerical accuracy | Banister analytical solution (exact value) | fully automated script |
| Tier 2 | Literature benchmarking | key literature data points (effect-size ranges) | semi-automated + AI-assisted interpretation |
| Tier 3 | Optimization plausibility | guideline static-point positions + single-objective degeneracy consistency | manual + AI-assisted |

**The core design decision for Tier 2**: medical models are not matched point-by-point exactly; only whether the **effect size falls within the plausible range given in the literature** is verified (for example: HCTZ 25mg lowers blood pressure by 8-12 mmHg, per Law 2009).

**Report format**: a markdown report is generated, with a table of key time-point values embedded inline (roughly 5-15 rows); the full time-series data is stored as a separate CSV file, with its path noted in the report. AI can read the markdown report directly to assist judgment.

---

## Rationale

- Only Tier 1 allows exact comparison (since an analytical solution exists); the correct way to validate a medical model is range comparison, not exact matching.
- The three tiers serve different degrees of validation rigor (numerical accuracy / clinical literature benchmarking / optimization plausibility), each with different requirements, avoiding over-validation (Tier 2 does not need to be as precise as Tier 1).
- Embedding value tables inline in markdown makes AI-assisted reading possible without needing to parse the CSV separately.

---

## Update (2026-07-19): protocol numbering adjustment

The table above, "Tier 1 (Banister V1/V2/V3)," reflects the numbering envisioned when this ADR was written (2026-05-04), under which all three protocols belonged to Tier 1/verify. In the actual implementation, V2/V3 were given the meaning of "literature-scenario reproduction" (belonging to Tier 2/validate, not Tier 1/verify), and the step-size convergence test protocol later added to Tier 1 took the next available number, V4 — leaving the two numerical protocols that both belong to the verify tier (analytical-solution comparison, step-size convergence testing) non-adjacent in numbering, separated instead by the validate tier's literature-scenario protocols. This is purely a historical numbering artifact from implementation order and does not reflect the tiered design.

Renumbering has since aligned the tiers with contiguous numbers: **V1** (day-by-day analytical-solution comparison) + **V2** (step-size convergence testing, formerly V4) both belong to Tier 1/verify; **V3** (formerly V2) + **V4** (formerly V3, both literature-scenario reproduction) both belong to Tier 2/validate. The current definitions are authoritative in `test_verify/verification_report.md` §2; the table above in this file preserves the original design record and is left unmodified.
