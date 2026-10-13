"""Regression test for the model_compose plugin, PluginContext.load_model(validate=False), and the
success path of POST /api/merge in both write modes. The models are written into a temporary
models directory, so the test does not depend on the model library."""

import importlib.util
import sys
from pathlib import Path

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402,F401

# See test_plugin_framework.py for why reference_engine/src goes in after the package import.
sys.path.insert(0, str(ROOT / 'reference_engine' / 'src'))
sys.path.insert(0, str(ROOT / 'reference_engine'))
import app_state  # noqa: E402
from src.loader_engine import LoaderEngine  # noqa: E402
from src.plugin_context import PluginContext  # noqa: E402
from routes import files as files_routes  # noqa: E402

HEADER = """metadata:
  name: {name}
  lm_format_version: "1.0"
  description: {{problem: p, result: r, limitations: l}}
"""
SIM = """simulation:
  step_size: {value: 1, unit: hour}
  start_date: "2026-01-01"
  end_date: "2026-01-03"
  output_variables: [%s]
"""

HEATER = HEADER.format(name='heater') + """variables:
  room_temp: {type: state, value: 15.0, unit: "C", description: Room temperature}
  setpoint: {type: parameter, value: 20.0, unit: "C", description: Setpoint}
  heating_rate: {type: parameter, value: 2.0, unit: "C/hour", description: Heating rate}
equations:
  heat:
    step_unit: hour
    condition: "room_temp < setpoint"
    dynamics:
      room_temp: "room_temp + heating_rate * step"
    priority: 1
""" + SIM % 'room_temp'

WINDOW = HEADER.format(name='window') + """variables:
  room_temp: {type: state, value: 15.0, unit: "K", description: Room temperature}
  setpoint: {type: parameter, value: 21.0, unit: "C", description: Setpoint}
  leak_rate: {type: parameter, value: 0.5, unit: "C/hour", description: Heat loss}
equations:
  leak:
    step_unit: hour
    dynamics:
      room_temp: "room_temp - leak_rate * step"
    priority: 2
""" + SIM % 'room_temp'

# Reads room_temp without declaring it, so it cannot pass validation alone.
SENSOR = HEADER.format(name='sensor') + """variables:
  comfort_index: {type: state, value: 1.0, unit: "1", description: Comfort}
equations:
  comfort:
    step_unit: hour
    dynamics:
      comfort_index: "max(0, 1 - abs(room_temp - 21) / 10)"
    priority: 3
""" + SIM % 'comfort_index'


@pytest.fixture
def models_dir(tmp_path):
    d = tmp_path / 'models'
    (d / 'fx').mkdir(parents=True)
    for name, text in (('heater', HEATER), ('window', WINDOW), ('sensor', SENSOR)):
        (d / 'fx' / f'{name}.yaml').write_text(text, encoding='utf-8')
    return d


@pytest.fixture
def ctx(models_dir):
    return PluginContext(loader=LoaderEngine(models_directory=str(models_dir)))


@pytest.fixture
def compose(ctx):
    spec = importlib.util.spec_from_file_location('model_compose_backend', ROOT / 'plugins' / 'model_compose' / 'backend.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    instance = module.ModelCompose(ctx)
    instance._module = module
    return instance


def test_load_model_without_validation_loads_a_component_and_skips_the_cache(ctx):
    with pytest.raises(ValueError):
        ctx.load_model('fx/sensor')
    data = ctx.load_model('fx/sensor', validate=False)
    assert 'comfort_index' in data['variables']
    # the unvalidated load must not leave a model behind for validated callers
    with pytest.raises(ValueError):
        ctx.load_model('fx/sensor')


def test_models_directory_is_absolute(ctx, models_dir):
    assert Path(ctx.models_directory) == models_dir.resolve()


def test_compose_finds_conflict_coupling_and_differences(compose):
    r = compose.endpoint_compose({'paths': ['fx/heater', 'fx/window', 'fx/sensor']})
    assert r['success'] and not r['errors']
    shared = {s['name']: s for s in r['shared']}
    assert set(shared) == {'room_temp', 'setpoint'}
    room = shared['room_temp']
    assert room['status'] == 'conflict'
    assert room['roles'] == {'fx/heater': 'writer', 'fx/window': 'writer', 'fx/sensor': 'reader'}
    assert room['declares']['fx/sensor'] is False
    assert {n['kind'] for n in room['notes']} == {'unit'}
    setpoint = shared['setpoint']
    assert setpoint['status'] == 'common'
    assert setpoint['roles']['fx/heater'] == 'reader' and setpoint['roles']['fx/window'] == 'none'
    assert {n['kind'] for n in setpoint['notes']} == {'value'}


def test_compose_couples_one_writer_with_a_reader(compose):
    r = compose.endpoint_compose({'paths': ['fx/heater', 'fx/sensor']})
    room = next(s for s in r['shared'] if s['name'] == 'room_temp')
    assert room['status'] == 'coupling'


def test_compose_reports_a_bad_path_and_keeps_the_rest(compose):
    r = compose.endpoint_compose({'paths': ['fx/heater', 'fx/missing', '../escape']})
    assert r['success']
    assert [m['path'] for m in r['models']] == ['fx/heater']
    assert set(r['errors']) == {'fx/missing', '../escape'}


def test_compose_without_paths_fails(compose):
    assert compose.endpoint_compose({})['success'] is False


def test_suggest_output_avoids_existing_files(compose, models_dir):
    first = compose.endpoint_suggest_output({'names': ['Heater', 'window']})
    assert first['output_path'] == 'temp_merged_ai/merged_heater_window.yaml'
    (models_dir / 'temp_merged_ai').mkdir()
    (models_dir / 'temp_merged_ai' / 'merged_heater_window.yaml').write_text('x', encoding='utf-8')
    second = compose.endpoint_suggest_output({'names': ['Heater', 'window']})
    assert second['output_path'] == 'temp_merged_ai/merged_heater_window_2.yaml'


@pytest.mark.parametrize('name', ['../x.yaml', 'a/b.yaml', 'x.txt', '.yaml', 'x y.yaml', ''])
def test_check_output_refuses_unsafe_names(compose, name):
    assert compose.endpoint_check_output({'filename': name}) == {'success': False, 'error': 'invalid_name'}


def test_check_output_refuses_an_existing_file(compose, models_dir):
    assert compose.endpoint_check_output({'filename': 'm.yaml'})['success'] is True
    (models_dir / 'temp_merged_ai').mkdir()
    (models_dir / 'temp_merged_ai' / 'm.yaml').write_text('x', encoding='utf-8')
    r = compose.endpoint_check_output({'filename': 'm.yaml'})
    assert r['success'] is False and r['exists'] is True


@pytest.fixture
def merge_client(models_dir):
    saved = (app_state.loader_engine, app_state.MODELS_DIR, app_state.SCS_MODE)
    app_state.loader_engine = LoaderEngine(models_directory=str(models_dir))
    app_state.MODELS_DIR = models_dir
    app = FastAPI()
    app.include_router(files_routes.router)
    yield TestClient(app)
    app_state.loader_engine, app_state.MODELS_DIR, app_state.SCS_MODE = saved


def test_merge_route_in_write_mode_writes_the_file(merge_client, models_dir):
    app_state.SCS_MODE = False
    r = merge_client.post('/api/merge', json={'files': ['fx/heater.yaml', 'fx/window.yaml'], 'output_path': 'temp_merged_ai/m.yaml'})
    assert r.status_code == 200 and r.json()['success'] is True
    merged = yaml.safe_load((models_dir / 'temp_merged_ai' / 'm.yaml').read_text(encoding='utf-8'))
    assert set(merged['equations']) == {'heat', 'leak'}
    # a shared declaration takes the value of the model given later
    assert merged['variables']['setpoint']['value'] == 21.0


def test_merge_route_in_scs_mode_returns_the_merged_model_without_writing(merge_client, models_dir):
    app_state.SCS_MODE = True
    r = merge_client.post('/api/merge', json={'files': ['fx/heater.yaml', 'fx/window.yaml'], 'output_path': 'temp_merged_ai/m.yaml'})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['scs_mode'] is True
    assert set(body['raw']['equations']) == {'heat', 'leak'}
    assert set(yaml.safe_load(body['yaml_text'])['equations']) == {'heat', 'leak'}
    assert not (models_dir / 'temp_merged_ai').exists()


def test_samples_are_dropped_when_their_models_are_missing(compose):
    # the temporary models directory holds none of the library models the samples name
    assert compose.endpoint_samples({}) == {'success': True, 'samples': []}


def test_samples_against_the_library(compose):
    from paths import MODELS_DIR
    if not (Path(MODELS_DIR) / 'references').exists():
        pytest.skip('model library not available')
    real = PluginContext(loader=LoaderEngine(models_directory=str(MODELS_DIR)))
    compose.ctx = real
    samples = compose.endpoint_samples({})['samples']
    assert samples, 'no sample passed its check against the library'
    for s in samples:
        assert 2 <= s['n_models'] <= 5 and len(s['paths']) == s['n_models']
        assert set(s['title']) == {'en', 'zh'} and set(s['note']) == {'en', 'zh'}


LONER = HEADER.format(name='loner') + """variables:
  unrelated_thing: {type: state, value: 1.0, unit: "1", description: Shares nothing}
equations:
  drift:
    step_unit: hour
    dynamics:
      unrelated_thing: "unrelated_thing * 0.99"
    priority: 4
""" + SIM % 'unrelated_thing'


def test_a_coupling_sample_must_connect_every_model(compose, models_dir):
    (models_dir / 'fx' / 'loner.yaml').write_text(LONER, encoding='utf-8')
    compose._module.SAMPLES[:] = [
        {'id': 'good', 'expect': 'coupling', 'min': 1, 'models': ['fx/heater', 'fx/sensor'],
         'title': {'en': 'a', 'zh': 'a'}, 'note': {'en': 'a', 'zh': 'a'}},
        {'id': 'one_model_floats', 'expect': 'coupling', 'min': 1, 'models': ['fx/heater', 'fx/sensor', 'fx/loner'],
         'title': {'en': 'b', 'zh': 'b'}, 'note': {'en': 'b', 'zh': 'b'}},
    ]
    assert [s['id'] for s in compose.endpoint_samples({})['samples']] == ['good']
