# VE Graph interface

## 1. Manifest

```yaml
id: ve_graph
name: VE Graph
version: '0.1'
contract_version: 2
backend:
  entry: backend.py
  class: VeGraph
ui:
  type: bundle
  root: dist
  entry: index.html
  title: VE Graph
  icon: ApartmentOutlined
  order: 20
```

The plugin is a bundle plugin, so the GUI lists it as a button in the view strip and covers the main area with `dist/index.html` in an iframe. The `order` value sets its place among the plugin buttons, small first.

## 2. Backend endpoint

`POST /api/plugins/ve_graph/graph` calls `VeGraph.endpoint_graph(inputs)`.

Request body:

```json
{ "inputs": { "path": "references/medical/physiology/banister_fitness_fatigue_2026" } }
```

`path` is the model path relative to the models directory, the same value the GUI sends as `model.path`. A missing path returns `{"success": false, "error": "No model path given"}`. A path that cannot be loaded returns `success: false` with the loader message.

Successful response:

```json
{
  "success": true,
  "name": "banister_fitness_fatigue",
  "nodes": [ ... ],
  "edges": [ { "source": "var:training_load", "target": "eq:fitness_dynamics" }, ... ]
}
```

Node fields shared by both kinds:

- id: `var:<name>` for a variable and `eq:<name>` for an equation. The prefix keeps a variable and an equation with the same name apart.
- kind: `variable` or `equation`.
- label: the variable or equation name.
- description: the description field of the model, or an empty string.

Extra fields of a variable node:

- vtype: `state`, `input` or `parameter`.
- unit: the unit string, or an empty string.
- value: the value field of the model, which may be a number, a string, a list or null.
- isolated: true when no equation reads or updates the variable.

Extra fields of an equation node:

- expressions: a map from each updated variable to its expression text.
- condition: the condition text, or an empty string.

## 3. How edges are built

For each equation the backend builds the set of variables it reads and the list of variables it writes.

- Reads: every identifier found in the expressions of `dynamics` and in `condition`, taken from the engine function `extract_vars_from_expr`, then reduced to names declared in `variables`. Engine symbols such as `step_size`, `dt` and `time`, math function names and Python keywords are not variables and never appear.
- Writes: the keys of `dynamics` that are declared in `variables`.
- Arrows: one arrow from each read variable to the equation, and one arrow from the equation to each written variable.

An equation that reads the variable it updates, which is the usual form of a state update, produces two opposite arrows between the same pair of nodes. The page draws such a pair as two curves so both stay visible.

The model is loaded through `PluginContext.load_model`, so imports are resolved and the graph covers the full imported model.

## 4. The page

### Messages

The page sends `{type: 'lm-ready'}` to its parent when it can receive. The host answers with `lm-init`, and sends it again when the model, theme or language changes.

```
{ type: 'lm-init', model: {key, title, path} | null, theme: 'dark' | 'light', lang: string }
```

Handling in the page:

- theme: switches the `data-theme` attribute of the root element. The first value also comes from the `theme` query parameter, so the page looks right when opened on its own.
- lang: any value starting with `zh` selects the Chinese texts, every other value selects English.
- model: the graph is fetched again only when `model.path` differs from the last one, so a theme or language change does not rebuild the layout. A null model shows a prompt to select a model.

### Controls

- Mode: switches between the dynamic layout, where nodes move under forces, and the layered layout, a fixed arrangement from sources on the left to outputs on the right. The change is animated.
- Plus and minus: zoom around the center of the view. The wheel zooms around the pointer.
- Fit: scales and moves the view so all visible nodes fit.
- Hide parameters: removes nodes of type `parameter` and their arrows from the picture.
- Hide unconnected: removes variables that no equation touches.
- Search box: dims every node whose name does not contain the text and every arrow that touches no match.
- Unpin all: releases all dragged nodes back to the force layout.
- Export SVG: downloads the visible graph as a standalone SVG file named `<model name>_ve_graph.svg`, with the current theme colors and a background.

### Pointer actions

- Drag a node: moves it and pins it, shown by a bright outline. In the dynamic mode the other nodes adjust around it.
- Double-click a node: unpins it.
- Click a node: selects it and opens a detail panel with its type, unit, value, expressions, condition and description. Click the background to deselect.
- Hover a node: dims everything except the node, its neighbors and the arrows between them. A selected node keeps this highlight until deselected.
- Drag the background: pans the view.

### Colors

Colors are CSS variables on the root element, defined for light and dark in one block at the top of the page. State variables are green, inputs blue, parameters orange, and equations gray. Changing a color means changing one variable, and the SVG export reads the same variables.
