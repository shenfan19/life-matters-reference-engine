# Model Compose interface

## 1. Manifest

```yaml
id: model_compose
contract_version: 2
backend:
  entry: backend.py
  class: ModelCompose
ui:
  type: bundle
  root: dist
  entry: index.html
  title: Compose
  icon: ClusterOutlined
  order: 30
  model_selection: multi
```

`model_selection: multi` is what turns the model tree into checkboxes while the plugin view is open and makes the host send the ticked models to the page. Without it the plugin would see only the single selected model.

## 2. Backend endpoints

All three are called as `POST /api/plugins/model_compose/<name>` with a body of the form `{"inputs": {...}}`.

### compose

Request: `{"paths": ["references/medical/physiology/human_body/glucose_insulin_2026", ...]}`, at most 12 paths, each relative to the models directory.

Response fields:

- success: false with `error` when no path was given.
- models: one entry per model that loaded, with `path`, `name`, `n_variables` and `n_equations`.
- shared: one entry per variable that two or more models touch and at least one declares, described below.
- collisions: equation names that more than one model defines, each with `equation` and `paths`.
- includes: pairs where one ticked model already imports another, each with `model` and `includes`.
- errors: a map from path to message for models that could not be loaded.

Each entry of `shared` has these fields:

- name, vtype, unit, description: taken from the first model that declares the variable.
- roles: a map from model path to `writer`, `reader` or `none`. A writer has the variable among the targets of its equations. A reader uses it in an expression or a condition and does not write it. A model with role `none` only declares it.
- declares: a map from model path to whether that model declares the variable. A model can read or write a variable that it does not declare, which is how a component asks another component for it.
- status: `conflict` when two or more models write it, `coupling` when one writes it and another reads it, and `common` otherwise.
- notes: differences between the declaring models, each with `kind` and `values`. The kind is `unit` for different units, `type` for different types such as state and parameter, and `value` for different values of a variable that no model writes.

The models are loaded without validation, so component models that need variables from another component can be analysed. The loader cache is bypassed for these loads.

### suggest_output

Request: `{"names": ["heater", "window"]}`. Response: `folder`, `filename` and `output_path`, an unused name such as `temp_merged_ai/merged_heater_window.yaml`. With more than three names the name ends in `_plus<k>`, and a numeric suffix is added when the name is taken.

### check_output

Request: `{"filename": "merged_heater_window.yaml"}`. The name must consist of letters, digits, underscore and hyphen and end in `.yaml`. Response: `success` true with `output_path`, or `success` false with `error` set to `invalid_name` or `exists`. An existing file is never accepted.

## 3. The page

### Messages

The page sends `lm-ready` and receives `lm-init` like every bundle plugin. It reads the field `models`, a list of `{key, title, path}` in tick order. It asks the backend again only when the list of paths changes, after a short delay so that ticking several models quickly causes one request. Theme and language changes do not trigger a request.

### What is drawn

- Purple rounded rectangles are the ticked models. Only variables shared by two or more models are drawn, so unshared variables never clutter the picture.
- A circle is a shared variable. Gray blue means shared and only read, green means one model writes it and others read it, and red with an exclamation mark means several models write it.
- An amber outline on a circle marks a difference in unit, type or value between the models that declare it.
- An arrow from a model to a variable means the model writes it. An arrow from a variable to a model means the model reads it. A dashed line without an arrowhead means the model declares the variable and neither reads nor writes it.
- Red arrows belong to a variable written by several models, and green arrows to a coupling.

### Findings panel

The panel at the top left lists what needs a decision.

- Written by several models: each conflict variable with the models that write it. Clicking an entry selects the node and moves the view to it.
- Differences: unit, type and value differences, equation names that exist in more than one model, and models that already import another ticked model. In a merge the model ticked later wins, which the heading says.
- Coupling: how many variables carry a value from one model to another, which is the positive result of combining.
- Not loaded: models that failed to load, with the reason.

### Controls

- Plus, minus, fit and the wheel: zoom and fit as in VE Graph. The view fits itself when the layout settles, until the user zooms or pans.
- Drag and double-click: drag a node to move and pin it, double-click to release it. Unpin all releases every node.
- Click: selects a node and shows its detail, which for a model lists the shared variables it writes, reads and declares, and for a variable lists the role of each model.
- Export SVG: downloads the graph with the current theme colors.
- Merge into new model: enabled with two or more ticked models. It opens a dialog described in the design document.

Positions of nodes that stay in the graph are kept when models are ticked or unticked, so the picture does not jump.
