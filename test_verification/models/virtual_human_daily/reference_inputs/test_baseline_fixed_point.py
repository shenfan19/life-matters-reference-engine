"""Fixed point test for the reference inputs of virtual_human_daily_2026.yaml (see test_verification/models/README.md).

With every input at its reference value the coupled system starts on its equilibrium, so the
maintenance plan must stay put for two years apart from the age term. A failure means a coupling
was added or changed without keeping the reference state consistent.
"""

MODEL = 'scenarios/medical/virtual_human_daily_2026'


def test_maintenance_plan_stays_at_reference_state(run_scenario, tmp_path):
    r = run_scenario(MODEL, 'baseline_maintenance', tmp_path)
    assert abs(r['body_weight'][-1] - r['body_weight'][0]) < 0.5
    assert abs(r['fasting_glucose'][-1] - r['fasting_glucose'][0]) < 1.0
    assert abs(r['systolic_bp'][-1] - r['systolic_bp'][0]) < 3.0
    assert abs(r['liver_fat'][-1] - r['liver_fat'][0]) < 0.5
    assert abs(r['hemoglobin'][-1] - r['hemoglobin'][0]) < 0.2
    assert all(v == v and abs(v) < 1e9 for col in r.values() for v in col)
