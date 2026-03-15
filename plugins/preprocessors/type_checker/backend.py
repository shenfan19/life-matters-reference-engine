class ModelBuilderPlugin:
    def __init__(self, context):
        self.context = context

    def run(self, inputs: dict) -> dict:
        return {'success': True, 'message': 'Model Builder - coming soon'}
