# Reference Engine Internal Architecture: The Validation Layer and the Plugin System

> This document focuses on two internal modules not previously covered by documentation: the **validation layer** (structural/format checks after a model loads) and the **plugin system** (optional secondary analysis of simulation results). For the full data-flow picture, see [data_flow.md](data_flow.md); for the optimizer design, see [opt.md](opt.md).
>
> Note the distinction from the Verify/Validate framework (the current definition is in
> [test_verification/verification_report.md](../test_verification/verification_report.md) §2.1,
> which also gives the two formal protocols V1/V2 under Verify;
> [ADR 0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md) records an early version of this framework):
> **Verify** only asks "did this piece of engine code correctly solve the equation it claims to solve," a pure numerical/software question unrelated to whether the model matches reality;
> **Validate** asks whether the output, after coupling several independently calibrated mechanisms, gives a joint feasible region/Pareto front that is genuine, non-degenerate, and meaningful for a decision,
> partly requiring judgment against an external benchmark (see the `life-matters-models` repository's
> [`models/test_validation/validation_report.md`](../../life-matters-models/models/test_validation/validation_report.md)).
> This document covers a third thing, distinct from both — **code-level input validation** (whether the YAML structure is valid, whether a date/time string's format is correct);
> the three concepts happen to all be called "validation," but are entirely different notions.

---

## 1. The validation layer

Validation splits into two independent modules, each checking a different thing, with no overlap:

| Module | What it validates | When it's called |
|---|---|---|
| [`model_structure/validator.py`](../../reference_engine/src/model_structure/validator.py) | Model structural integrity (variable types, equation variable references, metadata field types) | After `LoaderEngine.fetch()` loads a model (when `validate=True`, on by default) |
| [`validation.py`](../../reference_engine/src/validation.py) | Date/time string format (`YYYY-MM-DD`, `HH:MM`) | A one-time call **before** the CLI/GUI simulation or optimization starts running |

### 1.1 Structural validation: `ModelStructure.validate_model()`

`Validator` is one of `ModelStructure`'s mixins (`class ModelStructure(Loader, Validator, Simulation)`), and `validate_model()` internally runs three sub-validators in sequence, collecting every error and throwing them all at once, rather than stopping at the first error:

```python
# model_structure/validator.py:333-349
validators = [
    ('Metadata', validate_metadata),
    ('Variables', validate_variables),
    ('Equations', validate_equations)
]
for section, validator in validators:
    valid, errors, missing_vars = validator()
    ...
if all_errors:
    raise ValueError(
        f"Model validation failed with {len(all_errors)} errors:\n- " +
        "\n- ".join(all_errors)
    )
```

Each of the three sub-validators checks:

- **`validate_metadata`**: `metadata.name/version/author` must be strings, and `description` must be a string or a dict (corresponding to `model.md`'s structured-description convention).
- **`validate_variables`**: `value` must be a number, `type` must be a valid `VariableType`, `bounds` must be a numeric interval of length 2 with the lower bound no greater than the upper bound, the initial value must fall within `bounds`, and the variable name must be a valid Python identifier (because equations are ultimately compiled into Python functions, see [`simulation.py`'s `_compile_expr_to_fn`](../../reference_engine/src/model_structure/simulation.py)).
- **`validate_equations`**: uses `ast.parse` to parse each equation's `condition` and `dynamics` expressions, extracting the variable names referenced within, and checking that they can all be found in `self.variables` or `self.equations`; also checks `step_unit` — once an equation's `dynamics` uses `step`/`dt`/`step_size`, a valid `step_unit` (`minute`/`hour`/`day`) must be declared, and the deprecated symbols `dt`/`step_size` are forbidden (only `step` is allowed).

Before validating a model's equations, there is also a separate, independent equation-level check (not part of the `validators` list, run separately at the start of `validate_model()`): scanning whether each equation's `condition`/`dynamics` uses `dt` without pairing it with a time-unit constant like `MINUTE`/`HOUR`/`DAY`; a hit only logs `logger.warning`, not counted as an error — a legacy, lenient check whose stricter formal successor, `validate_equations()`'s `step_unit` enforcement, came later.

**Two observations in the current implementation** (recorded as the current state, for later manual judgment on whether they need addressing):

1. `validator.py` defines `validate_equations_old_ver_bug()` (L132-228), but it **does not appear in the `validators` list, nor is it called from anywhere else** — dead code that never executes; judging from the function name (`_old_ver_bug`), it appears to be a leftover old implementation superseded by `validate_equations()`, never cleaned up.
2. The logic for "extracting variable names from an expression" exists in two nearly identical implementations: [the module-level `extract_vars_from_expr` in `model_structure/utils.py:19`](../../reference_engine/src/model_structure/utils.py) (shared by `core.py`'s `split_model` and `validator.py`'s own wrapper method `self.extract_vars_from_expr`), and a same-named function defined locally again inside `validate_equations()` (validator.py:240-263); the two differ slightly in the set of built-in symbols they exclude (the local version additionally excludes `MINUTE`/`HOUR`/`DAY`/`WEEK`/`MONTH`/`YEAR`/`pi`/`e`).

### 1.2 Date/time format pre-validation: `validation.py`

This module solves a specific problem: `schedule_runner.py` and `optimizer_engine.py` parse date/time strings (e.g. `date.fromisoformat(sim_start_date)`) **deep inside a step-by-step hot loop**, and when they hit a format error, they **silently fall back** to a default value (such as the epoch `1900-01-01`, or the whole optimization window falling back to `total_time`), rather than raising an error. This means a typo in `valid_start` or `time_start` silently changes the simulation result independently on both the CLI and GUI paths, and the two sides' fallback logic isn't necessarily identical.

`validation.py`'s approach: before the simulation/optimization actually starts, walk through every date/time field that later code will parse, and raise a `ValueError` right away for a bad format, replacing two potentially divergent silent fallbacks with one upfront error. The four validation functions each correspond to a different data source:

| Function | What it validates | Called by |
|---|---|---|
| `validate_simulator_dates` | `simulator.start_date`/`end_date` | `reference_engine.py`'s `run_simulation`/`run_simulation_mc`, `session_manager.py`'s `start_session`, `optimizer_engine.py` |
| `validate_schedule_list` | Each regimen event's `time_start`/`time_end`/`valid_start`/`valid_end` in the schedule list | The same as above (the sim path) |
| `validate_optimizer_regimens` | The fixed-value and `optimize:` search-window time/date fields under `optimization.startpoint.regimens` | `optimizer_engine.run_optimizer` |

Date validation itself has two strictness levels: `_check_date_strict` (standard ISO date, used for a regimen's `valid_start`/`valid_end`) and `_check_date_loose` (additionally tolerating a year-0 "ancient date" placeholder, used for `simulator.start_date`/`end_date`, because `loader.py`/`optimizer_engine.py`'s span calculation explicitly supports this approximation, see [loader.py:391-401](../../reference_engine/src/model_structure/loader.py)).

---

## 2. The plugin system: current state and future possibilities

### 2.1 Design intent

`plugins/`'s design goal: the backend [`PluginManager`](../../reference_engine/src/plugin_manager.py) scans `plugins/<name>/manifest.yaml` to auto-discover plugins, and the frontend uses a generic component to render a form based on the input schema declared in the manifest, calling `/api/plugins/{id}/run` to fetch and display the result — that is, "after a simulation finishes, the user can optionally run a secondary analysis (causal inference, sensitivity analysis, etc.) without a dedicated GUI page having to be written for each kind of analysis."

### 2.2 Current state: the backend works, the frontend has zero integration

**The backend is fully functional**:

- [`PluginManager`](../../reference_engine/src/plugin_manager.py) recursively scans for `manifest.yaml` under `plugins/` (up to 2 levels deep); `load_plugin`/`run_plugin` dynamically load a plugin's `backend.py` via `importlib`, instantiating and executing it.
- [`routes/plugins.py`](../../reference_engine/src/routes/plugins.py) registers four endpoints, `/api/plugins` (list), `/api/plugins/{id}/ui-page` (an iframe page for a `component` plugin's custom UI), `/api/plugins/{id}/bundle/{path}` (the static files of a `bundle` plugin, refusing any path outside the plugin's `ui.root`), and `POST /api/plugins/{id}/{endpoint}` (execution: `run` calls `run(inputs)`, any other name calls the plugin class's `endpoint_<name>(inputs)`, and an unknown name returns 404), properly mounted in `api_server.py`.
- [`plugin_context.py`](../../reference_engine/src/plugin_context.py)'s `PluginContext` gives a plugin a unified interface for logging/caching/(optionally) retriggering a simulation, and `load_model(path)` for reading a model with its imports resolved.
- There are currently two analysis plugins without a page: `plugins/sensitivity_analysis/` (computes the Pearson correlation coefficient between state and objective variables, outputting tornado-chart data; its manifest notes it is intended for literature benchmarking at the Validate layer, "tier 2" in ADR 0056's three-tier framework) and `plugins/post_causal_inference/` (a Granger causality test, outputting a causal-graph edge list). Both manifests declare `ui.type: none`, meaning they supply no custom UI and can only be driven through a generic form component like `DynamicForm.tsx`.

**The frontend integrates only `bundle` plugins** (added 2026-10-07). A vertical strip between the model tree and the main area, [`ViewRail`](../../gui/src/components/plugins/ViewRail.tsx), holds a button for each view of the main area, Overview, Simulation and Optimization first, then one for each plugin whose manifest declares `ui.type: bundle`, and [`PluginHost`](../../gui/src/components/plugins/PluginHost.tsx) shows the chosen one in an iframe over the main area, sending it the selected model, the theme and the language by `postMessage`. The two existing analysis plugins declare `ui.type: none` and are still not reachable from the interface, and [`gui/src/components/DynamicForm.tsx`](../../gui/src/components/DynamicForm.tsx), the generic form that calls `/api/plugins/{id}/run`, is still imported by nothing. A page can also ask the host to filter the model tree to some models (`lm-filter-models`) and to switch to another bundle plugin (`lm-open-plugin`), so that models found in one plugin are ticked and used in another. Three complete plugins ship in `plugins/`: `ve_graph`, which draws the variables and equations of one or several models, `model_compose`, which joins ticked models through shared variables and can merge them, and `body_map`, which places models on the organs of a paper-doll body from the words in their tags, path and name. How to write a bundle plugin is in [`plugins/README_bundle_plugins.md`](../../plugins/README_bundle_plugins.md). The decisions are recorded in [ADR 0157](decisions/0157-2026-10-10_sim_bundle-plugins-and-view-rail.md), [ADR 0158](decisions/0158-2026-10-12_sim_plugin-multi-model-selection-and-reorderable-rail.md) and [ADR 0159](decisions/0159-2026-10-15_sim_plugin-tree-filter-body-map-and-multi-model-graph.md).

(Before 2026-10-07 the frontend had no integration at all; that state was first recorded on 2026-06-24 and rechecked on 2026-07-07.)

### 2.3 Two possible future directions

**Already executed on 2026-07-10**: `reference_engine/src/PluginLoader.tsx` (an orphaned React component placed in the wrong directory, zero references, with a `// if delete?` comment on its first line) and `gui/src/plugin_ui_server.py` (an orphaned `FastAPI()` app that was never started, zero references) have been deleted — this step should be done regardless of whether direction A or direction B is chosen later, and does not prejudge the choice of direction.

What remains is a product-scope question, not just code cleanup, and is still undecided:

- **Direction A (add a frontend entry point)**: keep the plugin system's overall architecture, and wire `DynamicForm.tsx` into some actual page (e.g. a model toolbar, or a standalone "Plugins" tab), making the two existing plugins (sensitivity analysis, causal inference) usable. Taken in part on 2026-10-07: the strip and iframe host described above exist for `bundle` plugins, while `DynamicForm.tsx` and the two analysis plugins are still unwired.
- **Direction B (remove it entirely)**: judge that the plugin feature is a half-finished piece that never truly landed, and remove the `plugins/` subsystem altogether (`PluginManager`, `routes/plugins.py`, `plugin_context.py`, the two example plugins, `DynamicForm.tsx`), redesigning it if a genuine need for pluggable secondary analysis arises later.

Which direction to choose depends on the priority of "post-simulation secondary analysis like sensitivity analysis/causal inference" on the product roadmap, not a purely technical judgment.
