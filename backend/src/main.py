"""
LifeMatters Backend - FastAPI Entry Point
插件系统核心服务
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging
import sys

# ========== 路径配置 ==========
# 获取当前文件的绝对路径
CURRENT_FILE = Path(__file__).resolve()      # .../backend/src/main.py
SRC_DIR = CURRENT_FILE.parent                # .../backend/src/
BACKEND_DIR = SRC_DIR.parent                 # .../backend/
PROJECT_ROOT = BACKEND_DIR.parent            # .../项目根目录/

# 添加到 Python 路径
sys.path.insert(0, str(SRC_DIR))            # 让 'from src.xxx' 能工作
sys.path.insert(0, str(BACKEND_DIR))        # 让 'from src.xxx' 能工作

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:%(name)s:%(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(title="LifeMatters API", version="0.1.0")

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


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    global plugin_manager, loader_engine
    
    logger.info("=" * 60)
    logger.info("Initializing LifeMatters Backend...")
    logger.info(f"CURRENT_FILE: {CURRENT_FILE}")
    logger.info(f"SRC_DIR: {SRC_DIR}")
    logger.info(f"BACKEND_DIR: {BACKEND_DIR}")
    logger.info(f"PROJECT_ROOT: {PROJECT_ROOT}")
    logger.info("=" * 60)
    
    # ========== 初始化插件系统 ==========
    try:
        # 使用正确的导入路径
        from backend.src.core.plugin_manager import PluginManager
        
        plugins_dir = PROJECT_ROOT / "plugins"
        logger.info(f"Plugins directory: {plugins_dir}")
        logger.info(f"Plugins exists: {plugins_dir.exists()}")
        
        if not plugins_dir.exists():
            logger.warning(f"Creating plugins directory: {plugins_dir}")
            plugins_dir.mkdir(parents=True, exist_ok=True)
        
        plugin_manager = PluginManager(plugin_dir=str(plugins_dir))
        logger.info(f"✅ Plugin system initialized")
        logger.info(f"   Loaded {len(plugin_manager.plugins)} plugins")
        
        for plugin_id, info in plugin_manager.plugins.items():
            logger.info(f"   - {info['manifest']['name']} ({plugin_id})")
        
    except ImportError as e:
        logger.error(f"❌ Failed to import PluginManager: {e}")
        logger.error(f"   sys.path: {sys.path[:3]}")
        plugin_manager = None
    except Exception as e:
        logger.error(f"❌ Error initializing plugins: {e}")
        import traceback
        logger.error(traceback.format_exc())
        plugin_manager = None
    
    # ========== 初始化 Mods 系统 ==========
    try:
        from backend.src.loader.loader_engine import LoaderEngine
        
        mods_dir = PROJECT_ROOT / "mods"
        logger.info(f"Mods directory: {mods_dir}")
        logger.info(f"Mods exists: {mods_dir.exists()}")
        
        if not mods_dir.exists():
            logger.warning(f"Creating mods directory: {mods_dir}")
            mods_dir.mkdir(parents=True, exist_ok=True)
        
        loader_engine = LoaderEngine(mods_directory=str(mods_dir))
        logger.info(f"✅ Mods system initialized")
        
        # 扫描模型
        try:
            models = loader_engine.scan_models()
            logger.info(f"   Found {len(models)} models")
            
            # 显示前5个模型
            for i, name in enumerate(list(models.keys())[:5]):
                logger.info(f"   - {name}")
            if len(models) > 5:
                logger.info(f"   ... and {len(models) - 5} more")
                
        except Exception as e:
            logger.warning(f"   Failed to scan models: {e}")
        
    except ImportError as e:
        logger.error(f"❌ Failed to import LoaderEngine: {e}")
        logger.error(f"   sys.path: {sys.path[:3]}")
        loader_engine = None
    except Exception as e:
        logger.error(f"❌ Error initializing mods: {e}")
        import traceback
        logger.error(traceback.format_exc())
        loader_engine = None
    
    logger.info("=" * 60)
    logger.info("Backend initialization complete")
    logger.info("=" * 60)


@app.get("/")
async def root():
    """健康检查"""
    return {
        "status": "ok",
        "service": "LifeMatters API",
        "version": "0.1.0"
    }


@app.get("/api/plugins")
async def list_plugins():
    """获取所有插件列表"""
    if plugin_manager is None:
        return {
            "plugins": [],
            "message": "Plugin system not initialized"
        }
    
    try:
        return {
            "plugins": plugin_manager.get_plugin_list(),
            "total": len(plugin_manager.plugins)
        }
    except Exception as e:
        logger.error(f"Error listing plugins: {e}")
        return {
            "plugins": [],
            "error": str(e)
        }


@app.post("/api/plugins/{plugin_id}/run")
async def run_plugin(plugin_id: str, payload: dict):
    """执行插件"""
    if plugin_manager is None:
        raise HTTPException(
            status_code=503,
            detail="Plugin system not initialized"
        )
    
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


@app.get("/api/mods")
async def list_mods(folder: str = None):
    """获取所有模型列表"""
    if loader_engine is None:
        return {
            "models": [],
            "message": "Mods system not initialized"
        }
    
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
        return {
            "models": [],
            "error": str(e)
        }


@app.get("/api/mods/{model_name}")
async def get_mod(model_name: str, folder: str = None):
    """获取单个模型详情"""
    if loader_engine is None:
        raise HTTPException(
            status_code=503,
            detail="Mods system not initialized"
        )
    
    try:
        model = loader_engine.fetch(model_name, folder)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        return {
            "metadata": {
                "name": model.metadata.name,
                "version": model.metadata.version,
                "author": model.metadata.author,
                "description": model.metadata.description
            },
            "variables": model.variables,
            "formulas": model.formulas,
            "simulator": model.simulator
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching mod {model_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    """详细健康检查"""
    plugins_loaded = len(plugin_manager.plugins) if plugin_manager else 0
    
    mods_loaded = 0
    if loader_engine:
        try:
            models = loader_engine.scan_models()
            mods_loaded = len(models)
        except:
            pass
    
    return {
        "status": "healthy",
        "components": {
            "plugin_manager": plugin_manager is not None,
            "loader_engine": loader_engine is not None
        },
        "plugins_loaded": plugins_loaded,
        "mods_loaded": mods_loaded,
        "paths": {
            "project_root": str(PROJECT_ROOT),
            "backend_dir": str(BACKEND_DIR),
            "src_dir": str(SRC_DIR),
            "plugins": str(PROJECT_ROOT / "plugins"),
            "mods": str(PROJECT_ROOT / "mods")
        }
    }


# 运行服务器
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)