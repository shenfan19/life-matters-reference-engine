# 0159 — Plugins That Filter the Model Tree and Switch Views, the Body Map, a Multi-Model VE Graph, and a Searchable List View

**Date**: 2026-10-15
**Status**: ✅ accepted

---

## Background

ADR 0157 and ADR 0158 let a plugin page show a view, read the selected or ticked models, and ask the host to tick models. Three plugins existed after them, and using them together exposed gaps.

- A plugin that finds models has no way to show them where the user already looks for models. The page would have to ship its own list, duplicating the tree, its folders and its selection.
- Finding models, ticking some, and handing them to another plugin was a chain of manual steps. The user had to leave the page, search the tree by name, tick, and open the next view.
- The graph of variables and equations drew one model, although a user comparing models wants to see where they meet.
- The search box of the model tree filtered only the list view. The tree view, and every view with checkboxes, ignored it, so searching had no effect in the situations where models are being picked. The list view was a flat list of titles, which is hard to read once several models share a title.

## Decision

**1. Two messages from a page to the host.**

- `{type: 'lm-filter-models', paths: [...] | null, label?: string}` makes the model tree show only those models, with the folders that hold them opened. A bar above the search box names the filter, counts the models and clears it. `paths: null` clears it, and clearing restores how the folders were opened before. A path may be written with or without the file suffix, and unknown paths are skipped. The filter stays while the user changes to another view, because the point is to find models in one plugin and use them in another.
- `{type: 'lm-open-plugin', id}` switches to another bundle plugin, and the ticked models stay ticked.

The filter is state of the Simulator and is applied by pruning the tree it passes down, so every way of showing the tree, tree, list, checkboxes, respects it, and the text search stacks on top of it. Two locale keys, `sim.tree.filtered` and `sim.tree.filter_clear`, are added in four languages.

**2. The Body Map plugin, `body_map`.** A paper-doll figure that shows where the ticked models act and which everyday inputs they respond to.

- Placement is by words. The words of a model's tags, path and name are matched against keyword lists in `plugins/body_map/sites.yaml`, one list for each of fifteen organ slots and one for each of nine inputs: air, food, work stress, study and social life, sleep, smoke and alcohol, medication, commute and exercise. A keyword ending in `*` matches every word with that start. A scenario also lights the organs and inputs of the components it imports, one level deep, and records the component as the reason.
- Two endpoints. `locate` places the ticked models. `search` reads the head of every model file under `references/` and `scenarios/` with a regular expression, without parsing the YAML, and returns the paths that match, which takes about a second.
- Clicking an organ or an input adds it to a selection, and a switch chooses whether a model must point to all of the picks or to any of them, default all. The search runs on every change and the result goes to the tree through `lm-filter-models`. A button ticks the first twelve results and a button opens Compose through `lm-open-plugin`. Following a model, an organ or an input dims the rest and draws dashed lines from the inputs to the organs of what is followed.
- The page is read only, written as one static file with no library, and follows the light and dark theme with a plain background and thin lines. Color appears only where a model sits.

**3. VE Graph draws several models.** The manifest sets `ui.model_selection: multi`, and the `graph` endpoint takes `paths` as well as `path`. Variables with the same name are one node, marked with a dashed ring when more than one model declares them, and a variable that is a state in one model and an input or a parameter in another keeps the strongest role. Equations are never merged, because two models may name equations alike, and are colored by their model. A variable of one model only has an outline in that model's color, and the legend lists the models. Models are loaded without validation, because the graph is about structure and a component that reads variables another component defines fails validation alone, which is the normal case for the models found through the Body Map. A name read by one model is drawn when any of the loaded models declares it. A model that cannot be loaded at all is skipped and reported, and does not stop the others. With one model the result is as before, except that a model that fails validation is now drawn.

**4. The model tree search and the list view.**

- The search box filters the tree view and the list view alike, and matches the path of a model as well as its title. The folders of the matches are opened while the filter is on, and a count of matches is shown.
- The list view shows the title with its folders on a second line, sorted by title. It is available with checkboxes, so it also works while ticking models for a plugin and while editing the library, where ADR 0158 hid the view toggle.

**5. Plugin versions.** A manifest's `version` is the plugin's own version and is independent of the engine's. The three plugins start at 0.1.0.

**6. One channel and one name in the model API.** `GET /api/models/{name}` answers with `{success, data}`, where it used to repeat the content of `data` at the top level as well, and the block that sets the simulation is `simulation` only, where the answer, the loader, the command line and the writers of model files each handled `simulator` as an alias. The upload endpoint had its own hand-written copy of the structure, which read an attribute that no longer existed and made every upload fail, and it now answers with the shared `model_to_dict` like the other two routes, so the structure of a model is written in one place.

## Alternatives considered

- **The plugin keeps its own model list and its own search.** Rejected for the reason ADR 0158 gave: it duplicates the tree. A filter on the tree also keeps the tick state in one place, so the models found in one plugin are the models the next plugin receives.
- **The page sends a search text and the host does the matching.** Rejected: the matching is the plugin's own logic, here the keyword lists, and a text box cannot express a union or an intersection of organs and inputs.
- **Placement from the variables and equations of a model, not from words.** Not done: it would need a map from variable names to organs, which is a modeling decision of its own, and the words that authors already put in tags are available now. Placement is therefore a guide to where to look, not a statement of what a model does.
- **Merging equations with the same name in the multi-model graph.** Rejected: names are not identities, and merging would hide that two models update the same quantity.
- **Defaulting a multiple pick to any of them.** Rejected: a second click usually narrows, for example the liver together with exercise, and an empty result under all of them is itself informative, since it shows a gap in the library or in the keyword lists. The switch is one click.
- **A tree filter that is cleared when the user changes view.** Rejected: finding in one view and using in another is the workflow this decision is for.

## Scope of impact

- `gui/src/components/plugins/PluginHost.tsx`: the two messages.
- `gui/src/components/Simulator/index.tsx`: the filter state, the pruned tree, the handlers.
- `gui/src/components/sim_tab/SimModelTree.tsx`: the filter bar, the search on the tree and the list, the list rows with a folder line and checkboxes.
- `gui/src/components/plugins/ViewRail.tsx`: the `UserOutlined` icon name.
- `gui/public/locales/engine/`: three strings in four languages.
- `plugins/body_map/`, new, with a `docs/` folder and `sites.yaml`.
- `plugins/ve_graph/`: the multi-model graph.
- `reference_engine/src/model_serialization.py`, `routes/models.py`, `routes/files.py`, `model_structure/loader.py`, `cli/`: the single channel and the single name.
- `plugins/README_bundle_plugins.md`, `docs/architecture.md`, `docs/cli.md`, `test_verification/test_plugin_framework.py`, `CHANGELOG.md`.

## Result

- Clicking an organ or an input finds the models of the library that point to it, shows only those in the tree, and lets the user tick them and open Compose. The chain from question to merge is a few clicks in one place.
- The search box works wherever the tree is shown.
- Tests cover placement, search with one and with several picks, and the multi-model graph. The filter and the view switch were checked in the running interface with real clicks.

## Open items

- The keyword lists are a first set written by hand. Checked against the 157 public models, 22 had no organ, of which 20 are social models, and air and commute had almost no match. They have not been checked against the larger local library.
- Placement looks at words, not at equations, so a model that never names an organ in its tags, path or name does not reach it. The search finds a scenario through its own tags only, not through the components it imports.
- The search covers `references/` and `scenarios/`, while the tree can hold more folders.
- Variables with the same name are joined whether or not they mean the same quantity, and the graph cannot tell.
- The filter is not remembered across a reload, and the search text matches substrings, so `liver` also finds `oliver`.
