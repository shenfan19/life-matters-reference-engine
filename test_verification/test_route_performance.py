"""The model list and the file tree must not redo their expensive work on every request:
the file tree keeps the metadata of a file until it changes, and concurrent requests for the model list share one scan."""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'reference_engine' / 'src'))
sys.path.insert(0, str(ROOT / 'reference_engine'))
import app_state  # noqa: E402
from routes import files as files_routes  # noqa: E402
from routes import models as models_routes  # noqa: E402


def test_file_tree_reads_a_file_again_only_after_it_changed(tmp_path, monkeypatch):
    (tmp_path / 'a.yaml').write_text('metadata:\n  name: a\n  tags: [x]\n', encoding='utf-8')
    (tmp_path / 'sub').mkdir()
    (tmp_path / 'sub' / 'b.yaml').write_text('metadata:\n  name: b\n', encoding='utf-8')
    reads = []
    real = files_routes.safe_load
    monkeypatch.setattr(files_routes, 'safe_load', lambda f: reads.append(1) or real(f))
    files_routes._FILE_META_CACHE.clear()

    tree = files_routes._build_file_tree(str(tmp_path))
    assert len(reads) == 2
    leaves = {c['title']: c for c in tree[0]['children'] if c.get('isLeaf')}
    assert leaves['a.yaml']['tags'] == ['x']

    files_routes._build_file_tree(str(tmp_path))
    assert len(reads) == 2                                  # nothing changed, nothing was read

    (tmp_path / 'a.yaml').write_text('metadata:\n  name: a\n  tags: [x, y, z]\n', encoding='utf-8')
    tree = files_routes._build_file_tree(str(tmp_path))
    assert len(reads) == 3                                  # only the changed file
    assert {c['title']: c for c in tree[0]['children'] if c.get('isLeaf')}['a.yaml']['tags'] == ['x', 'y', 'z']


def test_model_list_scans_once_for_concurrent_requests(monkeypatch):
    calls = []

    class FakeLoader:
        def scan_models(self, folders=None):
            calls.append(folders)
            return {'m': {'variables': 1, 'equations': 1, 'version': '1'}}

    monkeypatch.setattr(app_state, 'loader_engine', FakeLoader())
    monkeypatch.setattr(models_routes, '_scan_cache', {})
    monkeypatch.setattr(models_routes, '_scan_lock', None)

    async def run():
        return await asyncio.gather(*[models_routes.list_models() for _ in range(5)])

    answers = asyncio.run(run())
    assert len(calls) == 1
    assert all(a['total'] == 1 for a in answers)
    asyncio.run(models_routes.list_models(refresh=True))
    assert len(calls) == 2                                  # refresh skips the kept list


def test_file_tree_does_not_read_inside_a_folder_with_a_flood_of_subfolders(tmp_path):
    (tmp_path / 'keep.yaml').write_text('metadata:\n  name: k\n', encoding='utf-8')
    dump = tmp_path / 'temp_runs'
    dump.mkdir()
    (dump / 'top.yaml').write_text('metadata:\n  name: t\n', encoding='utf-8')
    for i in range(files_routes.MAX_SUBFOLDERS_READ + 1):
        run = dump / f'run_{i}'
        run.mkdir()
        (run / 'inside.yaml').write_text('metadata:\n  name: i\n', encoding='utf-8')
    tree = files_routes._build_file_tree(str(tmp_path))
    top = {c['title']: c for c in tree[0]['children']}
    temp = {c['title']: c for c in top['temp_runs']['children']}
    assert 'top.yaml' in temp                                # files of the folder itself are still listed
    assert temp['run_0']['type'] == 'folder' and temp['run_0']['children'] == []


def test_file_tree_metadata_survives_a_restart(tmp_path, monkeypatch):
    (tmp_path / 'a.yaml').write_text('metadata:\n  name: a\n  tags: [x]\n', encoding='utf-8')
    monkeypatch.setattr(files_routes, '_META_CACHE_FILE', str(tmp_path / 'cache' / 'meta.json'))
    monkeypatch.setattr(files_routes, '_META_CACHE_LOADED', False)
    files_routes._FILE_META_CACHE.clear()
    files_routes._build_file_tree(str(tmp_path))
    files_routes._FILE_META_CACHE.clear()                   # a new process starts with an empty cache
    monkeypatch.setattr(files_routes, '_META_CACHE_LOADED', False)
    reads = []
    real = files_routes.safe_load
    monkeypatch.setattr(files_routes, 'safe_load', lambda f: reads.append(1) or real(f))
    tree = files_routes._build_file_tree(str(tmp_path))
    assert reads == []
    assert {c['title']: c for c in tree[0]['children']}['a.yaml']['tags'] == ['x']
