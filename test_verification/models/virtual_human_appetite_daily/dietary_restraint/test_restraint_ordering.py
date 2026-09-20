"""Ordering test for `dietary_restraint` in virtual_human_appetite_daily_2026.yaml (see test_verification/models/README.md).

Restraint 1 follows the plan exactly and restraint 0 follows appetite. Under a 24 week 1500 kcal plan
the lowest weight must therefore fall strictly with restraint, and appetite alone must hold weight at
the unrestricted level. Under overfeeding a fully restrained plan equals the feedback off plan, and a
half restrained plan lands between it and the baseline.
"""

MODEL = 'scenarios/medical/virtual_human_appetite_daily_2026'
DIET_DAYS = 168


def test_lowest_weight_falls_with_restraint(run_scenario, tmp_path):
    base = run_scenario(MODEL, 'baseline_feedback', tmp_path)['body_weight']
    strict = min(run_scenario(MODEL, 'diet1500_strict', tmp_path)['body_weight'][:DIET_DAYS])
    half = min(run_scenario(MODEL, 'diet1500_half', tmp_path)['body_weight'][:DIET_DAYS])
    adlib = min(run_scenario(MODEL, 'diet1500_adlib', tmp_path)['body_weight'][:DIET_DAYS])
    assert strict < half < adlib
    assert adlib > base[0] - 1.0, 'with zero restraint appetite should cancel the diet'


def test_overfeeding_restraint_bracket(run_scenario, tmp_path):
    base = run_scenario(MODEL, 'baseline_feedback', tmp_path)['body_weight'][-1]
    open_ = run_scenario(MODEL, 'overfeed_open', tmp_path)['body_weight'][-1]
    strict = run_scenario(MODEL, 'overfeed_strict', tmp_path)['body_weight'][-1]
    half = run_scenario(MODEL, 'overfeed_half', tmp_path)['body_weight'][-1]
    assert abs(strict - open_) < 1e-6
    assert base + 5.0 < half < open_ - 5.0
