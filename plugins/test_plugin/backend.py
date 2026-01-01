"""
Test Plugin - 测试插件系统是否正常工作
"""


class TestPlugin:
    """测试插件"""
    
    def __init__(self, context):
        """
        Args:
            context: PluginContext 实例（可能为 None）
        """
        self.context = context
    
    def run(self, inputs: dict) -> dict:
        """
        执行插件
        
        Args:
            inputs: {
                'message': 'Hello, LifeMatters!'
            }
        
        Returns:
            {
                'success': True,
                'outputs': {'result': '...'},
                'ui_data': {...}
            }
        """
        try:
            message = inputs.get('message', 'No message')
            
            # 简单的逻辑：返回消息的反转
            result = message[::-1]
            
            return {
                'success': True,
                'outputs': {
                    'result': result
                },
                'ui_data': {
                    'original': message,
                    'reversed': result,
                    'length': len(message)
                }
            }
        
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
