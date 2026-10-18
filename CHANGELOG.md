# Changelog

This file records engineering changes to the LM Reference Engine repository (`cli/`, `reference_engine/`, `gui/`), grouped by subsystem and ordered chronologically within each group. Each entry tries to state what changed in one sentence; the full decision background is in the corresponding numbered ADR under `docs/decisions/`.

The YAML model library is outside this file's coverage; it is maintained independently in [life-matters-models](https://github.com/shenfan19/life-matters-models), and each model's own change history is recorded in that file's `metadata.log` field.

## [Unreleased]

## [1.2.0] - 2026-10-18

### Breaking changes

- `GET /api/models/{name}` answers with `{success, data}` only. The same content used to be repeated at the top level next to `data`, and anything that read `variables`, `equations` and the rest from the top level of the answer has to read them from `data`. The GUI and the plugins already did.
- The block of a model that sets the simulation is `simulation` only. The key `simulator`, an old alias, is no longer read by the loader or the command line, no longer written when a model is exported, merged or created, and no longer returned by the model API. No model in the library used it. The internal attribute of the model object keeps its name.

### Plugin system

- A bundle page can send `lm-filter-models` so that the model tree shows only the models it names, with the folders that hold them opened and a bar that names the filter and clears it, and `lm-open-plugin` to switch to another bundle plugin with the ticked models kept. The filter stays when the view changes, so models found in one plugin can be ticked and used in another. Corresponds to ADR 0159.
- Added the `body_map` plugin, a paper-doll body that shows where the ticked models act. Each model is placed on one of fifteen organs from the words in its tags, path and name, using the keyword lists in `plugins/body_map/sites.yaml`, and a scenario lights up the organs of the components it imports. Nine everyday inputs, air, food, work stress, study and social life, sleep, smoke and alcohol, medication, commute and exercise, are placed the same way.
- In the Body Map, organs and inputs can be picked several at a time with a switch between all of them and any of them. The picks filter the model tree to the models of the library that point to them, a button ticks the first twelve, a button opens Compose, and following a model, an organ or an input dims the rest and draws dashed lines from the inputs to the organs. The `search` endpoint takes a list of `picks` and a `mode`.
- VE Graph draws several ticked models together. Variables with the same name are one node, marked with a dashed ring, equations stay separate and take the color of their model, and the legend lists the models. The `graph` endpoint takes `paths` as well as `path`, loads models without validation so that components which read each other's variables can be drawn together, and skips and reports a model that cannot be loaded.
- Plugin manifests carry their own version, independent of the engine's, and the three plugins start at 0.1.0. The icon name `UserOutlined` can be used in `ui.icon`.

### Testing

- Added three end-to-end regression specs in `gui/e2e/specs`, for the model tree and the session area, the view rail and the three plugins, and the backend answers the page depends on, including that the server keeps answering while the file tree is built. A shared `helpers.ts` finds the models directory and waits for the tree.
- Added a check for props that a component declares and never uses, `gui/scripts/find-unused-props.mjs` read by `test_verification/test_gui_prop_wiring.py`. It finds the kind of loss that hid the cross of the session rows, where a handler is still passed down but nothing draws its control, and a prop that is meant to stay unused is listed with its reason.

### Scripts

- Added `stop.sh` and `stop.cmd`, plain shell and batch scripts that stop whatever is listening on the backend and GUI ports together with the processes it started, so a Ctrl+C that left a process behind no longer blocks the next start. Only a process that listens on a port is stopped, so a browser connected to the backend is left alone, and `--list` shows what is listening without stopping anything. They replace `scripts/kill_ports.py`, which also stopped programs that were merely connected to the port and left the processes under the one it stopped running.

### GUI: model tree

- The list view shows the title of a model with its folders on a second line, sorted by title, and is available while ticking models for a plugin or editing the library, with the checkboxes there. It was hidden in those modes. Corresponds to ADR 0159.
- The search box matches the path of a model as well as its title, and a count of matches is shown under it. Three locale keys are added in four languages.

### GUI: links to a model and a plugin view

- The address bar follows what is open, so a link opens a model on a tab. A link has the form `/model/<model path>/<tab>`, for example `/model/papers/lm_format/banister/banister_validation.yaml/sim`, where the tab is `overview`, `sim` or `opt`, and the path is the key the model tree already uses. Opening a link loads that model on that tab, with the simulation or optimization mode set to match, and takes the place of the model restored from the last visit. Changing the model or the tab writes a new address, and back and forward move between them. Models imported into the session exist only in the visitor's browser and get no link. The server needs no new route, because Nginx (`try_files`) and the Vite dev server already answer every path with `index.html`. The paths are read and written by `gui/src/core/urlRoute.ts` and `useUrlSync.ts`, without a router library. Corresponds to ADR 0160.
- A plugin view has a link too: `/model/<model path>/plugin/<plugin id>` with the model selected, or `/plugin/<plugin id>` with none. For a plugin that takes several models, `?m=<model path>` repeated lists the models ticked in the model tree, and they are ticked again when the link is opened. The state kept inside a plugin page, such as the organs picked in the Body Map, is not part of the link. A link to a plugin the server does not have shows the model tabs.
- A Copy link button in the toolbar above the tabs copies the link of the model and tab that are open. Three locale keys are added in four languages.

### Fixes

- A model imported into the session could not be removed, because the cross of a session row was lost when the model tree was split into its own component, although the handler was still wired. Each session row has its cross again, and uploading a file whose name is already in the session replaces that entry and says so.
- The label of a date error names `simulation.start_date`, the block that models actually use, where it said `simulator`.
- Importing a model file from the model tree always failed. The upload endpoint built its answer by reading `equation` from each equation, an attribute that stopped existing in the rename of 2026-08-09, so every upload ended in a 500, which the page could not parse and so showed nothing useful. The endpoint now answers with the same serialization as `GET /api/models/{name}`, and the page shows the reason when an upload is rejected.
- Downloading a model from the optimization page failed with a 422 when no optimization had been run, or when "with results" was unticked, because the request then left out `results` and the endpoint required it. The endpoint now treats `results` as optional and exports the model as it is when it is left out, which also lets a model with no optimization block be downloaded, and the page shows the reason when a download is rejected, where it used to do nothing. Embedding results into a model with no optimization block is still refused.
- Starting the backend and loading the page no longer stall for minutes when the model library holds thousands of models. Startup loaded every model file only to log a few names, and nothing used the result, so it now counts the files. The file tree, the model list and the plugin endpoints used to do their work on the event loop, where one slow request stopped every other request, even the health check, so they now run in worker threads. The file tree keeps the metadata of each file until the file changes and builds from directory entries, which takes the second and later loads from seconds to under one second. The model list is kept for 60 seconds and requests that arrive during a scan share it, with `?refresh=true` to skip it. With 2097 models the backend answers 2 seconds after it starts and the page shows the tree in about 2 seconds.
- The search box of the model tree now filters the tree view. It used to filter only the list view, so it had no effect in the tree view and in every view with checkboxes.

## [1.1.1] - 2026-10-13

### Plugin system

- Removed the three demonstration plugins. A template for a bundle plugin, with a manifest, a backend and a page, is in `docs/plugin_template/`, outside the folder that is scanned for plugins, together with a short guide. A test checks that the template loads, serves its page and answers its endpoint.

### Fixes

- The simulation chart no longer fails with a stack overflow when a run holds hundreds of thousands of points, such as a year of hourly steps with several plans and Monte Carlo repeats. The chart took the range of its values with `Math.min(...values)`, which passes every value as an argument and throws a `RangeError` past the argument limit of the engine, so the chart of a model with many plans stayed blank. The range is now computed in a loop.
- The Pareto, regrouping and progress charts and the solution summary used the same spread form on lists bounded by the population size. They now use the same loop based helpers, so a large population cannot trigger the failure either.

### Documentation

- `docs/ui_guidelines.md` has a rule against spreading series that may hold simulation points into `Math.min`, `Math.max` or `push`, with the helpers to use instead.
- The README opens with a screenshot of the optimization page.

## [1.1.0] - 2026-10-13

### GUI: the view rail and bundle plugins

- Added a vertical strip, the view rail, between the model tree and the main area. Overview, Simulation and Optimization moved from the horizontal tab bar onto it as buttons with their own icons, a line follows them, and each plugin that declares `ui.type: bundle` adds one button below it. The horizontal tab bar is removed, and the model tree's collapse button moved to the top of the strip. Editing the model library adds a button above the line, closes any open plugin view, and locks the other buttons while it is open. The built-in buttons keep their `center-tab-*` test ids. Corresponds to ADR 0157.
- A plugin view covers the main area in an iframe that is told the selected model, the theme and the language by `postMessage`, so a plugin page can follow the GUI.

### GUI: plugin multi-selection and button order

- A plugin whose manifest sets `ui.model_selection: multi` turns the model tree into checkboxes while its view is open, and its page receives the ticked models in the `models` field of `lm-init`. The tree header shows the count and a button to clear the ticks. Corresponds to ADR 0158.
- A multi-select plugin page can send `lm-set-models` to ask the host to tick given models in the tree, which the sample list of Model Compose uses. Corresponds to ADR 0158.
- The plugin buttons in the view rail can be dragged into a new order, which the browser remembers. Plugins not in the saved order follow in the order of `ui.order`.

### Plugin system

- Added `PluginContext.load_model(path, validate=False)` for models that cannot stand alone, which bypasses the model cache both ways, and the property `PluginContext.models_directory`.
- Added two plugins, `ve_graph`, a draggable graph of the variables and equations of the selected model, and `model_compose`, which joins ticked models through their shared variables, flags variables written by more than one model, and merges the ticked models into a new file through `POST /api/merge`. Model Compose also has a sample list of ready-made combinations that are checked against the model library before they are offered, and models that share nothing drift freely. Each plugin has a `docs/` folder.

- Added the plugin UI type `bundle`: a plugin ships a folder of static files, served at `/api/plugins/{id}/bundle/{path}` with a path-containment check, and needs no CDN or in-browser compilation. Manifests may declare `contract_version: 2`; manifests without it behave as before.
- Plugin backends may define `endpoint_<name>(inputs)` methods, called as `POST /api/plugins/{id}/<name>`; an unknown or malformed name returns 404, and an error raised inside a plugin returns 500.
- Added `PluginContext.load_model(path)`, which reads a model by its path relative to the models directory with imports resolved, and refuses absolute paths and `..`. The model serialization shared with `GET /api/models/{name}` moved to `src/model_serialization.py`; the route's output is unchanged.
- Added three demonstration plugins in `plugins/demo/` and a guide for writing a bundle plugin, `plugins/README_bundle_plugins.md`.
- Added `test_verification/test_plugin_framework.py`.

### Fixes

- `POST /api/merge` returned 500 in SCS mode when the merge succeeded, because the route passed the merged model object to the YAML writer. It now returns the merged model as plain data, in SCS mode for download and in write mode as before.
- The pages of bundle plugins, including the three demo plugins, were ignored by the `dist/` rule of `.gitignore` and missing from clones. They are now tracked.
- The view rail is wider, so a long label such as Optimization is no longer broken in the middle of the word when its button is active.

## [1.0.0] - 2026-07-26

### LM format execution semantics: Regimen, Schedule, Plan

- A Regimen adopts the K×4 structured input-scheduling scheme, expressing time, intake amount, execution days, and validity period as four separate dimensions, replacing the earlier single event list, corresponding to ADR 0038.
- `simulation.schedules` and `simulation.plans` coexisted for a while, with `plans` taking priority and mixing the two forbidden in `papers/`, corresponding to ADR 0087; this was later enforced further down to the location level, with simulation fixed to `plans` and optimization fixed to `optimization.startpoint`, corresponding to ADR 0109, superseding ADR 0087.
- Introduced `simulation.plans`, supporting multiple pre-defined simulation plans in the YAML, so a single run produces multiple curves at once, corresponding to ADR 0076.
- The Optimizer's schedule granularity is split into three tiers, T2 (time window), T3 (weekday pattern), and T4 (start date), corresponding to ADR 0080; the evaluation time window can be set independently of the simulation configuration, corresponding to ADR 0083.
- `optimization.schedules` was unified into a single list format merging decision variables and fixed background quantities, corresponding to ADR 0088, later superseded by ADR 0109's location convention.
- The simulation and optimization Regimen execution paths were merged into the same `_apply_regimens` implementation, removing the previously duplicated `_apply_regimen_events`, corresponding to ADR 0054; Plan/Schedule parsing converged to a single source of truth in the backend's `self.plans`, with the frontend no longer re-parsing the YAML, corresponding to ADR 0110.
- Removed the `second` step-size unit, unifying the simulation step size to three tiers, minute/hour/day, corresponding to ADR 0090; `Simulation.step()`'s input argument unit convention was set to seconds, corresponding to ADR 0096.
- `daily_inputs`, `_apply_schedules`, and the GUI-side manual-override state layer were cleaned up together as leftover code once plans became mandatory, corresponding to ADR 0115.
- The internal implementation was renamed from `regimen_runner.py` to `schedule_runner.py`, with the API contract's field names unchanged, corresponding to ADR 0116; the API/YAML concept-level naming ultimately kept `regimen`, while `optimization.results.reference` was renamed to `recommended` and the intermediate decoding dictionary was removed, corresponding to ADR 0117.
- The terminology, data model, and Monte Carlo interaction for multi-plan simulation were finalized around the Plan concept, corresponding to ADR 0073.

### Optimizer and Monte Carlo

- The Monte Carlo probabilistic-simulation architecture landed: `parameter` supports a distribution expression, the engine supports multiple runs, and the frontend renders the Monte Carlo result distribution as semi-transparent curves, corresponding to ADR 0045.
- The Optimizer was changed to an asynchronous job system, paired with real-time frontend progress display, corresponding to ADR 0049; the optimization algorithm's parameters converged to three presets (fast/standard/fine) linked to a slider UI, corresponding to ADR 0067.
- `optimization.results` was changed to an inline design, paired with a stateless backend service architecture, corresponding to ADR 0069.
- Fixed a bug where the optimization inner-loop Monte Carlo was silently zeroed by `reset_simulation()` when `runs>1`, which had affected the output correctness of 19 paper models; the same batch decoupled the Opt tab's MC controls from the Sim tab, corresponding to ADR 0130.
- Added concurrent-resource protection: optimization jobs and simulation sessions each get their own global cap, returning 503 directly at the routing layer once exceeded, corresponding to ADR 0129.

### The simulation execution core and the CLI

- Fixed a state-pollution issue caused by reusing the asteval Interpreter, switching to rebuilding the Interpreter on every simulation rather than calling `symtable.clear()`, corresponding to ADR 0024; the asteval sandbox execution approach was confirmed as an irreplaceable core safety constraint, forbidding a direct substitution with Python's native `eval()`, corresponding to ADR 0070.
- Equations moved from step-by-step runtime asteval parsing to precompiling into a Python function at load time, corresponding to ADR 0068.
- The CLI was upgraded from an internal batch-running tool into a formal, publicly released interface aimed at AI and automation scenarios, corresponding to ADR 0091 and ADR 0101, revising the earlier "GUI-only, dropping the CLI" position, corresponding to ADR 0072.
- The Sim execution core was merged between the CLI and GUI into a shared `advance_steps`, with the CLI also gaining `--mc-runs`/`--seed` capability, corresponding to ADR 0113; the CLI-side MC command-line flags were later removed, with MC configuration becoming read-only via YAML's `simulation.mc`, unified with the `optimization.mc` pattern, corresponding to ADR 0114, revising ADR 0113.
- Date and time fields moved to upfront validation, eliminating several previous silent fallbacks via `except: pass` in the code shared by the CLI/GUI, corresponding to ADR 0118; the Sim run-log content generation was merged into a shared core, with the CLI/GUI each responsible only for their own output channel, corresponding to ADR 0119.
- Added a `last_error` field to `LoaderEngine.fetch()`, so the `Loader`/`Validator`'s specific error messages are no longer swallowed into a bare `None`/`False`, corresponding to ADR 0124.
- Fixed two fidelity issues in Opt startpoint parsing: the seed had been hardcoded, and `date_range` had been silently dropped under T4 mode; the same batch added a frontend fidelity test, corresponding to ADR 0112.
- Result Exchange settled on CSV as the universal data-exchange format and YAML as the unified model-download format, corresponding to ADR 0094.

### GUI: session management, deployment, and interaction

- Session management went through several rounds of refinement: model import became an atomic upload, `useSession` was separated from the main state, `userEdited` is tracked independently, and dirty detection under a warm-start scenario plus Opt isolation for an inactive model were filled in progressively, corresponding to ADR 0077 and ADR 0089; the earlier lock-based model-switching and refresh mechanism was first replaced by the separated architecture, corresponding to ADR 0082, and later the lock mechanism was removed entirely in favor of freely switching models plus a double-arrow running indicator, corresponding to ADR 0085.
- Added an SCS mode for multi-user cloud deployment, protecting write operations and coordinating with frontend behavior, corresponding to ADR 0078; the GUI session gained an automatic 30-minute-idle destruction, paired with a background periodic sweep task, as a P0 requirement for public deployment, corresponding to ADR 0128.
- Sim and Opt were fully separated at the data-type level, with `InputEvent`/`OptInput` each independent and a new `OptSetupTab` component added, corresponding to ADR 0084; the workspace layout was fixed to a 4:6 percentage split, corresponding to ADR 0079.
- Added LM Score as the core healthy-lifespan metric, distinguishing recoverable from irreversible modes, corresponding to ADR 0081.
- Report export was reworked into consolidated Sim/Opt data plus independent per-plan PNG downloads, replacing the earlier whole-page-screenshot-only approach, corresponding to ADR 0122; Sim export changed to a ZIP of per-variable CSVs when there are multiple plans, corresponding to ADR 0108.
- Added a Pareto Regroup panel, supporting choosing any objective/decision variable for the axes and grouping, with a decision-variable-label bug fixed in the same batch, corresponding to ADR 0140.
- Early UI scaffolding was built up progressively: the Simulator's two-column layout, the left panel's accordion, the toolbar's validate-to-run action flow, the i18n locale-file scheme, client-side state persisted via localStorage, unifying the Sim/Game top bar, the relative font-size system, rounded-corner card panels with drag-to-reorder blocks, toolbar simplification, and layered display in the runtime log panel, corresponding respectively to ADR 0001, 0002, 0003, 0004, 0005, 0007, 0013, 0071, 0095, 0093.
- The disclaimer's placement and presentation rules, unifying the app's name to Life Matters, layering the About dialog's contact info into the project repository and the author's email, and Models being runnable directly from the GUI's file tree, correspond respectively to ADR 0019, 0020, 0021, 0023.

### The testing and validation system

- The three-tier validation framework was finalized: tier 1 numerical precision, tier 2 literature benchmarking, tier 3 optimization plausibility, corresponding to ADR 0056.
- Added the repository's first automated regression test suite, pinning down Sim/CLI consistency and a Monte Carlo determinism bug, corresponding to ADR 0111.
- The test outline and test report were consolidated into an outline-plus-report pair, moved to `models/test/`, replacing the previously scattered validation documentation and model checklist, corresponding to ADR 0123.

### Project structure

- Renamed the top-level directories, unifying `sim_cli`/`sim_engine`/`sim_gui` into `cli`/`reference_engine`/`gui`, reorganizing `docs/` accordingly, and renaming the `SimulatorEngine` class to `ReferenceEngine`, corresponding to ADR 0121.
- Finalized the boundary rule between public and internal documentation: `docs/` is published publicly, `go/` is internal and not published, corresponding to ADR 0055.
- Split the game frontend into an independent repository and settled each app's own UI architecture, corresponding to ADR 0060; confirmed no user-account system would be built, with intermediate results staged in a temporary directory, corresponding to ADR 0061.

---

- [ ]  Edit on submission day
    - [ ] Change the heading above from `[Unreleased]` to `[1.0.0] - YYYY-MM-DD`, and tag the corresponding commit with `git tag v1.0`.
