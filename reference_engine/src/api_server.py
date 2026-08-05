"""
LifeMatters Backend - FastAPI
"""

from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import sys

import app_state
from app_state import PROJECT_ROOT, SRC_DIR, BACKEND_DIR, MODELS_DIR
from paths import EXTRA_CORS_ORIGINS

# ── sys.path setup ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(SRC_DIR))
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:%(name)s:%(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


# ── Idle session cleanup (P0, public deployment) ────────────────────────────────
# Sweep interval shorter than the 30-min idle timeout so a zombie session isn't
# left alive much past its deadline; independent of app_state.optimizer_jobs.
SESSION_CLEANUP_INTERVAL_SECONDS = 300

async def _session_cleanup_loop():
    while True:
        await asyncio.sleep(SESSION_CLEANUP_INTERVAL_SECONDS)
        if app_state.engine is not None:
            try:
                app_state.engine.cleanup_stale_sessions()
            except Exception as e:
                logger.error(f"清理僵尸会话失败: {e}")


# ── Lifespan: initialize engines ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("Initializing LifeMatters Backend (via Lifespan Handler)...")
    logger.info(f"PROJECT_ROOT: {PROJECT_ROOT}")
    logger.info("=" * 60)

    # Plugin system
    try:
        from src.plugin_manager import PluginManager
        plugins_dir = PROJECT_ROOT / "plugins"
        if not plugins_dir.exists():
            plugins_dir.mkdir(parents=True, exist_ok=True)
        app_state.plugin_manager = PluginManager(plugin_dir=str(plugins_dir))
        logger.info(f"✅ Plugin system initialized ({len(app_state.plugin_manager.plugins)} plugins)")
        for pid, info in app_state.plugin_manager.plugins.items():
            logger.info(f"   - {info['manifest']['name']} ({pid})")
    except Exception as e:
        logger.error(f"❌ Plugin system error: {e}")
        app_state.plugin_manager = None

    # Loader / Models
    try:
        from src.loader_engine import LoaderEngine
        models_dir = MODELS_DIR
        if not models_dir.exists():
            models_dir.mkdir(parents=True, exist_ok=True)
        app_state.loader_engine = LoaderEngine(models_directory=str(models_dir))
        logger.info("✅ Models system initialized")
        try:
            models = app_state.loader_engine.scan_models()
            logger.info(f"   Found {len(models)} models")
            for name in list(models.keys())[:5]:
                logger.info(f"   - {name}")
            if len(models) > 5:
                logger.info(f"   ... and {len(models) - 5} more")
        except Exception as e:
            logger.warning(f"   Failed to scan models: {e}")
    except Exception as e:
        logger.error(f"❌ Models system error: {e}")
        app_state.loader_engine = None

    # Reference Engine (sim + opt orchestrator)
    try:
        from src.reference_engine import ReferenceEngine
        app_state.engine = ReferenceEngine(models_directory=str(MODELS_DIR))
        logger.info("✅ Simulation system initialized")
    except Exception as e:
        logger.error(f"❌ Simulation system error: {e}")
        app_state.engine = None

    logger.info("=" * 60)
    logger.info("Backend initialization complete")
    logger.info("=" * 60)

    cleanup_task = asyncio.create_task(_session_cleanup_loop())
    yield
    cleanup_task.cancel()
    logger.info("Shutting down LifeMatters Backend...")


# ── App + CORS ──────────────────────────────────────────────────────────────────
app = FastAPI(title="LifeMatters API", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", *EXTRA_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core endpoints (health) ─────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "ok", "service": "LifeMatters API", "version": "0.3.0"}


@app.get("/api/health")
async def health_check():
    active_jobs = sum(1 for j in app_state.optimizer_jobs.values() if j.get('status') == 'running')
    return {
        "status": "healthy",
        "components": {
            "plugin_manager": app_state.plugin_manager is not None,
            "loader_engine": app_state.loader_engine is not None
        },
        "plugins_loaded": len(app_state.plugin_manager.plugins) if app_state.plugin_manager else 0,
        "models_directory": str(MODELS_DIR),
        "models_exists": MODELS_DIR.exists(),
        "active_opt_jobs": active_jobs,
    }


# ── Route modules ───────────────────────────────────────────────────────────────
from routes.plugins import router as plugins_router
from routes.models import router as models_router
from routes.files import router as files_router
from routes.simulation import router as simulation_router
from routes.optimizer import router as optimizer_router
from routes.converter import router as converter_router

app.include_router(plugins_router)
app.include_router(models_router)
app.include_router(files_router)
app.include_router(simulation_router)
app.include_router(optimizer_router)
app.include_router(converter_router)


# ── Run ─────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("Pre-startup check: Starting Uvicorn on 127.0.0.1:18080")
    print("="*50 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=18080)
