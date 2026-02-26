"""
Plugin UI Server - 为自定义UI插件提供独立页面
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path
import yaml

app = FastAPI()

@app.get("/api/plugins/{plugin_id}/ui-page", response_class=HTMLResponse)
async def get_plugin_ui_page(plugin_id: str):
    """
    返回插件的独立UI页面（用于iframe加载）
    
    这个页面是完全独立的，包含：
    - React 运行时
    - 插件的 frontend.tsx 编译后的代码
    - 与父窗口通信的 postMessage API
    """
    
    # 查找插件
    plugin_dir = Path("plugins")
    plugin_path = None
    
    for folder in plugin_dir.iterdir():
        if folder.is_dir():
            manifest_file = folder / "manifest.yaml"
            if manifest_file.exists():
                with open(manifest_file, 'r') as f:
                    manifest = yaml.safe_load(f)
                    if manifest.get('id') == plugin_id:
                        plugin_path = folder
                        break
    
    if not plugin_path:
        raise HTTPException(status_code=404, detail="Plugin not found")
    
    # 读取 manifest
    with open(plugin_path / "manifest.yaml", 'r') as f:
        manifest = yaml.safe_load(f)
    
    ui_config = manifest.get('ui', {})
    
    if ui_config.get('type') != 'component':
        raise HTTPException(
            status_code=400, 
            detail="This plugin does not have a custom UI component"
        )
    
    component_path = ui_config.get('component_path')
    if not component_path:
        raise HTTPException(status_code=400, detail="No component_path specified")
    
    # 读取组件文件
    component_file = plugin_path / component_path
    if not component_file.exists():
        raise HTTPException(status_code=404, detail="Component file not found")
    
    with open(component_file, 'r', encoding='utf-8') as f:
        component_code = f.read()
    
    # 生成独立的HTML页面
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{manifest.get('name', 'Plugin')} UI</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        body {{
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }}
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        // 插件组件代码
        {component_code}
        
        // 渲染到页面
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<PluginComponent />);
        
        // 与父窗口通信的API
        window.pluginAPI = {{
            sendMessage: (data) => {{
                window.parent.postMessage({{
                    type: 'plugin-message',
                    pluginId: '{plugin_id}',
                    data: data
                }}, '*');
            }},
            
            callBackend: async (endpoint, data) => {{
                const response = await fetch(`/api/plugins/{plugin_id}/${{endpoint}}`, {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify(data)
                }});
                return await response.json();
            }}
        }};
    </script>
</body>
</html>
"""
    
    return HTMLResponse(content=html_content)
