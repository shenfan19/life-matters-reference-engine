# Model Compose plugin

Model Compose shows how several models can be combined. The user ticks models in the model tree on the left, and the plugin draws each ticked model as a node. Models that share a variable are joined through that variable, shown as a circle, with an arrow from the model that writes the variable and an arrow to each model that reads it. A variable written by more than one model is flagged, because a merge would update it more than once per step. One button merges the ticked models into a new model file.

## What to open

| Question | Open |
|----------|------|
| How do I use the page and what do the colors and arrows mean | [interface_ai.md](interface_ai.md), section 3 |
| What do the backend endpoints receive and return | [interface_ai.md](interface_ai.md), sections 1 and 2 |
| What exactly happens when I press the merge button | [design_ai.md](design_ai.md), section 5 |
| Why is it built this way and what are its limits | [design_ai.md](design_ai.md) |
| How is a plugin like this written | [writing_a_plugin_ai.md](../../ve_graph/docs/writing_a_plugin_ai.md) |
| What changed in the host so that this plugin is possible | ADR 0158 in the engine decisions folder |

## Files

- manifest.yaml: identity, the strip button, and `model_selection: multi`.
- backend.py: the endpoints `compose`, `suggest_output` and `check_output`.
- dist/index.html: the whole page, one file, no external library.
- docs: this folder.

## Tests

- Backend: the analysis was run on the human body component models and on three small models written for the test, one of which updates a variable that another also updates.
- Page: exercised in a headless browser with the analysis endpoint answered by the real backend function and the merge endpoints answered by stubs. It covers the empty and single-model states, the graph and findings, dragging, removing a model, and the merge dialog with the request that it sends.
- Whole path: the GUI with the real backend was driven through ticking models in the tree, the graph following the ticks, and leaving the plugin view.
