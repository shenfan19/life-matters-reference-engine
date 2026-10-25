"""Regression test for the one_life plugin.

The logic of a life is tested on a stand-in body whose risk follows a few inputs in a known way, so that the tests do
not depend on the model library. A last group runs the real virtual human when the model library is present.
"""

import copy
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / 'plugins' / 'one_life'
sys.path.insert(0, str(ROOT))
from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402,F401

# See test_plugin_framework.py for why reference_engine/src goes in after the package import.
sys.path.insert(0, str(ROOT / 'reference_engine' / 'src'))
sys.path.insert(0, str(ROOT / 'reference_engine'))
sys.path.insert(0, str(PLUGIN))
from paths import MODELS_DIR  # noqa: E402
from one_life_core import attribution  # noqa: E402
from one_life_core.birth import draw_birth, eligible_cards  # noqa: E402
from one_life_core.catalog import load_catalog, validate_catalog  # noqa: E402
from one_life_core.compare import compare_lives  # noqa: E402
from one_life_core.compose import (apply_effects, normalize_posture, phase_income, posture_cost, posture_values,  # noqa: E402
                                   spend_level_values, used_variables)
from one_life_core.life import Env, fit_posture, normalize_life, run_life  # noqa: E402
from one_life_core.rng import stream  # noqa: E402
from one_life_core.schedule import build_events, decision_points, first_pending, pack_phases, resolve_event  # noqa: E402

CATALOG = load_catalog()
SCORE_INPUTS = {'water_safety', 'crowding', 'vector_exposure', 'medical_era', 'diet_quality', 'injury_exposure',
                'stress_load', 'dietary_restraint', 'epidemic_pressure', 'pathogen_challenge'}
PLAIN_DEFAULTS = {'aerobic_min': 20, 'resistance_min': 5, 'sleep_hours': 7.5, 'vitamin_c_mg': 90, 'fiber_g': 25,
                  'sodium_g': 3.4, 'water_l': 2.4, 'energy_intake': 2500, 'alcohol_g': 5, 'smoking_cigs': 0,
                  'iodine_ug': 150, 'thiamine_mg': 1.2}
DEFAULTS = {name: ({'value': 1.0 if name in ('water_safety', 'medical_era') else 0.0, 'unit': 'score'} if name in SCORE_INPUTS
                   else {'value': PLAIN_DEFAULTS[name], 'unit': 'x'}) for name in used_variables(CATALOG)}
YEAR = 365.25 / 7.0


class FakeBody:
    """A body whose yearly risk of death rises with age, falls with medical care and rises with epidemics and injury."""

    instances = []

    def __init__(self, initial, max_weeks):
        self.age = initial['age_years']
        self.survival = 1.0
        self.closed = False
        self.seen = []
        FakeBody.instances.append(self)

    def advance(self, weeks, inputs):
        rows = []
        for _ in range(weeks):
            hazard = (0.002 * math.exp(0.07 * (self.age - 18)) * (1 + 2 * (1 - inputs.get('medical_era', 1.0)))
                      + 0.6 * inputs.get('epidemic_pressure', 0.0) + 0.3 * inputs.get('injury_exposure', 0.0))
            self.survival *= math.exp(-hazard / YEAR)
            self.age += 1 / YEAR
            rows.append({'age_years': self.age, 'survival_prob': self.survival, 'health_score': 90.0})
        self.seen.append((weeks, dict(inputs)))
        return rows, {'age_years': self.age, 'survival_prob': self.survival, 'annual_hazard': hazard, 'health_score': 90.0}

    def close(self):
        self.closed = True


@pytest.fixture
def env():
    FakeBody.instances = []
    return Env(CATALOG, DEFAULTS, None, lambda initial, max_weeks: FakeBody(initial, max_weeks))


def all_phases_posture(posture):
    return {str(i): posture for i in range(len(CATALOG['config']['full_life_phase_offsets']))}


# ---- the data files -------------------------------------------------------------------------------------------

def test_catalog_is_consistent():
    assert validate_catalog(CATALOG) == []


def test_catalog_checks_find_the_usual_mistakes():
    broken = copy.deepcopy(CATALOG)
    broken['cards']['cards']['medieval_europe_peasant']['world'] = 'elsewhere'
    broken['cards']['cards']['medieval_europe_peasant']['title'] = {'en': 'only english'}
    broken['events']['events']['harvest_failure']['decision']['default'] = 'nothing'
    broken['events']['events']['flu_season']['effects'] = {'pathogen_challenge': {'set': 1, 'add': 2}}
    broken['packs']['packs']['gold_rush_1849']['card'] = 'nobody'
    broken['packs']['packs']['gold_rush_1849']['scripted'][0]['year'] = 99
    text = '\n'.join(validate_catalog(broken))
    for fragment in ('world must be one of', 'needs a non-empty text', 'default option is not among', 'exactly one of',
                     'fixed card is not in cards.yaml', 'happens after the run ends'):
        assert fragment in text


def test_every_input_the_data_names_is_listed_for_the_body_check():
    assert {'epidemic_pressure', 'injury_exposure', 'vitamin_c_mg', 'sleep_hours'} <= used_variables(CATALOG)


# ---- seeded draws ---------------------------------------------------------------------------------------------

def test_same_seed_gives_same_birth_and_other_purposes_differ():
    first = draw_birth(CATALOG, 123, 'all', None, None)
    assert first == draw_birth(CATALOG, 123, 'all', None, None)
    assert stream(5, 'card').random() == stream(5, 'card').random()
    assert stream(5, 'card').random() != stream(5, 'sex').random()


def test_world_filter_and_pack_only_cards():
    for seed in range(60):
        assert CATALOG['cards']['cards'][draw_birth(CATALOG, seed, 'modern', None, None)['card_id']]['world'] == 'modern'
        assert draw_birth(CATALOG, seed, 'all', None, None)['card_id'] != 'gold_rush_miner'
    assert 'gold_rush_miner' not in eligible_cards(CATALOG, 'all')


def test_childhood_chance_matches_the_card():
    card_id = 'medieval_europe_peasant'
    chance = CATALOG['cards']['cards'][card_id]['survive_to_adult']
    outcomes = [draw_birth(CATALOG, seed, 'all', card_id, 'm')['child'] for seed in range(3000)]
    share = sum(o['survived'] for o in outcomes) / len(outcomes)
    assert abs(share - chance) < 0.03
    died = [o['age_at_death'] for o in outcomes if not o['survived']]
    assert died and all(0 <= age < 18 for age in died)


# ---- inputs from card, posture and events ---------------------------------------------------------------------

def test_level_zero_is_the_card_and_top_level_stops_at_the_limit():
    card = CATALOG['cards']['cards']['medieval_europe_peasant']
    care = CATALOG['levers']['spend']['care']
    values = spend_level_values(card, DEFAULTS, care)['medical_era']
    assert values[0] == card['baseline']['medical_era']
    assert values[3] == pytest.approx(card['limit']['medical_era'])
    assert values == sorted(values)
    housing = spend_level_values(card, DEFAULTS, CATALOG['levers']['spend']['housing'])
    assert housing['crowding'][3] == pytest.approx(card['limit']['crowding'])
    assert housing['crowding'] == sorted(housing['crowding'], reverse=True)


def test_a_limit_worse_than_the_card_changes_nothing():
    card = copy.deepcopy(CATALOG['cards']['cards']['medieval_europe_peasant'])
    card['limit']['water_safety'] = 0.1
    water = spend_level_values(card, DEFAULTS, CATALOG['levers']['spend']['housing'])['water_safety']
    assert set(water) == {card['baseline']['water_safety']}


def test_work_levels_change_income_and_activity():
    card = CATALOG['cards']['cards']['medieval_europe_peasant']
    light = normalize_posture(CATALOG['levers'], {'work': 0})
    heavy = normalize_posture(CATALOG['levers'], {'work': 2})
    assert phase_income(card, light, 1.0) < phase_income(card, heavy, 1.0)
    low = posture_values(CATALOG, card, DEFAULTS, light)
    high = posture_values(CATALOG, card, DEFAULTS, heavy)
    assert high['aerobic_min'] > low['aerobic_min'] and high['injury_exposure'] > low['injury_exposure']


def test_posture_is_checked():
    levers = CATALOG['levers']
    with pytest.raises(ValueError):
        normalize_posture(levers, {'care': 4})
    with pytest.raises(ValueError):
        normalize_posture(levers, {'work': 3})
    with pytest.raises(ValueError):
        normalize_posture(levers, {'luck': 1})
    with pytest.raises(ValueError):
        normalize_posture(levers, {'care': 1.5})
    assert posture_cost(levers, normalize_posture(levers, {'care': 2, 'rest': 1, 'work': 2})) == 3


def test_a_carried_posture_is_cut_back_to_the_income():
    card = CATALOG['cards']['cards']['medieval_europe_peasant']
    rich = normalize_posture(CATALOG['levers'], {'work': 1, 'care': 3, 'housing': 2})
    fitted = fit_posture(CATALOG['levers'], card, rich, 0.6)
    assert posture_cost(CATALOG['levers'], fitted) <= phase_income(card, fitted, 0.6)
    assert fitted['care'] >= fitted['housing']


def test_event_effects_set_add_mul_and_clamp():
    values = {'water_safety': 0.5, 'vitamin_c_mg': 40.0}
    out = apply_effects(values, {'water_safety': {'add': -2.0}, 'vitamin_c_mg': {'mul': 0.5}, 'injury_exposure': {'set': 5}}, DEFAULTS)
    assert out['water_safety'] == 0.0 and out['vitamin_c_mg'] == 20.0 and out['injury_exposure'] == 1.0
    assert values['water_safety'] == 0.5


# ---- phases and events ----------------------------------------------------------------------------------------

def test_events_depend_on_seed_and_card_not_on_choices():
    pack = CATALOG['packs']['packs']['full_life']
    card = CATALOG['cards']['cards']['han_south_malarial']
    first = build_events(CATALOG, pack, card, 77, 18)
    again = build_events(CATALOG, pack, card, 77, 18)
    assert [(e['key'], e['start_week']) for e in first] == [(e['key'], e['start_week']) for e in again]
    assert first != build_events(CATALOG, pack, card, 78, 18)
    assert all(not e['id'] == 'flu_season' for e in first)
    assert {e['id'] for e in first} & {'malaria_season', 'harvest_failure', 'good_harvest', 'local_outbreak'}


def test_events_follow_tags_and_age():
    pack = CATALOG['packs']['packs']['full_life']
    modern = CATALOG['cards']['cards']['modern_high_income_urban']
    ids = {e['id'] for seed in range(30) for e in build_events(CATALOG, pack, modern, seed, 18)}
    assert 'flu_season' in ids and not ids & {'harvest_failure', 'epidemic_wave', 'malaria_season'}
    for seed in range(30):
        for e in build_events(CATALOG, pack, CATALOG['cards']['cards']['medieval_europe_peasant'], seed, 18):
            if e['id'] == 'conscription_war':
                assert 18 <= 18 + e['year'] <= 45


def test_scripted_events_come_with_a_pack():
    pack = CATALOG['packs']['packs']['gold_rush_1849']
    events = build_events(CATALOG, pack, CATALOG['cards']['cards']['gold_rush_miner'], 1, 24)
    scripted = [e for e in events if e['source'] == 'script']
    assert [e['id'] for e in scripted] == ['sea_passage', 'camp_flux', 'snowbound_winter', 'claim_collapse']
    passage = scripted[0]
    horn, isthmus = resolve_event(passage, {}), resolve_event(passage, {passage['key']: 'isthmus'})
    assert horn['weeks'] == 22 and isthmus['weeks'] == 8 and isthmus['effects'] != horn['effects']
    with pytest.raises(ValueError):
        resolve_event(passage, {passage['key']: 'swim'})


def test_decision_points_are_ordered_and_first_pending_is_found():
    pack = CATALOG['packs']['packs']['gold_rush_1849']
    phases = pack_phases(CATALOG, pack)
    events = build_events(CATALOG, pack, CATALOG['cards']['cards']['gold_rush_miner'], 1, 24)
    points = decision_points(phases, events)
    assert [p['week'] for p in points] == sorted(p['week'] for p in points)
    assert points[0]['kind'] == 'posture' and points[0]['week'] == 0
    assert first_pending(points, {}, {})['key'] == '0'
    assert first_pending(points, {'0': {}}, {})['kind'] == 'event'


def test_mishap_comes_from_the_event_draw_and_not_from_the_order_of_choices():
    pack = CATALOG['packs']['packs']['walled_city_siege']
    card = CATALOG['cards']['cards']['walled_city_resident']
    wrong, total = 0, 400
    for seed in range(total):
        cut = next(e for e in build_events(CATALOG, pack, card, seed, 30) if e['id'] == 'supplies_cut')
        slipped = resolve_event(cut, {cut['key']: 'slip_out'})
        assert slipped == resolve_event(cut, {cut['key']: 'slip_out'})
        assert resolve_event(cut, {cut['key']: 'hold_out'})['mishap'] is None
        wrong += slipped['mishap'] is not None
    assert abs(wrong / total - 0.3) < 0.07


def test_a_mishap_adds_its_effects_and_is_told_in_the_log(env):
    pack = CATALOG['packs']['packs']['walled_city_siege']
    card = CATALOG['cards']['cards']['walled_city_resident']
    seeds = {}
    for seed in range(200):
        cut = next(e for e in build_events(CATALOG, pack, card, seed, 30) if e['id'] == 'supplies_cut')
        seeds.setdefault(resolve_event(cut, {cut['key']: 'slip_out'})['mishap'] is not None, seed)
        if len(seeds) == 2:
            break
    key = '0:supplies_cut'
    for went_wrong, seed in seeds.items():
        FakeBody.instances = []
        life = {'seed': seed, 'pack': 'walled_city_siege', 'postures': {'0': {'work': 1}, '1': {'work': 1}}, 'decisions': {key: 'slip_out'}}
        result = run_life(env, life, outlook=False, autofill=True)
        event = next(e for e in result['events'] if e['id'] == 'supplies_cut')
        assert (event['mishap'] is not None) == went_wrong
        injured = any(inputs['injury_exposure'] == 1.0 and inputs['stress_load'] == 0.95 for _, inputs in FakeBody.instances[0].seen)
        assert injured == went_wrong


def test_pending_options_show_the_chance_of_trouble_but_not_whether_it_happens(env):
    result = run_life(env, {'seed': 1, 'pack': 'walled_city_siege', 'postures': {'0': {'work': 1}}})
    assert result['status'] == 'pending' and result['pending']['kind'] == 'event'
    options = {o['id']: o for o in result['pending']['options']}
    assert options['hold_out']['mishap'] is None
    assert options['slip_out']['mishap'] == {'p': 0.3, 'title': options['slip_out']['mishap']['title']}


def test_catalog_checks_the_mishap_of_an_option():
    broken = copy.deepcopy(CATALOG)
    broken['packs']['packs']['walled_city_siege']['scripted'][0]['decision']['options']['slip_out']['mishap']['p'] = 1.5
    broken['packs']['packs']['walled_city_siege']['scripted'][0]['decision']['options']['slip_out']['weeks'] = [0, 3]
    text = ' '.join(validate_catalog(broken))
    assert 'mishap.p must be between 0 and 1' in text and 'weeks must be a' in text


def test_siege_pack_runs_to_its_end(env):
    done, result = finish(env, {'seed': 5, 'pack': 'walled_city_siege'})
    assert result['birth']['card'] == 'walled_city_resident' and result['birth']['start_age'] == 30
    assert result['status'] in ('ended', 'completed') and len(result['phases']) == 2
    assert any(e['id'] == 'supplies_cut' for e in result['events'])


# ---- risk split -----------------------------------------------------------------------------------------------

EQUATIONS = {
    'mortality_layer': {'dynamics': {
        'mortality_lnhr': '0.5 * max(0.0, 8.0 - sleep_hours) + 0.1 * max(0.0, bmi - 25.0) - 0.2 * sex_female - 0.1',
        'annual_hazard': '0.001 * exp(0.07 * (age_years - 35.0) + mortality_lnhr) + disease_hazard'}},
    'disease': {'dynamics': {
        'disease_hazard': '(1.0 - 0.8 * medical_era) * (0.04 * enteric_burden + 0.06 * tb_burden) + 1.5 * scurvy_index'}},
}
GROUPS = {'age': {'title': {'en': 'Age', 'zh': '年龄'}}, 'constant': {'title': {'en': 'Base', 'zh': '基线'}},
          'lifestyle': {'sleep_hours': {'group': 'sleep', 'title': {'en': 'Sleep', 'zh': '睡眠'}},
                        'bmi': {'group': 'weight', 'title': {'en': 'Weight', 'zh': '体重'}},
                        'sex_female': {'group': 'sex', 'title': {'en': 'Sex', 'zh': '性别'}}},
          'disease': {'enteric_burden': {'group': 'enteric', 'title': {'en': 'Gut', 'zh': '肠道'}},
                      'tb_burden': {'group': 'tb', 'title': {'en': 'TB', 'zh': '结核'}},
                      'scurvy_index': {'group': 'scurvy', 'title': {'en': 'Scurvy', 'zh': '坏血病'}}}}


def risk_state(**over):
    state = {'age_years': 40.0, 'sleep_hours': 6.0, 'bmi': 30.0, 'sex_female': 0.0, 'medical_era': 0.5,
             'enteric_burden': 0.5, 'tb_burden': 0.25, 'scurvy_index': 0.1}
    state.update(over)
    ln = 0.5 * max(0.0, 8.0 - state['sleep_hours']) + 0.1 * max(0.0, state['bmi'] - 25.0) - 0.2 * state['sex_female'] - 0.1
    disease = ((1 - 0.8 * state['medical_era']) * (0.04 * state['enteric_burden'] + 0.06 * state['tb_burden'])
               + 1.5 * state['scurvy_index'])
    state['mortality_lnhr'] = ln
    state['disease_hazard'] = disease
    state['annual_hazard'] = 0.001 * math.exp(0.07 * (state['age_years'] - 35.0) + ln) + disease
    return state


def test_risk_split_adds_up_to_the_risk_of_the_model():
    splitter = attribution.RiskSplitter(EQUATIONS, GROUPS)
    assert splitter.available
    for state in (risk_state(), risk_state(sleep_hours=9.0, bmi=22.0), risk_state(medical_era=1.0, scurvy_index=0.0)):
        parts = splitter.split(state)
        assert parts['total'] == pytest.approx(state['annual_hazard'], rel=1e-9)
        assert set(parts['disease']) == {'enteric', 'tb', 'scurvy'}
        assert {'sleep', 'weight', 'sex', 'constant'} >= set(parts['lifestyle'])


def test_risk_split_spreads_the_factor_over_the_burdens():
    splitter = attribution.RiskSplitter(EQUATIONS, GROUPS)
    state = risk_state(medical_era=0.5)
    parts = splitter.split(state)
    assert parts['disease']['enteric'] == pytest.approx(0.6 * 0.04 * 0.5)
    assert parts['disease']['tb'] == pytest.approx(0.6 * 0.06 * 0.25)
    assert parts['disease']['scurvy'] == pytest.approx(1.5 * 0.1)


def test_risk_split_names_the_driver_of_a_lifestyle_term():
    splitter = attribution.RiskSplitter(EQUATIONS, GROUPS)
    parts = splitter.split(risk_state(sleep_hours=4.0, bmi=25.0))
    assert parts['lifestyle']['sleep'] > 0 > parts['lifestyle']['sex'] + 0.0 or parts['lifestyle']['sex'] <= 0
    assert parts['lifestyle']['sleep'] == max(parts['lifestyle'].values())


def test_risk_split_refuses_unsafe_expressions():
    unsafe = {'a': {'dynamics': {'annual_hazard': '__import__("os").getcwd()', 'mortality_lnhr': '1', 'disease_hazard': '0'}}}
    with pytest.raises(attribution.UnsupportedExpression):
        attribution.RiskSplitter(unsafe, GROUPS)


def test_risk_split_is_off_when_the_model_lacks_the_expressions():
    assert not attribution.RiskSplitter({'x': {'dynamics': {'y': 'z'}}}, GROUPS).available


def test_ranking_shares():
    ranked = attribution.rank(attribution.merge_weighted([(2.0, {'age': 0.1, 'lifestyle': {'sleep': 0.2}, 'disease': {'tb': 0.7}}),
                                                            (1.0, {'age': 0.1, 'lifestyle': {'sleep': -0.05}, 'disease': {'tb': 0.4}})]))
    assert ranked[0]['name'] == 'tb' and ranked[0]['hazard'] == pytest.approx(1.8)
    assert sum(r['share'] for r in ranked if r['hazard'] > 0) == pytest.approx(1.0)
    assert [r for r in ranked if r['name'] == 'sleep'][0]['hazard'] == pytest.approx(0.35)


# ---- a life ---------------------------------------------------------------------------------------------------

def survivor(card, pack='full_life', start=0):
    for seed in range(start, start + 400):
        if draw_birth(CATALOG, seed, 'all', card, None)['child']['survived']:
            return seed
    raise AssertionError('no surviving seed')


def life_for(card, **extra):
    return {'seed': survivor(card), 'card': card, **extra}


def test_a_new_life_waits_for_the_first_posture_without_running_the_body(env):
    result = run_life(env, life_for('medieval_europe_peasant'))
    assert result['status'] == 'pending' and result['pending']['kind'] == 'posture' and result['pending']['phase'] == 0
    assert result['timeline'] == [] and FakeBody.instances == []
    assert result['pending']['income_by_work'] == [4, 5, 7]
    assert set(result['pending']['spend_values']) == set(CATALOG['levers']['spend'])


def test_childhood_death_ends_the_life_without_the_body(env):
    seed = next(s for s in range(400) if not draw_birth(CATALOG, s, 'all', 'medieval_europe_peasant', None)['child']['survived'])
    result = run_life(env, {'seed': seed, 'card': 'medieval_europe_peasant'})
    assert result['status'] == 'child_death' and result['death']['child'] and result['death']['age'] < 18
    assert FakeBody.instances == []


def test_a_life_runs_to_the_next_decision_and_shows_nothing_past_it(env):
    life = life_for('medieval_europe_peasant', postures={'0': {'work': 1}})
    result = run_life(env, life)
    assert result['status'] == 'pending'
    cut = result['pending']['week']
    assert result['lived_until_week'] == cut
    lived = [t for t in result['timeline'] if t['zone'] == 'life']
    assert lived and all(t['week'] <= cut + 52 for t in lived)
    assert all(e['week'] < cut for e in result['events'])
    assert result['death'] is None and result['odds_basis'] == 'outlook'
    assert any(t['zone'] == 'outlook' for t in result['timeline'])
    assert FakeBody.instances[0].closed


def test_outlook_has_no_events_that_have_not_happened_yet(env):
    life = life_for('han_south_malarial', postures={'0': {'work': 1}})
    result = run_life(env, life)
    cut = result['pending']['week']
    card = CATALOG['cards']['cards']['han_south_malarial']
    plain = posture_values(CATALOG, card, DEFAULTS, result['phases'][0]['posture'])
    revealed_end = max([e['week'] + e['weeks'] for e in result['events']] + [cut])
    week, checked = 0, 0
    for weeks, inputs in FakeBody.instances[0].seen:
        if week >= revealed_end and week < 7 * 52 * 2:
            assert all(inputs[var] == pytest.approx(value) for var, value in plain.items())
            checked += 1
        week += weeks
    assert checked, 'the outlook never ran on the plain posture'


def test_budget_is_enforced_for_the_phases_the_player_set(env):
    life = life_for('medieval_europe_peasant', postures={'0': {'work': 1, 'care': 3, 'housing': 3}})
    with pytest.raises(ValueError, match='more livelihood points'):
        run_life(env, life)
    assert run_life(env, life, check_budget=False)['status'] == 'pending'
    with pytest.raises(ValueError, match='no phase'):
        run_life(env, life_for('medieval_europe_peasant', postures={'42': {}}))


def test_record_is_checked():
    for bad in ({}, {'seed': -1}, {'seed': 1.5}, {'seed': 1, 'pack': 'nope'}, {'seed': 1, 'world': 'mars'},
                {'seed': 1, 'card': 'nope'}, {'seed': 1, 'sex': 'x'}, {'seed': 1, 'postures': {'a': {}}}, 'text'):
        with pytest.raises(ValueError):
            normalize_life(CATALOG, bad)
    assert normalize_life(CATALOG, {'seed': 1})['pack'] == 'full_life'


def finish(env, life, choose=None):
    """Plays a life to its end taking the default option wherever asked."""
    life = copy.deepcopy(life)
    life.setdefault('postures', {})
    life.setdefault('decisions', {})
    while True:
        result = run_life(env, life, outlook=False)
        if result['status'] != 'pending':
            return life, result
        pending = result['pending']
        if pending['kind'] == 'posture':
            life['postures'][str(pending['phase'])] = {'work': 1}
        else:
            life['decisions'][pending['key']] = (choose or {}).get(pending['key'], pending['default'])


def test_same_record_gives_same_life(env):
    life = life_for('han_north_farmer')
    _, first = finish(env, life)
    _, second = finish(env, life)
    assert first['death'] == second['death'] and first['timeline'] == second['timeline']


def test_a_life_ends_at_the_fate_line(env):
    life, result = finish(env, life_for('medieval_europe_peasant'))
    assert result['status'] == 'ended'
    fate, week = result['death']['fate'], result['death']['week']
    at_death = next(t for t in result['timeline'] if t['week'] >= week)
    assert at_death['survival'] <= fate + 0.05
    before = [t for t in result['timeline'] if t['week'] < week and t['zone'] == 'life']
    assert all(t['survival'] > fate for t in before)
    assert result['odds_basis'] == 'ghost' and result['odds']['age_at_survival']['0.5'] is not None
    assert result['sources']['final'] is not None or result['sources']['life'] == []


def test_better_care_moves_death_later_under_the_same_luck(env):
    life, base = finish(env, life_for('medieval_europe_peasant'))
    poor = copy.deepcopy(life)
    cared = copy.deepcopy(life)
    for key in cared['postures']:
        cared['postures'][key] = {'work': 1, 'care': 3}
    cared_result = run_life(env, cared, outlook=False, check_budget=False)
    assert cared_result['death']['fate'] == base['death']['fate']
    assert cared_result['death']['age'] > base['death']['age']
    assert run_life(env, poor, outlook=False)['death'] == base['death']


def test_events_do_not_move_with_choices(env):
    life = life_for('han_south_malarial')
    first = run_life(env, {**life, 'postures': {'0': {'work': 1}}})
    other = run_life(env, {**life, 'postures': {'0': {'work': 2, 'care': 1}}})
    shared = min(len(first['events']), len(other['events']))
    assert shared and [e['key'] for e in first['events'][:shared]] == [e['key'] for e in other['events'][:shared]]


def test_an_event_decision_waits_for_the_player_and_changes_the_inputs(env):
    life = life_for('medieval_europe_peasant')
    events = build_events(CATALOG, CATALOG['packs']['packs']['full_life'], CATALOG['cards']['cards']['medieval_europe_peasant'], life['seed'], 18)
    deciding = [e for e in events if e['decision']]
    if not deciding:
        pytest.skip('this seed has no event with a decision')
    first = deciding[0]
    postures = {str(i): {'work': 1} for i in range(8)}
    stopped = run_life(env, {**life, 'postures': postures})
    assert stopped['status'] in ('pending', 'ended')
    if stopped['status'] == 'pending':
        assert stopped['pending']['kind'] == 'event' and stopped['pending']['key'] == first['key']
        assert {o['id'] for o in stopped['pending']['options']} == set(first['decision']['options'])


def test_savings_count_the_unspent_points(env):
    life, result = finish(env, life_for('medieval_europe_peasant'))
    lived_phases = [p for p in result['phases'] if (p['start_age'] - 18) * 52 <= result['lived_until_week']]
    assert result['savings'] == sum(max(0, p['income'] - p['cost']) for p in lived_phases)


def test_gold_rush_pack_runs_with_scripted_events_and_ends(env):
    life = {'seed': 3, 'pack': 'gold_rush_1849'}
    done, result = finish(env, life)
    assert result['birth']['card'] == 'gold_rush_miner' and result['birth']['start_age'] == 24
    assert result['status'] in ('ended', 'completed')
    assert any(e['id'] == 'sea_passage' for e in result['events'])
    assert len(result['phases']) == 3
    if result['status'] == 'completed':
        assert result['timeline'][-1]['age'] <= 24 + 8 + 0.1


def test_the_body_is_closed_after_every_run(env):
    finish(env, life_for('medieval_europe_city'))
    assert FakeBody.instances and all(b.closed for b in FakeBody.instances)


# ---- counterfactuals ------------------------------------------------------------------------------------------

def test_compare_keeps_luck_and_shows_the_effect_of_the_change(env):
    life, base = finish(env, life_for('medieval_europe_peasant'))
    out = compare_lives(env, life, [
        {'id': 'care', 'label': 'More care', 'postures': {'all': {'care': 3}}, 'ignore_budget': True},
        {'id': 'same', 'label': 'No change'},
    ])
    views = {v['id']: v for v in out['variants']}
    assert views['base']['death_age'] == base['death']['age']
    assert views['same']['death_age'] == views['base']['death_age']
    assert views['care']['death_age'] > views['base']['death_age'] and views['care']['death_age_change'] > 0
    assert views['care']['life']['seed'] == life['seed']
    assert views['care']['timeline']


def test_compare_refuses_what_it_cannot_do(env):
    life = life_for('medieval_europe_peasant', postures={'0': {'work': 1}})
    with pytest.raises(ValueError, match='not finished'):
        compare_lives(env, life, [{'postures': {'all': {'care': 1}}}])
    done, _ = finish(env, life_for('medieval_europe_peasant'))
    with pytest.raises(ValueError, match='at least one'):
        compare_lives(env, done, [])
    with pytest.raises(ValueError, match='At most'):
        compare_lives(env, done, [{}] * 6)
    with pytest.raises(ValueError, match='no phase'):
        compare_lives(env, done, [{'postures': {'99': {'care': 1}}}])


def test_compare_can_change_the_birth_under_the_same_luck(env):
    life, base = finish(env, life_for('medieval_europe_peasant'))
    out = compare_lives(env, life, [{'id': 'modern', 'card': 'modern_high_income_urban', 'ignore_budget': True}])
    views = {v['id']: v for v in out['variants']}
    assert views['modern']['card'] == 'modern_high_income_urban'
    assert views['modern']['life']['seed'] == life['seed']
    assert views['modern']['death_age'] is None or views['modern']['death_age'] > base['death']['age'] or views['modern']['median_age']


# ---- the plugin on the real virtual human ---------------------------------------------------------------------

MODEL_PATH = CATALOG['config']['model']
needs_models = pytest.mark.skipif(not (MODELS_DIR / f'{MODEL_PATH}.yaml').exists(), reason='models directory not available')


@pytest.fixture(scope='module')
def plugin():
    import importlib.util
    from src.loader_engine import LoaderEngine
    from src.plugin_context import PluginContext
    ctx = PluginContext(engine=None, loader=LoaderEngine(str(MODELS_DIR)))
    spec = importlib.util.spec_from_file_location('plugin_one_life_under_test', PLUGIN / 'backend.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules['plugin_one_life_under_test'] = module
    spec.loader.exec_module(module)
    return module.OneLife(ctx)


@needs_models
def test_catalog_endpoint_lists_cards_levers_and_labels(plugin):
    out = plugin.endpoint_catalog({})
    assert out['success'] and out['model_ok']
    assert 'gold_rush_1849' in out['packs'] and 'medieval_europe_peasant' in out['cards']
    assert set(out['levers']['spend']) == set(CATALOG['levers']['spend'])
    assert out['limitations']['en'] and out['limitations']['zh']
    assert out['risk_titles']['scurvy']['zh']


@needs_models
def test_the_body_model_has_every_input_the_data_names(plugin):
    env_real = plugin._env()
    assert env_real.splitter.available


@needs_models
def test_real_body_runs_a_life_and_names_the_causes(plugin):
    seed = survivor('medieval_europe_peasant')
    life = {'seed': seed, 'card': 'medieval_europe_peasant', 'postures': all_phases_posture({'work': 1})}
    decisions = {}
    for _ in range(12):
        out = plugin.endpoint_live({'life': {**life, 'decisions': decisions}, 'outlook': False})
        assert out['success'], out
        if out['status'] != 'pending':
            break
        decisions[out['pending']['key']] = out['pending']['default']
    assert out['status'] == 'ended'
    assert 18 < out['death']['age'] < 100
    top = out['sources']['life'][0]
    assert top['section'] in ('disease', 'lifestyle', 'age') and top['share'] > 0
    assert out['sources']['final']
    again = plugin.endpoint_live({'life': {**life, 'decisions': decisions}, 'outlook': False})
    assert again['death'] == out['death']


@needs_models
def test_real_body_care_and_housing_help_a_peasant(plugin):
    seed = survivor('medieval_europe_peasant')
    life = {'seed': seed, 'card': 'medieval_europe_peasant', 'postures': all_phases_posture({'work': 1})}
    decisions = {}
    for _ in range(12):
        out = plugin.endpoint_live({'life': {**life, 'decisions': decisions}, 'outlook': False})
        if out['status'] != 'pending':
            break
        decisions[out['pending']['key']] = out['pending']['default']
    finished = {**life, 'decisions': decisions}
    result = plugin.endpoint_compare({'life': finished, 'variants': [
        {'id': 'care', 'postures': {'all': {'care': 3}}, 'ignore_budget': True},
        {'id': 'home', 'postures': {'all': {'housing': 3}}, 'ignore_budget': True}]})
    assert result['success'], result
    views = {v['id']: v for v in result['variants']}
    assert views['care']['median_age'] > views['base']['median_age']
    assert views['home']['median_age'] > views['base']['median_age']


@needs_models
def test_endpoint_reports_errors_as_data(plugin):
    assert plugin.endpoint_live({'life': {'seed': 'x'}})['success'] is False
    assert plugin.endpoint_compare({'life': {'seed': 1}, 'variants': []})['success'] is False


def test_runs_are_capped_and_the_slot_is_given_back():
    from one_life_core.limits import MAX_CONCURRENT_RUNS, Busy, run_slot
    stack = []
    try:
        for _ in range(MAX_CONCURRENT_RUNS):
            cm = run_slot()
            cm.__enter__()
            stack.append(cm)
        with pytest.raises(Busy):
            with run_slot():
                pass
    finally:
        for cm in stack:
            cm.__exit__(None, None, None)
    with run_slot():
        pass


def test_plugin_is_found_and_called_through_the_plugin_manager():
    from src.plugin_context import PluginContext
    from src.plugin_manager import PluginManager
    manager = PluginManager(str(ROOT / 'plugins'))
    assert 'one_life' in manager.plugins
    manifest = manager.plugins['one_life']['manifest']
    assert manifest['ui']['type'] == 'bundle' and manifest['contract_version'] == 2
    assert (PLUGIN / manifest['ui']['root'] / manifest['ui']['entry']).is_file()
    before = list(sys.path)
    out = manager.call_endpoint('one_life', 'catalog', {}, PluginContext(engine=None, loader=None))
    assert out['success'] and out['packs']
    manager.call_endpoint('one_life', 'catalog', {}, PluginContext(engine=None, loader=None))
    assert sys.path.count(str(PLUGIN)) == before.count(str(PLUGIN))
    # `run` belongs to the host, so the page endpoint has to be reachable under its own name.
    answer = manager.call_endpoint('one_life', 'live', {'life': {'seed': 'x'}}, PluginContext(engine=None, loader=None))
    assert answer['success'] is False and 'error' in answer


@needs_models
def test_the_fast_solver_gives_the_numbers_of_the_reference_solver(plugin):
    from one_life_core.driver import EngineDriver
    assert CATALOG['config']['solver'] == 'fast'
    inputs = {'medical_era': 0.0, 'water_safety': 0.3, 'vitamin_c_mg': 20.0, 'injury_exposure': 0.4}
    ends = []
    for solver in (None, CATALOG['config']['solver']):
        body = EngineDriver(str(MODELS_DIR), MODEL_PATH, {'age_years': 18.0, 'sex_female': 0.0}, 600, solver)
        try:
            rows, state = body.advance(52, inputs)
            rows2, state2 = body.advance(104, {**inputs, 'epidemic_pressure': 1.0})
        finally:
            body.close()
        ends.append((rows[-1]['survival_prob'], state2['survival_prob'], state2['annual_hazard'], state2['health_score']))
    assert ends[0] == pytest.approx(ends[1], rel=1e-9)
