"""The connection to the body model.

A driver owns one running body: it is started with the inputs and states of the birth, and `advance` runs it for some
weeks under given inputs, returning one row per week and the full state at the end. The engine driver uses a private
engine object, so a life never takes a slot among the sessions of the simulation view and leaves nothing behind.
"""

from typing import Any, Dict, List, Optional, Tuple

WEEK_SECONDS = 7 * 86400.0


class EngineDriver:
    """Runs the body model of the reference engine, week by week."""

    def __init__(self, models_directory: str, model_path: str, initial: Dict[str, float], max_weeks: int, solver: Optional[str] = None):
        from src.reference_engine import ReferenceEngine
        self._engine = ReferenceEngine(models_directory)
        started = self._engine.start_session(
            model_name=model_path, time_hours=max_weeks * 7 * 24.0, step_size=WEEK_SECONDS, input_params=dict(initial),
            solver=solver)
        if not started.get('success'):
            raise RuntimeError(f'The body model did not start: {started.get("error")}')
        self._session_id = started['data']['session_id']
        self._applied: Dict[str, float] = {}

    def advance(self, weeks: int, inputs: Dict[str, float]) -> Tuple[List[Dict[str, float]], Dict[str, float]]:
        changes = {var: value for var, value in inputs.items() if self._applied.get(var) != value}
        result = self._engine.batch_steps(self._session_id, steps=weeks, input_changes=changes or None)
        if not result.get('success'):
            raise RuntimeError(f'The body model stopped: {result.get("error")}')
        self._applied.update(changes)
        data = result['data']
        if data['steps_executed'] != weeks:
            raise RuntimeError('The body model ran out of steps before the end of the life')
        state = {name: entry['value'] for name, entry in data['final_state'].items()}
        return data['outputs'], state

    def close(self) -> None:
        self._engine.sessions.pop(self._session_id, None)


def model_defaults(model: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Value and unit of every input of a loaded model, as the plugin starts a life from them."""
    return {name: {'value': var['value'], 'unit': var.get('unit')}
            for name, var in model['variables'].items() if var.get('type') == 'input'}
