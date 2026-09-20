"""Direction test for `energy_intake` in virtual_human_daily_2026.yaml (see test_verification/models/README.md).

The body composition system integrates absorbed energy minus expenditure, so plans that change the
energy intake must order body weight by the sign of the imbalance, whatever the coefficients are.
A sustained surplus ends above the maintenance plan, and every deficit plan dips below it at some
point of the trajectory. Only orderings are asserted, no golden values.
"""

import pytest

MODEL = 'scenarios/medical/virtual_human_daily_2026'


def test_surplus_ends_above_maintenance(run_scenario, tmp_path):
    base = run_scenario(MODEL, 'baseline_maintenance', tmp_path)['body_weight']
    over = run_scenario(MODEL, 'overeating_sedentary', tmp_path)['body_weight']
    assert over[-1] > base[-1] + 10.0


@pytest.mark.parametrize('plan', ['severe_starvation_refeeding', 'crash_diet_rebound', 'total_fasting_21d'])
def test_deficit_plans_dip_below_maintenance(plan, run_scenario, tmp_path):
    base = run_scenario(MODEL, 'baseline_maintenance', tmp_path)['body_weight']
    weight = run_scenario(MODEL, plan, tmp_path)['body_weight']
    assert min(weight) < min(base) - 3.0, f'{plan} never dips clearly below maintenance'
