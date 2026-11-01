# Plugin template

A small, working bundle plugin to copy when writing a new one. It lists the variables of the model selected in the GUI. It is kept here and not in `plugins/`, so it is not loaded and does not add a button to the view rail.

## Use it

1. Copy this folder to `plugins/<your_id>/`, or to a category folder such as `plugins/visualizers/<your_id>/`.
2. Set `id` in `manifest.yaml` and the same id in `PLUGIN_ID` in `dist/index.html`, and rename the class in `backend.py` together with `backend.class` in the manifest.
3. Restart the backend and reload the GUI. The plugin appears as a button below the built-in views.

## What each file shows

- manifest.yaml: identity, the backend class, and the button of the plugin in the view rail.
- backend.py: one endpoint, `endpoint_fields`, which reads the selected model with `self.ctx.load_model`.
- dist/index.html: the page. It follows the theme of the GUI, waits for `lm-init`, calls the endpoint when the selected model changes, and builds its DOM with `textContent`.

The contract behind these files is in [README_bundle_plugins.md](../../plugins/README_bundle_plugins.md). Two complete plugins are in `plugins/`: `ve_graph`, a page that draws a graph from one model, and `model_compose`, a page that works on several ticked models, asks the host to tick models, and writes a merged model through an existing route. Each has a `docs/` folder with its interface and design.
