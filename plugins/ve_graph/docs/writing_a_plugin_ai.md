# Writing a bundle plugin, with VE Graph as the example

This guide walks through the steps that every bundle plugin follows. The reference for each field is [README_bundle_plugins.md](../../README_bundle_plugins.md), and the backend contract is in [INTERFACE.md](../../INTERFACE.md). This guide shows how the pieces fit when a real plugin is written.

## 1. Decide what the plugin is

A plugin has a backend part and a page part, and either can be absent.

- Page only: a static page that needs nothing from the engine, such as a plain explanation page.
- Page and backend: the page asks the backend for data and draws it. VE Graph is of this kind, because reading and parsing a model is easier in Python next to the loader than in the browser.
- Backend only: `ui.type: none`, called by tools through `POST /api/plugins/{id}/run`. The GUI does not show it.

Logic that needs the engine, the model files or heavy computation belongs in the backend. Drawing, interaction and layout belong in the page.

## 2. Create the folder

```
plugins/ve_graph/
├── manifest.yaml
├── backend.py
└── dist/
    └── index.html
```

The backend scans `plugins/` up to two folders deep for a `manifest.yaml`, so a category folder is allowed. Discovery happens when the backend starts and again whenever `GET /api/plugins` is called, and the page list in the GUI is read once when the GUI loads, so restart the backend and reload the GUI after adding a plugin.

## 3. Write the manifest

The fields that matter most:

- id: unique and in snake case. It becomes part of every URL of the plugin.
- contract_version: 2 for the bundle contract.
- backend.entry and backend.class: the Python file and the class inside it.
- ui.type: `bundle` for a page in the GUI.
- ui.root and ui.entry: the folder served as static files and the file opened first.
- ui.title, ui.icon and ui.order: the label, icon and position of the strip button. Icons come from a fixed list given in the bundle guide, and any other name falls back to a generic icon.

## 4. Write the backend

A backend is a class whose constructor takes a `PluginContext`. Each public endpoint is a method named `endpoint_<name>` that takes one dict and returns one dict.

```python
class VeGraph:
    def __init__(self, context):
        self.ctx = context

    def endpoint_graph(self, inputs: dict) -> dict:
        model = self.ctx.load_model(inputs['path'])
        ...
        return {'success': True, 'nodes': nodes, 'edges': edges}
```

Points to follow:

- No state: the module is imported again and a new instance is created on every call, so anything stored on the instance or in a module variable is lost. Per-request data goes in `ctx.set_cached`, and anything longer lived goes in a file or in the page.
- Errors the user should see are returned as `{'success': False, 'error': '...'}`. An exception becomes a 500, which the page can only show as a generic failure.
- Only `endpoint_*` methods are reachable from outside. Helper methods are safe to keep next to them.
- Endpoint names match `^[a-z][a-z0-9_]*$`.
- `ctx.load_model(path)` takes a path relative to the models directory, resolves imports and returns variables, equations, simulation and optimization blocks in the same shape as the models API. It refuses absolute paths and paths with `..`.
- Reuse engine helpers instead of writing parallel logic. VE Graph imports `extract_vars_from_expr` from the model structure package so that its idea of a dependency is the engine's idea.

## 5. Write the page

The page is a normal web page under `dist/`.

1. Define colors as CSS variables for light and dark, and read the `theme` query parameter so the first paint is correct.
2. Add a `message` listener for `lm-init`, which carries the selected model, the theme and the language. Update the theme and texts on every message, and reload data only when the part you depend on has changed, for example the model path.
3. Send `{type: 'lm-ready'}` to the parent once the listener exists, so the host answers with the current context.
4. Call the backend with `fetch('/api/plugins/<id>/<endpoint>', {method: 'POST', body: JSON.stringify({inputs: {...}})})`.
5. Handle a null model, a failed request and an empty result with a visible message, because all three happen in normal use.
6. Keep every file local. A page that loads a script from the internet breaks offline and breaks the rule that plugin pages make no request to another site.
7. Build DOM text with `textContent` and never insert model strings as HTML, since the page runs with the same rights as the GUI.

Asset paths inside the page are relative, because the page is served under `/api/plugins/{id}/bundle/`.

## 6. Test it

Backend:

- Import `backend.py` with `importlib`, build a `PluginContext` with a `LoaderEngine` that points at the models directory, and call the endpoint directly. The `test_ve_graph_plugin_builds_nodes_and_arrows` case in test_plugin_framework.py is a template.
- Check the properties that must always hold, such as every arrow joining a variable and an equation, instead of exact counts that change with the model.
- Check the error paths, such as a missing path.

Page:

- Serve `dist/` with any static server, open it in a headless browser, intercept the endpoint request, and answer it with the real output of the backend function. This tests the page without starting the full backend, which loads the whole model library at startup and takes more than a minute.
- Send an `lm-init` message with `window.postMessage` and assert on the result, for example the number of circles and squares drawn.
- Exercise each interaction once, such as zoom, drag, mode switch and export, and fail the test on any page error or console error.

Whole path:

- Start the backend and the GUI, restart so the plugin is discovered, and confirm the strip button appears, the page loads, and switching the model in the tree updates the page.

## 7. Checklist

- The plugin appears in `GET /api/plugins` and as a strip button.
- It looks right in light and dark.
- It shows a clear message with no model, with a failing model and with an empty result.
- Switching models in the tree updates it without a reload.
- It makes no request to another site.
- It keeps nothing in the backend between calls.
- The folder has a short guide covering the interface, the design reasons and the known limits, as this folder does.
