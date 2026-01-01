from typing import Any, Dict
from .core.simulator import BatchSimulator

class PluginContext:
    """插件与核心交互的唯一接口"""
    
    def __init__(self, simulator: BatchSimulator):
        self._simulator = simulator
        self._cache = {}
    
    def get_model(self) -> Dict[str, Any]:
        """获取当前模型"""
        return self._simulator.get_model_dict()
    
    def run_simulator(self, model: Dict, **params) -> Dict:
        """运行仿真"""
        return self._simulator.run(model, **params)
    
    def get_cached_result(self, key: str) -> Any:
        """获取缓存结果"""
        return self._cache.get(key)
    
    def set_cache(self, key: str, value: Any):
        """设置缓存"""
        self._cache[key] = value
    
    def log(self, message: str):
        """日志记录"""
        print(f"[Plugin] {message}")