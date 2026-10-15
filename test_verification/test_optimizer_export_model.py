"""POST /api/optimizer/export-model: the GUI omits `results` when no optimization has run or the user
unticks "with results", which used to be rejected with a 422, and a model with no optimization block could not be exported."""

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'reference_engine' / 'src'))
sys.path.insert(0, str(ROOT / 'reference_engine'))
import app_state  # noqa: E402
from routes import optimizer as optimizer_routes  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    (tmp_path / 'with_opt.yaml').write_text(
        'metadata:\n  name: with_opt\noptimization:\n  method: nsga2\n  results:\n    old: 1\n', encoding='utf-8')
    (tmp_path / 'plain.yaml').write_text('metadata:\n  name: plain\nvariables: {}\n', encoding='utf-8')
    monkeypatch.setattr(app_state, 'MODELS_DIR', tmp_path)
    app = FastAPI()
    app.include_router(optimizer_routes.router)
    return TestClient(app)


def test_export_without_results_returns_the_model_as_it_is(client):
    r = client.post('/api/optimizer/export-model', json={'model_key': 'with_opt.yaml', 'flatten_imports': False})
    assert r.status_code == 200 and r.json()['success'] is True
    assert 'old: 1' in r.json()['text']                    # the results the file already had are left alone


def test_export_with_results_embeds_them(client):
    r = client.post('/api/optimizer/export-model', json={'model_key': 'with_opt.yaml', 'results': {'n_solutions': 3}})
    assert r.status_code == 200
    assert 'n_solutions: 3' in r.json()['text'] and 'old: 1' not in r.json()['text']


def test_export_of_a_model_without_optimization_works_without_results_and_refuses_results(client):
    r = client.post('/api/optimizer/export-model', json={'model_key': 'plain.yaml'})
    assert r.status_code == 200 and 'name: plain' in r.json()['text']
    r = client.post('/api/optimizer/export-model', json={'model_key': 'plain.yaml', 'results': {'n_solutions': 1}})
    assert r.status_code == 400                            # nothing to embed them into


def test_export_refuses_a_path_outside_the_models_directory(client):
    r = client.post('/api/optimizer/export-model', json={'model_key': '../x.yaml'})
    assert r.status_code in (400, 404)


def test_upload_temp_resolves_a_model_and_answers_with_its_structure(tmp_path, monkeypatch):
    """POST /api/model/upload-temp read an attribute of Equation that no longer exists, so every upload ended in a 500."""
    from routes import files as files_routes
    from src.loader_engine import LoaderEngine
    models = tmp_path / 'models'
    models.mkdir()
    monkeypatch.setattr(app_state, 'MODELS_DIR', models)
    monkeypatch.setattr(app_state, 'loader_engine', LoaderEngine(models_directory=str(models)))
    app = FastAPI()
    app.include_router(files_routes.router)
    text = (
        'metadata:\n  name: up\n  version: "1.0"\n'
        'variables:\n  x: {value: 1.0, type: state, unit: "1", description: x}\n  k: {value: 0.1, type: parameter, unit: "1", description: k}\n'
        'equations:\n  decay:\n    description: decay\n    dynamics:\n      x: "x - k * x"\n'
        'simulation:\n  step_size: 1\n  step_unit: day\n'
    )
    r = TestClient(app).post('/api/model/upload-temp', json={'text': text, 'filename': 'up.yaml'})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['success'] is True and body['filename'] == 'up.yaml'
    assert set(body['resolved']['variables']) == {'x', 'k'}
    assert body['resolved']['equations']['decay']['dynamics'] == {'x': 'x - k * x'}
    assert not list((models / 'temp').glob('*'))           # the temporary copy is removed
