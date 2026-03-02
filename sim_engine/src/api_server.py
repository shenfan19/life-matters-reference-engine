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

# ========== 路径配置 ==========
CURRENT_FILE = Path(__file__).resolve()
SRC_DIR = CURRENT_FILE.parent
BACKEND_DIR = SRC_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

# 添加到 Python 路径
sys.path.insert(0, str(SRC_DIR))
sys.path.insert(0, str(BACKEND_DIR))

# 配置日志
log_file = PROJECT_ROOT / "mods" / "models" / "_output" / "api_debug.log"
# Ensure directory exists
log_file.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:%(name)s:%(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(str(log_file), mode='w', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)

# 全局实例
plugin_manager = None
loader_engine = None
simulator_engine = None
optimizer_engine = None


# ========== 寿命周期事件 ==========
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用寿命周期管理：包含启动初始化逻辑"""
    global plugin_manager, loader_engine, simulator_engine, optimizer_engine
    
    logger.info("=" * 60)
    logger.info("Initializing LifeMatters Backend (via Lifespan Handler)...")
    logger.info(f"PROJECT_ROOT: {PROJECT_ROOT}")
    logger.info("=" * 60)
    
    # 初始化插件系统
    try:
        from sim_engine.src.plugin_manager import PluginManager
        
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
    
    # 初始化 Mods 系统
    try:
        from sim_engine.src.loader_engine import LoaderEngine
        
        mods_dir = PROJECT_ROOT / "mods"
        logger.info(f"Mods directory: {mods_dir}")
        
        if not mods_dir.exists():
            mods_dir.mkdir(parents=True, exist_ok=True)
        
        loader_engine = LoaderEngine(mods_directory=str(mods_dir))
        logger.info(f"✅ Mods system initialized")
        
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
        logger.error(f"❌ Error initializing mods: {e}")
        loader_engine = None
    
    # 初始化仿真与优化引擎
    try:
        from sim_engine.src.simulator_engine import SimulatorEngine
        from sim_engine.src.optimizer_engine import OptimizerEngine
        
        mods_dir = PROJECT_ROOT / "mods"
        simulator_engine = SimulatorEngine(mods_directory=str(mods_dir))
        optimizer_engine = OptimizerEngine(mods_directory=str(mods_dir))
        
        # 注入仿真器到优化器
        optimizer_engine.set_simulator(simulator_engine)
        
        logger.info(f"✅ Simulation & Optimization systems initialized")
    except Exception as e:
        logger.error(f"❌ Error initializing simulation/optimization: {e}")
        simulator_engine = None
        optimizer_engine = None
    
    logger.info("=" * 60)
    logger.info("Backend initialization complete")
    logger.info("=" * 60)
    
    yield
    
    logger.info("Shutting down LifeMatters Backend...")


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


class SplitRequest(BaseModel):
    file_path: str
    output_dir: str = "default_split"


class SimulationStartRequest(BaseModel):
    model_name: str
    folder: Optional[str] = None
    time_hours: float = 24.0
    step_size: Optional[float] = None
    input_params: Optional[Dict[str, float]] = None


class SimulationStepRequest(BaseModel):
    session_id: str
    steps: int = 1
    input_changes: Optional[Dict[str, float]] = None


class SessionRequest(BaseModel):
    session_id: str


class OptimizationRequest(BaseModel):
    model_names: List[str]
    folder: Optional[str] = None
    mode: str = "full_params"
    method: str = "grid"
    time_hours: float = 720.0


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
    return {
        "status": "healthy",
        "components": {
            "plugin_manager": plugin_manager is not None,
            "loader_engine": loader_engine is not None
        },
        "plugins_loaded": len(plugin_manager.plugins) if plugin_manager else 0,
        "mods_directory": str(PROJECT_ROOT / "mods"),
        "mods_exists": (PROJECT_ROOT / "mods").exists()
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
            result = plugin_manager.run_plugin(
                plugin_id=plugin_id,
                inputs=payload.get('inputs', {}),
                context=None
            )
            return result
        else:
            # 未来可以扩展支持其他 endpoint
            raise HTTPException(status_code=404, detail=f"Endpoint {endpoint} not supported")
    except Exception as e:
        logger.error(f"Error calling plugin backend {plugin_id}/{endpoint}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Mods 端点 ==========
@app.get("/api/mods")
async def list_mods(folder: str = None):
    """获取所有模型列表"""
    if loader_engine is None:
        return {"models": [], "message": "Mods system not initialized"}
    
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
        logger.error(f"Error listing mods: {e}")
        return {"models": [], "error": str(e)}


@app.get("/api/mods/{model_name}")
async def get_mod(model_name: str, folder: str = None):
    """获取单个模型详情"""
    if loader_engine is None:
        raise HTTPException(status_code=503, detail="Mods system not initialized")
    
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
            
        model = loader_engine.fetch(model_name, folder)
        
        return {
            "metadata": {
                "name": model.metadata.name if model.metadata else "",
                "version": model.metadata.version if model.metadata else "",
                "author": model.metadata.author if model.metadata else "",
                "description": model.metadata.description if model.metadata else ""
            },
            "variables": {
                var_name: {
                    "description": var.description,
                    "value": var.value,
                    "unit": var.unit,
                    "type": var.type.value if hasattr(var.type, 'value') else str(var.type)
                }
                for var_name, var in model.variables.items()
            },
            "formulas": {
                f_name: {
                    "description": f.description,
                    "dynamics": f.dynamics
                }
                for f_name, f in model.formulas.items()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting mod: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
                                file_metadata['mod_type'] = data.get('type', 'unknown')
                                file_metadata['category'] = data.get('category', 'unknown')
                                file_metadata['description'] = data.get('description', '')
                                file_metadata['difficulty'] = data.get('difficulty', '')
                                file_metadata['levels'] = data.get('levels', [])
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
        mods_dir = PROJECT_ROOT / "mods"
        tree = [{
            'title': 'mods',
            'key': 'mods',
            'type': 'folder',
            'children': build_tree(str(mods_dir))
        }]
        
        return {'success': True, 'data': tree}
    except Exception as e:
        logger.error(f"Error getting file tree: {e}")
        return {'success': False, 'error': str(e)}


@app.get("/api/file/{file_path:path}")
async def get_file_content(file_path: str):
    """读取单个 YAML 文件内容"""
    try:
        logger.info(f"读取文件: {file_path}")
        
        # 使用 LoaderEngine 加载
        if loader_engine:
            try:
                # 首先处理路径和模型名
                # 如果是新结构路径 (如 stories/xxx.yaml)，直接作为 model_name，folder 传 None
                if file_path.startswith(('models/', 'stories/', 'scenarios/', 'models\\', 'stories\\', 'scenarios\\')):
                    folder = None
                    # 移除 .yaml 扩展名
                    model_name = file_path
                    if model_name.endswith(('.yaml', '.yml')):
                        model_name = os.path.splitext(model_name)[0]
                else:
                    # 向后兼容：旧的拆分逻辑
                    parts = file_path.split('/')
                    if len(parts) > 1:
                        folder = parts[0]
                        model_name = '/'.join(parts[1:])
                    else:
                        folder = None
                        model_name = parts[0]
                    # 移除 .yaml 扩展名
                    if model_name.endswith(('.yaml', '.yml')):
                        model_name = os.path.splitext(model_name)[0]
                
                # 首先读取原始 YAML 文件以获取 type 和 category
                yaml_file = PROJECT_ROOT / "mods" / file_path
                if not yaml_file.suffix:
                    yaml_file = yaml_file.with_suffix('.yaml')
                
                raw_data = {}
                if yaml_file.exists():
                    with open(yaml_file, 'r', encoding='utf-8') as f:
                        raw_data = yaml.safe_load(f) or {}
                
                # 然后使用 LoaderEngine 加载合并后的模型
                model = loader_engine.fetch(model_name, folder)
                if not model:
                    raise HTTPException(status_code=404, detail=f"Model not found: {file_path}")
                
                content = {
                    'type': raw_data.get('type', 'unknown'),
                    'category': raw_data.get('category', 'unknown'),
                    'metadata': {
                        'name': model.metadata.name if model.metadata else '',
                        'version': model.metadata.version if model.metadata else '',
                        'author': model.metadata.author if model.metadata else '',
                        'description': model.metadata.description if model.metadata else '',
                        'tags': model.metadata.tags if model.metadata else []
                    },
                    'imports': raw_data.get('imports', []),
                    'variables': {
                        var_name: {
                            'description': var.description,
                            'value': var.value,
                            'unit': var.unit,
                            'type': var.type.value if hasattr(var.type, 'value') else str(var.type),
                            'bounds': var.bounds
                        }
                        for var_name, var in model.variables.items()
                    },
                    'formulas': {
                        formula_name: {
                            'description': formula.description,
                            'condition': formula.description,
                            'priority': formula.priority,
                            'dynamics': formula.dynamics
                        }
                        for formula_name, formula in model.formulas.items()
                    },
                    'simulator': model.simulator,
                    'optimizer': model.optimizer
                }
                
                return {
                    'success': True,
                    'data': {
                        'path': file_path,
                        'content': content
                    }
                }
            except Exception as e:
                logger.error(f"LoaderEngine failed: {e}")
                # 降级到直接读取
        
        # 降级方案：直接读取 YAML
        yaml_file = PROJECT_ROOT / "mods" / file_path
        if not yaml_file.suffix:
            yaml_file = yaml_file.with_suffix('.yaml')
        
        if not yaml_file.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        
        with open(yaml_file, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        
        return {
            'success': True,
            'data': {
                'path': file_path,
                'content': data
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Merge 端点 ==========
@app.post("/api/merge")
async def merge_models(request: MergeRequest):
    """合并模型"""
    if loader_engine is None:
        raise HTTPException(status_code=503, detail="Mods system not initialized")
    
    try:
        result = loader_engine.merge_models(
            model_names=request.files,
            folders=request.folders,
            # Ensure output path is relative to mods directory
            output_path=str(PROJECT_ROOT / "mods" / request.output_path) if request.output_path and not os.path.isabs(request.output_path) else request.output_path
        )
        
        if result['success']:
            return {
                'success': True,
                'data': {
                    'variables': result['variables'],
                    'formulas': result['formulas'],
                    'output_path': request.output_path
                }
            }
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Merge failed'))
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Merge error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Validate 端点 ==========
@app.post("/api/validate")
async def validate_model(request: ValidateRequest):
    """验证模型"""
    if loader_engine is None:
        raise HTTPException(status_code=503, detail="Mods system not initialized")
    
    try:
        # Determine files to validate
        files_to_validate = []
        if request.files:
            files_to_validate = request.files
        elif request.file_path:
            files_to_validate = [request.file_path]
        else:
            raise HTTPException(status_code=400, detail="Either file_path or files must be provided")

        if not files_to_validate:
            raise HTTPException(status_code=400, detail="No files provided for validation")
        
        logger.info(f"Validating models: {files_to_validate}")

        # Reuse merge logic to load multiple files into one model structure for validation
        # If only one file, it behaves like a normal load
        # Use merge_models to combine them in memory
        merge_result = loader_engine.merge_models(
            model_names=files_to_validate, 
            folders=None,
            output_path=None # In-memory merge
        )

        if not merge_result['success']:
             logger.error(f"Merge failed: {merge_result.get('error')}")
             raise ValueError(f"Failed to load/merge models for validation: {merge_result.get('error')}")
        
        model = merge_result['data']
        logger.info(f"Merged model has {len(model.variables)} vars and {len(model.formulas)} formulas")

        # 验证模型
        try:
            # Determine output directory for patch
            patch_dir = PROJECT_ROOT / "mods" / "models" / "_output" / "patch"
            model.validate_model(output_dir=str(patch_dir))
            logger.info("Validation successful")
            return {
                'success': True,
                'data': {
                    'valid': True,
                    'variables': len(model.variables),
                    'formulas': len(model.formulas)
                }
            }
        except ValueError as e:
            logger.warning(f"Validation failed: {e}")
            # Check if patch was generated
            # Use the name of the first file as base for patch name if model name is generic
            base_name = os.path.splitext(os.path.basename(files_to_validate[0]))[0]
            patch_filename = f"{base_name}_patch.yaml"
            patch_path = PROJECT_ROOT / "mods" / "models" / "_output" / "patch" / patch_filename
            relative_patch_path = f"models/_output/patch/{patch_filename}"
            
            return {
                'success': False,
                'data': {
                    'valid': False,
                    'errors': [str(e)],
                    'patch_file': relative_patch_path if patch_path.exists() else None
                }
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== Split 端点 ==========
@app.post("/api/split")
async def split_model(request: SplitRequest):
    """拆分模型"""
    if loader_engine is None:
        raise HTTPException(status_code=503, detail="Mods system not initialized")
    
    try:
        file_path = request.file_path
        output_dir = request.output_dir
        
        # Ensure output dir is relative to mods directory
        if output_dir and not os.path.isabs(output_dir):
            full_output_dir = str(PROJECT_ROOT / "mods" / output_dir)
        else:
            full_output_dir = output_dir

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
                elif (item.endswith('.yaml') or item.endswith('.yml')) and keyword in item.lower():
                    results.append({
                        'title': item,
                        'key': relative_path,
                        'path': relative_path,
                        'type': 'file'
                    })
        except Exception as e:
            logger.error(f"Search error in {directory}: {e}")
    
    try:
        mods_dir = PROJECT_ROOT / "mods"
        search_in_dir(str(mods_dir))
        return {'success': True, 'data': results}
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {'success': False, 'error': str(e)}


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
        mods_dir = PROJECT_ROOT / "mods"
        collect_folders(str(mods_dir))
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
        result = simulator_engine.start_session(
            model_name=request.model_name,
            folder=request.folder,
            time_hours=request.time_hours,
            step_size=request.step_size,
            input_params=request.input_params
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
@app.post("/api/optimizer/run")
async def run_optimization(request: OptimizationRequest):
    """运行优化"""
    if optimizer_engine is None:
        raise HTTPException(status_code=503, detail="Optimizer engine not initialized")
    
    try:
        # 加载模型
        success = optimizer_engine.load_models(request.model_names, request.folder)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to load models for optimization")
        
        # 执行优化
        result = optimizer_engine.optimize(
            mode=request.mode,
            method=request.method,
            time_hours=request.time_hours
        )
        
        if result['success']:
            return result
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Optimization failed'))
            
    except Exception as e:
        logger.error(f"Error in optimization: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# 运行服务器
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)