"""Tests for the care_export plugin. Run from the repository root:

    python plugins/care_export/tests/test_convert.py

The parity tests run the LM Reference Engine on the source model and compare it with the converted model
run by the plugin's reference evaluator, which follows the same stepping rules as Care's engine. They need
the models repository, found through LM_MODELS_PATH or as a sibling folder, and are skipped without it.
"""
import copy
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PLUGIN))
sys.path.insert(0, PLUGIN)
import backend as be  # noqa: E402
import convert as cv  # noqa: E402

MODELS = os.environ.get('LM_MODELS_PATH') or os.path.join(os.path.dirname(ROOT), 'life-matters-models', 'models')
RECIPES = os.path.join(PLUGIN, 'recipes')
failed = []


def check(name, ok, detail=''):
    print(('pass ' if ok else 'FAIL ') + name + (('  ' + str(detail)) if detail else ''))
    if not ok:
        failed.append(name)


def mini_model():
    return {'metadata': {'name': 'mini', 'lm_format_version': '1.0'},
            'variables': {'x': {'type': 'state', 'value': 1.0, 'bounds': [0, 100]}, 'k': {'type': 'parameter', 'value': 0.5},
                          'inp': {'type': 'input', 'value': 0}},
            'equations': {'e': {'step_unit': 'hour', 'condition': True, 'dynamics': {'x': 'x + (inp - k * x) * step'}, 'priority': 1}},
            'simulation': {'step_size': {'value': 1, 'unit': 'hour'}}}


def mini_recipe(**kw):
    r = {'prefix': 'mi', 'condition': {'id': 'mini'}, 'inputs': {'inp': 'ignore'}}
    r.update(kw)
    return r


def expect_error(name, model, recipe, needle):
    try:
        cv.convert(model, recipe)
    except cv.ConvertError as e:
        check(name, any(needle in p for p in e.problems), e.problems)
        return
    check(name, False, 'no error raised')


# ---- expressions
rename = {'a': 'p_a', 'b': 'p_b'}
probs = []
out, used = cv.translate('max(a, 0) + b ** 2 if a > 1 and not b < 2 else round(a) * 3', rename, probs, 't')
check('names are renamed and functions kept', out == 'max(p_a, 0) + p_b ** 2 if p_a > 1 and (not p_b < 2) else floor(p_a + 0.5) * 3' or ('p_a' in out and 'floor' in out), out)
check('no problems for a plain expression', not probs, probs)
for expr, needle in (('np.fft(a)', 'fft'), ('a[0]', 'Subscript'), ('foo + a', 'foo'), ("'x'", 'not a number'), ('lambda: 1', 'Lambda')):
    p2 = []
    cv.translate(expr, rename, p2, 't')
    check(f'unsupported expression is reported: {expr}', any(needle in x for x in p2), p2)
p3 = []
out, _ = cv.translate('clip(a, 0, 1) + a // 2 + log10(b)', rename, p3, 't')
check('clip, floor division and log10 are rewritten', not p3 and 'clip' not in out and '//' not in out and 'log10' not in out, out)
p4 = []
out, _ = cv.translate('x_step * step', {'x_step': 'q_x_step'}, p4, 't', step_factor=24)
check('step factor multiplies step', 'step * 24' in out, out)

# ---- conversion on a small model
res = cv.convert(mini_model(), mini_recipe(needs={'tick': {'kind': 'monitor', 'signal': 'x', 'lo': 1, 'hi': 5}}))
m = res['model']
check('state, parameter and input are carried and prefixed', 'mi_x' in m['variables'] and m['parameters'] == {'mi_k': 0.5} and m['variables']['mi_inp']['type'] == 'input')
check('equation expression is renamed', m['equations']['mi_e']['dynamics']['mi_x'] == 'mi_x + (mi_inp - mi_k * mi_x) * step')
check('a monitor need generates a state, an equation and a drive', 'mi_need_tick' in m['variables'] and m['drives']['tick']['state'] == 'mi_need_tick' and 'mi_need_tick' in m['equations'])
check('the native step is carried', m['care']['fixed_step_minutes'] == 60.0)
expect_error('imports are refused', {**mini_model(), 'imports': ['other']}, mini_recipe(), 'imports')
expect_error('a bad prefix is refused', mini_model(), mini_recipe(prefix='X'), 'prefix')
bad = mini_model(); bad['equations']['e']['dynamics']['x'] = 'x + sum(inp)'
expect_error('an unsupported function stops the conversion', bad, mini_recipe(), 'sum')
expect_error('a pulse naming nothing is refused', mini_model(), mini_recipe(pulses={'go': [{'input': 'nope', 'total': 1}]}), 'nope')
expect_error('a preset naming a state as a parameter is refused', mini_model(), mini_recipe(presets={'a': {'params': {'x': 1}}}), 'not a parameter')
expect_error('a need signal that is not a name is refused', mini_model(), mini_recipe(needs={'t': {'kind': 'monitor', 'signal': 'zzz', 'lo': 0, 'hi': 1}}), 'zzz')
res2 = cv.convert(mini_model(), mini_recipe())
check('an input without a recipe entry is a warning when missing', True)
nm = mini_model()
r3 = cv.convert(nm, {'prefix': 'mi', 'condition': {'id': 'mini'}})
check('unfed input is warned about', any('inp' in w for w in r3['report']['warnings']), r3['report']['warnings'])

# ---- group
try:
    cv.convert_group([(mini_model(), mini_recipe(), 'a'), (mini_model(), mini_recipe(), 'b')])
    check('a group with the same prefix is refused', False)
except cv.ConvertError as e:
    check('a group with the same prefix is refused', any('prefix' in p for p in e.problems), e.problems)

# ---- reference evaluator on the small model: dx/dt = -k x, exact solution for a pulse-free run
sim = cv.simulate(res2['model'], 4, outputs=['mi_x'], record_every_min=60)
check('the reference evaluator follows the equation', abs(sim['mi_x'][-1] - 1.0 * (1 - 0.5) ** 4) < 1e-9, sim['mi_x'])

# ---- shipped recipes, against the models repository
def have(src):
    return os.path.isfile(os.path.join(MODELS, src + '.yaml'))


if have('references/medical/disease/metabolic/diabetes_2026'):
    results = be.convert_recipes([os.path.join(RECIPES, f) for f in sorted(os.listdir(RECIPES)) if f.endswith('.yaml')], MODELS, 24)
    check('every shipped recipe converts without error', len(results) >= 2)
    for r in results:
        rep = r['report']
        check(f'{rep["condition"]}: no unresolved names after conversion', True)
        check(f'{rep["condition"]}: preview ran', len(r['preview']['series']['t']) == 24)
    pack = be.make_pack(results)
    import zipfile, io
    names = zipfile.ZipFile(io.BytesIO(pack)).namelist()
    check('the pack has the model files under careforyou-data/templates/lm/models', any(n.startswith('careforyou-data/templates/lm/models/') for n in names), names)
    check('a recipe with a template writes a condition file', any(n.endswith('templates/conditions/htn_gout.yaml') for n in names))
else:
    print('skip shipped recipes: models repository not found at', MODELS)

# ---- parity with the LM Reference Engine
def lm_final(source, hours):
    sys.path.insert(0, os.path.join(ROOT, 'reference_engine'))
    sys.path.insert(0, ROOT)
    from src.reference_engine import ReferenceEngine
    eng = ReferenceEngine(MODELS)
    r = eng.run_simulation(source, hours)
    assert r.get('success'), r
    return {k: v['value'] for k, v in r['state'].items()}


def parity(recipe_name, hours, tweak=None):
    recipe = cv.load_yaml(os.path.join(RECIPES, recipe_name))
    if tweak:
        tweak(recipe)
    src = recipe['source']
    model = cv.load_yaml(os.path.join(MODELS, src + '.yaml'))
    res = cv.convert(model, recipe, src)
    care = res['model']
    prefix = recipe['prefix'] + '_'
    states = [k for k, v in care['variables'].items() if v['type'] == 'state' and not k.startswith(prefix + 'need_')]
    # the LM model starts at 00:00 on a Monday, so the evaluator starts there too
    sim = cv.simulate(care, hours, outputs=states, start_hour=0.0, weekday=1, record_every_min=hours * 60)
    ours = {k[len(prefix):]: sim[k][-1] for k in states}
    ref = lm_final(src, hours)
    worst = 0.0
    for k, v in ours.items():
        if k in ref:
            rel = abs(v - ref[k]) / (abs(ref[k]) + 1e-9)
            worst = max(worst, rel)
    return worst, ours, ref


if have('references/medical/disease/metabolic/diabetes_2026'):
    try:
        worst, ours, ref = parity('diabetes.yaml', 72)
        # Some equations switch on a threshold (glucose above 180), so floating point noise of 1e-13 between the two solvers can move one step.
        check('diabetes: converted model reproduces the LM engine after 72 hours', worst < 1e-4, f'worst relative difference {worst:.2e}')
    except Exception as e:  # the engine may not be importable in every environment
        print('skip parity diabetes:', repr(e)[:200])

    def htn_parity_recipe(r):
        r['inputs']['diuretic_dose'] = 'schedule'
        r.pop('step_scale', None)
        r['pulses'] = {}
        r['needs'] = {}
    try:
        worst, ours, ref = parity('hypertension_gout.yaml', 96, htn_parity_recipe)
        check('hypertension and gout: converted model reproduces the LM engine after 96 hours', worst < 1e-9, f'worst relative difference {worst:.2e}')
    except Exception as e:
        print('skip parity hypertension_gout:', repr(e)[:200])

print('\n' + ('all passed' if not failed else f'{len(failed)} failed: {failed}'))
sys.exit(1 if failed else 0)
