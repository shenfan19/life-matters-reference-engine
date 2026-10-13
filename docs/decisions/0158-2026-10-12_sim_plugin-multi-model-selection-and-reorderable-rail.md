# 0158 — Multi-Model Selection for Plugins and a Reorderable Plugin Strip

**Date**: 2026-10-12
**Status**: ✅ accepted

---

## Background

ADR 0157 gave a plugin a full-page view that is told about one selected model. Two plugins written on top of it showed what that contract lacks.

- A plugin that compares models needs several models at once. The model tree selects exactly one, so such a plugin would have to ship its own model list, duplicating the tree and its search and folders.
- Component models, such as the human body subsystem files, read variables that another component defines. They fail validation when loaded alone, which is exactly the situation a plugin about composing models has to analyse, and `PluginContext.load_model` always validated.
- A plugin writing a new model file would bypass the write protection that `POST /api/merge` applies in the public deployment mode, unless it goes through that route.
- With more than a few plugins installed, the order the manifests give is not the order a user wants, and the strip had no way to change it.

## Decision

**1. `ui.model_selection: multi` in the manifest.** A plugin that sets it makes the model tree show a checkbox on every model while that plugin view is open. The same checkbox rendering as the model library editor is reused, with its own list of ticked models that survives closing and reopening the plugin view within a session. The header of the tree shows how many are ticked and a button to clear them. The view toggle between tree and list is hidden in this mode. The default is `single`, which changes nothing for existing plugins.

**2. The ticked models reach the page.** `lm-init` gains a field `models`, a list of `{key, title, path}` in the order the models were ticked, empty unless the plugin asked for multi selection. The existing field `model` keeps the single selected model. A page that ignores `models` works as before.

**3. `PluginContext.load_model(path, validate=True)`.** With `validate=False` the model is loaded without the validation step, and the loader cache is bypassed both ways, so an unvalidated model is never handed to a caller that asked for a validated one. A read only property `PluginContext.models_directory` gives the absolute models path for plugins that choose or check a path under it.

**4. Merging goes through the existing route.** The compose plugin does not write files itself. It proposes an unused file name under `temp_merged_ai/` through its own endpoint and posts the ticked model keys to `POST /api/merge`, so the write protection, the loader merge semantics and the session mode answer of that route apply unchanged. Names are limited to letters, digits, underscore and hyphen, an existing file is never overwritten, and the folder is gitignored by the `temp_` convention of the models repository.

**5. A page can ask the host to tick models.** A page sends `{type: 'lm-set-models', paths}` to its parent, and the host ticks exactly those models in the tree, in that order, then sends `lm-init` as usual. A path may be written with or without the file suffix, unknown paths are skipped, and the message is honoured only for a plugin with `ui.model_selection: multi`. The tree stays the single place where the selection is shown, so a preset chosen in the page is visible in the tree and the merge uses the same keys.

**6. The plugin buttons can be dragged into a new order.** A button is dragged onto another to be placed before it, or below the last one to go to the end. The order is kept in the browser under the key `lm_plugin_button_order`. Plugins that are not in the saved list, such as a newly installed one, follow in the order of `ui.order`. Dragging is off while the model library editor is open. The built-in views are not movable.

**7. Two plugins use the new pieces.**

- `ve_graph`: a draggable graph of the variables and equations of the selected model, with a static layered mode and SVG export.
- `model_compose`: models that share a variable are joined through that variable, with arrows from the model that writes it and to the models that read it. A variable written by more than one model is flagged, differences in unit, type and value are listed, and one button merges the ticked models into a new file. A sample list offers ready-made combinations from the model library, each checked against the library when the list is requested and offered only if it still behaves as described.

## Alternatives considered

- **The compose plugin ships its own model list.** Rejected: it duplicates the tree, and the user already knows where models are in the tree. The cost of the host change is small because the checkbox rendering already existed for the library editor.
- **Making the model tree always multi-select.** Rejected: the single selection drives simulation and optimization, and a checkbox in front of every model would be noise for most work.
- **A write endpoint in the plugin context, so plugins save files themselves.** Rejected: it would give plugins a second way to write that skips the write protection. Reusing `POST /api/merge` keeps one writer.
- **Keeping the validated load and having the compose plugin skip components that fail.** Rejected: components that fail alone are the main thing being composed.
- **Saving the plugin order on the backend.** Rejected for now: the order is a personal view preference, and the GUI already keeps similar preferences in the browser.

## Scope of impact

- `reference_engine/src/plugin_context.py`: `load_model(validate=...)`, `models_directory`.
- `gui/src/components/plugins/`: `usePlugins.ts` reads `ui.model_selection`, `PluginHost.tsx` sends `models` and relays `lm-set-models`, `ViewRail.tsx` reorders buttons and knows the cluster icon.
- `gui/src/components/sim_tab/SimModelTree.tsx`: multi-select mode.
- `gui/src/components/Simulator/index.tsx`: the ticked list and its wiring.
- `gui/public/locales/engine/`: two strings in four languages.
- `plugins/ve_graph/`, `plugins/model_compose/`, each with a `docs/` folder.
- `plugins/README_bundle_plugins.md`, `plugins/INTERFACE.md`, `test_verification/test_plugin_framework.py`, `CHANGELOG.md`.

## Result

- A plugin can ask for several models and get them in tick order, with the ordinary tree as the picker.
- The compose plugin shows couplings and write conflicts before a merge, and states what a merge will do. In the loader merge, the declaration of a shared variable from the model ticked later replaces the earlier declaration, equations with different names are all kept, so a variable written by two models is updated by both, and equations with the same name replace each other.
- Existing plugins and tests are unaffected.

## Open items

- Neither the ticked list nor the button order is shared between browsers, and the ticked list is not remembered across a reload.
- Dragging is mouse only, and there is no keyboard way to reorder.
- A merged file appears in the model tree after the tree is reloaded.
- Session models, which exist only in the browser, cannot be ticked.
