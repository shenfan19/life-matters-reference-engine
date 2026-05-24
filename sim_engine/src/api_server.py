"""
LifeMatters Backend - FastAPI (完整版)
合并了原 api_server.py 的所有功能
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from contextlib import asynccontextmanager

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional, Dict, Any, List
import logging
import sys
import os
import yaml
import uuid
import asyncio
import functools
from time import time as _time

# ========== 路径配置 ==========
CURRENT_FILE = Path(__file__).resolve()
SRC_DIR = CURRENT_FILE.parent
BACKEND_DIR = SRC_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

# 添加到 Python 路径
sys.path.insert(0, str(SRC_DIR))
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(PROJECT_ROOT))


# 配置日志（仅控制台，不写文件）
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:%(name)s:%(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# ========== SCS 模式 ==========
SCS_MODE = os.getenv("SCS_MODE", "false").lower() == "true"

def _check_write():
    if SCS_MODE:
        raise HTTPException(status_code=403, detail="SCS mode: write operations are disabled")

# 全局实例
plugin_manager = None
loader_engine = None
simulator_engine = None
optimizer_jobs: Dict[str, Dict[str, Any]] = {}


# ========== 寿命周期事件 ==========
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用寿命周期管理：包含启动初始化逻辑"""
    global plugin_manager, loader_engine, simulator_engine
    
    logger.info("=" * 60)
    logger.info("Initializing LifeMatters Backend (via Lifespan Handler)...")
    logger.info(f"PROJECT_ROOT: {PROJECT_ROOT}")
    logger.info("=" * 60)
    
    # 初始化插件系统
    try:
        from src.plugin_manager import PluginManager
        
        plugins_dir = PROJECT_ROOT / "plugins"
        logger.info(f"Plugins directory: {plugins_dir}")
        
        if not plugins_dir.exists():
            plugins_dir.mkdir(parents=True, exist_ok=True)
        
        plugin_manager = PluginManager(plugin_dir=str(plugins_dir))
        logger.info(f"✅ Plugin system initialized")
        logger.info(f"   Loaded {len(plugin_manager.plugins)} plugins")
        
        for plugin_id, info in plugin_manager.plugins.items():
            logger.info(f"   - {info['manifest']['name']} ({plugin_id})")
        
    except ImportError as e:
        logger.error(f"❌ Failed to import PluginManager: {e}")
        plugin_manager = None
    except Exception as e:
        logger.error(f"❌ Error initializing plugins: {e}")
        plugin_manager = None
    
    # 初始化 Models 系统
    try:
        from src.loader_engine import LoaderEngine
        
        models_dir = PROJECT_ROOT / "models"
        logger.info(f"Models directory: {models_dir}")

        if not models_dir.exists():
            models_dir.mkdir(parents=True, exist_ok=True)

        loader_engine = LoaderEngine(models_directory=str(models_dir))
        logger.info(f"✅ Models system initialized")
        
        try:
            models = loader_engine.scan_models()
            logger.info(f"   Found {len(models)} models")
            
            for i, name in enumerate(list(models.keys())[:5]):
                logger.info(f"   - {name}")
            if len(models) > 5:
                logger.info(f"   ... and {len(models) - 5} more")
                
        except Exception as e:
            logger.warning(f"   Failed to scan models: {e}")
        
    except ImportError as e:
        logger.error(f"❌ Failed to import LoaderEngine: {e}")
        loader_engine = None
    except Exception as e:
        logger.error(f"❌ Error initializing models: {e}")
        loader_engine = None
    
    # 初始化仿真引擎
    try:
        from src.simulator_engine import SimulatorEngine
        models_dir = PROJECT_ROOT / "models"
        simulator_engine = SimulatorEngine(models_directory=str(models_dir))
        logger.info(f"✅ Simulation system initialized")
    except Exception as e:
        logger.error(f"❌ Error initializing simulation: {e}")
        simulator_engine = None

    logger.info("=" * 60)
    logger.info("Backend initialization complete")
    logger.info("=" * 60)
    
    yield
    
    logger.info("Shutting down LifeMatters Backend...")


def _add_log(job: dict, msg: str):
    job['logs'].append({'t': _time(), 'msg': msg})


async def _run_optimizer_job(job_id: str, fn):
    job = optimizer_jobs[job_id]
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, fn)
        job['result'] = result
        job['status'] = 'completed' if result.get('success') else 'failed'
        if not result.get('success'):
            job['error'] = result.get('error', 'Unknown error')
            _add_log(job, f"Failed: {job['error']}")
        else:
            _add_log(job, "Optimization completed.")
    except Exception as e:
        job['status'] = 'failed'
        job['error'] = str(e)
        _add_log(job, f"Error: {e}")


# 创建 FastAPI 应用
app = FastAPI(title="LifeMatters API", version="0.3.0", lifespan=lifespan)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ========== Pydantic 模型（请求体定义）==========
class MergeRequest(BaseModel):
    folders: Optional[List[str]] = None
    files: Optional[List[str]] = None
    output_path: Optional[str] = None


class ValidateRequest(BaseModel):
    file_path: Optional[str] = None
    files: Optional[List[str]] = None


class StoryRequest(BaseModel):
    story_path: str

class SplitRequest(BaseModel):
    file_path: str


class SaveFileRequest(BaseModel):
    path: str          # relative to models/, e.g. "scenarios/examples/my_scene.yaml"
    content: Dict[str, Any]


class FileMoveRequest(BaseModel):
    src: str   # relative to models/
    dst: str   # relative to models/


class FileNewRequest(BaseModel):
    path: str           # relative to models/
    template: str = "model"  # "model" | "scenario"


class RegimenEventData(BaseModel):
    id: str = ""
    time: str = "08:00"   # "HH:mm"
    value: float = 0.0

class RegimenData(BaseModel):
    variable: str
    events: List[RegimenEventData] = []
    days_enabled: bool = False
    days: List[bool] = [True]*7   # [Mon..Sun]
    valid_range_enabled: bool = False
    valid_start: str = ""   # "YYYY-MM-DD"
    valid_end: str = ""

class SimulationStartRequest(BaseModel):
    model_name: str
    folder: Optional[str] = None
    time_hours: float = 24.0
    step_size: Optional[float] = None
    input_params: Optional[Dict[str, float]] = None
    regimens: Optional[List[RegimenData]] = None
    sim_runs: int = 1   # Monte Carlo 运行条数（1=单条，>1=MC多条）
    seed: Optional[int] = None  # MC seed（None=每次随机，整数=固定可复现）


class SimulationStepRequest(BaseModel):
    session_id: str
    steps: int = 1
    input_changes: Optional[Dict[str, float]] = None


class SessionRequest(BaseModel):
    session_id: str




# ========== 基础端点 ==========
@app.get("/")
async def root():
    """健康检查"""
    return {
        "status": "ok",
        "service": "LifeMatters API",
        "version": "0.3.0"
    }


@app.get("/api/health")
async def health_check():
    """详细健康检查"""
    active_jobs = sum(1 for j in optimizer_jobs.values() if j.get('status') == 'running')
    return {
        "status": "healthy",
        "components": {
            "plugin_manager": plugin_manager is not None,
            "loader_engine": loader_engine is not None
        },
        "plugins_loaded": len(plugin_manager.plugins) if plugin_manager else 0,
        "models_directory": str(PROJECT_ROOT / "models"),
        "models_exists": (PROJECT_ROOT / "models").exists(),
        "active_opt_jobs": active_jobs,
    }


# ========== Plugins 端点 ==========
@app.get("/api/plugins")
async def list_plugins():
    """获取所有插件列表"""
    if plugin_manager is None:
        return {"plugins": [], "message": "Plugin system not initialized"}
    
    try:
        plugin_manager.scan_plugins()
        return {
            "success": True,
            "plugins": plugin_manager.get_plugin_list(),
            "count": len(plugin_manager.plugins)
        }
    except Exception as e:
        logger.error(f"Error listing plugins: {e}")
        return {"plugins": [], "error": str(e)}


@app.get("/api/plugins/{plugin_id}/ui-page", response_class=HTMLResponse)
async def get_plugin_ui_page(plugin_id: str, theme: str = 'light'):
    """返回渲染后的插件UI页面"""
    if plugin_manager is None:
        raise HTTPException(status_code=503, detail="Plugin system not initialized")
    
    if plugin_id not in plugin_manager.plugins:
        raise HTTPException(status_code=404, detail="Plugin not found")
        
    plugin_info = plugin_manager.plugins[plugin_id]
    manifest = plugin_info['manifest']
    plugin_path = plugin_info['path']
    
    ui_config = manifest.get('ui', {})
    if ui_config.get('type') != 'component':
        raise HTTPException(status_code=400, detail="This plugin does not have a custom UI component")
        
    component_path = ui_config.get('component_path')
    if not component_path:
        raise HTTPException(status_code=400, detail="No component_path specified")
        
    component_file = plugin_path / component_path
    if not component_file.exists():
        raise HTTPException(status_code=404, detail="Component file not found")
        
    with open(component_file, 'r', encoding='utf-8') as f:
        component_code = f.read()

    # Set background and text color based on theme
    bg_color = '#141414' if theme == 'dark' else 'transparent'
    text_color = '#ffffff' if theme == 'dark' else '#000000'
    theme_algo = 'theme.darkAlgorithm' if theme == 'dark' else 'theme.defaultAlgorithm'

    # HTML 模版
    template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{name}} UI</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script crossorigin src="https://unpkg.com/dayjs@1/dayjs.min.js"></script>
    <script crossorigin src="https://unpkg.com/antd@5/dist/antd.min.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/antd@5/dist/reset.css" />
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: {{bg_color}};
            color: {{text_color}};
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        // 外部注入的 React 和 antd
        const { useState, useEffect, useRef, useMemo } = React;
        const { ConfigProvider, theme } = antd;

        // 插件组件代码
        {{component_code}}

        // 渲染逻辑
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(
            <ConfigProvider theme={{ algorithm: {{theme_algo}} }}>
                <PluginComponent />
            </ConfigProvider>
        );

        // 通信 API
        window.pluginAPI = {
            sendMessage: (data) => {
                window.parent.postMessage({
                    type: 'plugin-message',
                    pluginId: '{{plugin_id}}',
                    data: data
                }, '*');
            },
            callBackend: async (endpoint, data) => {
                const url = endpoint === 'run' ? `/api/plugins/{{plugin_id}}/run` : `/api/plugins/{{plugin_id}}/${endpoint}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inputs: data })
                });
                return await response.json();
            }
        };
    </script>
</body>
</html>
"""

    html_content = template.replace('{{name}}', manifest.get('name', 'Plugin')) \
                           .replace('{{component_code}}', component_code) \
                           .replace('{{plugin_id}}', plugin_id) \
                           .replace('{{bg_color}}', bg_color) \
                           .replace('{{text_color}}', text_color) \
                           .replace('{{theme_algo}}', theme_algo)

    return HTMLResponse(content=html_content)


@app.post("/api/plugins/{plugin_id}/{endpoint}")
async def call_plugin_backend(plugin_id: str, endpoint: str, payload: dict):
    """通用插件后台调用转发器"""
    if plugin_manager is None:
        raise HTTPException(status_code=503, detail="Plugin system not initialized")
        
    try:
        if endpoint == 'run':
            from src.plugin_context import PluginContext
            ctx = PluginContext(simulator_engine=simulator_engine)
            result = plugin_manager.run_plugin(
                plugin_id=plugin_id,
                inputs=payload.get('inputs', {}),
                context=ctx
            )
            return result
        else:
            # 未来可以扩展支持其他 endpoint
            raise HTTPException(status_code=404, detail=f"Endpoint {endpoint} not supported")
    except Exception as e:
        logger.error(f"Error calling plugin backend {plugin_id}/{endpoint}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Models 端点 ==========
@app.get("/api/models")
async def list_models(folder: str = None):
    """获取所有模型列表"""
    if loader_engine is None:
        return {"models": [], "message": "Models system not initialized"}
    
    try:
        folders = [folder] if folder else None
        models = loader_engine.scan_models(folders)
        
        return {
            "models": [
                {
                    "name": name,
                    "variables": info["variables"],
                    "formulas": info["formulas"],
                    "version": info["version"]
                }
                for name, info in models.items()
            ],
            "total": len(models)
        }
    except Exception as e:
        logger.error(f"Error listing models: {e}")
        return {"models": [], "error": str(e)}


@app.get("/api/models/{model_name}")
async def get_model(model_name: str, folder: str = None):
    """获取单个模型详情"""
    if loader_engine is None:
        raise HTTPException(status_code=503, detail="Models system not initialized")
    
    try:
        # 解析路径：优先考虑全路径
        if model_name.startswith(('models/', 'stories/', 'scenarios/', 'models\\', 'stories\\', 'scenarios\\')):
            # 如果提供了 folder 且 model_name 不包含 folder 前缀，则可能需要保留 folder
            # 但通常 GUI 会发送完整的相对路径
            pass
        else:
            # 向后兼容：如果 folder 存在且 model_name 不包含分隔符
            if folder and '/' not in model_name and '\\' not in model_name:
                pass
            # 否则 LoaderEngine 的 find_model_file 会处理
            
        model = loader_engine.fetch(model_name, folder, use_cache=False)
        if model is None:
            raise HTTPException(status_code=404, detail=f"Model not found: {model_name}")
        metadata = {
            "name": model.metadata.name if model.metadata else "",
            "version": model.metadata.version if model.metadata else "",
            "author": model.metadata.author if model.metadata else "",
            "description": model.metadata.description if model.metadata else ""
        }
        variables = {
            var_name: {
                "description": var.description,
                "value": var.value,
                "unit": var.unit,
                "type": var.type.value if hasattr(var.type, 'value') else str(var.type)
            }
            for var_name, var in model.variables.items()
        }
        formulas = {
            f_name: {
                "description": f.description,
                "condition": f.condition,
                "priority": f.priority,
                "dynamics": f.dynamics,
                "formula": f.formula,
            }
            for f_name, f in model.formulas.items()
        }
        provenance = getattr(model, 'provenance', {}) or {}
        data = {
            "metadata": metadata,
            "variables": variables,
            "formulas": formulas,
            "simulation": model.simulator,
            "simulator": model.simulator,
            "optimizer": model.optimizer,
            "imports": provenance.get('imports', []),
            "provenance": provenance,
            "resolved": True,
        }
        
        return {
            "success": True,
            "data": data,
            **data,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Config 端点 ==========
@app.get("/api/config")
async def get_config():
    return {"scs_mode": SCS_MODE}


# ========== Files 端点（文件树）==========
@app.get("/api/files")
async def list_files():
    """获取文件树结构，包含 type 和 category 元数据"""
    def build_tree(directory, base_path=''):
        items = []
        if not os.path.exists(directory):
            return items
        
        try:
            for item in sorted(os.listdir(directory)):
                item_path = os.path.join(directory, item)
                relative_path = os.path.join(base_path, item).replace('\\', '/')
                
                if os.path.isdir(item_path):
                    # 跳过特殊文件夹
                    if item in ['__pycache__', '.git']:
                        continue
                    
                    children = build_tree(item_path, relative_path)
                    items.append({
                        'title': item,
                        'key': relative_path,
                        'type': 'folder',
                        'children': children if children else []
                    })
                elif item.endswith('.yaml') or item.endswith('.yml'):
                    # 读取文件以获取 type 和 category
                    file_metadata = {}
                    try:
                        with open(item_path, 'r', encoding='utf-8') as f:
                            data = yaml.safe_load(f)
                            if isinstance(data, dict):
                                file_metadata['category'] = data.get('category', 'unknown')
                                file_metadata['description'] = data.get('description', '')
                                file_metadata['difficulty'] = data.get('difficulty', '')
                                file_metadata['levels'] = data.get('levels', [])
                                meta = data.get('metadata', {})
                                file_metadata['tags'] = meta.get('tags', [])
                    except Exception as e:
                        logger.warning(f"Failed to read metadata from {item_path}: {e}")
                    
                    items.append({
                        'title': item,
                        'key': relative_path,
                        'type': 'file',
                        'isLeaf': True,
                        **file_metadata
                    })
        except Exception as e:
            logger.error(f"Error scanning {directory}: {e}")
        
        return items
    
    try:
        models_dir = PROJECT_ROOT / "models"
        tree = [{
            'title': 'models',
            'key': 'models',
            'type': 'folder',
            'children': build_tree(str(models_dir))
        }]
        
        return {'success': True, 'data': tree}
    except Exception as e:
        logger.error(f"Error getting file tree: {e}")
        return {'success': False, 'error': str(e)}


@app.get("/api/file/{file_path:path}")
async def get_file_content(file_path: str):
    """读取单个 YAML 文件原始内容（用于编辑器，直接读文件，不经过 loader）"""
    try:
        logger.info(f"读取文件: {file_path}")
        yaml_file = PROJECT_ROOT / "models" / file_path.lstrip('/')
        if not yaml_file.suffix:
            yaml_file = yaml_file.with_suffix('.yaml')
        if not str(yaml_file.resolve()).startswith(str((PROJECT_ROOT / "models").resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        if not yaml_file.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        with open(yaml_file, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        return {'success': True, 'data': {'path': file_path, 'content': data}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Validate a models/ YAML file (GET, delegates to shared logic) ==========
@app.get("/api/validate/{file_path:path}")
async def validate_file(file_path: str):
    """Validate a single models/ YAML file."""
    valid, errors = _simple_yaml_validate(file_path, PROJECT_ROOT)
    return {'valid': valid, 'errors': errors}


# ========== Save structured JSON as YAML ==========
@app.post("/api/file-structured/{file_path:path}")
async def save_file_structured(file_path: str, payload: dict):
    """Receive a JSON object, serialize to YAML, and save to models/"""
    _check_write()
    target = PROJECT_ROOT / "models" / file_path.lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True)
    data = payload.get('data', {})
    text = yaml.dump(data, allow_unicode=True, default_flow_style=False,
                     sort_keys=False, indent=2)
    target.write_text(text, encoding='utf-8')
    if loader_engine:
        loader_engine.models_cache.clear()
    return {'success': True, 'path': file_path}


# ========== Diff two files ==========
@app.post("/api/diff")
async def diff_files(payload: dict):
    """Return unified diff patch between two models/ files"""
    import difflib
    path_a = (payload.get('file_a') or '').lstrip('/')
    path_b = (payload.get('file_b') or '').lstrip('/')
    if not path_a or not path_b:
        raise HTTPException(status_code=400, detail="file_a and file_b required")
    target_a = PROJECT_ROOT / "models" / path_a
    target_b = PROJECT_ROOT / "models" / path_b
    try:
        text_a = target_a.read_text(encoding='utf-8').splitlines(keepends=True)
        text_b = target_b.read_text(encoding='utf-8').splitlines(keepends=True)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    patch = ''.join(difflib.unified_diff(text_a, text_b, fromfile=path_a, tofile=path_b, n=3))
    return {'success': True, 'patch': patch or '(no differences)'}


# ========== Raw file read/write (for YAML text editor) ==========
@app.get("/api/file-raw/{file_path:path}")
async def get_file_raw(file_path: str):
    """Return the raw text content of a file in models/"""
    try:
        target = PROJECT_ROOT / "models" / file_path.lstrip('/')
        if not str(target.resolve()).startswith(str((PROJECT_ROOT / "models").resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        if not target.exists():
            raise HTTPException(status_code=404, detail="File not found")
        text = target.read_text(encoding='utf-8')
        return {'success': True, 'text': text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/file-raw/{file_path:path}")
async def save_file_raw(file_path: str, payload: dict):
    """Save raw text to a file in models/ (creates parent dirs as needed)"""
    _check_write()
    try:
        target = PROJECT_ROOT / "models" / file_path.lstrip('/')
        if not str(target.resolve()).startswith(str((PROJECT_ROOT / "models").resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload.get('text', ''), encoding='utf-8')
        if loader_engine:
            loader_engine.models_cache.clear()
        return {'success': True, 'path': file_path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/model/upload-temp")
async def upload_model_temp(payload: dict):
    """Upload YAML, resolve imports in-process, delete temp file, return raw+resolved content."""
    import re as _re
    text = payload.get("text", "")
    raw_name = payload.get("filename", f"import_{uuid.uuid4().hex[:8]}.yaml")
    safe_name = _re.sub(r'[^a-zA-Z0-9_\-.]', '_', raw_name)
    if not safe_name.lower().endswith(('.yaml', '.yml')):
        safe_name += '.yaml'

    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")

    if loader_engine is None:
        raise HTTPException(status_code=503, detail="Models system not initialized")

    temp_dir = PROJECT_ROOT / "models" / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_name = f"{uuid.uuid4().hex}_{safe_name}"
    temp_path = temp_dir / temp_name

    try:
        temp_path.write_text(text, encoding='utf-8')
        model = loader_engine.fetch(temp_name, folder='temp', use_cache=False)
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
                k: {
                    "description": v.description, "value": v.value, "unit": v.unit,
                    "type": v.type.value if hasattr(v.type, 'value') else str(v.type),
                }
                for k, v in model.variables.items()
            },
            "formulas": {
                k: {
                    "description": f.description, "condition": f.condition,
                    "priority": f.priority, "dynamics": f.dynamics, "formula": f.formula,
                }
                for k, f in model.formulas.items()
            },
            "simulation": model.simulator,
            "simulator": model.simulator,
            "optimizer": model.optimizer,
            "imports": provenance.get('imports', []),
            "provenance": provenance,
            "resolved": True,
        }
        return {"success": True, "raw": raw, "resolved": resolved, "filename": safe_name}
    finally:
        if temp_path.exists():
            temp_path.unlink()


# ========== Save File 端点 ==========
@app.post("/api/save-file")
async def save_file_endpoint(request: SaveFileRequest):
    """保存文件到 models 目录（用于构建新 scenario）"""
    _check_write()
    try:
        target = PROJECT_ROOT / "models" / request.path.lstrip('/')
        if not str(target.resolve()).startswith(str((PROJECT_ROOT / "models").resolve())):
            raise HTTPException(status_code=400, detail="Path must be inside models directory")
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, 'w', encoding='utf-8') as f:
            yaml.dump(request.content, f, allow_unicode=True, sort_keys=False,
                      default_flow_style=False, indent=2)
        # Invalidate loader engine cache so next read reflects the saved file
        if loader_engine:
            loader_engine.models_cache.clear()
        logger.info(f"File saved: {target}")
        return {'success': True, 'data': {'path': str(target.relative_to(PROJECT_ROOT / "models"))}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Save file error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== File management endpoints ==========

@app.delete("/api/file/{file_path:path}")
async def delete_file(file_path: str):
    """Delete a file inside the models directory."""
    _check_write()
    models_root = PROJECT_ROOT / "models"
    target = models_root / file_path.lstrip('/')
    if not str(target.resolve()).startswith(str(models_root.resolve())):
        raise HTTPException(status_code=400, detail="Path must be inside models directory")
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    if target.is_dir():
        raise HTTPException(status_code=400, detail="Cannot delete directories via this endpoint")
    target.unlink()
    if loader_engine:
        loader_engine.models_cache.clear()
    logger.info(f"File deleted: {target}")
    return {'success': True}


@app.post("/api/file-move")
async def move_file(request: FileMoveRequest):
    """Move / rename a file inside the models directory."""
    _check_write()
    import shutil
    models_root = PROJECT_ROOT / "models"
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
    logger.info(f"File moved: {src} → {dst}")
    return {'success': True, 'dst': request.dst}


_FILE_TEMPLATES = {
    "model": {
        "metadata": {"name": "新模型", "description": "", "tags": [], "version": "1.0"},
        "variables": {"example_var": {"initial_value": 0.0, "unit": "", "description": ""}},
        "formulas": {},
        "simulator": {"time_unit": "day", "step_size": 3600},
    },
    "scenario": {
        "metadata": {"name": "新场景", "description": "", "tags": [], "version": "1.0"},
        "variables": {},
        "formulas": {},
        "simulator": {"time_unit": "day", "step_size": 3600},
    },
}


@app.post("/api/file-new")
async def create_new_file(request: FileNewRequest):
    """Create a new YAML file from a template inside the models directory."""
    _check_write()
    models_root = PROJECT_ROOT / "models"
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
    logger.info(f"New file created: {target} (template={request.template})")
    return {'success': True, 'path': request.path}


# ========== Merge 端点 ==========
def _simple_yaml_merge(files, output_path, project_root):
    """Simple YAML merge: combine variables/formulas/simulator from multiple files."""
    import copy
    merged = {'metadata': {'name': 'merged', 'description': '', 'tags': []},
              'variables': {}, 'formulas': {}, 'simulator': {}}
    for f in (files or []):
        target = project_root / "models" / f.lstrip('/')
        if not target.exists():
            continue
        try:
            with open(target, encoding='utf-8') as fh:
                data = yaml.safe_load(fh) or {}
        except Exception:
            continue
        merged['variables'].update(data.get('variables') or {})
        merged['formulas'].update(data.get('formulas') or {})
        sim = data.get('simulator') or data.get('simulation') or {}
        merged['simulator'].update(sim)
    if output_path:
        out = project_root / "models" / output_path.lstrip('/')
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, 'w', encoding='utf-8') as fh:
            yaml.dump(merged, fh, allow_unicode=True, default_flow_style=False,
                      sort_keys=False, indent=2)
    return merged

@app.post("/api/merge")
async def merge_models(request: MergeRequest):
    """合并模型。SCS 模式下不写盘，返回合并内容供前端创建 session model。"""
    if not SCS_MODE:
        _check_write()

    # Determine output path: None in SCS mode (no disk write)
    out_path = None if SCS_MODE else request.output_path

    merged = None
    if loader_engine is not None:
        try:
            abs_out = (str(PROJECT_ROOT / "models" / out_path)
                       if out_path and not os.path.isabs(out_path) else out_path)
            result = loader_engine.merge_models(
                model_names=request.files,
                folders=request.folders,
                output_path=abs_out
            )
            if result['success']:
                merged = result.get('merged') or result
        except Exception as e:
            logger.warning(f"Loader merge failed, falling back to simple merge: {e}")

    if merged is None:
        merged = _simple_yaml_merge(request.files, out_path, PROJECT_ROOT)

    if SCS_MODE:
        yaml_text = yaml.dump(merged, allow_unicode=True, default_flow_style=False,
                              sort_keys=False, indent=2)
        return {'success': True, 'scs_mode': True, 'raw': merged, 'yaml_text': yaml_text,
                'filename': (out_path or 'merged').split('/')[-1]}

    return {'success': True, 'data': {
        'variables': merged.get('variables', {}),
        'formulas': merged.get('formulas', {}),
        'output_path': request.output_path
    }}


# ========== Validate 端点 ==========
def _simple_yaml_validate(file_path, project_root):
    """
    Semantic validation of a model YAML file.

    Checks:
      1. metadata.name exists
      2. variables section is non-empty
      3. Every dynamics key in each formula is defined in variables
      4. Every identifier referenced in formula expressions that matches
         a known variable name is defined in variables
      5. Every variable defined in variables is referenced somewhere
         (as a dynamics key or in an expression / condition)

    simulator/optimizer are NOT required here — they can be supplied at run time.
    """
    import re

    target = project_root / "models" / file_path.lstrip('/')
    if not target.exists():
        return False, [f'文件不存在: {file_path}']
    try:
        with open(target, encoding='utf-8') as fh:
            data = yaml.safe_load(fh) or {}
    except Exception as e:
        return False, [f'YAML 解析错误: {e}']

    errors = []

    # ── 1. Metadata ────────────────────────────────────────────────────────
    meta = data.get('metadata') or data.get('meta')
    if not meta:
        errors.append('缺少 metadata 字段')
    elif not (meta.get('name') or '').strip():
        errors.append('metadata.name 为空')

    # ── 2. Variables ───────────────────────────────────────────────────────
    variables: dict = data.get('variables') or {}
    if not variables:
        errors.append('缺少 variables 字段（或为空）')
        return False, errors   # nothing more to cross-check

    var_set = set(variables.keys())

    # ── 3 & 4. Formula → variable cross-check ─────────────────────────────
    formulas: dict = data.get('formulas') or {}

    # All text that formulas expose: dynamics keys + expression strings + conditions
    dyn_keys_used: set[str] = set()
    vars_referenced: set[str] = set()

    for fname, fd in formulas.items():
        if not isinstance(fd, dict):
            errors.append(f'公式 {fname!r} 格式错误（应为字典）')
            continue

        dynamics: dict = fd.get('dynamics') or {}
        if not dynamics:
            errors.append(f'公式 {fname!r} 缺少 dynamics 字段')

        for dyn_key, expr in dynamics.items():
            # Check dynamics key is a defined variable
            if dyn_key not in var_set:
                errors.append(f'公式 {fname!r}: dynamics 键 {dyn_key!r} 未在 variables 中定义')
            else:
                dyn_keys_used.add(dyn_key)

            # Extract identifiers from the expression that are known variable names
            expr_str = str(expr) if expr is not None else ''
            for token in re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\b', expr_str):
                if token in var_set:
                    vars_referenced.add(token)

        # Also scan condition string
        cond = fd.get('condition')
        if isinstance(cond, str):
            for token in re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\b', cond):
                if token in var_set:
                    vars_referenced.add(token)

    all_used = dyn_keys_used | vars_referenced

    # ── 5. Variable → formula cross-check ─────────────────────────────────
    unused = var_set - all_used
    for vname in sorted(unused):
        errors.append(f'变量 {vname!r} 已定义但未被任何公式使用')

    return not errors, errors

@app.post("/api/validate")
async def validate_model(request: ValidateRequest):
    """验证模型（先用 loader_engine，失败时回退到简单 YAML 验证）"""
    files_to_validate = []
    if request.files:
        files_to_validate = request.files
    elif request.file_path:
        files_to_validate = [request.file_path]
    else:
        raise HTTPException(status_code=400, detail="Either file_path or files must be provided")

    if not files_to_validate:
        raise HTTPException(status_code=400, detail="No files provided for validation")

    logger.info(f"Validating: {files_to_validate}")

    # Try loader_engine first (deep validation)
    if loader_engine is not None:
        try:
            merge_result = loader_engine.merge_models(
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

    # Simple YAML fallback
    all_errors = []
    for fp in files_to_validate:
        valid, errs = _simple_yaml_validate(fp, PROJECT_ROOT)
        all_errors.extend(errs)
    return {'valid': not all_errors, 'errors': all_errors}


# ========== Split 端点 ==========
@app.post("/api/split")
async def split_model(request: SplitRequest):
    """拆分模型"""
    _check_write()
    if loader_engine is None:
        raise HTTPException(status_code=503, detail="Models system not initialized")
    
    try:
        file_path = request.file_path

        # 解析路径：优先考虑全路径
        if file_path.startswith(('models/', 'stories/', 'scenarios/', 'models\\', 'stories\\', 'scenarios\\')):
            folder = None
            model_name = file_path
        else:
            # 向后兼容：旧的拆分逻辑
            if '/' in file_path or os.sep in file_path:
                parts = file_path.replace(os.sep, '/').split('/')
                folder = parts[0]
                model_name = '/'.join(parts[1:])
            else:
                folder = None
                model_name = file_path

        if model_name.endswith(('.yaml', '.yml')):
            model_name = os.path.splitext(model_name)[0]

        # Output dir: models/components/splitted_{clean_name}
        clean_name = os.path.basename(model_name.replace('\\', '/'))
        full_output_dir = str(PROJECT_ROOT / "models" / "components" / f"splitted_{clean_name}")

        # 调用 split_model
        result = loader_engine.split_model(model_name, full_output_dir, folder)
        
        if result['success']:
            return {
                'success': True,
                'data': {
                    'output_dir': result.get('output_dir'),
                    'files': result.get('files', [])
                }
            }
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Split failed'))
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Split error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Search 端点 ==========
@app.get("/api/search")
async def search_files(q: str = ""):
    """搜索文件"""
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
                                data = yaml.safe_load(f)
                                if isinstance(data, dict):
                                    tags = data.get('metadata', {}).get('tags', [])
                                    matched = any(keyword in str(t).lower() for t in tags)
                        except Exception:
                            pass
                    if matched:
                        results.append({
                            'title': item,
                            'key': relative_path,
                            'path': relative_path,
                            'type': 'file'
                        })
        except Exception as e:
            logger.error(f"Search error in {directory}: {e}")
    
    try:
        models_dir = PROJECT_ROOT / "models"
        search_in_dir(str(models_dir))
        return {'success': True, 'data': results}
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {'success': False, 'error': str(e)}


# ========== Story 端点 ==========
@app.get("/api/story/{story_id:path}")
async def get_story_data(story_id: str):
    """加载完整的故事数据，包括卡牌和初始状态"""
    try:
        story_dir = PROJECT_ROOT / "models" / "stories" / story_id
        story_file = story_dir / "story.yaml"

        if not story_file.exists():
            # 兼容单个文件的故事
            story_file = PROJECT_ROOT / "models" / "stories" / f"{story_id}.yaml"
            if not story_file.exists():
                raise HTTPException(status_code=404, detail=f"Story not found: {story_id}")
            story_dir = story_file.parent

        with open(story_file, 'r', encoding='utf-8') as f:
            story_data = yaml.safe_load(f)

        # 加载关联卡牌
        cards_data = {}
        if 'cards' in story_data:
            for card_rel_path in story_data['cards']:
                card_path = story_dir / card_rel_path
                if card_path.exists():
                    with open(card_path, 'r', encoding='utf-8') as f:
                        card_content = yaml.safe_load(f)
                        cards_data[card_rel_path] = card_content
        
        return {
            'success': True,
            'data': {
                'config': story_data,
                'cards': cards_data
            }
        }
    except Exception as e:
        logger.error(f"Error loading story {story_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ========== Folders 端点 ==========
@app.get("/api/folders")
async def list_folders():
    """获取文件夹列表"""
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
        models_dir = PROJECT_ROOT / "models"
        collect_folders(str(models_dir))
        return {'success': True, 'data': folders}
    except Exception as e:
        logger.error(f"Error listing folders: {e}")
        return {'success': False, 'error': str(e)}


# ========== Simulation 端点 ==========
@app.post("/api/simulation/start")
async def start_simulation(request: SimulationStartRequest):
    """启动仿真"""
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    
    try:
        regimens_raw = [r.dict() for r in request.regimens] if request.regimens else None
        result = simulator_engine.start_session(
            model_name=request.model_name,
            folder=request.folder,
            time_hours=request.time_hours,
            step_size=request.step_size,
            input_params=request.input_params,
            regimens=regimens_raw,
            sim_runs=max(1, request.sim_runs),
            seed=request.seed,
        )
        
        if result['success']:
            return result
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start simulation'))
            
    except Exception as e:
        logger.error(f"Error starting simulation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/simulation/step")
@app.post("/api/simulation/batch")
async def simulation_step(request: SimulationStepRequest):
    """单步或批量执行仿真"""
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    
    try:
        result = simulator_engine.batch_steps(
            session_id=request.session_id,
            steps=request.steps,
            input_changes=request.input_changes
        )
        
        if result['success']:
            return result
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to execute simulation steps'))
            
    except Exception as e:
        logger.error(f"Error in simulation step: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/simulation/session/{session_id}")
async def get_simulation_session(session_id: str):
    """获取仿真 session 快照，用于页面刷新/断线后重新 attach。"""
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")

    result = simulator_engine.get_session_info(session_id)
    if result['success']:
        return result
    raise HTTPException(status_code=404, detail=result.get('error', 'Session not found'))


@app.post("/api/simulation/pause")
async def pause_simulation(request: SessionRequest):
    """暂停仿真"""
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    
    result = simulator_engine.pause_session(request.session_id)
    if result['success']:
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to pause simulation'))


@app.post("/api/simulation/resume")
async def resume_simulation(request: SessionRequest):
    """继续仿真"""
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    
    result = simulator_engine.resume_session(request.session_id)
    if result['success']:
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to resume simulation'))


@app.post("/api/simulation/reset")
async def reset_simulation(request: SessionRequest):
    """重置仿真"""
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    
    result = simulator_engine.reset_session(request.session_id)
    if result['success']:
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to reset simulation'))


@app.post("/api/simulation/export")
async def export_simulation(request: SessionRequest):
    """导出仿真数据"""
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    
    result = simulator_engine.export_session_csv(request.session_id)
    if result['success']:
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to export simulation data'))


# ========== Optimizer 端点 ==========

class YamlOptRequest(BaseModel):
    model_name: str
    folder: Optional[str] = None
    optimizer_override: Optional[Dict[str, Any]] = None


@app.post("/api/optimizer/run_yaml")
async def run_yaml_optimization(request: YamlOptRequest):
    """Run optimizer using YAML optimizer: block (NSGA-II / L-BFGS-B / Nelder-Mead).
    optimizer_override merges GUI state into the YAML block before running.
    """
    if simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    try:
        from src.optimizer_engine import run_optimizer
        job_id = str(uuid.uuid4())
        job_history: List[Dict[str, Any]] = []
        job: Dict[str, Any] = {
            'status': 'running',
            'history': job_history,
            'logs': [{'t': _time(), 'msg': f"Loading model: {request.model_name}"}],
            'result': None,
            'error': None,
            'start_time': _time(),
            'job_type': 'yaml',
            'method': 'nsga2',
        }
        optimizer_jobs[job_id] = job

        def progress_cb(entry: dict):
            job_history.append(entry)
            it = entry.get('iteration', len(job_history))
            f = entry.get('fitness')
            ne = entry.get('n_eval')
            if it % 5 == 0 or it == 1:
                parts = [f"Gen {it}"]
                if f is not None:
                    parts.append(f"best={f:.4f}")
                if ne:
                    parts.append(f"eval={ne}")
                _add_log(job, "  ".join(parts))

        _add_log(job, "Starting optimizer...")
        fn = functools.partial(run_optimizer, simulator_engine,
                               request.model_name, request.folder, progress_cb,
                               request.optimizer_override)
        asyncio.create_task(_run_optimizer_job(job_id, fn))
        return {'success': True, 'job_id': job_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"run_yaml_optimization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/optimizer/status/{job_id}")
async def get_optimizer_status(job_id: str):
    """轮询优化任务进度"""
    if job_id not in optimizer_jobs:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    job = optimizer_jobs[job_id]
    return {
        'job_id': job_id,
        'status': job['status'],
        'history': list(job['history']),
        'logs': list(job['logs']),
        'result': job.get('result'),
        'error': job.get('error'),
        'elapsed': _time() - job.get('start_time', _time()),
        'iteration': len(job['history']),
        'method': job.get('method', ''),
        'job_type': job.get('job_type', ''),
    }


class ExportModelRequest(BaseModel):
    model_key: str           # path relative to models/, e.g. "papers/paper2/foo.yaml"
    results: Dict[str, Any]  # the optimizer.results block to embed
    flatten_imports: bool = False  # if True, resolve all imports into a single flat YAML


@app.post("/api/optimizer/export-model")
async def export_model_with_results(request: ExportModelRequest):
    """Read model YAML, embed optimizer.results in memory, return YAML text.
    The server file is NEVER modified — this is a stateless operation.
    The client downloads the returned text as a .yaml file.
    If flatten_imports=True, all imported models are merged in first so the
    exported file has no external dependencies.
    """
    try:
        models_root = PROJECT_ROOT / "models"
        target = models_root / request.model_key.lstrip('/')
        if not str(target.resolve()).startswith(str(models_root.resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        if not target.exists():
            raise HTTPException(status_code=404, detail=f"Model file not found: {request.model_key}")

        if request.flatten_imports:
            try:
                from src.model_structure import ModelStructure
                ms = ModelStructure(str(models_root), 'zh')
                data = ms._load_model_data(str(target), request.model_key)
                data.pop('_sources', None)
                data['imports'] = []
            except Exception as flat_err:
                logger.warning(f"flatten_imports failed, falling back to raw load: {flat_err}")
                with open(target, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f) or {}
        else:
            with open(target, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}

        if not isinstance(data.get('optimizer'), dict):
            raise HTTPException(status_code=400, detail="Model has no optimizer: block")

        # Embed results in memory — no disk write
        data['optimizer']['results'] = request.results

        text = yaml.dump(data, allow_unicode=True, default_flow_style=False,
                         sort_keys=False, indent=2)
        name = (data.get('metadata') or {}).get('name', target.stem)
        return {'success': True, 'text': text, 'filename': f"{name}.yaml"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"export_model_with_results error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/optimizer/job/{job_id}")
async def cancel_optimizer_job(job_id: str):
    """标记优化任务为已取消"""
    if job_id not in optimizer_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    optimizer_jobs[job_id]['status'] = 'cancelled'
    _add_log(optimizer_jobs[job_id], "Cancelled by user.")
    return {'success': True}


# ========== Converter 端点 ==========

class ConvertRequest(BaseModel):
    scenario_path: str      # path relative to models/, e.g. "components/medical/dynamics/foo.yaml"
    game_name: str          # basename used for scenarios/to_game/{game_name}/ folder
    health_variable: str


def _detect_pattern(expr: str):
    """简单公式模式识别，返回 (pattern, delta_int)"""
    import re
    s = str(expr).strip()
    # P1: 纯常数
    if re.fullmatch(r'-?\d+(\.\d+)?', s):
        return "P1", round(float(s))
    # P5: 概率 0.xx
    if re.fullmatch(r'0\.\d+', s):
        return "P5", max(-50, round(-float(s) * 100))
    # P6: 含百分比乘法
    if re.search(r'\*\s*0\.', s) or re.search(r'0\.\d+\s*\*', s):
        return "P6", -5
    # P4: 含条件关键词
    if any(kw in s for kw in ('if ', 'else', '>', '<', '>=', '<=')):
        return "P4", -10
    # P2: 累积自增
    if '+=' in s or re.search(r'\+\s*\d', s):
        return "P2", -3
    # P3: 变量乘系数
    return "P3", -8


@app.post("/api/convert")
async def convert_scenario(request: ConvertRequest):
    """将 scenario 自动转换为 game story 文件夹结构"""
    import json
    from datetime import date

    scenario_path = request.scenario_path.lstrip('/')
    game_name     = request.game_name
    health_var    = request.health_variable

    scen_file = PROJECT_ROOT / "models" / scenario_path
    if not scen_file.exists():
        raise HTTPException(status_code=404, detail=f"Model file not found: {scenario_path}")
    if not str(scen_file.resolve()).startswith(str((PROJECT_ROOT / "models").resolve())):
        raise HTTPException(status_code=400, detail="Path outside models/")

    with open(scen_file, 'r', encoding='utf-8') as f:
        scenario = yaml.safe_load(f) or {}

    metadata  = scenario.get("metadata", {})
    variables = scenario.get("variables", {})
    formulas  = scenario.get("formulas", {})
    simulator = scenario.get("simulator", {})

    # total_time → turns (assume ~30 days/turn)
    total_time = simulator.get("total_time", 365)
    total_turns = max(1, round(total_time / 30)) if isinstance(total_time, (int, float)) else 12

    out_dir   = PROJECT_ROOT / "models" / "stories" / game_name
    cards_dir = out_dir / "cards"
    out_dir.mkdir(parents=True, exist_ok=True)
    cards_dir.mkdir(parents=True, exist_ok=True)

    env_cards    = []
    player_cards = []
    variable_to_card  = {}
    formula_patterns  = {}

    # Build a lookup: var_name → list of (formula_key, expr_str)
    var_formula_map: dict = {}
    for fml_key, fml_data in formulas.items():
        for vname, expr in (fml_data.get("dynamics") or {}).items():
            var_formula_map.setdefault(vname, []).append((fml_key, str(expr) if expr is not None else ""))

    for var_name, var_data in variables.items():
        if var_name == health_var:
            continue

        var_type = var_data.get("type", "state")
        display_name = var_data.get("description") or var_name

        if var_type == "input":
            card_id   = f"player_{var_name}"
            card_file = f"cards/{card_id}.yaml"
            card = {
                "id": card_id, "type": "player", "category": "action",
                "display": {"name": display_name, "description": "", "flavor": "", "icon": ""},
                "cost": 2,
                "effects": [{"target": "health", "delta": 5, "condition": None}],
                "channel": "social", "tags": [], "weight": 100,
                "source": {"variable": var_name, "formula": "", "pattern_detected": "P1"},
            }
            with open(cards_dir / f"{card_id}.yaml", 'w', encoding='utf-8') as f:
                yaml.safe_dump(card, f, allow_unicode=True, default_flow_style=False, indent=2)
            player_cards.append({"path": card_file})
            variable_to_card[var_name] = card_file

        elif var_type in ("state", "parameter"):
            pattern = "P1"
            delta   = -5
            formula_expr = ""
            if var_name in var_formula_map:
                fml_key, formula_expr = var_formula_map[var_name][0]
                pattern, delta = _detect_pattern(formula_expr)
                formula_patterns[formula_expr] = pattern

            card_id   = f"env_{var_name}"
            card_file = f"cards/{card_id}.yaml"
            card = {
                "id": card_id, "type": "env", "category": "state",
                "display": {"name": display_name, "description": "", "flavor": "", "icon": ""},
                "pattern": pattern,
                "effects": [{"target": "health", "delta": delta, "condition": None}],
                "debuff": None,
                "channel": "medical", "tags": [], "weight": 100,
                "source": {"variable": var_name, "formula": formula_expr, "pattern_detected": pattern},
            }
            with open(cards_dir / f"{card_id}.yaml", 'w', encoding='utf-8') as f:
                yaml.safe_dump(card, f, allow_unicode=True, default_flow_style=False, indent=2)
            env_cards.append({"path": card_file, "weight": 100})
            variable_to_card[var_name] = card_file

    # health bounds for scale
    hv_data = variables.get(health_var, {})
    bounds  = hv_data.get("bounds", [0, 1])
    h_min   = bounds[0] if len(bounds) > 0 else 0
    h_max   = bounds[1] if len(bounds) > 1 else 1

    game_story = {
        "meta": {
            "name":            metadata.get("name", game_name),
            "description":     metadata.get("description", ""),
            "difficulty":      metadata.get("difficulty", "medium"),
            "tags":            metadata.get("tags", []),
            "author":          metadata.get("author", ""),
            "version":         "0.1",
            "source_scenario": game_name,
            "source_path":     scenario_path,
        },
        "initial_state":  {"health": 100, "money": 10, "status": 1},
        "health_mapping": {
            "source_variable": health_var,
            "scale":           [h_min, h_max, 0, 100],
            "display":         "生命值",
        },
        "turns": {
            "total":             total_turns,
            "time_per_turn":     "1 month",
            "env_cards_per_turn": 2,
            "player_hand_size":  5,
            "action_points":     3,
        },
        "win_condition":  {"type": "survive",     "description": f"撑过 {total_turns} 个回合"},
        "lose_condition": {"type": "health_zero", "description": "生命值归零"},
        "endings": [
            {"grade": "S", "condition": "health >= 50", "title": "优秀"},
            {"grade": "A", "condition": "health > 0",   "title": "幸存"},
            {"grade": "D", "condition": "health <= 0",  "title": "失败"},
        ],
        "env_deck":    env_cards,
        "player_deck": player_cards,
        "generic_cards": {"inject": ["rest", "labor", "interrupt"]},
    }

    with open(out_dir / "game_story.yaml", 'w', encoding='utf-8') as f:
        yaml.safe_dump(game_story, f, allow_unicode=True, default_flow_style=False, indent=2)

    mapping_data = {
        "version":         "1.0",
        "source_scenario": game_name,
        "source_path":     scenario_path,
        "generated_at":    str(date.today()),
        "updated_at":      str(date.today()),
        "health_mapping":  {"source_variable": health_var, "scale": [h_min, h_max, 0, 100]},
        "auto_mappings":   {
            "metadata.name":        "meta.name",
            "metadata.description": "meta.description",
            "metadata.tags":        "meta.tags",
            "simulator.total_time": "turns.total",
        },
        "variable_to_card":  variable_to_card,
        "formula_patterns":  formula_patterns,
        "manual_overrides":  {},
    }

    with open(out_dir / "_mapping.json", 'w', encoding='utf-8') as f:
        json.dump(mapping_data, f, ensure_ascii=False, indent=2)

    logger.info(f"Converted {game_name} (from {scenario_path}): {len(env_cards)} env cards, {len(player_cards)} player cards")
    return {
        "success":      True,
        "env_cards":    len(env_cards),
        "player_cards": len(player_cards),
        "message":      f"生成完成：{len(env_cards)} 张环境牌，{len(player_cards)} 张玩家牌",
    }


# 运行服务器
if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("Pre-startup check: Starting Uvicorn on 127.0.0.1:18080")
    print("="*50 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=18080)
