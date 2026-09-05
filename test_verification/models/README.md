# Numerical multi-value test directory convention

> Task origin: `2026-06-19_task_code-trust-verification-infra`, item 4. Unlike
> `test_verification/test_sim_cli_consistency.py` (CLI/GUI path consistency regression), the
> tests under this directory target **a single model variable's numerical behavior across
> multiple values**, used to quickly catch a regression where "some variable's output no longer
> matches expectations" after an equation/parameter change.

## Directory structure

```
test_verification/models/<model_name>/<variable_name>/test_*.py
```

- `<model_name>`: the `metadata.name` of some `.yaml` file under `models/` (without a path prefix).
- `<variable_name>`: the **input variable** being tested in that model (`type: input` or
  `type: parameter`), i.e. the variable that takes multiple values in `pytest.mark.parametrize`.
- Multiple test cases for the same variable live in their own folder, not mixed into one file with
  another variable's tests — when an equation for a given variable changes, only that one folder's
  tests need checking.

## Writing convention

- Use `pytest.mark.parametrize` to enumerate the variable's values (usually corresponding to the
  `simulation.plans` already in the model YAML, with each plan representing one set of values for
  that variable).
- Assert a **relationship** (a ratio, monotonicity, a sign), not a hardcoded specific float from
  the engine's output — a hardcoded value produces a flood of false positives after a minor
  equation tweak, and a newcomer reading the diff can't tell a real regression from numerical
  drift. A scenario needing an exact-value comparison follows the numerical-precision protocol in
  `test_verification/verification_report.md` §2, or the literature-benchmarking protocol in
  `models/validation/validation_report.md` §1, handled separately, not here.
- Example: `test_valid_mc_distributions/daily_dose/test_dose_scaling.py` —
  `test_valid_mc_distributions.yaml`'s `daily_dose` takes 100/200/350 mg across its
  `low_dose`/`moderate_dose`/`high_dose` plans, asserting that `plasma_conc` and `peak_plasma`'s
  deterministic steady-state values scale strictly linearly with dose (this model's
  absorption/clearance equations are linear in `daily_dose`, with no saturation term).
- Example (added 2026-07-10): `test_valid_plans/caloric_deficit/test_weight_loss_ordering.py` —
  three named plans (conservative/balanced/aggressive) escalate along both the
  `caloric_deficit`/`exercise_minutes` dimensions in turn, asserting that the final `body_weight`
  is strictly monotonically decreasing, with an added margin check against the `max(50.0, ...)`
  floor clamp, to avoid a false pass from "just barely hitting the floor."
- Example (added 2026-07-10, a real paper-referenced model under `models/papers/`):
  `bergman_glucose_insulin/carb_intake_per_meal/test_intervention_beats_baseline.py` — four named
  plans (no intervention baseline -> ADA standard -> fasting exercise + IF -> combined
  optimization) assert that `insulin_sensitivity` is strictly monotonically increasing, and that
  every intervention plan clearly beats the no-intervention baseline by a wide margin;
  `hba1c` asserts only the wide "intervention vs. baseline" gap, not a strict ordering among the
  three intervention plans — their pairwise gap is only about 1e-5 (a known degeneracy documented
  in the model's own docs: the `hba1c` equilibrium point is dominated by `fasting_glucose_target`,
  with limited discriminating power), and asserting too fine an ordering would make the test
  brittle under normal parameter tuning.

## Running

```bash
pytest test_verification/models/
```
