# LM Plugin Interface Specification

A plugin is a self-contained folder with three parts:
`manifest.yaml` + `backend.py` + `frontend.html` (optional).

Drop the folder into `plugins/` and restart the backend — it is discovered automatically.

A plugin can also ship its own page as a set of static files, a **bundle plugin** (`ui.type: bundle`), which the GUI shows as a full-page view. That kind is described in [README_bundle_plugins.md](README_bundle_plugins.md). This file is the contract for the backend side and for the older `component` kind.

---

## Directory Layout

```
plugins/
└── my_plugin/
    ├── manifest.yaml   # required — identity and wiring
    ├── backend.py      # required — computation logic
    └── frontend.html   # optional — rendered in an iframe in the GUI
```

---

## 1. `manifest.yaml`

```yaml
id: my_plugin                  # unique snake_case identifier
name: My Plugin                # human-readable display name
version: '1.0'
description: One-line description shown in the plugin list.
author: Your Name

backend:
  entry: backend.py            # Python file relative to plugin folder
  class: MyPlugin              # class name inside backend.py

ui:
  type: component              # 'component' = render frontend.html in iframe
                               # 'none'      = no UI, backend only
                               # 'bundle'    = a folder of static files, shown as a full-page
                               #               view in the GUI, see README_bundle_plugins.md
  component_path: frontend.html
```

`contract_version: 2` marks a manifest written for the bundle contract. A manifest without it is read as version 1 and keeps working as before.

**Where the GUI shows a plugin.** The GUI lists only `bundle` plugins, as buttons in the strip between the model tree and the main area, below Overview, Simulation and Optimization. A `component` plugin is not hosted by the GUI at present, although the backend still serves its page at `/api/plugins/{id}/ui-page`.

---

## 2. `backend.py` — Python Interface

Every plugin backend is a class with a `run(inputs)` method. It may also define any number of `endpoint_<name>(inputs)` methods, which a page calls as `POST /api/plugins/{id}/<name>`. The name must match `^[a-z][a-z0-9_]*$`; a name with no such method returns 404. Details are in [README_bundle_plugins.md](README_bundle_plugins.md).

```python
from typing import Any, Dict

class MyPlugin:
    def __init__(self, context):
        """context: PluginContext — provides log(), get_cached(), run_simulation(),
        load_model(path)."""
        self.ctx = context

    def run(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Receive sim data, return a result dict.

        inputs keys (all optional — check before use):
          model       dict   Parsed YAML content (variables, equations, metadata…)
          sim_results list   Data points: [{time, var1, var2, …}, …]  (seconds)
          params      dict   Extra parameters from the plugin's own UI form
          sim_config  dict   {start_date, end_date, step_size, step_unit}

        Return dict keys:
          result_type  str   'html' | 'table' | 'json' | 'text'
          data         any   The payload (HTML string, list-of-dicts, dict, str)
          title        str   Optional display title
          error        str   Set this instead of raising to show a user-visible error
        """
        sim_results = inputs.get('sim_results', [])
        if not sim_results:
            return {'result_type': 'text', 'data': 'No simulation data available.'}

        # example: count time steps
        return {
            'result_type': 'json',
            'title': 'Example output',
            'data': {'n_steps': len(sim_results)},
        }
```

### Returning an HTML chart

```python
def run(self, inputs):
    import json
    data = inputs.get('sim_results', [])
    times  = [d['time'] / 3600 for d in data]   # seconds → hours
    values = [d.get('glucose', 0) for d in data]

    chart_html = f"""
    <canvas id="c" width="600" height="300"></canvas>
    <script>
    const ctx = document.getElementById('c').getContext('2d');
    // … use Chart.js or plain canvas …
    const t = {json.dumps(times)};
    const v = {json.dumps(values)};
    </script>
    """
    return {'result_type': 'html', 'title': 'Glucose Trajectory', 'data': chart_html}
```

### Using PluginContext to re-run simulation

```python
def run(self, inputs):
    model   = inputs['model']
    config  = inputs.get('sim_config', {})
    results = {}
    for delta in [-0.1, 0.0, +0.1]:
        # perturb a parameter
        model_copy = deep_copy_and_perturb(model, delta)
        r = self.ctx.run_simulation(
            model_name = model['metadata']['name'],
            folder     = None,
            time_hours = config.get('time_hours', 24),
            step_size  = config.get('step_size', 3600),
        )
        results[delta] = r
    return {'result_type': 'json', 'data': results}
```

---

## 3. `frontend.html` — Browser UI Interface

The plugin page is loaded inside an iframe. Use the `LM` bridge injected by the host.

```html
<!DOCTYPE html>
<html>
<body>
<button onclick="runPlugin()">Run</button>
<div id="out"></div>

<script>
// ── Receive sim data from host ──────────────────────────────────────────────
let simData = null;
window.addEventListener('message', (e) => {
  if (e.data.type === 'plugin-init') {
    simData = e.data.data;        // { model, simResults, theme }
    document.body.style.background = simData.theme === 'dark' ? '#1a1a1a' : '#fff';
    document.body.style.color      = simData.theme === 'dark' ? '#eee'    : '#222';
  }
});

// ── Call backend ────────────────────────────────────────────────────────────
async function runPlugin() {
  const resp = await LM.callBackend('run', {
    // extra params beyond what the host already sends
    my_param: 42,
  });
  document.getElementById('out').innerHTML =
    resp.result_type === 'html' ? resp.data : JSON.stringify(resp.data, null, 2);
}

// ── Send result back to host (optional) ────────────────────────────────────
function sendResult(data) {
  window.parent.postMessage({ type: 'plugin-result', data }, '*');
}
</script>
</body>
</html>
```

### `LM` bridge API (injected by the host page)

| Method | Signature | Description |
|--------|-----------|-------------|
| `LM.callBackend(endpoint, extraParams)` | `Promise<result>` | POST to `/api/plugins/{id}/{endpoint}` with merged inputs |
| `LM.sendResult(data)` | `void` | Post a result back to the host app |

The host automatically merges `{ model, sim_results, sim_config }` into every `callBackend` call — the plugin only needs to send its own extra parameters.

---

## 4. How the Host Calls the Backend

When the user triggers a plugin run, the host POSTs to `/api/plugins/{id}/run`:

```json
{
  "inputs": {
    "model":       { … },
    "sim_results": [ { "time": 0, "glucose": 90 }, … ],
    "sim_config":  { "start_date": "2026-01-01", "end_date": "2026-12-31",
                     "step_size": 86400, "step_unit": "day" },
    "params":      { "my_param": 42 }
  }
}
```

The backend returns:
```json
{
  "result_type": "html",
  "title": "Sensitivity Analysis",
  "data": "<canvas …>…</canvas>"
}
```

---

## 5. Minimal Working Example

```
plugins/hello_world/
├── manifest.yaml
└── backend.py
```

**`manifest.yaml`**
```yaml
id: hello_world
name: Hello World
version: '1.0'
description: Counts simulation steps.
backend:
  entry: backend.py
  class: HelloWorld
ui:
  type: none
```

**`backend.py`**
```python
class HelloWorld:
    def __init__(self, context):
        self.ctx = context

    def run(self, inputs):
        n = len(inputs.get('sim_results', []))
        self.ctx.log(f"Hello — {n} steps received")
        return {
            'result_type': 'text',
            'title': 'Hello World',
            'data': f'Received {n} simulation steps.',
        }
```

Restart the backend, call `GET /api/plugins` — you should see `hello_world` listed.

---

## 5b. Solvers and in-process views

Two further extension points are not plugin folders. Both are described in ADR 0163.

- **Solver**: a subclass of `Solver` in `reference_engine/src/solver.py` that implements `advance(...)` and lists its capabilities (`evaluate`, `batch`, `gradient`, `snapshot`, `events`, `stochastic`), added with `register_solver`. Simulation, Monte Carlo and the optimizer call the registered solver, and an optimizer backend names the capabilities it needs in `optimizer_backends.BACKEND_REQUIRES`. A solver used for published results has to reproduce the reference solver within a stated tolerance. `GET /api/solvers` lists what is registered.
- **View**: a file `gui/src/components/views/<Name>View.tsx` that exports `view: ViewDef` (`id`, `labelKey`, `icon`, `order`, `component`, and optionally `useModule`). The component receives `core`, the interface the simulator workbench offers (`Simulator/useCore.ts`): the model library and the selected model, theme and language, the run settings shared by simulation and optimization, the saved session of a model, a runtime lock, navigation, an event bus. A view that keeps state or logic brings it as `useModule(core)`; what the module returns is readable by other modules as `core.modules[id]`, and a module keeps its slice of the saved session of a model with `useSessionSlice`. The registry finds the file at build time, and a view with an icon gets a button on the view rail. A view that has to run in isolation, or comes from someone else, is a bundle plugin (`ui.type: bundle`) instead. The built-in Overview, Simulation, Optimization and model editor are views of this kind.

---

## 6. Planned Plugins

| Plugin | Status | Purpose |
|--------|--------|---------|
| `post_causal_inference` | 🚧 stub | Post-sim causal graph from time-series |
| `sensitivity_analysis` | 📋 planned | One-at-a-time parameter perturbation + tornado chart |
| `sbml_importer` | 📋 planned | Convert SBML/CellML to LM YAML |
| `report_latex` | 📋 planned | Export simulation report as LaTeX / PDF |
| `ve_graph` | ✅ bundle plugin | Draggable graph of the variables and equations of the selected model, see `ve_graph/docs/` |
| `model_compose` | ✅ bundle plugin | Join ticked models through shared variables, flag write conflicts, merge into a new model, see `model_compose/docs/` |
