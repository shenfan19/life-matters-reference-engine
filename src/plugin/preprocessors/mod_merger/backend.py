class ModMergerPlugin:
    def __init__(self, context):
        self.context = context
    
    def run(self, inputs: dict) -> dict:
        """
        inputs = {
            'models': ['model1.yaml', 'model2.yaml'],
            'output_name': 'merged_model'
        }
        """
        # 从 context 获取模型
        models = [self.context.get_model(name) for name in inputs['models']]
        
        # 合并逻辑（从 dynamics/merger.py 迁移）
        merged = self._merge_models(models)
        
        # 返回结果
        return {
            'success': True,
            'output': merged,
            'variables': len(merged['variables']),
            'formulas': len(merged['formulas'])
        }
    
    def _merge_models(self, models):
        # 原有的合并逻辑
        pass