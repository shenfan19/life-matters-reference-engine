import os
import sys

# one_life_core sits next to this file. The plugin host loads backend.py by its path and does not put the folder on the path.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from one_life_core.attribution import RiskSplitter  # noqa: E402
from one_life_core.catalog import load_catalog  # noqa: E402
from one_life_core.compare import compare_lives  # noqa: E402
from one_life_core.compose import missing_variables  # noqa: E402
from one_life_core.driver import EngineDriver, model_defaults  # noqa: E402
from one_life_core.life import Env, run_life  # noqa: E402
from one_life_core.limits import run_slot  # noqa: E402
from one_life_core.scenario import CUSTOM_DIR, custom_text, norm_path, same_components, write_custom  # noqa: E402
from one_life_core.view import catalog_view  # noqa: E402


class OneLife:
    """Draws a birth, runs the life on the virtual human, and answers what-if questions about it.

    The plugin keeps nothing between calls: the page sends the record of the life each time and gets the whole answer back."""

    def __init__(self, context):
        self.ctx = context

    def _model_path(self, catalog: dict, inputs: dict) -> str:
        """The scenario to run: the base one, or a custom one when the ticked components differ from its imports."""
        config = catalog['config']
        base = norm_path(inputs.get('base') or config['model'])
        if base not in [norm_path(p) for p in config['scenarios']]:
            raise ValueError(f'Unknown scenario: {base}')
        components = inputs.get('models') or []
        if not isinstance(components, list) or not components:
            return base
        imports = self.ctx.load_model(base, validate=False).get('imports') or []
        if same_components(components, imports):
            return base
        return write_custom(self.ctx.models_directory, base, components)

    def _env(self, inputs: dict) -> Env:
        catalog = load_catalog()
        model_path = self._model_path(catalog, inputs)
        try:
            model = self.ctx.load_model(model_path)
        except ValueError:
            if not model_path.startswith(CUSTOM_DIR):
                raise
            raise ValueError('The ticked components do not make a valid model together. A component probably reads a variable that '
                             'no ticked component defines, so tick the components it needs, or pick a scenario again.')
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
                result = run_life(self._env(inputs), inputs.get('life'), outlook=inputs.get('outlook', True) is not False)
        except (ValueError, RuntimeError) as e:
            return {'success': False, 'error': str(e)}
        return {'success': True, **result}

    def endpoint_compare(self, inputs: dict) -> dict:
        try:
            with run_slot():
                result = compare_lives(self._env(inputs), inputs.get('life'), inputs.get('variants') or [])
        except (ValueError, RuntimeError) as e:
            return {'success': False, 'error': str(e)}
        return {'success': True, **result}

    def endpoint_scenarios(self, inputs: dict) -> dict:
        """The scenarios the page offers, each with the components it imports and the inputs a life needs and it lacks."""
        try:
            catalog = load_catalog()
        except ValueError as e:
            return {'success': False, 'error': str(e)}
        config = catalog['config']
        entries = []
        for path in config['scenarios']:
            path = norm_path(path)
            entry = {'path': path, 'default': path == norm_path(config['model'])}
            try:
                model = self.ctx.load_model(path, validate=False)
                entry['title'] = model['metadata'].get('name') or path
                entry['imports'] = [norm_path(i) for i in model.get('imports') or []]
                entry['missing'] = missing_variables(catalog, model_defaults(model))
            except (ValueError, RuntimeError) as e:
                entry.update(title=path, imports=[], missing=[], error=str(e).splitlines()[0] if str(e) else 'cannot be loaded')
            entries.append(entry)
        return {'success': True, 'scenarios': entries}

    def endpoint_scenario_file(self, inputs: dict) -> dict:
        """The scenario file of a custom choice of components, to download, or also saved under a temp_ folder when `save` is set."""
        try:
            catalog = load_catalog()
            base = norm_path(inputs.get('base') or catalog['config']['model'])
            if base not in [norm_path(p) for p in catalog['config']['scenarios']]:
                raise ValueError(f'Unknown scenario: {base}')
            name = str(inputs.get('name') or '') or None
            components = inputs.get('models') or []
            text, stem = custom_text(self.ctx.models_directory, base, components, name)
            result = {'success': True, 'name': stem, 'yaml': text}
            if inputs.get('save'):
                result['saved_as'] = write_custom(self.ctx.models_directory, base, components, name) + '.yaml'
            return result
        except (ValueError, RuntimeError) as e:
            return {'success': False, 'error': str(e)}
