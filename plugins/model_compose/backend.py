import os
import re

from src.model_structure.utils import extract_vars_from_expr

OUTPUT_FOLDER = 'temp_merged_ai'


def _norm_path(path: str) -> str:
    """A model path without a models/ prefix and without the .yaml suffix."""
    n = str(path).replace('\\', '/')
    if n.startswith('models/'):
        n = n[len('models/'):]
    return n[:-5] if n.endswith('.yaml') else n


class ModelCompose:
    """Compares the variables of several models and reports how they could be combined."""

    MAX_MODELS = 12

    def __init__(self, context):
        self.ctx = context

    # analysis

    def endpoint_compose(self, inputs: dict) -> dict:
        paths = inputs.get('paths') or []
        if not isinstance(paths, list) or not paths:
            return {'success': False, 'error': 'No model paths given'}
        paths = [str(p) for p in paths][:self.MAX_MODELS]

        models, errors = [], {}
        for path in paths:
            try:
                # A component often reads variables that another component defines, so it
                # cannot pass validation alone. The analysis needs exactly that dependency.
                data = self.ctx.load_model(path, validate=False)
            except (ValueError, RuntimeError) as e:
                errors[path] = str(e)
                continue
            variables = data['variables']
            reads, writes = set(), set()
            for eq in data['equations'].values():
                dynamics = eq.get('dynamics') or {}
                writes |= set(dynamics)
                for expr in dynamics.values():
                    reads |= extract_vars_from_expr(str(expr))
                if eq.get('condition'):
                    reads |= extract_vars_from_expr(str(eq['condition']))
            models.append({
                'path': path,
                'name': data['metadata']['name'],
                'variables': variables,
                'reads': reads - writes,
                'writes': writes,
                'equations': set(data['equations']),
                'imports': [_norm_path(i) for i in data.get('imports', [])],
            })

        # A model touches a variable when it declares it, reads it or updates it. Reads and
        # updates of names it does not declare count too, because that is how a component
        # asks another component for a variable.
        declared_anywhere = {v for m in models for v in m['variables']}
        touches = {}
        for m in models:
            for v in set(m['variables']) | m['reads'] | m['writes']:
                if v in declared_anywhere:
                    touches.setdefault(v, []).append(m)

        shared = []
        for v, owners in sorted(touches.items()):
            if len(owners) < 2:
                continue
            roles, declares = {}, {}
            for m in owners:
                roles[m['path']] = 'writer' if v in m['writes'] else ('reader' if v in m['reads'] else 'none')
                declares[m['path']] = v in m['variables']
            writers = [p for p, r in roles.items() if r == 'writer']
            has_reader = any(r == 'reader' for r in roles.values())
            if len(writers) >= 2:
                status = 'conflict'
            elif writers and has_reader:
                status = 'coupling'
            else:
                status = 'common'
            infos = [m['variables'][v] for m in owners if v in m['variables']]
            notes = []
            units = sorted({str(i.get('unit') or '') for i in infos} - {''})
            if len(units) > 1:
                notes.append({'kind': 'unit', 'values': units})
            types = sorted({str(i.get('type')) for i in infos})
            if len(types) > 1:
                notes.append({'kind': 'type', 'values': types})
            values = {repr(i.get('value')) for i in infos if i.get('value') is not None}
            if len(values) > 1 and not writers:
                notes.append({'kind': 'value', 'values': sorted(values)})
            first = infos[0]
            shared.append({
                'name': v,
                'vtype': first.get('type'),
                'unit': first.get('unit') or '',
                'description': first.get('description') or '',
                'roles': roles,
                'declares': declares,
                'status': status,
                'notes': notes,
            })

        eq_owner = {}
        for m in models:
            for e in m['equations']:
                eq_owner.setdefault(e, []).append(m['path'])
        collisions = [{'equation': e, 'paths': p} for e, p in sorted(eq_owner.items()) if len(p) >= 2]

        by_norm = {_norm_path(m['path']): m for m in models}
        includes = []
        for m in models:
            for imp in m['imports']:
                other = by_norm.get(imp)
                if other is not None and other is not m:
                    includes.append({'model': m['path'], 'includes': other['path']})

        return {
            'success': True,
            'models': [{
                'path': m['path'], 'name': m['name'],
                'n_variables': len(m['variables']), 'n_equations': len(m['equations']),
            } for m in models],
            'shared': shared,
            'collisions': collisions,
            'includes': includes,
            'errors': errors,
        }

    # output path for a merge

    def endpoint_suggest_output(self, inputs: dict) -> dict:
        """Proposes an unused file name under the merge output folder."""
        names = [re.sub(r'[^a-z0-9]+', '_', str(n).lower()).strip('_') for n in (inputs.get('names') or [])]
        base = 'merged_' + '_'.join(n for n in names[:3] if n)
        if len(names) > 3:
            base += f'_plus{len(names) - 3}'
        base = base[:60].rstrip('_') or 'merged_model'
        root = self.ctx.models_directory
        candidate, i = base, 2
        while os.path.exists(os.path.join(root, OUTPUT_FOLDER, candidate + '.yaml')):
            candidate = f'{base}_{i}'
            i += 1
        return {'success': True, 'folder': OUTPUT_FOLDER, 'filename': candidate + '.yaml',
                'output_path': f'{OUTPUT_FOLDER}/{candidate}.yaml'}

    def endpoint_check_output(self, inputs: dict) -> dict:
        """Accepts only a plain file name under the merge output folder that does not exist yet."""
        filename = str(inputs.get('filename') or '').strip()
        if not re.fullmatch(r'[A-Za-z0-9_\-]{1,80}\.yaml', filename):
            return {'success': False, 'error': 'invalid_name'}
        path = f'{OUTPUT_FOLDER}/{filename}'
        if os.path.exists(os.path.join(self.ctx.models_directory, OUTPUT_FOLDER, filename)):
            return {'success': False, 'exists': True, 'error': 'exists', 'output_path': path}
        return {'success': True, 'output_path': path}
