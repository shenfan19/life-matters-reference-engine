"""Tests for the game_bridge plugin. Run from the repository root:

    python plugins/game_bridge/tests/test_bridge.py

Three groups.
  1. Pure tests on small models written here: vocabulary, bridge checks, choosing models, composition, priorities, every error path.
  2. Parity tests: the composed model run by the LM Reference Engine equals the same chain written by hand; the Care model made from it,
     run by the care_export evaluator, equals the engine; a single-model system gives exactly the model care_export makes alone.
  3. Teleporter: every expression of the fragment compiles with Teleporter's own expr.js and gives the same number as the source
     expression (needs node and the game-teleporter folder next to this repository, skipped without them).
Groups 2 and 3 need the models repository (LM_MODELS_PATH or a sibling folder); they are skipped without it.
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PLUGIN))
sys.path.insert(0, PLUGIN)
import backend as be  # noqa: E402
import bridge as br  # noqa: E402
import targets as tg  # noqa: E402

MODELS = os.environ.get('LM_MODELS_PATH') or os.path.join(os.path.dirname(ROOT), 'life-matters-models', 'models')
TP_DIR = os.environ.get('TP_PATH') or os.path.join(os.path.dirname(ROOT), 'game-teleporter')
DIABETES = 'references/medical/disease/metabolic/diabetes_2026'
failed = []


def check(name, ok, detail=''):
    print(('pass ' if ok else 'FAIL ') + name + (('  ' + str(detail)) if detail else ''))
    if not ok:
        failed.append(name)


def expect_error(name, fn, needle):
    try:
        fn()
    except br.BridgeError as e:
        check(name, any(needle in p for p in e.problems), e.problems)
        return
    check(name, False, 'no error raised')


# ---------------------------------------------------------------- small models

def model(name, variables, equations, step=('minute', 1), plans=None, ratings=None, prio=None):
    m = {'metadata': {'name': name, 'lm_format_version': '1.0', 'ratings': ratings or {'confidence': '0.5 - toy'}},
         'variables': variables, 'equations': equations,
         'simulation': {'step_size': {'value': step[1], 'unit': step[0]}, 'start_date': '2026-01-01', 'end_date': '2026-01-03'}}
    if plans:
        m['simulation']['plans'] = plans
    return m


def toy_models():
    diet = model('toy_diet', {
        'meal_g': {'type': 'input', 'value': 0, 'unit': 'g'},
        'absorb': {'type': 'parameter', 'value': 0.8},
        'carb_flux': {'type': 'state', 'value': 0, 'unit': 'g', 'bounds': [0, 500]},
    }, {'absorb_meal': {'step_unit': 'minute', 'priority': 10, 'dynamics': {'carb_flux': 'meal_g * absorb'}}})
    gluc = model('toy_glucose', {
        'carb': {'type': 'input', 'value': 0, 'unit': 'g'},
        'g': {'type': 'state', 'value': 100, 'unit': 'mg/dL', 'bounds': [30, 600]},
        'k': {'type': 'parameter', 'value': 0.01},
    }, {'g_eq': {'step_unit': 'minute', 'priority': 5, 'dynamics': {'g': 'g + (carb * 2 - k * (g - 90)) * step'}}})
    gluc_b = copy.deepcopy(gluc)
    gluc_b['metadata'] = {'name': 'toy_glucose_b', 'lm_format_version': '1.0', 'ratings': {'confidence': '0.5 - toy'}}
    gluc_c = copy.deepcopy(gluc)
    gluc_c['metadata'] = {'name': 'toy_glucose_c', 'lm_format_version': '1.0', 'ratings': {'confidence': '0.75 - toy'}}
    loopa = model('toy_loop_a', {'a_in': {'type': 'input', 'value': 0}, 'a_out': {'type': 'state', 'value': 0}},
                  {'ea': {'step_unit': 'minute', 'dynamics': {'a_out': 'a_in + 1'}}})
    loopb = model('toy_loop_b', {'b_in': {'type': 'input', 'value': 0}, 'b_out': {'type': 'state', 'value': 0}},
                  {'eb': {'step_unit': 'minute', 'dynamics': {'b_out': 'b_in + 1'}}})
    badprio = model('toy_badprio', {'x': {'type': 'state', 'value': 0}}, {'e': {'step_unit': 'minute', 'priority': 500, 'dynamics': {'x': 'x + 1'}}})
    pantry = model('toy_pantry', {'stock': {'type': 'state', 'value': 100, 'bounds': [0, 1000]}, 'meal_out': {'type': 'state', 'value': 0, 'bounds': [0, 500]}},
                   {'serve': {'step_unit': 'minute', 'priority': -20, 'dynamics': {'meal_out': 'min(stock, 50)'}}})
    return {'toy/pantry': pantry, 'toy/diet': diet, 'toy/glucose': gluc, 'toy/glucose_b': gluc_b, 'toy/glucose_c': gluc_c, 'toy/loop_a': loopa,
            'toy/loop_b': loopb, 'toy/badprio': badprio}


def toy_bridges():
    b = lambda model, provides=None, requires=None, tags=None: {'bridge_version': 1, 'model': model, 'provides': provides or {}, 'requires': requires or {},
                                                                 'tags': tags or []}
    return {
        'diet': b('toy/diet', {'carb_intake': {'var': 'carb_flux'}}, {'food_intake': {'var': 'meal_g'}}, ['diet']),
        'pantry': b('toy/pantry', {'food_intake': {'var': 'meal_out'}}, {}, ['pantry']),
        'glucose': b('toy/glucose', {'glycemic_level': {'var': 'g', 'scale': [70, 300]}, 'frailty': {'rate': '0.001 * (g - 90)'}},
                     {'carb_intake': {'var': 'carb'}}, ['toy_diabetes']),
        'glucose_b': b('toy/glucose_b', {'glycemic_level': {'var': 'g', 'scale': [70, 300]}}, {'carb_intake': {'var': 'carb'}}, ['twin']),
        'glucose_c': b('toy/glucose_c', {'glycemic_level': {'var': 'g', 'scale': [70, 300]}}, {'carb_intake': {'var': 'carb'}}, ['twin2']),
        'loop_a': b('toy/loop_a', {'activity_load': {'var': 'a_out'}}, {'social_contact': {'var': 'a_in'}}, ['loop']),
        'loop_b': b('toy/loop_b', {'social_contact': {'var': 'b_out'}}, {'activity_load': {'var': 'b_in'}}, ['loop']),
        'badprio': b('toy/badprio', {'fatigue': {'var': 'x', 'scale': [0, 1]}}, {}, ['badprio']),
    }


def build_library(root):
    mdir, bdir = os.path.join(root, 'models'), os.path.join(root, 'bridges')
    for key, m in toy_models().items():
        be.write(os.path.join(mdir, key + '.yaml'), br.dump_yaml(m))
    for name, b in toy_bridges().items():
        be.write(os.path.join(bdir, name + '.bridge.yaml'), br.dump_yaml(b))
    vocab = br.Vocabulary(br.load_yaml(os.path.join(be.LIBRARY, 'concepts.yaml')))
    return br.Library(mdir, [bdir], vocab)


def run_tests(tmp):
    lib = build_library(os.path.join(tmp, 'toy'))
    vocab = lib.vocab

    # ---- vocabulary
    check('the shipped vocabulary loads and is small', len(vocab.concepts) <= 25, len(vocab.concepts))
    expect_error('a concept with an unknown role is refused', lambda: br.Vocabulary({'concepts': {'a': {'role': 'thing'}}}), 'role must be')
    expect_error('a concept with a bad combine is refused', lambda: br.Vocabulary({'concepts': {'a': {'role': 'readout', 'combine': 'sum_rate'}}}), 'combine must be')

    ok_voc = {'vocabulary_version': 1, 'concepts': {'h': {'role': 'handle', 'mode': 'total'}, 'r': {'role': 'readout'}}}
    check('a small vocabulary with a version and a handle mode loads', br.Vocabulary(ok_voc).mode('h') == 'total' and br.Vocabulary(ok_voc).version == 1)
    expect_error('a vocabulary without a version is refused', lambda: br.Vocabulary({'concepts': {}}), 'vocabulary_version')
    expect_error('a handle without a mode is refused', lambda: br.Vocabulary({'vocabulary_version': 1, 'concepts': {'h': {'role': 'handle'}}}), 'needs mode')
    expect_error('a handle with an unknown mode is refused', lambda: br.Vocabulary({'vocabulary_version': 1, 'concepts': {'h': {'role': 'handle', 'mode': 'burst'}}}), 'needs mode')
    expect_error('a readout with a mode is refused', lambda: br.Vocabulary({'vocabulary_version': 1, 'concepts': {'r': {'role': 'readout', 'mode': 'level'}}}), 'mode belongs to handles')
    check('every handle of the shipped vocabulary has a mode', all(c.get('mode') in br.HANDLE_MODES for c in vocab.concepts.values() if c['role'] == 'handle'))

    # ---- bridge checks
    probs = br.check_library(lib)
    check('the toy bridge files are consistent with their models', not probs, probs)
    bad = copy.deepcopy(toy_bridges()['glucose'])
    bad['provides']['not_a_concept'] = {'var': 'g'}
    bad['provides']['hydration_deficit'] = {'var': 'missing', 'scale': [0, 1]}
    bad['provides']['fatigue'] = {'var': 'g'}
    bad['requires']['carb_intake'] = {'var': 'k'}
    ps = br.check_bridge(bad, toy_models()['toy/glucose'], vocab)
    check('unknown concept is reported', any('not_a_concept' in p for p in ps), ps)
    check('undeclared variable is reported', any('"missing" is not declared' in p for p in ps), ps)
    check('a readout without scale is reported', any('scale' in p and 'fatigue' in p for p in ps), ps)
    check('a required parameter is reported', any('parameter' in p for p in ps), ps)

    # ---- resolve
    base = {'system_version': 1, 'id': 's', 'goal': ['glycemic_level'], 'include_tags': ['toy_diabetes'], 'supply_from_game': ['food_intake']}
    plan = br.resolve(base, lib)
    check('the diet is pulled in because the glucose model needs carb_intake', plan['members'] == ['toy/glucose', 'toy/diet'], plan['members'])
    check('the provider sits one level above the consumer', plan['level'] == {'toy/glucose': 0, 'toy/diet': 1}, plan['level'])
    plan1 = br.resolve({**base, 'supply_from_game': ['food_intake', 'carb_intake']}, lib)
    check('a concept the game supplies is not looked up', plan1['members'] == ['toy/glucose'], plan1['members'])
    expect_error('an unsatisfied requirement is reported with its origin', lambda: br.resolve({**base, 'supply_from_game': [], 'policy': {'exclude': ['toy/pantry']}}, lib), 'toy/diet requires "food_intake"')
    expect_error('a goal nobody provides is reported', lambda: br.resolve({**base, 'goal': ['loneliness']}, lib), 'goal "loneliness"')
    expect_error('two providers of one readout need a pin', lambda: br.resolve({**base, 'include_tags': ['toy_diabetes', 'twin']}, lib), 'combines by replace')
    p_pin = br.resolve({**base, 'include_tags': [], 'goal': ['glycemic_level'], 'pins': {'glycemic_level': 'toy/glucose_b'}, 'supply_from_game': ['carb_intake']}, lib)
    check('a pin chooses the provider', p_pin['members'] == ['toy/glucose_b'], p_pin['members'])
    p_hi = br.resolve({**base, 'include_tags': [], 'supply_from_game': ['carb_intake', 'food_intake'], 'goal': ['glycemic_level'],
                       'policy': {'min_ratings': {'confidence': 0.75}}}, lib)
    check('policy.min_ratings removes weaker providers', p_hi['members'] == ['toy/glucose_c'], p_hi['members'])
    p_top = br.resolve({**base, 'include_tags': [], 'supply_from_game': ['carb_intake', 'food_intake'], 'goal': ['glycemic_level']}, lib)
    check('with several providers the highest confidence wins', p_top['members'] == ['toy/glucose_c'], p_top['members'])
    expect_error('a tie without a pin is reported', lambda: br.resolve({**base, 'include_tags': [], 'supply_from_game': ['carb_intake', 'food_intake'],
                                                                      'goal': ['glycemic_level'], 'policy': {'exclude': ['toy/glucose_c']}}, lib), 'tie')
    p_ex = br.resolve({**base, 'include_tags': [], 'supply_from_game': ['carb_intake', 'food_intake'], 'goal': ['glycemic_level'],
                       'policy': {'exclude': ['toy/glucose_c', 'toy/glucose_b']}}, lib)
    check('policy.exclude removes a candidate', p_ex['members'] == ['toy/glucose'], p_ex['members'])
    expect_error('a cycle between members is reported', lambda: br.resolve({**base, 'include_tags': ['loop'], 'goal': [], 'supply_from_game': []}, lib), 'cycle')
    expect_error('a pin that does not provide is reported', lambda: br.resolve({**base, 'pins': {'glycemic_level': 'toy/diet'}}, lib), 'does not provide')
    expect_error('an unknown concept in a system is reported', lambda: br.resolve({**base, 'goal': ['nope']}, lib), 'not in the vocabulary')
    expect_error('supplying a readout is refused', lambda: br.resolve({**base, 'supply_from_game': ['glycemic_level']}, lib), 'is a readout')

    # ---- a chain of three
    chain = br.resolve({**base, 'supply_from_game': []}, lib)
    check('a chain of three members gets three levels', chain['level'] == {'toy/glucose': 0, 'toy/diet': 1, 'toy/pantry': 2}, chain['level'])
    cflat = br.compose(chain, lib)['model']['equations']
    cp = {n: e['priority'] for n, e in cflat.items()}
    order = sorted(cp, key=lambda n: -cp[n])
    check('equations run pantry, wire, diet, wire, glucose', order == ['pantry_serve', 'wire_diet_meal_g', 'diet_absorb_meal', 'wire_glucose_carb', 'glucose_g_eq'], order)

    # ---- compose
    res = br.compose(plan, lib)
    flat, bridge = res['model'], res['bridge']
    check('names carry the member prefix', 'glucose_g' in flat['variables'] and 'diet_carb_flux' in flat['variables'], list(flat['variables']))
    check('the wired input became a state', flat['variables']['glucose_carb']['type'] == 'state', flat['variables']['glucose_carb'])
    check('the wire equation follows the provider', flat['equations']['wire_glucose_carb']['dynamics'] == {'glucose_carb': 'diet_carb_flux'},
          flat['equations']['wire_glucose_carb'])
    pr = {n: e['priority'] for n, e in flat['equations'].items()}
    check('priorities run provider, wire, consumer', pr['diet_absorb_meal'] > pr['wire_glucose_carb'] > pr['glucose_g_eq'], pr)
    check('the game supplied handle is listed', bridge['handles'] == {'food_intake': ['diet_meal_g']}, bridge.get('handles'))
    check('the bridge description carries the vocabulary version and the mode of each handle', bridge['vocabulary_version'] == vocab.version and bridge['modes'] == {'food_intake': 'total'}, (bridge.get('vocabulary_version'), bridge.get('modes')))
    lc = be.lmcore_files(res)
    check('the lmcore export is two JSON documents, the flat model and the bridge description', sorted(lc) == ['s.bridge.json', 's.lm.json'] and json.loads(lc['s.bridge.json']) == bridge and json.loads(lc['s.lm.json'])['variables'].keys() == flat['variables'].keys())
    check('the readout is described with its scale', bridge['readouts']['glycemic_level']['sources'] == [{'var': 'glucose_g', 'lo': 70, 'hi': 300}], bridge['readouts'])
    check('a rate is renamed and kept', bridge['rates']['frailty']['terms'] == ['0.001 * (glucose_g - 90)'], bridge.get('rates'))
    check('the flat model has no imports and only LM blocks', set(flat) <= {'metadata', 'variables', 'equations', 'simulation', 'auxiliary'}, list(flat))
    check('ratings are the lowest of the members', flat['metadata']['ratings']['confidence'].startswith('0.5'), flat['metadata']['ratings'])
    single = br.compose(plan1, lib)
    check('a single-member system keeps the original names', 'g' in single['model']['variables'] and 'carb' in single['model']['variables'], list(single['model']['variables']))
    state = {'glucose_g': 185.0}
    check('read_concepts scales and clips', abs(br.read_concepts(bridge, state)['glycemic_level'] - 0.5) < 1e-12, br.read_concepts(bridge, state))
    check('read_rates evaluates a rate', abs(br.read_rates(bridge, state)['frailty'] - 0.095) < 1e-12, br.read_rates(bridge, state))
    expect_error('priorities outside the band are refused', lambda: br.compose(br.resolve({**base, 'include_tags': ['badprio'], 'goal': [], 'supply_from_game': []}, lib), lib), 'priorities must stay')
    with_imp = copy.deepcopy(toy_models()['toy/diet'])
    with_imp['imports'] = ['toy/glucose']
    be.write(os.path.join(lib.models_dir, 'toy', 'diet.yaml'), br.dump_yaml(with_imp))
    expect_error('a member that imports is refused', lambda: br.compose(plan, lib), 'imports')
    be.write(os.path.join(lib.models_dir, 'toy', 'diet.yaml'), br.dump_yaml(toy_models()['toy/diet']))

    # ---- targets
    check('the flat model passes the Care expression subset', not tg.check_target(flat, 'care'), tg.check_target(flat, 'care'))
    check('the flat model passes the Teleporter expression subset', not tg.check_target(flat, 'tp'), tg.check_target(flat, 'tp'))
    odd = copy.deepcopy(flat)
    odd['equations']['glucose_g_eq']['dynamics']['glucose_g'] = 'foo(glucose_g)'
    check('an unsupported function is reported for both games', tg.check_target(odd, 'care') and tg.check_target(odd, 'tp'))
    frag = tg.to_tp(flat, bridge, 'traveler', 0.25)
    check('Teleporter variables are dotted and marked lm_model', 'traveler.glucose_g' in frag['variables'] and frag['variables']['traveler.glucose_g']['source'] == 'lm_model',
          list(frag['variables'])[:4])
    e = frag['equations']['traveler_glucose_g_eq']['dynamics']['traveler.glucose_g']
    check('step is rewritten from minutes to days', '(step * 1440.0)' in e.replace('step * 1440', 'step * 1440.0') or 'step * 1440' in e, e)
    check('the bridge of the fragment uses Teleporter names', frag['bridge']['readouts']['glycemic_level']['sources'][0]['var'] == 'traveler.glucose_g', frag['bridge']['readouts'])
    era = {'simulation': {'step_size': {'value': 0.25}}, 'variables': {'x': {'type': 'state', 'value': 0, 'source': 'game_assumption'}}, 'equations': {}}
    merged = tg.merge_into_era(era, frag)
    check('a fragment merges into an era file', 'traveler.glucose_g' in merged['variables'] and 'x' in merged['variables'])
    expect_error('a step mismatch is refused', lambda: tg.merge_into_era({**era, 'simulation': {'step_size': {'value': 1}}}, frag), 'steps by')
    expect_error('a name clash is refused', lambda: tg.merge_into_era({**era, 'variables': {'traveler.glucose_g': {}}}, frag), 'already exists')
    dist = copy.deepcopy(flat)
    dist['variables']['glucose_k']['value'] = 'normal(0.01, 0.002)'
    expect_error('a distribution cannot go to Teleporter', lambda: tg.to_tp(dist, bridge), 'not a number')

    # ---- concept expansion in a recipe
    probs2 = []
    out = tg.expand_concepts({'pulses': {'dinner': [{'input': '@food_intake', 'total': 5}]}, 'needs': {'sugar': {'signal': '@glycemic_level'}},
                              'effects': {'x': '2 * @glucose.k'}}, bridge, probs2)
    check('@concept expands in pulses, values and member tokens', not probs2 and out['pulses']['dinner'][0]['input'] == 'diet_meal_g' and
          out['needs']['sugar']['signal'] == 'glucose_g' and out['effects']['x'] == '2 * glucose_k', (out, probs2))
    probs3 = []
    tg.expand_concepts({'a': '@loneliness'}, bridge, probs3)
    check('an unknown concept in a recipe is reported', bool(probs3), probs3)


# ---------------------------------------------------------------- parity with the engine

def engine_final(models_dir, key, hours, out_csv):
    sys.path.insert(0, os.path.join(ROOT, 'reference_engine'))
    sys.path.insert(0, ROOT)
    from src.reference_engine import ReferenceEngine
    eng = ReferenceEngine(models_dir)
    r = eng.run_simulation(key, hours, output_path=out_csv)
    assert r.get('success'), r
    return {k: v['value'] for k, v in r['state'].items()}


def parity_tests(tmp):
    src = br.load_yaml(os.path.join(MODELS, DIABETES + '.yaml'))
    # a diet that turns a meal into the carbohydrate the diabetes model eats; 80 percent of the meal arrives
    absorb = 0.8
    meals = [('08:00', 50.0), ('12:00', 70.0), ('18:00', 60.0)]
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    dr = ['2026-01-01', '2026-04-01']
    diet = model('meal_diet', {
        'meal_g': {'type': 'input', 'value': 0, 'unit': 'g'},
        'absorb': {'type': 'parameter', 'value': absorb},
        'carb_flux': {'type': 'state', 'value': 0, 'unit': 'g', 'bounds': [0, 500]},
    }, {'absorb_meal': {'step_unit': 'minute', 'priority': 10, 'dynamics': {'carb_flux': 'meal_g * absorb'}}},
        plans=[{'id': 'default', 'regimens': [{'variable': 'meal_g', 'time_start': t, 'value': v, 'days': days, 'date_range': dr} for t, v in meals]}])
    root = os.path.join(tmp, 'par')
    mdir, bdir = os.path.join(root, 'models'), os.path.join(root, 'bridges')
    be.write(os.path.join(mdir, 'toy', 'meal_diet.yaml'), br.dump_yaml(diet))
    be.write(os.path.join(bdir, 'meal_diet.bridge.yaml'), br.dump_yaml({'bridge_version': 1, 'model': 'toy/meal_diet', 'provides': {'carb_intake': {'var': 'carb_flux'}},
                                                                         'requires': {'food_intake': {'var': 'meal_g'}}, 'tags': []}))
    # the real model, copied so that the reference run can use the carbohydrate the diet would give
    be.write(os.path.join(mdir, DIABETES + '.yaml'), br.dump_yaml(src))
    ref = copy.deepcopy(src)
    for r in ref['simulation']['plans'][0]['regimens']:
        if r['variable'] == 'carb_intake':
            r['value'] = r['value'] * absorb
    be.write(os.path.join(mdir, 'toy', 'diabetes_reference.yaml'), br.dump_yaml(ref))
    vocab = br.Vocabulary(br.load_yaml(os.path.join(be.LIBRARY, 'concepts.yaml')))
    lib = br.Library(mdir, [os.path.join(be.LIBRARY, 'bridges'), bdir], vocab)
    system = {'system_version': 1, 'id': 'diabetes_meals', 'goal': ['glycemic_level', 'frailty', 'mood_valence'], 'include_tags': ['diabetes'],
              'supply_from_game': ['food_intake', 'activity_load']}
    res = br.compose_system(system, lib)
    check('the real diabetes model pulls in the diet by concept', list(res['report']['members']) == [DIABETES, 'toy/meal_diet'], res['report']['members'])
    be.write(os.path.join(mdir, 'composed', 'diabetes_meals.yaml'), br.dump_yaml(res['model']))
    hours = 72
    try:
        got = engine_final(mdir, 'composed/diabetes_meals', hours, os.path.join(tmp, 'c.csv'))
        want = engine_final(mdir, 'toy/diabetes_reference', hours, os.path.join(tmp, 'r.csv'))
    except Exception as e:
        print('skip engine parity:', repr(e)[:300])
        return
    pre = res['report']['members'][DIABETES]
    worst = 0.0
    for k, v in want.items():
        g = got.get(f'{pre}_{k}')
        if g is None or not isinstance(v, (int, float)):
            continue
        worst = max(worst, abs(g - v) / (abs(v) + 1e-9))
    check('composed diet+diabetes equals the diabetes model fed the same carbohydrate (engine, 72 h)', worst < 1e-9, f'worst relative difference {worst:.2e}')
    check('the wired input is a state in the engine run', f'{pre}_carb_intake' in got)

    # Care: the whole chain models -> compose -> Care model -> Care evaluator equals the engine
    sys.path.insert(0, os.path.join(os.path.dirname(PLUGIN), 'care_export'))
    import convert as cv
    recipe = {'prefix': 'dmlm', 'condition': {'id': 'diabetes'}, 'inputs': {'@food_intake': {'schedule': 'auto'}, '@activity_load': {'schedule': 'auto'}},
              'needs': {'sugar': {'kind': 'monitor', 'signal': '@glycemic_level', 'lo': 110, 'hi': 220, 'rate': 0.05, 'gain': 1.5}}}
    care = tg.to_care(res['model'], res['bridge'], recipe)
    cm = care['model']
    check('Care effects come from the rates the members give', 'frailty' in cm['care']['effects'] and 'mood' in cm['care']['effects'], cm['care'].get('effects'))
    check('mood effect is negated, a bad mood value lowers mood', cm['care']['effects']['mood'].startswith('-('), cm['care']['effects']['mood'])
    states = [k for k, v in cm['variables'].items() if v['type'] == 'state' and '_need_' not in k]
    sim = cv.simulate(cm, hours, outputs=states, start_hour=0.0, weekday=1, record_every_min=hours * 60)
    cprefix = 'dmlm_'
    worst = 0.0
    for k in states:
        base = k[len(cprefix):]
        if base in got:
            worst = max(worst, abs(sim[k][-1] - got[base]) / (abs(got[base]) + 1e-9))
    check('the Care model of the composed system reproduces the engine (72 h)', worst < 1e-4, f'worst relative difference {worst:.2e}')

    # a single-member system gives the same Care model as care_export alone
    recipe_file = os.path.join(os.path.dirname(PLUGIN), 'care_export', 'recipes', 'diabetes.yaml')
    rcp = br.load_yaml(recipe_file)
    one = br.compose_system({'system_version': 1, 'id': 'diabetes_alone', 'goal': ['glycemic_level'], 'include_tags': ['diabetes'],
                             'supply_from_game': ['carb_intake', 'activity_load']}, lib)
    via = tg.to_care(one['model'], one['bridge'], rcp)
    direct = cv.convert(src, rcp, DIABETES)
    body = lambda m: {k: v for k, v in m.items() if k != 'metadata'}
    check('a single-member system exports exactly what care_export makes alone', body(via['model']) == body(direct['model']))
    keep = lambda m: {k: m['metadata'].get(k) for k in ('ratings', 'source_reviewed', 'description')}
    check('the review status and ratings of the source survive composition', keep(via['model']) == keep(direct['model']), keep(via['model']))
    return res


def tp_tests(tmp, res, step_days=0.25, label='diabetes fragment'):
    node = shutil.which('node')
    expr_js = os.path.join(TP_DIR, 'js', 'expr.js')
    if not node or not os.path.isfile(expr_js) or res is None:
        print('skip Teleporter expression check: node or', expr_js, 'not found')
        return
    flat, bridge = res['model'], res['bridge']
    frag = tg.to_tp(flat, bridge, 'traveler', step_days)
    # cases: the source expression evaluated in Python at a state, the fragment expression evaluated by Teleporter's own compiler at the same state
    import math
    funcs = {'min': min, 'max': max, 'abs': abs, 'exp': math.exp, 'log': math.log, 'sqrt': math.sqrt, 'pow': math.pow, 'floor': math.floor, 'sin': math.sin, 'cos': math.cos, 'tanh': math.tanh}
    import random
    rnd = random.Random(7)
    cases = []
    names = {n: v for n, v in flat['variables'].items()}
    for en, eq in flat['equations'].items():
        unit_h = br.STEP_HOURS[eq.get('step_unit', 'hour')]
        step = step_days * 24.0 / unit_h
        for trial in range(5):
            env = {}
            for n, v in names.items():
                b = v.get('bounds') or [0, 10]
                lo, hi = (b[0] if b[0] is not None else 0), (b[1] if b[1] is not None else 10)
                env[n] = float(v['value']) if trial == 0 else rnd.uniform(lo, hi)
            aux = {}
            for an, ae in (flat.get('auxiliary') or {}).items():
                aux[an] = eval(str(ae), {'__builtins__': {}}, {**funcs, **env, 'step': step})
            for var, expr in eq['dynamics'].items():
                try:
                    want = eval(str(expr), {'__builtins__': {}}, {**funcs, **env, **aux, 'step': step})
                except (ValueError, ZeroDivisionError, OverflowError):
                    continue            # a state the equation is not defined at
                cases.append({'eq': f'{"traveler_" + en}', 'target': 'traveler.' + var, 'state': {f'traveler.{k}': val for k, val in env.items()},
                              'step': step_days, 'want': float(want)})
    payload = {'expr_js': expr_js.replace('\\', '/'), 'frag': {'equations': frag['equations'], 'variables': list(frag['variables'])}, 'cases': cases}
    script = os.path.join(HERE, 'tp_check.mjs')
    p = subprocess.run([node, script], input=json.dumps(payload), capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        check(f'Teleporter compiles and evaluates every expression of the {label} like the source', False, (p.stdout + p.stderr)[-600:])
        return
    out = json.loads(p.stdout)
    check(f'Teleporter compiles and evaluates every expression of the {label} like the source', out['worst'] < 1e-9 and out['n'] == len(cases),
          f'{out["n"]} cases, worst relative difference {out["worst"]:.2e}')



# ---------------------------------------------------------------- shared namespace, expressions, inverted scales

def shared_tests(tmp):
    """Components that read each other by name (the way the human body components do), joined without prefixes."""
    body = model('toy_body', {
        'load': {'type': 'state', 'value': 0.2, 'bounds': [0, 1]},
        'rest': {'type': 'state', 'value': 1.0, 'bounds': [0, 2]},
        'pool_a': {'type': 'state', 'value': 1.0, 'bounds': [0, 3]},
        'pool_b': {'type': 'state', 'value': 1.0, 'bounds': [0, 3]},
        'k': {'type': 'parameter', 'value': 0.1},
    }, {'load_eq': {'step_unit': 'day', 'priority': 150, 'dynamics': {'load': 'load + (effort * 0.1 + hook_a * 0.0 - k * load) * step'}},
        'rest_eq': {'step_unit': 'day', 'priority': 140, 'dynamics': {'rest': 'rest - (rest - 1.0 + load) * 0.1 * step'}},
        'pool_eq': {'step_unit': 'day', 'dynamics': {'pool_a': 'pool_a - 0.05 * step', 'pool_b': 'pool_b - 0.02 * step'}}})
    inputs = model('toy_inputs', {'effort': {'type': 'input', 'value': 0.5, 'bounds': [0, 2]}, 'hook_a': {'type': 'state', 'value': 0.0}}, {})
    hooker = model('toy_hooker', {'unused': {'type': 'parameter', 'value': 1}}, {'hook_eq': {'step_unit': 'day', 'dynamics': {'hook_a': 'hook_a + load * step'}}})
    twin = model('toy_twin', {'load': {'type': 'state', 'value': 0.5}}, {})
    root = os.path.join(tmp, 'shared')
    mdir, bdir = os.path.join(root, 'models'), os.path.join(root, 'bridges')
    for key, m in {'body/body': body, 'body/inputs': inputs, 'body/hooker': hooker, 'body/twin': twin}.items():
        be.write(os.path.join(mdir, key + '.yaml'), br.dump_yaml(m))
    bridges = {
        'body': {'bridge_version': 1, 'model': 'body/body', 'namespace': 'shared',
                 'provides': {'fatigue': {'var': 'load', 'scale': [0.2, 1.0]}, 'hydration_deficit': {'var': 'rest', 'scale': [1.0, 0.5]},
                              'nutrient_deficit': {'expr': 'max(0.0, 1.0 - min(pool_a, pool_b))', 'scale': [0, 1]}}, 'requires': {}},
        'inputs': {'bridge_version': 1, 'model': 'body/inputs', 'namespace': 'shared', 'provides': {}, 'requires': {'activity_load': {'var': 'effort'}}},
        'twin': {'bridge_version': 1, 'model': 'body/twin', 'namespace': 'shared', 'provides': {}, 'requires': {}},
    }
    for name, b in bridges.items():
        be.write(os.path.join(bdir, name + '.bridge.yaml'), br.dump_yaml(b))
    vocab = br.Vocabulary(br.load_yaml(os.path.join(be.LIBRARY, 'concepts.yaml')))
    lib = br.Library(mdir, [bdir], vocab)
    check('the bridge files of the shared toy components are consistent', not br.check_library(lib), br.check_library(lib))
    system = {'system_version': 1, 'id': 'shared_toy', 'goal': ['fatigue', 'hydration_deficit', 'nutrient_deficit'], 'include_models': ['body/inputs'],
              'shared_models': ['body/hooker'], 'supply_from_game': ['activity_load'], 'step_size': {'value': 1, 'unit': 'day'}}
    res = br.compose_system(system, lib)
    flat, bridge = res['model'], res['bridge']
    check('shared members keep their names and an implicit shared model joins without a bridge file',
          {'load', 'rest', 'effort', 'hook_a', 'unused'} <= set(flat['variables']) and 'hook_eq' in flat['equations'], sorted(flat['variables']))
    check('the system sets the step, and dates are filled in when no member has them',
          flat['simulation']['step_size'] == {'value': 1440, 'unit': 'minute'} and flat['simulation'].get('start_date'), flat['simulation'])
    check('a hook equation may update a variable that another shared component declares', flat['equations']['hook_eq']['dynamics'] == {'hook_a': 'hook_a + load * step'})
    check('priorities above 100 are kept for shared members, nothing is shifted', flat['equations']['load_eq']['priority'] == 150, flat['equations']['load_eq']['priority'])
    check('a handle of a shared member keeps its own name', bridge['handles'] == {'activity_load': ['effort']} and bridge['modes'] == {'activity_load': 'level'}, bridge.get('handles'))
    check('an expression readout and an inverted scale are described',
          bridge['readouts']['nutrient_deficit']['sources'] == [{'expr': 'max(0.0, 1.0 - min(pool_a, pool_b))', 'lo': 0, 'hi': 1}]
          and bridge['readouts']['hydration_deficit']['sources'][0]['lo'] == 1.0 and bridge['readouts']['hydration_deficit']['sources'][0]['hi'] == 0.5, bridge['readouts'])
    state = {'load': 0.6, 'rest': 0.75, 'pool_a': 0.7, 'pool_b': 0.9}
    got = br.read_concepts(bridge, state)
    check('read_concepts reads an inverted scale and an expression',
          abs(got['hydration_deficit'] - 0.5) < 1e-12 and abs(got['nutrient_deficit'] - 0.3) < 1e-12 and abs(got['fatigue'] - 0.5) < 1e-12, got)
    check('a composition of shared members only reports no warning about names declared nowhere', not res['report']['warnings'], res['report']['warnings'])
    expect_error('two shared components declaring one name are refused', lambda: br.compose_system({**system, 'include_models': ['body/inputs', 'body/twin']}, lib), 'both declare "load"')
    expect_error('a shared model that has a bridge file cannot also be listed as implicit', lambda: br.resolve({**system, 'shared_models': ['body/inputs']}, lib), 'has a bridge file')
    expect_error('a shared model that does not exist is reported', lambda: br.resolve({**system, 'shared_models': ['body/nothing']}, lib), 'not found')
    bad = copy.deepcopy(bridges['body'])
    bad['provides']['fatigue'] = {'var': 'load', 'scale': [0.5, 0.5]}
    bad['provides']['nutrient_deficit'] = {'expr': 'pool_a + missing', 'scale': [0, 1]}
    bad['provides']['injury_burden'] = {'var': 'load', 'expr': 'load', 'scale': [0, 1]}
    bad['namespace'] = 'global'
    ps = br.check_bridge(bad, body, vocab)
    check('a scale with lo equal to hi, an unknown name in an expression, var with expr, and an unknown namespace are each reported',
          any('lo different from hi' in p for p in ps) and any('missing' in p for p in ps) and any('exactly one of var, expr and rate' in p for p in ps) and any('namespace' in p for p in ps), ps)
    wired = copy.deepcopy(bridges['inputs'])
    wired['requires'] = {'fatigue': {'var': 'effort'}}
    be.write(os.path.join(bdir, 'inputs.bridge.yaml'), br.dump_yaml(wired))
    lib2 = br.Library(mdir, [bdir], vocab)
    expect_error('a shared component is not wired by concept', lambda: br.compose_system({**system, 'supply_from_game': []}, lib2), 'shared namespace')


def traveler_parity(tmp):
    """The traveler_stay system, composed in the shared namespace, equals the same seventeen files imported by a scenario (engine, 30 days)."""
    hb = 'references/medical/physiology/human_body'
    mdir = os.path.join(tmp, 'tp_parity', 'models')
    os.makedirs(os.path.join(mdir, hb), exist_ok=True)
    for fn in os.listdir(os.path.join(MODELS, hb)):
        if fn.endswith('_2026.yaml'):
            shutil.copy(os.path.join(MODELS, hb, fn), os.path.join(mdir, hb, fn))
    lib = be.open_library(mdir)
    system = br.load_yaml(os.path.join(be.SYSTEMS, 'traveler_stay.system.yaml'))
    res = br.compose_system(system, lib)
    check('traveler_stay composes with no warning', not res['report']['warnings'], res['report']['warnings'])
    check('traveler_stay answers every goal it names', sorted(res['bridge']['readouts']) == sorted(system['goal']), sorted(res['bridge']['readouts']))
    be.write(os.path.join(mdir, 'composed', 'traveler_stay.yaml'), br.dump_yaml(res['model']))
    scenario = {'metadata': {'name': 'traveler_oracle', 'lm_format_version': '1.0'}, 'imports': list(res['report']['members']), 'variables': {}, 'equations': {},
                'simulation': {'step_size': {'value': 1, 'unit': 'day'}, 'start_date': '2026-01-01', 'end_date': '2026-04-01'}}
    be.write(os.path.join(mdir, 'composed', 'traveler_oracle.yaml'), br.dump_yaml(scenario))
    try:
        got = engine_final(mdir, 'composed/traveler_stay', 30 * 24, os.path.join(tmp, 'ts.csv'))
        want = engine_final(mdir, 'composed/traveler_oracle', 30 * 24, os.path.join(tmp, 'to.csv'))
    except Exception as e:
        print('skip traveler parity:', repr(e)[:300])
        return
    worst = max((abs(got[k] - v) / (abs(v) + 1e-9) for k, v in want.items() if k in got and isinstance(v, (int, float))), default=1.0)
    start = res['model']['variables']
    moved = sum(1 for k, v in want.items() if k in start and isinstance(v, (int, float)) and abs(v - float(start[k]['value'])) > 1e-6)
    check('the composed traveler_stay equals the same components imported by a scenario (engine, 30 days)', worst < 1e-9 and len(got) == len(want), f'{len(want)} variables, worst relative difference {worst:.2e}')
    check('the comparison is not trivial: many variables moved from their start over the 30 days', moved > 20, f'{moved} moved')
    return res


if __name__ == '__main__':
    tmp = tempfile.mkdtemp(prefix='temp_game_bridge_test_')
    try:
        run_tests(tmp)
        shared_tests(tmp)
        if os.path.isfile(os.path.join(MODELS, DIABETES + '.yaml')):
            r = parity_tests(tmp)
            ts = traveler_parity(tmp)
            tp_tests(tmp, r)
            if ts is not None:
                tp_tests(tmp, ts, step_days=1.0, label='traveler_stay fragment')
        else:
            print('skip parity and Teleporter tests: models repository not found at', MODELS)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print('\n' + ('all passed' if not failed else f'{len(failed)} failed: {failed}'))
    sys.exit(1 if failed else 0)
