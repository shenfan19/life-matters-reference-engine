# LM Plugin Interface Specification

A plugin is a self-contained folder with three parts:
`manifest.yaml` + `backend.py` + `frontend.html` (optional).

Drop the folder into `plugins/` and restart the backend — it is discovered automatically.

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
  component_path: frontend.html
```

---

## 2. `backend.py` — Python Interface

Every plugin backend is a class with a single `run(inputs)` method.

```python
from typing import Any, Dict

class MyPlugin:
    def __init__(self, context):
        """context: PluginContext — provides log(), get_cached(), run_simulation()."""
        self.ctx = context

    def run(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Receive sim data, return a result dict.

        inputs keys (all optional — check before use):
          model       dict   Parsed YAML content (variables, formulas, metadata…)
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

## 6. Planned Plugins

| Plugin | Status | Purpose |
|--------|--------|---------|
| `post_causal_inference` | 🚧 stub | Post-sim causal graph from time-series |
| `sensitivity_analysis` | 📋 planned | One-at-a-time parameter perturbation + tornado chart |
| `sbml_importer` | 📋 planned | Convert SBML/CellML to LM YAML |
| `report_latex` | 📋 planned | Export simulation report as LaTeX / PDF |
