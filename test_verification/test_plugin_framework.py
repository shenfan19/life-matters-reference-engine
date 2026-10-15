"""Regression test for the plugin framework: endpoint dispatch, PluginContext.load_model,
and the static file route of bundle plugins (including path-traversal refusal)."""

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402,F401

# The package is imported above while only ROOT is on sys.path; see
# test_capacity_limits.py for why reference_engine/src goes in afterwards.
sys.path.insert(0, str(ROOT / 'reference_engine' / 'src'))
sys.path.insert(0, str(ROOT / 'reference_engine'))
import app_state  # noqa: E402
from paths import MODELS_DIR  # noqa: E402
from src.loader_engine import LoaderEngine  # noqa: E402
from src.plugin_manager import PluginManager  # noqa: E402
from src.plugin_context import PluginContext  # noqa: E402
from routes import plugins as plugin_routes  # noqa: E402

MODEL_PATH = 'test_fixtures/valid/test_valid_equation_condition'

pytestmark = pytest.mark.skipif(not (MODELS_DIR / f'{MODEL_PATH}.yaml').exists(), reason='models directory not available')

MANIFEST = """id: fx_bundle
name: Fixture bundle
version: '0.1'
contract_version: 2
backend:
  entry: backend.py
  class: Fx
ui:
  type: bundle
  root: dist
  entry: index.html
"""

BACKEND = """class Fx:
    def __init__(self, context):
        self.ctx = context

    def run(self, inputs):
        return {'ran': True}

    def endpoint_echo(self, inputs):
        return {'echo': inputs.get('word')}

    def endpoint_boom(self, inputs):
        raise KeyError('inside the plugin')

    def helper(self, inputs):
        return {'should_not_be_reachable': True}
"""


@pytest.fixture
def client(tmp_path):
    plugin = tmp_path / 'plugins' / 'fx_bundle'
    (plugin / 'dist').mkdir(parents=True)
    (plugin / 'manifest.yaml').write_text(MANIFEST, encoding='utf-8')
    (plugin / 'backend.py').write_text(BACKEND, encoding='utf-8')
    (plugin / 'dist' / 'index.html').write_text('<html>fx</html>', encoding='utf-8')
    (plugin / 'dist' / 'a.txt').write_text('inside', encoding='utf-8')
    (plugin / 'secret.txt').write_text('outside the bundle root', encoding='utf-8')

    saved = (app_state.plugin_manager, app_state.loader_engine, app_state.engine)
    app_state.plugin_manager = PluginManager(plugin_dir=str(tmp_path / 'plugins'))
    app_state.loader_engine = LoaderEngine(models_directory=str(MODELS_DIR))
    app_state.engine = None
    app = FastAPI()
    app.include_router(plugin_routes.router)
    yield TestClient(app)
    app_state.plugin_manager, app_state.loader_engine, app_state.engine = saved


def test_run_keeps_working(client):
    r = client.post('/api/plugins/fx_bundle/run', json={'inputs': {}})
    assert r.status_code == 200 and r.json() == {'ran': True}


def test_custom_endpoint_is_dispatched(client):
    r = client.post('/api/plugins/fx_bundle/echo', json={'inputs': {'word': 'hi'}})
    assert r.status_code == 200 and r.json() == {'echo': 'hi'}


@pytest.mark.parametrize('endpoint', ['missing', 'helper', 'Echo', 'ec-ho', '__init__'])
def test_unknown_or_illegal_endpoint_is_404(client, endpoint):
    r = client.post(f'/api/plugins/fx_bundle/{endpoint}', json={'inputs': {}})
    assert r.status_code == 404


def test_error_inside_endpoint_is_500_not_404(client):
    r = client.post('/api/plugins/fx_bundle/boom', json={'inputs': {}})
    assert r.status_code == 500


def test_unknown_plugin_is_404(client):
    r = client.post('/api/plugins/nope/run', json={'inputs': {}})
    assert r.status_code == 404


def test_bundle_serves_entry_and_files(client):
    assert client.get('/api/plugins/fx_bundle/bundle/').text == '<html>fx</html>'
    assert client.get('/api/plugins/fx_bundle/bundle/a.txt').text == 'inside'


def test_bundle_missing_file_is_404(client):
    assert client.get('/api/plugins/fx_bundle/bundle/none.txt').status_code == 404


@pytest.mark.parametrize('path', ['..%2Fsecret.txt', '%2e%2e/secret.txt'])
def test_bundle_refuses_encoded_path_traversal(client, path):
    r = client.get(f'/api/plugins/fx_bundle/bundle/{path}')
    assert r.status_code in (400, 404)
    assert 'outside the bundle root' not in r.text


@pytest.mark.parametrize('path', ['../secret.txt', 'a/../../secret.txt'])
def test_bundle_refuses_raw_path_traversal(client, path):
    # An HTTP client normalizes ".." away before sending, so the route function is
    # called directly to reach its own check.
    import asyncio
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(plugin_routes.get_plugin_bundle_file('fx_bundle', path))
    assert exc_info.value.status_code == 400


def test_non_bundle_plugin_has_no_bundle_route(client):
    # sensitivity_analysis style: ui.type none
    pm = app_state.plugin_manager
    pm.plugins['fx_bundle']['manifest']['ui'] = {'type': 'none'}
    assert client.get('/api/plugins/fx_bundle/bundle/a.txt').status_code == 400


def make_context():
    return PluginContext(loader=LoaderEngine(models_directory=str(MODELS_DIR)))


def test_load_model_returns_api_shape():
    data = make_context().load_model(MODEL_PATH)
    assert data['resolved'] is True
    assert data['variables'] and data['equations']
    assert set(next(iter(data['variables'].values()))) >= {'type', 'unit', 'description'}


def test_load_model_matches_get_models_route():
    from routes import models as model_routes
    app = FastAPI()
    app.include_router(model_routes.router)
    saved = app_state.loader_engine
    app_state.loader_engine = LoaderEngine(models_directory=str(MODELS_DIR))
    try:
        body = TestClient(app).get(f'/api/models/{MODEL_PATH.rsplit("/", 1)[-1]}').json()
    finally:
        app_state.loader_engine = saved
    assert body['variables'] == make_context().load_model(MODEL_PATH)['variables']


@pytest.mark.parametrize('bad', ['../models/x', 'a/../../x', '/etc/passwd', 'C:/Windows/win.ini'])
def test_load_model_refuses_paths_outside_models(bad):
    with pytest.raises(ValueError):
        make_context().load_model(bad)


def test_load_model_unknown_model_raises():
    with pytest.raises(ValueError):
        make_context().load_model('no/such/model')


def test_load_model_needs_a_loader():
    with pytest.raises(RuntimeError):
        PluginContext().load_model(MODEL_PATH)


def test_ve_graph_plugin_builds_nodes_and_arrows():
    """The ve_graph plugin turns a model into variable nodes, equation nodes and arrows
    from read variables to the equation and from the equation to the variables it updates."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('ve_graph_backend', ROOT / 'plugins' / 've_graph' / 'backend.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    ctx = PluginContext(loader=LoaderEngine(models_directory=str(MODELS_DIR)))
    graph = module.VeGraph(ctx).endpoint_graph({'path': MODEL_PATH})
    assert graph['success'], graph
    ids = {n['id']: n for n in graph['nodes']}
    assert any(n['kind'] == 'equation' for n in graph['nodes'])
    assert any(n['kind'] == 'variable' for n in graph['nodes'])
    for e in graph['edges']:
        kinds = {ids[e['source']]['kind'], ids[e['target']]['kind']}
        assert kinds == {'variable', 'equation'}, e
    assert module.VeGraph(ctx).endpoint_graph({})['success'] is False


def test_plugin_template_is_a_working_bundle_plugin(tmp_path):
    """docs/plugin_template/ is the starting point for new plugins, so it must load, serve its page and answer."""
    import shutil
    shutil.copytree(ROOT / 'docs' / 'plugin_template', tmp_path / 'plugins' / 'my_plugin')
    saved = (app_state.plugin_manager, app_state.loader_engine, app_state.engine)
    app_state.plugin_manager = PluginManager(plugin_dir=str(tmp_path / 'plugins'))
    app_state.loader_engine = LoaderEngine(models_directory=str(MODELS_DIR))
    app_state.engine = None
    try:
        app = FastAPI()
        app.include_router(plugin_routes.router)
        c = TestClient(app)
        assert 'my_plugin' in app_state.plugin_manager.plugins
        assert 'lm-ready' in c.get('/api/plugins/my_plugin/bundle/').text
        r = c.post('/api/plugins/my_plugin/fields', json={'inputs': {'path': MODEL_PATH}})
        assert r.status_code == 200 and r.json()['success'] is True and r.json()['variable_count'] > 0
        assert c.post('/api/plugins/my_plugin/fields', json={'inputs': {}}).json()['success'] is False
    finally:
        app_state.plugin_manager, app_state.loader_engine, app_state.engine = saved


def test_body_map_plugin_places_models_on_organs(tmp_path):
    """body_map places a model on the organs its tags, path and name point to, lets a scenario light up
    the organs of the components it imports, and refuses unsafe or missing paths."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('body_map_backend', ROOT / 'plugins' / 'body_map' / 'backend.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    (tmp_path / 'fitness').mkdir()
    (tmp_path / 'fitness' / 'running_2026.yaml').write_text(
        'metadata:\n  name: running\n  tags: [fitness, vo2max]\n', encoding='utf-8')
    (tmp_path / 'liver_2026.yaml').write_text('metadata:\n  name: liver\n  tags: [hepatic, fibrosis]\n', encoding='utf-8')
    (tmp_path / 'lung_2026.yaml').write_text('metadata:\n  name: lung_fn\n  tags: [lung_function]\n', encoding='utf-8')
    (tmp_path / 'scenario.yaml').write_text(
        'metadata:\n  name: scenario\n  tags: [scenario]\nimports:\n  - liver_2026\n  - lung_2026\n', encoding='utf-8')
    (tmp_path / 'abstract.yaml').write_text('metadata:\n  name: abstract\n  tags: [theory]\n', encoding='utf-8')

    class Ctx:
        models_directory = str(tmp_path)

    plugin = module.BodyMap(Ctx())
    out = plugin.endpoint_locate({'paths': ['fitness/running_2026', 'scenario', 'abstract', '../x', 'missing', 'models/liver_2026.yaml']})
    assert out['success'] is True
    by_path = {m['path']: m for m in out['models']}

    running = {s['slot'] for s in by_path['fitness/running_2026']['sites']}
    assert running == {'muscle', 'heart'}          # fitness folder and vo2max tag

    scenario = {s['slot']: s for s in by_path['scenario']['sites']}
    assert set(scenario) == {'liver', 'lung'}      # the scenario's own tags name no organ, its components do
    assert scenario['liver']['via'] == ['liver'] and scenario['lung']['via'] == ['lung_fn']
    assert by_path['scenario']['imports'] == 2

    assert by_path['abstract']['sites'] == []      # nothing to place is not an error
    assert 'error' not in by_path['abstract']
    assert 'error' in by_path['../x'] and 'error' in by_path['missing']
    assert by_path['liver_2026']['sites'][0]['slot'] == 'liver'   # a models/ prefix and .yaml suffix are accepted

    assert plugin.endpoint_locate({})['success'] is False
