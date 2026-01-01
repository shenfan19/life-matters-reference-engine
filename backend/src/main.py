"""
LifeMatters Backend - FastAPI Entry Point
插件系统核心服务
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(title="LifeMatters API", version="0.1.0")

# CORS 配置（允许前端访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite 默认端口
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局实例
plugin_manager = None


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    global plugin_manager
    
    logger.info("Initializing LifeMatters Backend...")
    
    try:
        # 尝试导入 PluginManager
        from src.core.plugin_manager import PluginManager
        
        # 初始化插件管理器
        plugin_manager = PluginManager(plugin_dir="plugins")
        logger.info(f"Loaded {len(plugin_manager.plugins)} plugins")
        
    except ImportError as e:
        logger.warning(f"Failed to import PluginManager: {e}")
        logger.info("Running in minimal mode (no plugins)")
        plugin_manager = None
    
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        plugin_manager = None
    
    logger.info("Backend initialized successfully")


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
        # 如果 PluginManager 未初始化，返回空列表
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
        # TODO: 需要实现 context
        result = plugin_manager.run_plugin(
            plugin_id=plugin_id,
            inputs=payload.get('inputs', {}),
            context=None  # 临时传 None
        )
        return result
    
    except Exception as e:
        logger.error(f"Error running plugin {plugin_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    """详细健康检查"""
    return {
        "status": "healthy",
        "components": {
            "plugin_manager": plugin_manager is not None
        },
        "plugins_loaded": len(plugin_manager.plugins) if plugin_manager else 0
    }


# 运行服务器
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)