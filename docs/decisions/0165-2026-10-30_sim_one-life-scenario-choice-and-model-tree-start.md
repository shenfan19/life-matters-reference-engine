# 0165 — One Life: Choosing the Scenario and Its Components, and a Model Tree That Starts Fast

**Date**: 2026-10-30
**Status**: ✅ implemented

---

## Background

ADR 0164 fixed the One Life plugin to one scenario named in `config.yaml`. The virtual human of the library has several scenarios with different step sizes and with or without appetite, and a person who wants to see what one component does to a life had no way to leave it out or add another. The plugin framework already lets a plugin ask for a multi-select model tree through `ui.model_selection: multi`, so the choice could be made in the tree the page already sits beside.

Two things stood in the way.

- A life needs the environment inputs of the infectious and nutritional disease component. Ticking components freely can produce a model that lacks them, or one that does not validate at all.
- The model tree took close to a minute to appear. The library has thousands of models, and the temp_ folders under it hold tens of thousands of folders, one per simulation run. On Windows each folder costs about a millisecond to open. The server also walked the whole library at start only to log a count of yaml files.

## Decision

**1. A list of scenarios in `config.yaml`.** `scenarios` names the scenarios the page offers, and the catalog check refuses a list that does not include `model`, the default. Four virtual human scenarios are listed. A request names its base with `base`, and a base that is not in the list is refused.

**2. Ticked components make a custom scenario.** When the ticked components equal the imports of the base, the base runs unchanged. Otherwise the file of the base is copied with `imports` replaced by the ticked components, named by a hash of the base and the components, or by a name the player gives, and written under `temp_one_life_custom/` of the models directory. That folder starts with `temp_`, so the file never reaches the repository. A choice of between 1 and 40 components is accepted, and every path must be a model file inside the models directory.

**3. Two endpoints and a changed request.** `scenarios` lists each scenario with its components and the inputs a life needs and the scenario lacks, found by the same check the composition uses. `scenario_file` returns the text of the custom scenario to download, and with `save` also writes it under the temp_ folder. `live` and `compare` take `base` and `models` and run the custom scenario when they differ from the base. A model that fails to validate with the ticked components gets one message that says a component probably reads a variable no ticked component defines.

**4. The model tree does not read inside a flood of folders.** A folder with more than 200 subfolders is an output dump. It is listed, and its subfolders are not read.

**5. The metadata of the tree is kept on disk.** The cache of file metadata keyed by modification time and size is written to `output/file_tree_meta_cache.json` after a build that read anything new, and loaded once at the first build. A restart no longer reads every model again.

**6. The server does not count models at start.** The count was only logged, and walking the library to produce it was part of the delay.

## Alternatives considered

- Offer only whole scenarios: simple, but the question of what one component does to a life could not be asked. A scenario list is kept as the base, and the ticking is added on top.
- Let the page build the model in memory and send it: the engine loads models from files, and a file the player can download is also what anyone can reproduce the life with.
- Write custom scenarios beside the library scenarios: they would be picked up by the repository. A temp_ folder is ignored by the existing convention.
- Skip the folders of an output dump by name: names differ between users. A count of subfolders needs no list.
- Warm the tree in a background thread at start: the first request would still wait or show a half-built tree, and the cache on disk removes the work instead of moving it.

## Scope of impact

- Changed: `plugins/one_life/` with `backend.py`, `manifest.yaml`, `data/config.yaml`, `one_life_core/catalog.py`, `dist/index.html`, and new `one_life_core/scenario.py`. `reference_engine/src/routes/files.py` and `reference_engine/src/api_server.py` for the tree and the start. `README.md` gains a section on what Life Matters is not.
- Tests: `test_plugin_one_life.py` covers the scenario list, the choice between the base and a custom scenario, and the scenario file. `test_route_performance.py` covers the folder flood and the cache across a restart.
- The plugin framework, the solvers and the model library are not changed.

## Result

- The page has a scenario dropdown, and ticking components in the tree changes the model the life runs on.
- A scenario that lacks inputs is listed with what it lacks, and a combination that does not validate is explained instead of failing with a trace.
- The tree appears without walking the output folders, and a restart reuses the metadata of the previous run.

## Open items

- The limit of 200 subfolders is a set value. A library folder with more subfolders than that would show as empty.
- A custom scenario keeps the simulation settings of its base. Components with a different step size from the base are not reconciled.
- Custom scenario files accumulate under the temp_ folder and are not cleaned up.
