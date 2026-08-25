"""File/model CRUD, validate, merge, split, search, story, folders, config."""

import os
import re
import uuid
import yaml
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import app_state
from yaml_io import safe_load

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Schemas ────────────────────────────────────────────────────────────────────

class MergeRequest(BaseModel):
    files: List[str]
    folders: Optional[List[str]] = None
    output_path: Optional[str] = None


class ValidateRequest(BaseModel):
    file_path: Optional[str] = None
    files: Optional[List[str]] = None


class SplitRequest(BaseModel):
    file_path: str
    output_dir: Optional[str] = None


class SaveFileRequest(BaseModel):
    path: str
    content: dict


class FileMoveRequest(BaseModel):
    src: str
    dst: str


class FileNewRequest(BaseModel):
    path: str
    template: str = "model"


# ── Helpers ────────────────────────────────────────────────────────────────────

_FILE_TEMPLATES = {
    "model": {
        "metadata": {"name": "新模型", "description": "", "tags": [], "version": "1.0"},
        "variables": {"example_var": {"initial_value": 0.0, "unit": "", "description": ""}},
        "equations": {},
        "simulator": {"time_unit": "day", "step_size": 3600},
    },
    "scenario": {
        "metadata": {"name": "新场景", "description": "", "tags": [], "version": "1.0"},
        "variables": {},
        "equations": {},
        "simulator": {"time_unit": "day", "step_size": 3600},
    },
}


def _simple_yaml_merge(files, output_path, models_root):
    """Simple YAML merge: combine variables/equations/simulator from multiple files."""
    merged = {'metadata': {'name': 'merged', 'description': '', 'tags': []},
              'variables': {}, 'equations': {}, 'simulator': {}}
    for f in (files or []):
        target = models_root / f.lstrip('/')
        if not target.exists():
            continue
        try:
            with open(target, encoding='utf-8') as fh:
                data = safe_load(fh) or {}
        except Exception:
            continue
        merged['variables'].update(data.get('variables') or {})
        merged['equations'].update(data.get('equations') or {})
        sim = data.get('simulator') or data.get('simulation') or {}
        merged['simulator'].update(sim)
    if output_path:
        out = models_root / output_path.lstrip('/')
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, 'w', encoding='utf-8') as fh:
            yaml.dump(merged, fh, allow_unicode=True, default_flow_style=False,
                      sort_keys=False, indent=2)
    return merged


def _simple_yaml_validate(file_path, models_root):
    """Semantic validation of a model YAML file."""
    target = models_root / file_path.lstrip('/')
    if not target.exists():
        return False, [f'文件不存在: {file_path}']
    try:
        with open(target, encoding='utf-8') as fh:
            data = safe_load(fh) or {}
    except Exception as e:
        return False, [f'YAML 解析错误: {e}']

    errors = []
    meta = data.get('metadata') or data.get('meta')
    if not meta:
        errors.append('缺少 metadata 字段')
    elif not (meta.get('name') or '').strip():
        errors.append('metadata.name 为空')

    variables: dict = data.get('variables') or {}
    if not variables:
        errors.append('缺少 variables 字段（或为空）')
        return False, errors

    var_set = set(variables.keys())
    equations: dict = data.get('equations') or {}
    dyn_keys_used: set = set()
    vars_referenced: set = set()

    for fname, fd in equations.items():
        if not isinstance(fd, dict):
            errors.append(f'方程 {fname!r} 格式错误（应为字典）')
            continue
        dynamics: dict = fd.get('dynamics') or {}
        if not dynamics:
            errors.append(f'方程 {fname!r} 缺少 dynamics 字段')
        for dyn_key, expr in dynamics.items():
            if dyn_key not in var_set:
                errors.append(f'方程 {fname!r}: dynamics 键 {dyn_key!r} 未在 variables 中定义')
            else:
                dyn_keys_used.add(dyn_key)
            expr_str = str(expr) if expr is not None else ''
            for token in re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\b', expr_str):
                if token in var_set:
                    vars_referenced.add(token)
        cond = fd.get('condition')
        if isinstance(cond, str):
            for token in re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\b', cond):
                if token in var_set:
                    vars_referenced.add(token)

    all_used = dyn_keys_used | vars_referenced
    for vname in sorted(var_set - all_used):
        errors.append(f'变量 {vname!r} 已定义但未被任何方程使用')

    return not errors, errors


# ── Config ─────────────────────────────────────────────────────────────────────

@router.get("/api/config")
async def get_config():
    return {"scs_mode": app_state.SCS_MODE}


# ── File tree ──────────────────────────────────────────────────────────────────

@router.get("/api/files")
async def list_files():
    def build_tree(directory, base_path=''):
        items = []
        if not os.path.exists(directory):
            return items
        try:
            for item in sorted(os.listdir(directory)):
                item_path = os.path.join(directory, item)
                relative_path = os.path.join(base_path, item).replace('\\', '/')
                if os.path.isdir(item_path):
                    if item in ['__pycache__', '.git']:
                        continue
                    children = build_tree(item_path, relative_path)
                    items.append({'title': item, 'key': relative_path, 'type': 'folder',
                                  'children': children if children else []})
                elif item.endswith('.yaml') or item.endswith('.yml'):
                    file_metadata = {}
                    try:
                        with open(item_path, 'r', encoding='utf-8') as f:
                            data = safe_load(f)
                            if isinstance(data, dict):
                                file_metadata['category'] = data.get('category', 'unknown')
                                file_metadata['description'] = data.get('description', '')
                                file_metadata['difficulty'] = data.get('difficulty', '')
                                file_metadata['levels'] = data.get('levels', [])
                                meta = data.get('metadata', {})
                                file_metadata['tags'] = meta.get('tags', [])
                    except Exception as e:
                        logger.warning(f"Failed to read metadata from {item_path}: {e}")
                    items.append({'title': item, 'key': relative_path, 'type': 'file',
                                  'isLeaf': True, **file_metadata})
        except Exception as e:
            logger.error(f"Error scanning {directory}: {e}")
        return items

    try:
        models_dir = app_state.MODELS_DIR
        tree = [{'title': 'models', 'key': 'models', 'type': 'folder',
                 'children': build_tree(str(models_dir))}]
        return {'success': True, 'data': tree}
    except Exception as e:
        return {'success': False, 'error': str(e)}


# ── File read ──────────────────────────────────────────────────────────────────

@router.get("/api/file/{file_path:path}")
async def get_file_content(file_path: str):
    try:
        yaml_file = app_state.MODELS_DIR / file_path.lstrip('/')
        if not yaml_file.suffix:
            yaml_file = yaml_file.with_suffix('.yaml')
        if not str(yaml_file.resolve()).startswith(str((app_state.MODELS_DIR).resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        if not yaml_file.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        with open(yaml_file, 'r', encoding='utf-8') as f:
            data = safe_load(f) or {}
        return {'success': True, 'data': {'path': file_path, 'content': data}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/file-raw/{file_path:path}")
async def get_file_raw(file_path: str):
    try:
        target = app_state.MODELS_DIR / file_path.lstrip('/')
        if not str(target.resolve()).startswith(str((app_state.MODELS_DIR).resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        if not target.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return {'success': True, 'text': target.read_text(encoding='utf-8')}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── File write ─────────────────────────────────────────────────────────────────

@router.post("/api/file-raw/{file_path:path}")
async def save_file_raw(file_path: str, payload: dict):
    app_state.check_write()
    try:
        target = app_state.MODELS_DIR / file_path.lstrip('/')
        if not str(target.resolve()).startswith(str((app_state.MODELS_DIR).resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload.get('text', ''), encoding='utf-8')
        if app_state.loader_engine:
            app_state.loader_engine.models_cache.clear()
        return {'success': True, 'path': file_path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/file-structured/{file_path:path}")
async def save_file_structured(file_path: str, payload: dict):
    app_state.check_write()
    target = app_state.MODELS_DIR / file_path.lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True)
    text = yaml.dump(payload.get('data', {}), allow_unicode=True, default_flow_style=False,
                     sort_keys=False, indent=2)
    target.write_text(text, encoding='utf-8')
    if app_state.loader_engine:
        app_state.loader_engine.models_cache.clear()
    return {'success': True, 'path': file_path}


@router.post("/api/save-file")
async def save_file_endpoint(request: SaveFileRequest):
    app_state.check_write()
    try:
        target = app_state.MODELS_DIR / request.path.lstrip('/')
        if not str(target.resolve()).startswith(str((app_state.MODELS_DIR).resolve())):
            raise HTTPException(status_code=400, detail="Path must be inside models directory")
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, 'w', encoding='utf-8') as f:
            yaml.dump(request.content, f, allow_unicode=True, sort_keys=False,
                      default_flow_style=False, indent=2)
        if app_state.loader_engine:
            app_state.loader_engine.models_cache.clear()
        return {'success': True, 'data': {'path': str(target.relative_to(app_state.MODELS_DIR))}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── File delete / move / new ───────────────────────────────────────────────────

@router.delete("/api/file/{file_path:path}")
async def delete_file(file_path: str):
    app_state.check_write()
    models_root = app_state.MODELS_DIR
    target = models_root / file_path.lstrip('/')
    if not str(target.resolve()).startswith(str(models_root.resolve())):
        raise HTTPException(status_code=400, detail="Path must be inside models directory")
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    if target.is_dir():
        raise HTTPException(status_code=400, detail="Cannot delete directories via this endpoint")
    target.unlink()
    if app_state.loader_engine:
        app_state.loader_engine.models_cache.clear()
    return {'success': True}


@router.post("/api/file-move")
async def move_file(request: FileMoveRequest):
    app_state.check_write()
    import shutil
    models_root = app_state.MODELS_DIR
    src = models_root / request.src.lstrip('/')
    dst = models_root / request.dst.lstrip('/')
    for p in (src, dst):
        if not str(p.resolve()).startswith(str(models_root.resolve())):
            raise HTTPException(status_code=400, detail="Path must be inside models directory")
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"Source not found: {request.src}")
    if dst.exists():
        raise HTTPException(status_code=409, detail=f"Destination already exists: {request.dst}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    return {'success': True, 'dst': request.dst}


@router.post("/api/file-new")
async def create_new_file(request: FileNewRequest):
    app_state.check_write()
    models_root = app_state.MODELS_DIR
    target = models_root / request.path.lstrip('/')
    if not str(target.resolve()).startswith(str(models_root.resolve())):
        raise HTTPException(status_code=400, detail="Path must be inside models directory")
    if target.exists():
        raise HTTPException(status_code=409, detail=f"File already exists: {request.path}")
    template = _FILE_TEMPLATES.get(request.template, _FILE_TEMPLATES["model"])
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, 'w', encoding='utf-8') as fh:
        yaml.dump(template, fh, allow_unicode=True, sort_keys=False,
                  default_flow_style=False, indent=2)
    return {'success': True, 'path': request.path}


# ── Upload temp model ──────────────────────────────────────────────────────────

@router.post("/api/model/upload-temp")
async def upload_model_temp(payload: dict):
    """Upload YAML, resolve imports in-process, delete temp file, return raw+resolved."""
    text = payload.get("text", "")
    raw_name = payload.get("filename", f"import_{uuid.uuid4().hex[:8]}.yaml")
    safe_name = re.sub(r'[^a-zA-Z0-9_\-.]', '_', raw_name)
    if not safe_name.lower().endswith(('.yaml', '.yml')):
        safe_name += '.yaml'

    try:
        raw = safe_load(text)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")

    if app_state.loader_engine is None:
        raise HTTPException(status_code=503, detail="Models system not initialized")

    temp_dir = app_state.MODELS_DIR / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_name = f"{uuid.uuid4().hex}_{safe_name}"
    temp_path = temp_dir / temp_name

    try:
        temp_path.write_text(text, encoding='utf-8')
        model = app_state.loader_engine.fetch(temp_name, folder='temp', use_cache=False)
        if model is None:
            raise HTTPException(status_code=400, detail="Model could not be resolved — check imports paths")
        provenance = getattr(model, 'provenance', {}) or {}
        resolved = {
            "metadata": {
                "name": model.metadata.name if model.metadata else "",
                "version": model.metadata.version if model.metadata else "",
                "author": model.metadata.author if model.metadata else "",
                "description": model.metadata.description if model.metadata else "",
            },
            "variables": {
                k: {"description": v.description, "value": v.value, "unit": v.unit,
                    "type": v.type.value if hasattr(v.type, 'value') else str(v.type)}
                for k, v in model.variables.items()
            },
            "equations": {
                k: {"description": f.description, "condition": f.condition,
                    "priority": f.priority, "dynamics": f.dynamics, "equation": f.equation}
                for k, f in model.equations.items()
            },
            "simulation": model.simulator,
            "simulator": model.simulator,
            "optimization": model.optimizer,
            "imports": provenance.get('imports', []),
            "provenance": provenance,
            "resolved": True,
        }
        return {"success": True, "raw": raw, "resolved": resolved, "filename": safe_name}
    finally:
        if temp_path.exists():
            temp_path.unlink()


# ── Diff ───────────────────────────────────────────────────────────────────────

@router.post("/api/diff")
async def diff_files(payload: dict):
    import difflib
    path_a = (payload.get('file_a') or '').lstrip('/')
    path_b = (payload.get('file_b') or '').lstrip('/')
    if not path_a or not path_b:
        raise HTTPException(status_code=400, detail="file_a and file_b required")
    target_a = app_state.MODELS_DIR / path_a
    target_b = app_state.MODELS_DIR / path_b
    try:
        text_a = target_a.read_text(encoding='utf-8').splitlines(keepends=True)
        text_b = target_b.read_text(encoding='utf-8').splitlines(keepends=True)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    patch = ''.join(difflib.unified_diff(text_a, text_b, fromfile=path_a, tofile=path_b, n=3))
    return {'success': True, 'patch': patch or '(no differences)'}


# ── Validate ───────────────────────────────────────────────────────────────────

@router.get("/api/validate/{file_path:path}")
async def validate_file(file_path: str):
    valid, errors = _simple_yaml_validate(file_path, app_state.MODELS_DIR)
    return {'valid': valid, 'errors': errors}


@router.post("/api/validate")
async def validate_model(request: ValidateRequest):
    files_to_validate = []
    if request.files:
        files_to_validate = request.files
    elif request.file_path:
        files_to_validate = [request.file_path]
    else:
        raise HTTPException(status_code=400, detail="Either file_path or files must be provided")

    if app_state.loader_engine is not None:
        try:
            merge_result = app_state.loader_engine.merge_models(
                model_names=files_to_validate, folders=None, output_path=None)
            if merge_result['success']:
                model = merge_result['data']
                try:
                    model.validate_model()
                    return {'valid': True, 'errors': []}
                except ValueError as e:
                    return {'valid': False, 'errors': [str(e)]}
        except Exception as e:
            logger.warning(f"Loader validation failed, using simple YAML check: {e}")

    all_errors = []
    for fp in files_to_validate:
        valid, errs = _simple_yaml_validate(fp, app_state.MODELS_DIR)
        all_errors.extend(errs)
    return {'valid': not all_errors, 'errors': all_errors}


# ── Merge ──────────────────────────────────────────────────────────────────────

@router.post("/api/merge")
async def merge_models(request: MergeRequest):
    if not app_state.SCS_MODE:
        app_state.check_write()
    out_path = None if app_state.SCS_MODE else request.output_path
    merged = None

    if app_state.loader_engine is not None:
        try:
            abs_out = (str(app_state.MODELS_DIR / out_path)
                       if out_path and not os.path.isabs(out_path) else out_path)
            result = app_state.loader_engine.merge_models(
                model_names=request.files, folders=request.folders, output_path=abs_out)
            if result['success']:
                merged = result.get('merged') or result
        except Exception as e:
            logger.warning(f"Loader merge failed, falling back to simple merge: {e}")

    if merged is None:
        merged = _simple_yaml_merge(request.files, out_path, app_state.MODELS_DIR)

    if app_state.SCS_MODE:
        yaml_text = yaml.dump(merged, allow_unicode=True, default_flow_style=False,
                              sort_keys=False, indent=2)
        return {'success': True, 'scs_mode': True, 'raw': merged, 'yaml_text': yaml_text,
                'filename': (out_path or 'merged').split('/')[-1]}

    return {'success': True, 'data': {
        'variables': merged.get('variables', {}),
        'equations': merged.get('equations', {}),
        'output_path': request.output_path
    }}


# ── Split ──────────────────────────────────────────────────────────────────────

@router.post("/api/split")
async def split_model(request: SplitRequest):
    app_state.check_write()
    if app_state.loader_engine is None:
        raise HTTPException(status_code=503, detail="Models system not initialized")
    try:
        file_path = request.file_path
        if file_path.startswith(('models/', 'stories/', 'scenarios/', 'models\\', 'stories\\', 'scenarios\\')):
            folder = None
            model_name = file_path
        else:
            if '/' in file_path or os.sep in file_path:
                parts = file_path.replace(os.sep, '/').split('/')
                folder = parts[0]
                model_name = '/'.join(parts[1:])
            else:
                folder = None
                model_name = file_path
        if model_name.endswith(('.yaml', '.yml')):
            model_name = os.path.splitext(model_name)[0]
        clean_name = os.path.basename(model_name.replace('\\', '/'))
        full_output_dir = str(app_state.MODELS_DIR / "components" / f"splitted_{clean_name}")
        result = app_state.loader_engine.split_model(model_name, full_output_dir, folder)
        if result['success']:
            data = result.get('data', {})
            return {'success': True, 'data': {'output_dir': data.get('output_dir'),
                                               'files': data.get('files', [])}}
        raise HTTPException(status_code=500, detail=result.get('error', 'Split failed'))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Search / Story / Folders ───────────────────────────────────────────────────

@router.get("/api/search")
async def search_files(q: str = ""):
    if not q:
        return {'success': True, 'data': []}
    keyword = q.lower()
    results = []

    def search_in_dir(directory, base_path=''):
        if not os.path.exists(directory):
            return
        try:
            for item in os.listdir(directory):
                item_path = os.path.join(directory, item)
                relative_path = os.path.join(base_path, item).replace('\\', '/')
                if os.path.isdir(item_path):
                    search_in_dir(item_path, relative_path)
                elif item.endswith('.yaml') or item.endswith('.yml'):
                    matched = keyword in item.lower()
                    if not matched:
                        try:
                            with open(item_path, 'r', encoding='utf-8') as f:
                                data = safe_load(f)
                                if isinstance(data, dict):
                                    tags = data.get('metadata', {}).get('tags', [])
                                    matched = any(keyword in str(t).lower() for t in tags)
                        except Exception:
                            pass
                    if matched:
                        results.append({'title': item, 'key': relative_path,
                                        'path': relative_path, 'type': 'file'})
        except Exception as e:
            logger.error(f"Search error in {directory}: {e}")

    try:
        search_in_dir(str(app_state.MODELS_DIR))
        return {'success': True, 'data': results}
    except Exception as e:
        return {'success': False, 'error': str(e)}


@router.get("/api/story/{story_id:path}")
async def get_story_data(story_id: str):
    try:
        story_dir = app_state.MODELS_DIR / "stories" / story_id
        story_file = story_dir / "story.yaml"
        if not story_file.exists():
            story_file = app_state.MODELS_DIR / "stories" / f"{story_id}.yaml"
            if not story_file.exists():
                raise HTTPException(status_code=404, detail=f"Story not found: {story_id}")
            story_dir = story_file.parent
        with open(story_file, 'r', encoding='utf-8') as f:
            story_data = safe_load(f)
        cards_data = {}
        if 'cards' in story_data:
            for card_rel_path in story_data['cards']:
                card_path = story_dir / card_rel_path
                if card_path.exists():
                    with open(card_path, 'r', encoding='utf-8') as f:
                        cards_data[card_rel_path] = safe_load(f)
        return {'success': True, 'data': {'config': story_data, 'cards': cards_data}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/folders")
async def list_folders():
    folders = []

    def collect_folders(directory, base_path=''):
        if not os.path.exists(directory):
            return
        try:
            for item in os.listdir(directory):
                item_path = os.path.join(directory, item)
                if os.path.isdir(item_path):
                    if item in ['__pycache__', '.git']:
                        continue
                    relative_path = os.path.join(base_path, item).replace('\\', '/')
                    folders.append(relative_path)
                    collect_folders(item_path, relative_path)
        except Exception as e:
            logger.error(f"Error collecting folders from {directory}: {e}")

    try:
        collect_folders(str(app_state.MODELS_DIR))
        return {'success': True, 'data': folders}
    except Exception as e:
        return {'success': False, 'error': str(e)}
