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
                            self.plugins[manifest['id']] = {
                                'manifest': manifest,
                                'path': item,
                                'category': item.parent.name if depth > 0 else 'uncategorized'
                            }
                    except Exception as e:
                        print(f"Error loading plugin at {item}: {e}")
                else:
                    # Continue scanning subdirectories
                    scan_recursive(item, depth + 1, max_depth)
        
        scan_recursive(self.plugin_dir)
    
    def get_plugin_list(self) -> List[dict]:
        """获取插件清单"""
        return [p['manifest'] for p in self.plugins.values()]
    
    def load_plugin(self, plugin_id: str):
        """动态加载插件"""
        if plugin_id not in self.plugins:
            raise ValueError(f"Plugin {plugin_id} not found")
        
        plugin_info = self.plugins[plugin_id]
        manifest = plugin_info['manifest']
        
        # 动态导入 backend.py
        backend_path = plugin_info['path'] / manifest['backend']['entry']
        # ... 动态加载逻辑
        
    def run_plugin(self, plugin_id: str, inputs: dict, context):
        """执行插件"""
        plugin_module = self.load_plugin(plugin_id)
        plugin_class = getattr(plugin_module, plugin_module.manifest['backend']['class'])
        instance = plugin_class(context)
        return instance.run(inputs)