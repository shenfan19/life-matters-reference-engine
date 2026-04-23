class ScenarioBuilderPlugin:
    def __init__(self, context):
        self.context = context

    def run(self, inputs: dict) -> dict:
        """
        Scenario Builder delegates core logic to the main API endpoints:
          /api/validate, /api/merge, /api/split
        This backend is a placeholder for future batch operations.
        """
        return {'success': True, 'message': 'Use the Scenario Builder UI to validate, merge, patch, and split models.'}
