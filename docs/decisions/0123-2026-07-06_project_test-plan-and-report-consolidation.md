# 0123 — Test plan + test report merged, moved to `models/test/`

**Date**: 2026-07-06
**Status**: Accepted

---

## Background

Testing/validation documentation was previously scattered across four locations, none cross-referencing the others, with blurred boundaries of responsibility:

1. `docs/reference_engine/validation.md` (ADR 0056's three-tier validation framework: numerical precision / literature benchmarking / optimization plausibility), which referenced a `scripts/validate_banister.py` that had not yet been implemented.
2. `life-matters-home/process/c_paper_model_verify_checklist.md` (a manual A–F checklist for each YAML model).
3. `life-matters-home/tasks/2026-06-25_task_prelaunch-publish-verification-checklist.md` (a project-level pre-launch/pre-publication checklist, partially overlapping with #2, while also mixing in internal-only content such as deployment/security).
4. `tests/errors/README.md`, `tests/models/README.md`, `models/test/{valid,invalid}/README.md` (scope descriptions for the actual pytest suites, each referencing the three documents above in a scattered way).

There was no single distinction between "what is tested, how, and what the pass criteria are" (a plan) and "what has actually been tested and with what results" (a report); a new collaborator had to piece together the full picture across four repositories.

## Decision

### 1. Split into a plan and a report, placed under `models/test/`

- `models/test/test_plan.md`: static methodology — test scope, protocol, pass criteria. Merges #1 (the full three-tier framework), #2 (the full A–F checklist), and the general engine-numerical-correctness/API-IO checking methods from #3 (not the project-specific bug tracking).
- `models/test/test_report.md`: a dynamic execution record — each run/review appends a result entry, never overwriting history.

**Placed under `models/test/` rather than `docs/reference_engine/`**: the object under test is fundamentally the "engine + model" combination (the tier-2/tier-3 validations and the per-model checklist are all run against specific YAML models), and the model-ecosystem repository (`life-matters-models`) already has `models/test/` hosting test fixtures (`valid/`/`invalid/`). Keeping the plan and report alongside these fixtures, as part of the same "test infrastructure," is easier to maintain and reference than splitting them across `docs/reference_engine/` and `life-matters-home`.

### 2. The public/internal boundary: not every "test-related document" gets merged and moved

`models/test/` is published publicly along with the codebase (GitHub). Document #3 mixes in **internal-only** content such as deployment resource protection (e.g. the P0 session-timeout item, not yet implemented at the time) and security compliance — publishing this kind of information would amount to disclosing unfixed vulnerabilities. Accordingly:

- #1 and #2 were merged in full, and the original files deleted (their content is purely scientific methodology, with no publication risk).
- Only the **general checking methods** from #3 (general engine-numerical-correctness checks, API/IO boundary checking methods) were merged into `test_plan.md`; the original file remains in `life-matters-home/tasks/`, only slimmed down (the duplicated portions replaced with pointers to `test_plan.md`), continuing to hold internal content such as deployment/security and specific bug tracking.
- The three README files in #4 are unchanged (they describe the fixture directories themselves, not the "test documents" being merged).

### 3. The report records only what has actually been verified, not carried-over assertions from the old documents

While generating `test_report.md`, `pytest tests/` was actually run (22 tests, all passing, 2026-07-06) and recorded as-is; the tier-2/tier-3 validations had never been executed against the current engine code, so the report explicitly marks them as "not yet executed," rather than reusing the illustrative figures embedded in `validation.md` at design time as if they were already-verified results.

## Outcome

- Added: `models/test/test_plan.md`, `models/test/test_report.md`
- Removed: `docs/reference_engine/validation.md`, `life-matters-home/process/c_paper_model_verify_checklist.md`
- Slimmed down: `life-matters-home/tasks/2026-06-25_task_prelaunch-publish-verification-checklist.md` (sections 1/3 replaced with pointers, internal-only tracking items retained)
- Updated references: the root `README.md`, `docs/reference_engine/DECISIONS.md`, `docs/reference_engine/decisions/README.md`, `models/papers/README.md`, `life-matters-home/process/lm_update_checklist.md`, `life-matters-home/process/case_study_minipaper_methodology.md`, `tests/models/README.md`

## Open items

- ~~`reference_engine/scripts/validate_banister.py` still not implemented; tier-1 numerical-precision validation still relies on manual computation~~
  **Implemented and run as V1 on 2026-07-10** (the actual result was FAIL; the error-amplification mechanism is analyzed in `test_report.md` section 2; the summary table in `test_plan.md` section 0 was updated accordingly). V2/V3 remain unimplemented, pending another open category-C item (the direction of aligning training-load figures).
- Numerical regression coverage in `tests/models/` **expanded from 1 model variable to 2 as of 2026-07-10** (a new `test_plans/caloric_deficit` relational regression), still low; ongoing tracking in `life-matters-home/tasks/2026-06-25_task_prelaunch-publish-verification-checklist.md` §8.
