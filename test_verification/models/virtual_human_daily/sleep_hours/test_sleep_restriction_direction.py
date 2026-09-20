"""Direction test for `sleep_hours` in virtual_human_daily_2026.yaml (see test_verification/models/README.md).

Chronic sleep restriction must move the coupled markers in the documented direction relative to the
maintenance plan, with blood pressure, body weight and fatigue up, and insulin sensitivity and immune
competence down. Signs and a small margin only, no golden values.
"""

import pytest

MODEL = 'scenarios/medical/virtual_human_daily_2026'


@pytest.mark.parametrize('var,sign', [
    ('systolic_bp', +1), ('body_weight', +1), ('fatigue_index', +1),
    ('insulin_sensitivity', -1), ('immune_competence', -1),
])
def test_sleep_restriction_moves_marker_in_expected_direction(var, sign, run_scenario, tmp_path):
    base = run_scenario(MODEL, 'baseline_maintenance', tmp_path)[var][-1]
    short = run_scenario(MODEL, 'sleep_deprivation', tmp_path)[var][-1]
    assert sign * (short - base) > 0.01 * abs(base), f'{var}: baseline {base}, sleep restricted {short}'
