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
        """扫描所有插件"""
        for folder in self.plugin_dir.iterdir():
            if not folder.is_dir():
                continue
            manifest_path = folder / "manifest.yaml"
            if manifest_path.exists():
                with open(manifest_path, 'r') as f:
                    manifest = yaml.safe_load(f)
                    self.plugins[manifest['id']] = {
                        'manifest': manifest,
                        'path': folder
                    }
    
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