# 0157 — Bundle Plugins and the View Rail: a Full-Page Plugin View and One Strip for Every View of the Main Area

**Date**: 2026-10-10
**Status**: ✅ accepted

---

## Background

Before this decision the plugin system worked on the backend only, and a user could not reach any plugin from the interface (see [architecture.md §2](../architecture.md)).

- A plugin's own page could only be a `frontend.html` holding one `PluginComponent`, which the backend pasted into a template, compiled in the browser with Babel, and loaded React and antd from a CDN. That meant no npm libraries, no TypeScript, and no use without internet access.
- The backend accepted only one endpoint name, `run`; any other name returned 404.
- A plugin could not read a model. `PluginContext` offered logging, a per-request cache and a way to run a simulation, but no way to load the model the user was looking at.
- The GUI had no host for a plugin page. The loader component had been deleted as dead code on 2026-07-10, and the generic form that calls `run` was imported by nothing.
- The views of the main area, Overview, Simulation and Optimization, were a hand-built horizontal tab bar inside `Simulator`. Adding one entry for every plugin to a horizontal bar does not scale, and a plugin view would have needed a second, different entry point.

The first plugins that need this are visual: a graph of how the equations of the selected model depend on each other, and a map that places the components of a model on a body. Both need their own page, the selected model, and the backend.

## Decision

**1. A new plugin UI type, `bundle`.** A plugin ships a folder of static files, and the manifest declares it:

```yaml
contract_version: 2
ui:
  type: bundle
  root: dist          # folder of static files, relative to the plugin folder
  entry: index.html   # opened first, relative to root
  title: ...          # label and tooltip of the plugin's button
  icon: ...           # a name from a fixed list of icons
  order: 10           # position among the plugin buttons
```

The backend serves the folder at `GET /api/plugins/{id}/bundle/{path}`. A path that resolves outside `ui.root` returns 400, and an empty path returns the entry file. The old `component` type and its template are unchanged, and a manifest without `contract_version` is read as version 1.

**2. Named backend endpoints.** `POST /api/plugins/{id}/{endpoint}` calls `run(inputs)` for `run` and `endpoint_<name>(inputs)` of the plugin class for any other name. A name must match `^[a-z][a-z0-9_]*$`, and a name with no such method returns 404. Missing methods raise a dedicated exception, `EndpointNotFound`, so that a `KeyError` or `LookupError` raised inside a plugin is a 500 and is never mistaken for an unknown endpoint. Only methods named `endpoint_*` can be reached from outside.

**3. Reading a model from a plugin.** `PluginContext.load_model(path)` loads a model by its path relative to the models directory, imports resolved, and returns the same shape as `GET /api/models/{name}`. It raises `ValueError` for an absolute path, a path containing `..`, or a model that cannot be found. To make the two shapes the same by construction, the serialization that used to sit inside the route moved to `src/model_serialization.py`, and the route calls it; the route's output is unchanged.

**4. A view rail in the GUI.** A vertical strip, `ViewRail`, sits between the model tree and the main area and holds one button for each view of the main area.

- At the top are the buttons for Overview, Simulation and Optimization, each with its own icon and a short label. The horizontal tab bar they used to be in is removed. The button that collapses and expands the model tree moved to the top of the strip, where it stays visible while the tree is collapsed.
- A line separates them from the plugin buttons, one for each `bundle` plugin, in the order of `ui.order`.
- Editing the model library adds a fourth built-in button above the line, with a close control. While it is open the other built-in buttons and all plugin buttons are locked, and an open plugin view is closed, so the editor is the only thing in the main area. The lock is what the horizontal tab bar did before.
- Clicking a plugin button covers the main area with the plugin's page. The model tree stays visible and keeps its selection, and the built-in views stay mounted underneath, so a running simulation or an edit in progress is not disturbed.
- The built-in buttons keep the `data-testid` values `center-tab-intro`, `center-tab-simulation` and `center-tab-optimization`, so existing end-to-end tests are unaffected.

**5. Messages between the host and a plugin page.** `PluginHost` shows the page in an iframe and talks to it with `postMessage`. The host sends `{type: 'lm-init', model: {key, title, path} | null, theme, lang}`, again whenever the selected model, the theme or the language changes. The page sends `{type: 'lm-ready'}` when it can receive, and the host answers with `lm-init`. The host accepts messages only from its own iframe. The theme and language are also in the iframe's query string, so a page opened on its own has them.

**6. Three demonstration plugins** in `plugins/demo/` check the whole path: a text page, a page with an image of its own, and a page that asks the backend for fields of the selected model, falling back to a small physiology model when no model is selected. How to write a plugin of this kind is in [`plugins/README_bundle_plugins.md`](../../plugins/README_bundle_plugins.md), and the backend contract is in [`plugins/INTERFACE.md`](../../plugins/INTERFACE.md).

## Alternatives considered

- **A side panel beside the main area.** Rejected: the plugins that motivated this are full pages, and a panel would have needed the model tree to become a panel too, for consistency.
- **Making the model tree a panel as well, with all views as dockable panels.** Rejected for now: it would need a refactor of the state `Simulator` holds, with a stability cost, for a flexibility nobody yet needs. The view rail is built so that the built-in views can later be registered the same way plugins are.
- **Putting the strip at the far left of the whole window.** Deferred: the selected model and the tree live inside `Simulator`, so a strip outside it would first need that state lifted to the application level. The strip can move there later without changing a plugin.
- **A separate GUI application for the map.** Rejected for now: it would add a second front end, a second port and a second place to keep in step, while a plugin reuses the existing backend and the GUI's model selection.
- **Keeping the browser-compiled `component` page and adding more to it.** Rejected: it cannot use a build tool or any library outside the CDN list.

## Scope of impact

- `reference_engine/src/plugin_manager.py`: `call_endpoint`, `EndpointNotFound`.
- `reference_engine/src/routes/plugins.py`: endpoint dispatch, the bundle route.
- `reference_engine/src/plugin_context.py`: `load_model`.
- `reference_engine/src/model_serialization.py`: new, shared with `routes/models.py`.
- `gui/src/components/plugins/`: `ViewRail.tsx`, `PluginHost.tsx`, `usePlugins.ts`.
- `gui/src/components/Simulator/index.tsx`: the strip, the plugin view over the main area, the closing of a plugin view when model library editing opens, and the removal of the horizontal tab bar.
- `plugins/demo/`, `plugins/README_bundle_plugins.md`, `plugins/INTERFACE.md`.
- `test_verification/test_plugin_framework.py`: 24 cases for endpoint dispatch, `load_model`, the bundle route and path-traversal refusal.
- `docs/architecture.md`, `docs/ui_guidelines.md`, `CHANGELOG.md`.

## Result

- A plugin can have its own page, read the selected model and call its own backend, and a user reaches it from one strip that also holds the built-in views.
- Plugin pages run offline, because they carry their own files.
- A plugin page is served from the same origin as the GUI and runs with the same rights; only load plugins you trust. This is stated in the plugin guide.
- Plugin views are read-only so far. A plugin that rewrites model files, such as editing a scenario's `imports`, is outside what this decision covers and would need its own.

## Open items

- The two analysis plugins, which declare `ui.type: none`, and the generic form that calls `run` are still not reachable from the interface.
- The selected view is not remembered across a reload; the GUI returns to Overview.
- Moving the strip to the far left, and registering Overview, Simulation and Optimization as views the same way plugins are, are possible later steps and are not part of this decision.
