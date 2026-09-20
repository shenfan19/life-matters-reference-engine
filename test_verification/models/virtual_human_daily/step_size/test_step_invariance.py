"""Step size invariance test for virtual_human_daily_2026.yaml (see test_verification/models/README.md).

The component equations are calibrated per day and written in a step invariant form, so a seven day
step must reproduce the one day end values within a small relative error. The infection plans are
left out on purpose, because the pathogen dose is injected at the start of each step and is known
to depend on the step size.
"""

import pytest

MODEL = 'scenarios/medical/virtual_human_daily_2026'


@pytest.mark.parametrize('plan', ['baseline_maintenance', 'overeating_sedentary', 'resistance_high_protein'])
@pytest.mark.parametrize('var', ['body_weight', 'fat_mass', 'fasting_glucose', 'systolic_bp', 'liver_fat'])
def test_seven_day_step_matches_one_day_step(plan, var, run_scenario, tmp_path):
    daily = run_scenario(MODEL, plan, tmp_path)[var][-1]
    weekly = run_scenario(MODEL, plan, tmp_path, step_days=7)[var][-1]
    assert abs(weekly - daily) <= 0.02 * abs(daily), f'{plan} {var}: 1 day {daily}, 7 day {weekly}'
