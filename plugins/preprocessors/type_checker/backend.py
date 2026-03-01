class ModelCheckerPlugin:
    def __init__(self, context):
        self.context = context
    
    def run(self, inputs: dict) -> dict:
        model = self.context.get_model()
        strict = inputs.get('strict_mode', False)
        
        errors = []
        # 从 dynamics/validator.py 迁移的类型检查逻辑
        for var_name, var_info in model['variables'].items():
            if 'type' not in var_info:
                errors.append(f"Variable {var_name} missing type")
        
        return {
            'success': len(errors) == 0,
            'errors': errors,
            'ui_data': {
                'total_vars': len(model['variables']),
                'error_count': len(errors)
            }
        }
    