from fastapi import FastAPI
from .core.plugin_manager import PluginManager
from .plugin_context import PluginContext
from .core.simulator import BatchSimulator

app = FastAPI()

# 初始化
simulator = BatchSimulator()
context = PluginContext(simulator)
plugin_manager = PluginManager()

@app.get("/api/plugins")
def list_plugins():
    return {"plugins": plugin_manager.get_plugin_list()}

@app.post("/api/plugins/{plugin_id}/run")
def run_plugin(plugin_id: str, payload: dict):
    result = plugin_manager.run_plugin(plugin_id, payload['inputs'], context)
    return result
