class DemoFields:
    """Reads the model the GUI has selected and returns a few of its fields."""

    MAX_VARIABLES = 12

    def __init__(self, context):
        self.ctx = context

    def endpoint_fields(self, inputs: dict) -> dict:
        path = inputs.get('path')
        if not path:
            return {'success': False, 'error': 'No model path given'}
        try:
            model = self.ctx.load_model(path)
        except (ValueError, RuntimeError) as e:
            return {'success': False, 'error': str(e)}

        variables = model['variables']
        by_type = {}
        for var in variables.values():
            by_type[var['type']] = by_type.get(var['type'], 0) + 1
        return {
            'success': True,
            'name': model['metadata']['name'],
            'variable_count': len(variables),
            'equation_count': len(model['equations']),
            'by_type': by_type,
            'variables': [
                {'name': name, 'type': var['type'], 'unit': var['unit']}
                for name, var in list(variables.items())[:self.MAX_VARIABLES]
            ],
        }
