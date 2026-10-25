import os
import sys

# one_life_core sits next to this file. The plugin host loads backend.py by its path and does not put the folder on the path.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from one_life_core.attribution import RiskSplitter  # noqa: E402
from one_life_core.catalog import load_catalog  # noqa: E402
from one_life_core.compare import compare_lives  # noqa: E402
from one_life_core.driver import EngineDriver, model_defaults  # noqa: E402
from one_life_core.life import Env, run_life  # noqa: E402
from one_life_core.limits import run_slot  # noqa: E402
from one_life_core.view import catalog_view  # noqa: E402


class OneLife:
    """Draws a birth, runs the life on the virtual human, and answers what-if questions about it.

    The plugin keeps nothing between calls: the page sends the record of the life each time and gets the whole answer back."""

    def __init__(self, context):
        self.ctx = context

    def _env(self) -> Env:
        catalog = load_catalog()
        model_path = catalog['config']['model']
        model = self.ctx.load_model(model_path)
        models_directory = self.ctx.models_directory

        def start_body(initial, max_weeks):
            return EngineDriver(models_directory, model_path, initial, max_weeks, catalog['config']['solver'])

        return Env(catalog, model_defaults(model), RiskSplitter(model['equations'], catalog['risk_groups']), start_body)

    def endpoint_catalog(self, inputs: dict) -> dict:
        try:
            catalog = load_catalog()
        except ValueError as e:
            return {'success': False, 'error': str(e)}
        view = catalog_view(catalog)
        try:
            self.ctx.load_model(catalog['config']['model'])
            view['model_ok'] = True
        except (ValueError, RuntimeError) as e:
            view['model_ok'] = False
            view['model_error'] = str(e).splitlines()[0] if str(e) else 'The body model cannot be loaded'
        return {'success': True, **view}

    # The host reserves the endpoint name `run` for the old entry point of plugins without a page, so the page calls `live`.
    def endpoint_live(self, inputs: dict) -> dict:
        try:
            with run_slot():
                result = run_life(self._env(), inputs.get('life'), outlook=inputs.get('outlook', True) is not False)
        except (ValueError, RuntimeError) as e:
            return {'success': False, 'error': str(e)}
        return {'success': True, **result}

    def endpoint_compare(self, inputs: dict) -> dict:
        try:
            with run_slot():
                result = compare_lives(self._env(), inputs.get('life'), inputs.get('variants') or [])
        except (ValueError, RuntimeError) as e:
            return {'success': False, 'error': str(e)}
        return {'success': True, **result}
