# Writing a Bundle Plugin

A bundle plugin is a plugin whose interface is a small web app. The GUI shows it as a full-page view, next to Overview, Simulation and Optimization, and it can talk to the backend and to the GUI. This guide is all you need to write one. The older kind of plugin, a `run(inputs)` backend with no page, is described in [INTERFACE.md](INTERFACE.md).

Three working examples are in [`demo/`](demo/): `demo_a_text` shows a text, `demo_b_image` shows an image shipped inside the plugin, `demo_c_fields` shows fields of the model selected in the GUI through a custom backend endpoint.

---

## 1. Folder layout

```
plugins/
└── my_plugin/
    ├── manifest.yaml
    ├── backend.py        # optional, only if the page needs the backend
    └── dist/             # the static files of the page
        ├── index.html
        └── ...           # scripts, styles, images
```

The backend finds a plugin by looking for `manifest.yaml` in `plugins/`, up to two folders deep, so a category folder such as `plugins/demo/` is fine. Restart the backend after adding a plugin.

`dist/` is just a folder of static files. It can be written by hand, as in the demos, or built by any tool, for example Vite. Whatever you use, make asset paths relative, such as `sample.svg` or `./assets/app.js`, because the page is served under `/api/plugins/{id}/bundle/`.

---

## 2. `manifest.yaml`

```yaml
id: my_plugin                   # unique, snake_case
name: My Plugin
version: '0.1'
contract_version: 2             # the contract described here
description: One sentence about what it does.
author: Your Name

backend:                        # optional
  entry: backend.py
  class: MyPlugin

ui:
  type: bundle
  root: dist                    # folder of static files, relative to the plugin folder
  entry: index.html             # opened first, relative to root
  title: My Plugin              # label and tooltip of the strip button; default is name
  icon: TableOutlined           # see the list below; default is AppstoreOutlined
  order: 40                     # position in the strip, small first; default is 1000
```

Icons you can name in `ui.icon`: `ApartmentOutlined`, `AppstoreOutlined`, `BarChartOutlined`, `FileTextOutlined`, `PictureOutlined`, `TableOutlined`. Any other name falls back to `AppstoreOutlined`.

Plugins with `ui.type: none` or `component` are not shown in the strip.

---

## 3. How the GUI shows a bundle plugin

- A vertical strip sits between the model tree and the main area. It holds one button for each view of the main area. Overview, Simulation and Optimization are at the top, then a line, then one button for each bundle plugin in the order of `ui.order`. While the model library is being edited a fourth built-in button appears above the line.
- Clicking a plugin button covers the main area with the plugin page in an iframe. The model tree stays visible and keeps its selection. Clicking one of the built-in buttons goes back.
- A button shows its icon and a label of up to two lines, so a short `ui.title` reads best. The full title is the tooltip.
- With no bundle plugin installed the strip shows only the built-in buttons.
- The page is loaded from `/api/plugins/{id}/bundle/?theme=dark|light&lang=zh-CN`. The query string means a page opened on its own still knows the theme and language.

---

## 4. Messages between the page and the GUI

Both directions use `window.postMessage`.

The page tells the GUI it can receive messages:

```js
parent.postMessage({ type: 'lm-ready' }, '*');
```

The GUI answers with the current context, and sends it again whenever the selected model, the theme or the language changes:

```js
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'lm-init') {
    // e.data = {
    //   type: 'lm-init',
    //   model: { key, title, path } | null,   // the model selected in the tree
    //   theme: 'dark' | 'light',
    //   lang: 'en' | 'zh-CN' | 'zh-TW' | 'fr'
    // }
  }
});
```

`model.path` is the path of the model file relative to the models directory. Pass it to your backend to read the model, see section 6.

Follow the theme: the GUI has a dark and a light mode and a plugin page should look right in both. The demos switch a `data-theme` attribute on `<html>` and define their colors as CSS variables.

---

## 5. Backend endpoints

A page calls its own backend with a POST:

```js
const res = await fetch('/api/plugins/my_plugin/fields', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ inputs: { path: model.path } })
});
const data = await res.json();
```

The endpoint name in the URL, here `fields`, calls the method `endpoint_fields(self, inputs)` of the class named in the manifest. The method receives the `inputs` object and returns a dict.

```python
class MyPlugin:
    def __init__(self, context):
        self.ctx = context

    def endpoint_fields(self, inputs: dict) -> dict:
        model = self.ctx.load_model(inputs['path'])
        return {'success': True, 'variables': len(model['variables'])}
```

Rules:

- The endpoint name must match `^[a-z][a-z0-9_]*$`. Anything else, and any name with no `endpoint_<name>` method, returns 404.
- `run` is the old entry point and still calls `run(inputs)`.
- Only methods whose names start with `endpoint_` can be reached from outside. Helper methods are not exposed.
- An exception inside an endpoint returns 500 with the message. Return `{'success': False, 'error': '...'}` for errors the page should show.
- A new instance of the class is created on every call and `backend.py` is loaded again each time, so keep no state in the class. Use `self.ctx.set_cached` only within one request.

---

## 6. `PluginContext`

`self.ctx` gives a plugin:

| Method | Purpose |
|--------|---------|
| `load_model(path)` | Loads a model by its path relative to the models directory, imports resolved, and returns the same shape as `GET /api/models/{name}`: `metadata`, `variables`, `equations`, `simulation`, `optimization`, `plans`, `imports`, `provenance`. Raises `ValueError` for an absolute path, a path containing `..`, or a model that cannot be found. |
| `run_simulation(...)` | Runs a full simulation, for plugins that need a fresh run. |
| `log(message)` | Prints to the backend log. |
| `get_cached(key)`, `set_cached(key, value)` | A cache that lives for one request. |

Each variable in `load_model(...)['variables']` has `type` (`state`, `input` or `parameter`), `unit`, `description`, `value` and the evidence fields. Each equation has `dynamics`, a map from the variable it updates to its expression, plus `priority`, `condition` and `description`.

---

## 7. Safety notes

- Only the files under `ui.root` are served. A request that resolves outside it returns 400.
- A plugin page runs in the same origin as the GUI. Load only code you trust.
- A bundle plugin can read any model the backend can load. It cannot read outside the models directory through `load_model`.
- Do not load scripts from the internet. A plugin page should work offline, so put the files it needs inside `dist/`.

---

## 8. Checklist before you share a plugin

- It appears in `GET /api/plugins` and as a button in the strip after a backend restart.
- It looks right in dark and light mode.
- It shows something sensible when no model is selected, `model` is `null`.
- Switching to another model in the tree updates it.
- It makes no request to another site.
