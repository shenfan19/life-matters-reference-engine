# Implementation Detail

> This document records the Loader module's data-loading/assembly mechanism, and several implementation details of the simulation engine's runtime not expanded on in [design.md](design.md) (equation execution order, model validation before entering the simulation, interface-layer constraints for the GUI/CLI, intermediate-result staging, and the editing-state versus running-state snapshot).
> For the full data-flow picture, see [design.md](design.md); for the optimizer design, see [opt.md](opt.md); for the validation layer's and the plugin system's internal structure, see [architecture.md](architecture.md).

## The Loader module (data loading and assembly)

The Loader is the bridge between static YAML and the dynamic simulation environment, responsible for parsing models under `models/source/` and `models/stories/`, handling dependency imports, and assembling a complete, executable `ModelStructure` in memory.

### The principle for cross-model data references

- **The `components/` layer**: declares only its own variables and equations, referencing no other model.
- **The `stories/` layer**: `imports` multiple models, overriding parameters via `patches`.

This avoids coupling between models, following the single-responsibility principle.

### The expression-evaluation architecture (⭐⭐ a core constraint)

**asteval is the safety-sandbox layer for equation expressions, and must not be replaced directly with Python's native `eval()`.**

A YAML equation is hand-written by a modeler and counts as "untrusted user input." asteval supplies:
- An isolated execution environment with no access to the filesystem, network, `__import__`, or other dangerous operations
- Safe versions of built-in math functions (`sin`/`cos`/`max`/`min`, etc.)
- Controlled capture of syntax errors, so it never crashes the whole engine

#### Runtime layering

| Layer | Tool | Responsibility |
|----|------|------|
| **Validation layer** (at load time) | `asteval` | Parsing plus syntax checking; detecting an undefined variable |
| **Compilation layer** (before the first step) | `ast.parse` plus `exec` | Converting an expression into a Python function (`_build_equation_cache`) |
| **Execution layer** (every step) | A native Python function call | `fn(*args)`, with variables passed via LOAD_FAST |
| **Fallback layer** (on a compilation failure) | `asteval.eval()` | Does not interrupt the simulation, preserving compatibility |

**Forbidden**: substituting `eval(expr, symtable)` or `eval(compile(expr, ...), globals)` directly for `asteval.eval()`, even for an expression already sourced from YAML. asteval cannot be bypassed at the validation layer or the fallback layer, see ADR 0024, ADR 0068, ADR 0070.

### Handling variable-naming conflicts

When merging multiple models:
- A variable or equation defined by the **root model (the caller)** **always overrides** a same-named definition in an imported model.
- A same-named variable with semantic ambiguity (e.g. two models both defining `body_weight`) issues a warning, requiring it to be explicitly specified in `patches`.

### Architectural constraint detection

- Circular dependencies are forbidden (`A imports B imports A`).
- The `models/` layer is forbidden from importing the `stories/` layer.
- If the `models/` layer contains an `optimizer` field, a warning is issued, recommending it be migrated to the story layer.

### Evidence conversion (done automatically at load time)

The Loader iterates over the entries in the YAML's `variables:` that declare an `evidence_type` field, performing the conversion according to that field, and writes the conversion result back in place into `self.variables` (`type` stays `parameter`, with no `_effective` suffix added), so `equations`/`dynamics` reference it directly by that name. For the specific conversion equations of the 8 subtypes, the traceability fields (`evidence_type`/`evidence_raw_value`), and known implementation details (such as `hr`'s `baseline_ref` not being validated for its target type on the base conversion path), see [evidence/conversion.md](evidence/conversion.md); for the `applies_to` mechanism that automatically wires a conversion result into some state variable's dynamics (the validation order, the generated expression template, `rate_unit`/`step_unit` conversion), see [evidence/applies_to.md](evidence/applies_to.md).

### Metadata description

`metadata.description` keeps its original structure at runtime: it can be a string, or a mapping object. The backend only does type validation, without fixing a field set or padding empty fields. The frontend's Overview page is responsible for displaying a string as a single-line `Brief`, or displaying all non-empty fields in a mapping object's field order in the YAML.

The recommended field names are in `model_design.md`, but the Loader and Simulator do not depend on these recommended fields; a new field automatically generates an English label from its key.

### Precompiling an equation into a Python function (ADR 0068)

The first time `step()` is called after a model loads, `_build_equation_cache()` precompiles each equation once:

1. `ast.parse()` extracts the variable names an expression references (model variables plus step-size symbols)
2. `exec()` generates a named-parameter function in an isolated namespace:
   ```python
   def _fn(blood_glucose, uptake, utilization, step): return blood_glucose + (uptake - utilization) * step
   ```
3. Caches `(fn, [param_names])` and the sorted equation list

Every step calls `fn(*[_get_arg(n) for n in params])`, passing variables in as positional arguments; internally, Python uses `LOAD_FAST`, with no dictionary-lookup overhead. On a compilation failure, it falls back to `asteval.eval()`.

---

## The simulation-engine runtime

### Equation execution order

When multiple equations update the same variable, the `priority` field controls the execution order:
- A smaller number executes first (e.g. `-100` before `0`).
- Conflicting variables in parallel are evaluated in order via `asteval`, avoiding an implicit race condition.

### Model validation (before entering the simulation)

> The following is a statistical-validation concept described in a historical design draft (forward-simulating a statistical incidence rate, comparing against a literature group, benchmarking against KM/RCT results); it is not implemented and not on the current roadmap.

The current actual implementation is pure structural validation (whether `metadata`/`variables`/`equations` fields exist, whether their types are correct, whether the variables `dynamics` references have been defined, etc.), involving no statistical computation at all:

```bash
GET /api/validate/{file_path}
POST /api/validate
```

(`reference_engine/src/routes/files.py::_simple_yaml_validate`) returns a list of errors when validation fails, which the frontend uses to block entering the simulation.

### Interface-layer constraints (⭐⭐ a core constraint)

**The GUI (`gui/`) is the primary interface aimed at human researchers; the CLI (`cli/`) is the formal, publicly released interface aimed at AI/automation scenarios
(ADR 0101, revising ADR 0072's statement that "the CLI is not a formal interface"). Both share the same engine layer, and result consistency is automatically regression-tested by
`test_verification/test_sim_cli_consistency.py` (ADR 0111).**

```
A human user -> gui (React) -> the HTTP API (api_server.py) -> the engine layer (Python)
AI/a script  -> cli (lm-sim) ─────────────────────────────► the engine layer (Python)
```

- **A capability that only the GUI has does not trickle down to the CLI**: charts, interactive parameter tuning, history archiving, etc. are still implemented only in the GUI (see the "Relationship with the GUI" table in `cli.md`)
- **The CLI is not treated as a test entry point**: tests import the engine-layer functions directly, not going through the CLI's parsing layer (ADR 0072)
- Internal debugging files such as `optimizer_cli.py` are kept for now, not shipped with the code release, and not introduced in the documentation

See ADR 0072 and ADR 0101 for the background and reasoning behind this decision.

### Intermediate-result staging (models/temp/)

Intermediate files produced by opt and simulation are stored in `models/temp/{job_id}/`, with no dependency on a user-account system:

```
models/temp/
  {job_id}/
    input_override.yaml   # the input the opt writes back, feedable directly to sim
    charts/               # chart files
    result.csv
```

**A frontend-backend convention:**
- The backend generates a `job_id` (a uuid) when creating a task, and returns it
- The frontend stores `job_id` in `localStorage`, recoverable after a refresh
- `GET /api/download/result/{job_id}/{filename}` triggers a browser download
- The backend clears any temp subdirectory older than 24h at startup

See ADR 0061 for detail.

### Editing-state refresh versus running-state snapshot

The Simulator's frontend state falls into two categories:

- **Editing-state UI state**: the currently selected YAML, the left tree's expansion state, the tab, panel open/closed states, font size, input configuration, etc., which can be saved in `localStorage`.
- **Source model content**: the raw YAML text, resolved imports, variables, equations, `simulation`, and `optimizer`, re-read from the backend every time a selection is made or a manual refresh happens, never treated as a long-term cache of old content.

Once a simulation run starts, the backend session holds the resolved model object as it was at start time, as a snapshot for this run. Afterward, even if the YAML file changes, an existing session never switches models mid-run; only creating a new session reads the new YAML version.

After a page refresh or a brief disconnection, the frontend can use the locally saved `sessionId` to call:

```
GET /api/simulation/session/{session_id}
```

If the backend session still exists, the existing trajectory, progress, output variables, and random seed are restored; if the session has expired or the backend has restarted, the last locally saved static result is kept for viewing, but the run cannot continue.

The Game-derived application follows the same principle: selecting a level/editing state refreshes the story/card YAML; once a game begins, the current match is fixed to the story/card snapshot taken at the start, and restoring the page restores the match state. A source-file update only affects a newly started game and never contaminates a match in progress.

See ADR 0064 for detail.
