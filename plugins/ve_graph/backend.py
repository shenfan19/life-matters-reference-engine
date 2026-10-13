from src.model_structure.utils import extract_vars_from_expr


class VeGraph:
    """Turns the variables and equations of a model into nodes and arrows."""

    def __init__(self, context):
        self.ctx = context

    def endpoint_graph(self, inputs: dict) -> dict:
        path = inputs.get('path')
        if not path:
            return {'success': False, 'error': 'No model path given'}
        try:
            model = self.ctx.load_model(path)
        except (ValueError, RuntimeError) as e:
            return {'success': False, 'error': str(e)}

        variables = model['variables']
        nodes = []
        edges = []
        used = set()

        for eq_name, eq in model['equations'].items():
            dynamics = eq.get('dynamics') or {}
            reads = set()
            for expr in dynamics.values():
                reads |= extract_vars_from_expr(str(expr))
            if eq.get('condition'):
                reads |= extract_vars_from_expr(str(eq['condition']))
            reads = {v for v in reads if v in variables}
            writes = [v for v in dynamics if v in variables]
            nodes.append({
                'id': 'eq:' + eq_name, 'kind': 'equation', 'label': eq_name,
                'description': eq.get('description') or '',
                'expressions': {k: str(v) for k, v in dynamics.items()},
                'condition': eq.get('condition') or '',
            })
            for v in sorted(reads):
                edges.append({'source': 'var:' + v, 'target': 'eq:' + eq_name})
                used.add(v)
            for v in writes:
                edges.append({'source': 'eq:' + eq_name, 'target': 'var:' + v})
                used.add(v)

        # Variables that no equation touches are kept as isolated nodes so nothing is hidden.
        for name, var in variables.items():
            nodes.append({
                'id': 'var:' + name, 'kind': 'variable', 'label': name,
                'vtype': var['type'], 'unit': var.get('unit') or '',
                'description': var.get('description') or '',
                'value': var.get('value'),
                'isolated': name not in used,
            })

        return {
            'success': True,
            'name': model['metadata']['name'],
            'nodes': nodes,
            'edges': edges,
        }
