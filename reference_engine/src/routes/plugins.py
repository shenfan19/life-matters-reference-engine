import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
import app_state
from src.plugin_manager import EndpointNotFound

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/plugins")
async def list_plugins():
    if app_state.plugin_manager is None:
        return {"plugins": [], "message": "Plugin system not initialized"}
    try:
        app_state.plugin_manager.scan_plugins()
        return {
            "success": True,
            "plugins": app_state.plugin_manager.get_plugin_list(),
            "count": len(app_state.plugin_manager.plugins)
        }
    except Exception as e:
        logger.error(f"Error listing plugins: {e}")
        return {"plugins": [], "error": str(e)}


@router.get("/api/plugins/{plugin_id}/ui-page", response_class=HTMLResponse)
async def get_plugin_ui_page(plugin_id: str, theme: str = 'light'):
    if app_state.plugin_manager is None:
        raise HTTPException(status_code=503, detail="Plugin system not initialized")
    if plugin_id not in app_state.plugin_manager.plugins:
        raise HTTPException(status_code=404, detail="Plugin not found")

    plugin_info = app_state.plugin_manager.plugins[plugin_id]
    manifest = plugin_info['manifest']
    plugin_path = plugin_info['path']
    ui_config = manifest.get('ui', {})
    if ui_config.get('type') != 'component':
        raise HTTPException(status_code=400, detail="This plugin does not have a custom UI component")
    component_path = ui_config.get('component_path')
    if not component_path:
        raise HTTPException(status_code=400, detail="No component_path specified")
    component_file = plugin_path / component_path
    if not component_file.exists():
        raise HTTPException(status_code=404, detail="Component file not found")

    with open(component_file, 'r', encoding='utf-8') as f:
        component_code = f.read()

    bg_color = '#141414' if theme == 'dark' else 'transparent'
    text_color = '#ffffff' if theme == 'dark' else '#000000'
    theme_algo = 'theme.darkAlgorithm' if theme == 'dark' else 'theme.defaultAlgorithm'

    template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{name}} UI</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script crossorigin src="https://unpkg.com/dayjs@1/dayjs.min.js"></script>
    <script crossorigin src="https://unpkg.com/antd@5/dist/antd.min.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/antd@5/dist/reset.css" />
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: {{bg_color}};
            color: {{text_color}};
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect, useRef, useMemo } = React;
        const { ConfigProvider, theme } = antd;
        {{component_code}}
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(
            <ConfigProvider theme={{ algorithm: {{theme_algo}} }}>
                <PluginComponent />
            </ConfigProvider>
        );
        window.pluginAPI = {
            sendMessage: (data) => {
                window.parent.postMessage({
                    type: 'plugin-message',
                    pluginId: '{{plugin_id}}',
                    data: data
                }, '*');
            },
            callBackend: async (endpoint, data) => {
                const url = endpoint === 'run' ? `/api/plugins/{{plugin_id}}/run` : `/api/plugins/{{plugin_id}}/${endpoint}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inputs: data })
                });
                return await response.json();
            }
        };
    </script>
</body>
</html>
"""
    html_content = template \
        .replace('{{name}}', manifest.get('name', 'Plugin')) \
        .replace('{{component_code}}', component_code) \
        .replace('{{plugin_id}}', plugin_id) \
        .replace('{{bg_color}}', bg_color) \
        .replace('{{text_color}}', text_color) \
        .replace('{{theme_algo}}', theme_algo)
    return HTMLResponse(content=html_content)


@router.get("/api/plugins/{plugin_id}/bundle/{file_path:path}")
async def get_plugin_bundle_file(plugin_id: str, file_path: str):
    """Serves a bundle plugin's static files, only from the folder named by ui.root."""
    if app_state.plugin_manager is None:
        raise HTTPException(status_code=503, detail="Plugin system not initialized")
    if plugin_id not in app_state.plugin_manager.plugins:
        raise HTTPException(status_code=404, detail="Plugin not found")

    plugin_info = app_state.plugin_manager.plugins[plugin_id]
    ui_config = plugin_info['manifest'].get('ui', {})
    if ui_config.get('type') != 'bundle':
        raise HTTPException(status_code=400, detail="This plugin is not a bundle plugin")
    root = (plugin_info['path'] / ui_config.get('root', 'dist')).resolve()
    target = (root / (file_path or ui_config.get('entry', 'index.html'))).resolve()
    if not target.is_relative_to(root):
        raise HTTPException(status_code=400, detail="Path outside the plugin bundle")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target)


@router.post("/api/plugins/{plugin_id}/{endpoint}")
async def call_plugin_backend(plugin_id: str, endpoint: str, payload: dict):
    if app_state.plugin_manager is None:
        raise HTTPException(status_code=503, detail="Plugin system not initialized")
    if plugin_id not in app_state.plugin_manager.plugins:
        raise HTTPException(status_code=404, detail="Plugin not found")
    try:
        from src.plugin_context import PluginContext
        ctx = PluginContext(engine=app_state.engine, loader=app_state.loader_engine)
        return app_state.plugin_manager.call_endpoint(
            plugin_id=plugin_id,
            endpoint=endpoint,
            inputs=payload.get('inputs', {}),
            context=ctx
        )
    except EndpointNotFound:
        raise HTTPException(status_code=404, detail=f"Endpoint {endpoint} not supported")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calling plugin backend {plugin_id}/{endpoint}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
