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

def _resolve_env_path(env_var: str, default: Path) -> Path:
    """A relative value must resolve against PROJECT_ROOT, not the process's
    cwd — the GUI backend (cwd = reference_engine/) and the CLI (cwd = wherever
    invoked) would otherwise resolve the same .env value to different places.
    """
    raw = os.getenv(env_var)
    return (PROJECT_ROOT / raw) if raw else default


MODELS_DIR = _resolve_env_path("LM_MODELS_PATH", PROJECT_ROOT / "models")
OUTPUT_DIR = _resolve_env_path("LM_OUTPUT_PATH", PROJECT_ROOT / "output")
SCS_MODE = os.getenv("SCS_MODE", "false").lower() == "true"

# A P1/P2 resource protection for public deployment (2026-06-25_task_prelaunch-publish-verification-checklist.md §4):
# a global concurrency cap, preventing multiple users from running large-scale optimizations/
# simulations at once and exhausting the server. The (N+1)th request returns 503, letting the
# frontend show "the server is busy, please retry later" instead of silently queuing or
# overloading the machine.
MAX_CONCURRENT_OPTS = int(os.getenv("LM_MAX_CONCURRENT_OPTS", "2"))
MAX_CONCURRENT_SIMS = int(os.getenv("LM_MAX_CONCURRENT_SIMS", "5"))

# The deployment environment's public-facing address (an IP or domain), added to the CORS
# allow_origins whitelist. Comma-separated, multiple values allowed. Not hardcoded in
# api_server.py, since that source file is shared by local development and anyone's own
# self-deployment and shouldn't be welded to one specific server's address; a value specific to
# this machine is written here instead (.env), not in the source code.
EXTRA_CORS_ORIGINS = [o.strip() for o in os.getenv("LM_EXTRA_CORS_ORIGINS", "").split(",") if o.strip()]

# A private query token for the anonymous visit counter (routes/visits.py): a random string in
# the URL path, not hardcoded in the source. When unconfigured, the stats endpoint returns a
# blanket 404, not exposing the fact that a stats endpoint even exists.
STATS_TOKEN = os.getenv("LM_STATS_TOKEN", "")
