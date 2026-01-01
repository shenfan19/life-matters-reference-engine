"""
LifeMatters Backend - FastAPI (完整版)
合并了原 api_server.py 的所有功能
"""

from fastapi import FastAPI, HTTPException
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
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:%(name)s:%(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(title="LifeMatters API", version="0.3.0")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局实例
plugin_manager = None
loader_engine = None


# ========== Pydantic 模型（请求体定义）==========
class MergeRequest(BaseModel):
    folders: Optional[List[str]] = None
    files: Optional[List[str]] = None
    output_path: Optional[str] = None


class ValidateRequest(BaseModel):
    file_path: str


class SplitRequest(BaseModel):
    file_path: str
    output_dir: str = "default_split"


# ========== 启动事件 ==========
@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    global plugin_manager, loader_engine
    
    logger.info("=" * 60)
    logger.info("Initializing LifeMatters Backend...")
    logger.info(f"PROJECT_ROOT: {PROJECT_ROOT}")
    logger.info("=" * 60)
    
    # 初始化插件系统
    try:
        from src.core.plugin_manager import PluginManager
        
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
        from backend.src.loader_engine import LoaderEngine
        
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
    
    logger.info("=" * 60)
    logger.info("Backend initialization complete")
    logger.info("=" * 60)


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
        return {
            "plugins": plugin_manager.get_plugin_list(),
            "total": len(plugin_manager.plugins)
        }
    except Exception as e:
        logger.error(f"Error listing plugins: {e}")
        return {"plugins": [], "error": str(e)}


@app.post("/api/plugins/{plugin_id}/run")
async def run_plugin(plugin_id: str, payload: dict):
    """执行插件"""
    if plugin_manager is None:
        raise HTTPException(status_code=503, detail="Plugin system not initialized")
    
    try:
        result = plugin_manager.run_plugin(
            plugin_id=plugin_id,
            inputs=payload.get('inputs', {}),
            context=None
        )
        return result
    except Exception as e:
        logger.error(f"Error running plugin {plugin_id}: {e}")
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
        model = loader_engine.fetch(model_name, folder)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        
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
    """获取文件树结构"""
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
                    if item in ['merged', 'splited', 'output', '__pycache__', '.git']:
                        continue
                    
                    children = build_tree(item_path, relative_path)
                    if children:
                        items.append({
                            'title': item,
                            'key': relative_path,
                            'type': 'folder',
                            'children': children
                        })
                elif item.endswith('.yaml') or item.endswith('.yml'):
                    items.append({
                        'title': item,
                        'key': relative_path,
                        'type': 'file',
                        'isLeaf': True
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
        
        # 解析路径
        parts = file_path.split('/')
        if len(parts) > 1:
            folder = parts[0]
            model_name = '/'.join(parts[1:])
        else:
            folder = None
            model_name = parts[0]
        
        # 移除 .yaml 扩展名
        if model_name.endswith('.yaml') or model_name.endswith('.yml'):
            model_name = os.path.splitext(model_name)[0]
        
        # 使用 LoaderEngine 加载
        if loader_engine:
            try:
                model = loader_engine.fetch(model_name, folder)
                if not model:
                    raise HTTPException(status_code=404, detail=f"Model not found: {file_path}")
                
                content = {
                    'metadata': {
                        'name': model.metadata.name if model.metadata else '',
                        'version': model.metadata.version if model.metadata else '',
                        'author': model.metadata.author if model.metadata else '',
                        'description': model.metadata.description if model.metadata else ''
                    },
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
                            'condition': formula.condition,
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
            output_path=request.output_path
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
        file_path = request.file_path
        
        # 解析路径
        if '/' in file_path:
            parts = file_path.split('/')
            folder = parts[0]
            model_name = '/'.join(parts[1:])
        else:
            folder = None
            model_name = file_path
        
        # 移除扩展名
        if model_name.endswith('.yaml') or model_name.endswith('.yml'):
            model_name = os.path.splitext(model_name)[0]
        
        # 加载模型
        model = loader_engine.fetch(model_name, folder)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        # 验证模型
        try:
            model.validate_model()
            return {
                'success': True,
                'data': {
                    'valid': True,
                    'variables': len(model.variables),
                    'formulas': len(model.formulas)
                }
            }
        except ValueError as e:
            return {
                'success': False,
                'data': {
                    'valid': False,
                    'errors': [str(e)]
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
        
        # 解析路径
        if '/' in file_path:
            parts = file_path.split('/')
            folder = parts[0]
            model_name = '/'.join(parts[1:])
        else:
            folder = None
            model_name = file_path
        
        if model_name.endswith('.yaml') or model_name.endswith('.yml'):
            model_name = os.path.splitext(model_name)[0]
        
        # 调用 split_model
        result = loader_engine.split_model(model_name, output_dir, folder)
        
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
                    if item in ['merged', 'splited', 'output', '__pycache__']:
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


# 运行服务器
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)