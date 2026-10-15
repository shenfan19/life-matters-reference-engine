from src.model_structure.utils import extract_vars_from_expr

MAX_MODELS = 8
# When a variable is a state in one model and an input or a parameter in another, the joined node keeps the strongest role.
ROLE_RANK = {'state': 0, 'input': 1, 'parameter': 2}


class VeGraph:
    """Turns the variables and equations of one or several models into nodes and arrows.

    With several models, variables with the same name are one node, so models are joined through what they share.
    Equations stay one node each, named with their model, because two models may call their equations the same."""

    def __init__(self, context):
        self.ctx = context

    def endpoint_graph(self, inputs: dict) -> dict:
        paths = inputs.get('paths')
        if not paths:
            paths = [inputs['path']] if inputs.get('path') else []
        if not isinstance(paths, list) or not paths:
            return {'success': False, 'error': 'No model path given'}
        paths = [str(p) for p in paths][:MAX_MODELS]

        loaded = []
        for path in paths:
            try:
                loaded.append(self.ctx.load_model(path))
            except (ValueError, RuntimeError) as e:
                return {'success': False, 'error': f'{path}: {e}'}
        multi = len(loaded) > 1
        names = [m['metadata']['name'] for m in loaded]

        var_nodes = {}      # variable name -> node, one per name across all models
        eq_nodes = []
        edges = []
        edge_keys = set()
        used = set()

        def add_edge(source, target):
            if (source, target) not in edge_keys:
                edge_keys.add((source, target))
                edges.append({'source': source, 'target': target})

        for idx, model in enumerate(loaded):
            variables = model['variables']
            for name, var in variables.items():
                node = var_nodes.get(name)
                if node is None:
                    node = var_nodes[name] = {
                        'id': 'var:' + name, 'kind': 'variable', 'label': name,
                        'vtype': var['type'], 'unit': var.get('unit') or '',
                        'description': var.get('description') or '', 'value': var.get('value'),
                        'isolated': True, 'models': [],
                    }
                elif ROLE_RANK.get(var['type'], 3) < ROLE_RANK.get(node['vtype'], 3):
                    node['vtype'] = var['type']
                if names[idx] not in node['models']:
                    node['models'].append(names[idx])

            for eq_name, eq in model['equations'].items():
                dynamics = eq.get('dynamics') or {}
                reads = set()
                for expr in dynamics.values():
                    reads |= extract_vars_from_expr(str(expr))
                if eq.get('condition'):
                    reads |= extract_vars_from_expr(str(eq['condition']))
                reads = {v for v in reads if v in variables}
                writes = [v for v in dynamics if v in variables]
                eq_id = ('eq:%d:%s' % (idx, eq_name)) if multi else 'eq:' + eq_name
                eq_nodes.append({
                    'id': eq_id, 'kind': 'equation', 'label': eq_name, 'model': names[idx],
                    'description': eq.get('description') or '',
                    'expressions': {k: str(v) for k, v in dynamics.items()},
                    'condition': eq.get('condition') or '',
                })
                for v in sorted(reads):
                    add_edge('var:' + v, eq_id)
                    used.add(v)
                for v in writes:
                    add_edge(eq_id, 'var:' + v)
                    used.add(v)

        # Variables that no equation touches are kept as isolated nodes so nothing is hidden.
        for name, node in var_nodes.items():
            node['isolated'] = name not in used
            node['shared'] = len(node['models']) > 1

        return {
            'success': True,
            'name': ' + '.join(names),
            'models': names,
            'shared': sum(1 for n in var_nodes.values() if n['shared']),
            'nodes': eq_nodes + list(var_nodes.values()),
            'edges': edges,
        }
