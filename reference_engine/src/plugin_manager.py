import os
import yaml
from pathlib import Path
from typing import Dict, List

class PluginManager:
    def __init__(self, plugin_dir: str = "plugins"):
        self.plugin_dir = Path(plugin_dir)
        self.plugins: Dict[str, dict] = {}
        self.scan_plugins()
    
    def scan_plugins(self):
        """递归扫描插件（最多2层深度）"""
        self.plugins = {} # Clear existing
        def scan_recursive(directory, depth=0, max_depth=2):
            if depth > max_depth:
                return
            
            if not directory.exists():
                return

            for item in directory.iterdir():
                # Skip hidden directories and the specific test_plugin
                if item.name.startswith('.') or item.name == 'test_plugin':
                    continue
                    
                if not item.is_dir():
                    continue
                
                manifest_path = item / "manifest.yaml"
                if manifest_path.exists():
                    try:
                        with open(manifest_path, 'r', encoding='utf-8') as f:
                            manifest = yaml.safe_load(f)
                            if manifest.get('id') == 'test_plugin':
                                continue
                            plugin_id = manifest.get('id')
                            print(f"[PluginManager] Found plugin: {plugin_id} at {item}")
                            self.plugins[plugin_id] = {
                                'manifest': manifest,
                                'path': item,
                                'category': item.parent.name if depth > 0 else 'uncategorized'
                            }
                    except Exception as e:
                        print(f"[PluginManager] Error loading plugin at {item}: {e}")
                else:
                    # Continue scanning subdirectories
                    scan_recursive(item, depth + 1, max_depth)
        
        scan_recursive(self.plugin_dir)
    
    def get_plugin_list(self) -> List[dict]:
        """获取插件清单"""
        return [p['manifest'] for p in self.plugins.values()]
    
    def load_plugin(self, plugin_id: str):
        """动态加载插件并返回模块"""
        import importlib.util
        import sys
        
        if plugin_id not in self.plugins:
            raise ValueError(f"Plugin {plugin_id} not found")
        
        plugin_info = self.plugins[plugin_id]
        manifest = plugin_info['manifest']
        
        # 动态导入 backend.py
        backend_path = plugin_info['path'] / manifest['backend']['entry']
        
        module_name = f"plugin_{plugin_id}"
        spec = importlib.util.spec_from_file_location(module_name, str(backend_path))
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load spec for {backend_path}")
            
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        
        return module
        
    def run_plugin(self, plugin_id: str, inputs: dict, context):
        """执行插件"""
        module = self.load_plugin(plugin_id)
        plugin_info = self.plugins[plugin_id]
        class_name = plugin_info['manifest']['backend']['class']
        
        plugin_class = getattr(module, class_name)
        instance = plugin_class(context)
        return instance.run(inputs)