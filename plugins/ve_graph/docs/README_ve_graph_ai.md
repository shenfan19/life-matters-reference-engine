# VE Graph plugin

VE Graph draws the variables and equations of the model selected in the GUI as a graph. Variables are circles, equations are squares, and arrows run from the variables an equation reads to the equation, and from the equation to the variables it updates. Nodes can be dragged, the view can be zoomed and panned, and a layered layout gives a static, readable picture of the same graph.

## What to open

| Question | Open |
|----------|------|
| How do I use the page and what does each control do | [interface_ai.md](interface_ai.md), section 4 |
| What does the backend endpoint receive and return | [interface_ai.md](interface_ai.md), sections 1 to 3 |
| Why is it built this way and what are its limits | [design_ai.md](design_ai.md) |
| How is a plugin like this written from scratch | [writing_a_plugin_ai.md](writing_a_plugin_ai.md) |
| What is the general contract of every bundle plugin | [README_bundle_plugins.md](../../README_bundle_plugins.md) |

## Files

- manifest.yaml: identity, backend class and the strip button of the plugin.
- backend.py: the `graph` endpoint, which turns a model into nodes and edges.
- dist/index.html: the whole page, one file with its styles and script, no external library.
- docs: this folder.

## Tests

- Backend and framework: the case `test_ve_graph_plugin_builds_nodes_and_arrows` in test_plugin_framework.py checks that every arrow joins one variable and one equation.
- Page: no automated test is checked in. The page was exercised in a headless browser with the endpoint answered from the backend function, covering zoom, drag, pinning, mode switch, hiding parameters and SVG export.
