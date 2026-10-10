import os
from typing import Any, Dict, Optional


class PluginContext:
    """Plugin ↔ LM core interface.

    Plugins run in stateless request-response mode: they receive sim data via
    ``inputs`` and return results. This context provides logging, caching, and
    optional active sim calls for plugins that need to re-run the engine.
    """

    def __init__(self, engine=None, loader=None):
        # Optional[ReferenceEngine] — injected by api_server at call time
        self._engine = engine
        # Optional[LoaderEngine] — used by load_model
        self._loader = loader
        self._cache: Dict[str, Any] = {}

    # ── logging ──────────────────────────────────────────────────────────────

    def log(self, message: str) -> None:
        print(f"[Plugin] {message}")

    # ── cache (per-request, not persistent) ──────────────────────────────────

    def get_cached(self, key: str) -> Optional[Any]:
        return self._cache.get(key)

    def set_cached(self, key: str, value: Any) -> None:
        self._cache[key] = value

    # ── model access ──────────────────────────────────────

    def load_model(self, path: str) -> Dict:
        """Loads a model by its path relative to the models directory, imports resolved.

        Returns the same shape as ``GET /api/models/{name}``. Absolute paths and
        ``..`` are refused, so a plugin request cannot read outside models/.
        """
        from src.model_serialization import model_to_dict
        if self._loader is None:
            raise RuntimeError("LoaderEngine not injected into PluginContext")
        norm = path.replace(os.sep, '/')
        if os.path.isabs(norm) or norm.startswith('/') or '..' in norm.split('/'):
            raise ValueError(f"Model path must be relative to models/: {path}")
        model = self._loader.fetch(norm)
        if model is None:
            raise ValueError(f"Model not found: {path}")
        return model_to_dict(model)

    # ── active sim call (optional, for plugins that need a fresh run) ─────────

    def run_simulation(
        self,
        model_name: str,
        folder: Optional[str],
        time_hours: float,
        step_size: float,
        input_params: Optional[Dict] = None,
    ) -> Dict:
        """Trigger a full simulation and return all data points.

        Most plugins don't need this — they work on ``inputs['sim_results']``
        that the host already computed. Use this only when the plugin needs to
        run the model with different parameters (e.g., sensitivity analysis
        reruns with perturbed parameters).
        """
        if self._engine is None:
            raise RuntimeError("ReferenceEngine not injected into PluginContext")
        session = self._engine.start_session(
            model_name=model_name,
            folder=folder,
            time_hours=time_hours,
            step_size=step_size,
            input_params=input_params or {},
        )
        if not session.get("success"):
            raise RuntimeError(f"Sim start failed: {session.get('error')}")
        sid = session["data"]["session_id"]
        result = self._engine.batch_steps(sid, n=999_999)
        return result
