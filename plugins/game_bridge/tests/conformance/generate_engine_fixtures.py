"""Makes the engine fixtures of the conformance tests.

For a composed system (diabetes with a meal model in front of it) it runs the LM Reference Engine and records the variables at the end of
every call of a scenario. The JavaScript runner (run.mjs) replays the same calls on the LM core and compares. The fixtures are committed,
so the runner needs neither Python nor the models repository; run this script again after the engine, the models or the composition change:

    python plugins/game_bridge/tests/conformance/generate_engine_fixtures.py

It needs the models repository (LM_MODELS_PATH or a sibling folder) and the reference engine.
"""
import datetime
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(os.path.dirname(PLUGIN))
sys.path.insert(0, PLUGIN)
import backend as be  # noqa: E402
import bridge as br  # noqa: E402

MODELS = os.environ.get('LM_MODELS_PATH') or os.path.join(os.path.dirname(ROOT), 'life-matters-models', 'models')
DIABETES = 'references/medical/disease/metabolic/diabetes_2026'
FIXTURES = os.path.join(HERE, 'fixtures')
TOLERANCE = {'relative': 1e-9, 'absolute': 1e-12}


def iso_day(minute):
    """The date of a minute counted from the start date 2026-01-01; a regimen is pinned to its day so that it does not recur."""
    return (datetime.date(2026, 1, 1) + datetime.timedelta(days=minute // 1440)).isoformat()


def hhmm(minute):
    minute %= 1440
    return f'{minute // 60:02d}:{minute % 60:02d}'


def compose_system(workdir):
    """Compose diabetes_meals from the real diabetes model and the meal model of the conformance library."""
    mdir = os.path.join(workdir, 'models')
    os.makedirs(os.path.join(mdir, os.path.dirname(DIABETES)), exist_ok=True)
    shutil.copy(os.path.join(MODELS, DIABETES + '.yaml'), os.path.join(mdir, DIABETES + '.yaml'))
    shutil.copy(os.path.join(HERE, 'library', 'models', 'meal_diet.yaml'), os.path.join(mdir, 'meal_diet.yaml'))
    lib = be.open_library(mdir, [os.path.join(HERE, 'library', 'bridges')])
    system = br.load_yaml(os.path.join(HERE, 'library', 'diabetes_meals.system.yaml'))
    res = br.compose_system(system, lib)
    be.write(os.path.join(mdir, 'composed', 'diabetes_meals.yaml'), br.dump_yaml(res['model']))
    return mdir, res


def engine_rows(mdir, key, regimens, n_steps):
    """Run the engine for n_steps of the model's step with the given regimens as the only schedule; returns the rows of every variable."""
    sys.path.insert(0, os.path.join(ROOT, 'reference_engine'))
    sys.path.insert(0, ROOT)
    from src.reference_engine import ReferenceEngine
    from src.solver import get_solver
    from src.schedule_runner import precompute_sustained_divisors
    eng = ReferenceEngine(mdir)
    assert eng.load_models([key]), 'the engine could not load ' + key
    model = eng.current_model
    step_size = model.simulator['step_size']
    entries = model._parse_schedule_entries(regimens, model.simulator) if regimens is not None else model.schedule_entries
    schedules = precompute_sustained_divisors(list(entries), step_size)
    rows, _, _ = get_solver().advance(model, schedules, step_size, n_steps, 0, 0.0, list(model.variables), model.simulator.get('start_date', ''))
    return rows, step_size / 60.0


def expected_from_rows(rows, step_min, calls, bridge):
    out, minutes = [], 0
    for i, c in enumerate(calls):
        minutes += c['minutes']
        steps = int(round(minutes / step_min))
        row = rows[steps - 1]
        variables = {k: v for k, v in row.items() if k not in ('step', 'time')}
        out.append({'after_call': i, 'variables': variables, 'readouts': br.read_concepts(bridge, variables), 'rates': br.read_rates(bridge, variables)})
    return out


def scenario_preset(res, mdir):
    calls = [{'minutes': 60, 'handles': []} for _ in range(72)]
    rows, step_min = engine_rows(mdir, 'composed/diabetes_meals', None, 72 * 60)
    return {'name': 'diabetes_meals_preset', 'description': 'Composed diabetes and meals, the default plan as preset, 72 hours in calls of one hour.',
            'init': {'subjects': [{'id': 's', 'preset': 'default'}]}, 'calls': calls,
            'expected': expected_from_rows(rows, step_min, calls, res['bridge'])}


def scenario_writes(res, mdir):
    """The game writes a meal as a total and an activity as a level in calls of 15 minutes; the engine gets the same as schedule windows."""
    bridge = res['bridge']
    food_var, act_var = bridge['handles']['food_intake'][0], bridge['handles']['activity_load'][0]
    meals = {7 * 60 + 30: 50.0, 12 * 60 + 15: 70.0, 18 * 60 + 45: 60.0, 21 * 60: 25.0}
    walks = {9 * 60: 0.2, 17 * 60: 0.4, 17 * 60 + 15: 0.4, 17 * 60 + 30: 0.4, 8 * 60 + 45: 0.15}
    calls, regimens = [], []
    for k in range(48 * 4):
        minute = k * 15
        day_minute = minute % 1440
        handles = []
        if day_minute in meals:
            handles.append({'concept': 'food_intake', 'mode': 'total', 'value': meals[day_minute], 'source': 'player'})
            regimens.append({'variable': food_var, 'time_start': hhmm(minute), 'time_end': hhmm(minute + 15), 'value': meals[day_minute],
                             'date_range': [iso_day(minute), iso_day(minute)]})
        if day_minute in walks:
            handles.append({'concept': 'activity_load', 'mode': 'level', 'value': walks[day_minute], 'source': 'dispatch'})
            regimens.append({'variable': act_var, 'time_start': hhmm(minute), 'time_end': hhmm(minute + 15), 'value': walks[day_minute], 'delivery': 'level',
                             'date_range': [iso_day(minute), iso_day(minute)]})
        calls.append({'minutes': 15, 'handles': handles})
    rows, step_min = engine_rows(mdir, 'composed/diabetes_meals', regimens, 48 * 60)
    return {'name': 'diabetes_meals_writes', 'description': 'Composed diabetes and meals, no preset, meals written as totals and activity as levels in calls of 15 minutes, 48 hours.',
            'init': {'subjects': [{'id': 's', 'preset': None}]}, 'calls': calls, 'expected': expected_from_rows(rows, step_min, calls, bridge)}


HUMAN_BODY = 'references/medical/physiology/human_body'


def scenario_traveler(workdir):
    """The seventeen components of the traveler_stay system in the shared namespace, a day per call, with a daily drink, an activity and a pathogen exposure.

    Two things are recorded. First, as a check made while the fixture is generated, the composed flat model is run in the engine next to a scenario that
    imports the same seventeen files the way the models repository does; the two must agree, which shows that the shared namespace is what an import is.
    Second, the fixture itself: the daily calls and the variables the engine gives for the flat model."""
    mdir = os.path.join(workdir, 'models_traveler')
    os.makedirs(os.path.join(mdir, HUMAN_BODY), exist_ok=True)
    for fn in os.listdir(os.path.join(MODELS, HUMAN_BODY)):
        if fn.endswith('_2026.yaml'):
            shutil.copy(os.path.join(MODELS, HUMAN_BODY, fn), os.path.join(mdir, HUMAN_BODY, fn))
    lib = be.open_library(mdir)
    res = br.compose_system(br.load_yaml(os.path.join(be.SYSTEMS, 'traveler_stay.system.yaml')), lib)
    bridge, flat = res['bridge'], res['model']
    exposure = 0.15
    eng_model = json.loads(json.dumps(flat, default=str))
    eng_model['variables'][bridge['context']['pathogen_exposure'][0]]['value'] = exposure
    be.write(os.path.join(mdir, 'composed', 'traveler_stay.yaml'), br.dump_yaml(eng_model))
    imports = [m for m in res['report']['members']]
    scenario = {'metadata': {'name': 'traveler_oracle', 'lm_format_version': '1.0'}, 'imports': imports, 'variables': {}, 'equations': {},
                'simulation': {'step_size': {'value': 1, 'unit': 'day'}, 'start_date': '2026-01-01', 'end_date': '2026-04-01'}}
    scenario['variables'][bridge['context']['pathogen_exposure'][0]] = {'value': exposure}
    be.write(os.path.join(mdir, 'composed', 'traveler_oracle.yaml'), br.dump_yaml(scenario))
    days = 40
    water_var, act_var = bridge['handles']['fluid_intake'][0], bridge['handles']['activity_load'][0]
    drinks = [2.4, 1.2, 0.6, 0.6, 1.0, 2.4, 3.0, 0.4]
    walks = [20.0, 60.0, 120.0, 90.0, 10.0, 30.0]
    calls, regimens = [], []
    for d in range(days):
        w, a = drinks[d % len(drinks)], walks[(3 * d) % len(walks)]
        calls.append({'minutes': 1440, 'handles': [{'concept': 'fluid_intake', 'mode': 'total', 'value': w, 'source': 'event'},
                                                    {'concept': 'activity_load', 'mode': 'level', 'value': a, 'source': 'dispatch'}]})
        regimens.append({'variable': water_var, 'time_start': '00:00', 'time_end': '24:00', 'value': w, 'date_range': [iso_day(d * 1440)] * 2})
        regimens.append({'variable': act_var, 'time_start': '00:00', 'time_end': '24:00', 'value': a, 'delivery': 'level', 'date_range': [iso_day(d * 1440)] * 2})
    rows, step_min = engine_rows(mdir, 'composed/traveler_stay', regimens, days)
    rows_o, _ = engine_rows(mdir, 'composed/traveler_oracle', regimens, days)
    worst = 0.0
    for k, v in rows[-1].items():
        if k in ('step', 'time') or not isinstance(v, (int, float)):
            continue
        o = rows_o[-1].get(k)
        if o is not None:
            worst = max(worst, abs(v - o) / (abs(o) + 1e-9))
    print(f'composed traveler_stay against the imported scenario after {days} days: worst relative difference {worst:.2e}')
    assert worst < 1e-9, 'the shared namespace composition does not equal the import'
    expected = []
    for i in range(len(calls)):
        row = rows[i]
        variables = {k: v for k, v in row.items() if k not in ('step', 'time')}
        expected.append({'after_call': i, 'variables': variables, 'readouts': br.read_concepts(bridge, variables)})
    return {'name': 'traveler_stay_days', 'description': f'The traveler_stay system, {days} days of one call each: a daily drink as a total, an activity as a level and a pathogen exposure of {exposure}.',
            'init': {'subjects': [{'id': 's', 'preset': None, 'context': {'pathogen_exposure': exposure}}]}, 'calls': calls, 'expected': expected,
            '_model': flat, '_bridge': bridge, '_report': res['report']}


def main():
    if not os.path.isfile(os.path.join(MODELS, DIABETES + '.yaml')):
        print('the models repository was not found at', MODELS)
        return 1
    work = tempfile.mkdtemp(prefix='temp_conformance_engine_')
    try:
        mdir, res = compose_system(work)
        os.makedirs(FIXTURES, exist_ok=True)
        scenarios = [scenario_preset(res, mdir), scenario_writes(res, mdir), scenario_traveler(work)]
        for sc in scenarios:
            m, b, rep = sc.pop('_model', res['model']), sc.pop('_bridge', res['bridge']), sc.pop('_report', res['report'])
            doc = {'fixture_version': 1, 'kind': 'engine', 'source': {'reference': 'LM Reference Engine, ReferenceSolver', 'system': b['system'], 'members': rep['members']},
                   'model': m, 'bridge': b, 'tolerance': TOLERANCE, **sc}
            path = os.path.join(FIXTURES, sc['name'] + '.json')
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                json.dump(doc, f, ensure_ascii=False, indent=1, default=str)
            print('wrote', path, len(sc['calls']), 'calls')
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
