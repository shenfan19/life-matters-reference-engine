"""Shared filesystem layout — single source of truth for both the GUI backend
(api_server.py via app_state.py) and the CLI (cli/main.py, batch.py).

Reads an optional `.env` file at the project root (see `.env.example`), then
falls back to OS environment variables, then to the defaults below.
"""

import os
import sys
from pathlib import Path

CURRENT_FILE = Path(__file__).resolve()
SRC_DIR = CURRENT_FILE.parent
BACKEND_DIR = SRC_DIR.parent


def _detect_project_root() -> Path:
    """__file__-based resolution breaks once the CLI ships as a PyInstaller exe
    (cli/build.spec): reference_engine/src is bundled inside the exe, so
    BACKEND_DIR.parent no longer points at the directory the user actually
    deployed (docs/cli.md: ship models/ — and now .env — alongside the exe).
    Mirrors the same sys.frozen check cli/main.py and batch.py already do.
    """
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return BACKEND_DIR.parent


PROJECT_ROOT = _detect_project_root()

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / '.env')
except ImportError:
    pass

MODELS_DIR = Path(os.getenv("LM_MODELS_PATH", str(PROJECT_ROOT / "models")))
OUTPUT_DIR = Path(os.getenv("LM_OUTPUT_PATH", str(PROJECT_ROOT / "output")))
SCS_MODE = os.getenv("SCS_MODE", "false").lower() == "true"

# P1/P2 公网部署资源保护（2026-06-25_task_prelaunch-publish-verification-checklist.md §4）：
# 全局并发上限，防止多用户同时跑大规模优化/仿真耗尽服务器资源。第 N+1 个请求返回 503，
# 前端可提示"服务繁忙，请稍后重试"，而不是悄悄排队或让机器过载。
MAX_CONCURRENT_OPTS = int(os.getenv("LM_MAX_CONCURRENT_OPTS", "2"))
MAX_CONCURRENT_SIMS = int(os.getenv("LM_MAX_CONCURRENT_SIMS", "5"))
