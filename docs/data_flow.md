# Data Flow

Life Matters's data flow is organized around one principle: **the model file is the single source of truth, computed results are local, temporary artifacts, and publishing is an explicit, deliberate action.**

---

## Two storage layers

The model files are maintained independently in the [life-matters-models](https://github.com/shenfan19/life-matters-models) repository; this repository (life-matters-reference-engine) points to that repository's `models/` directory via the `LM_MODELS_PATH` variable in `.env` (default `../life-matters-models/models`), resolved at startup by `reference_engine/src/paths.py`, with the GUI backend and the CLI sharing the same resolved path; this repository itself tracks no YAML model files.

| Layer | Location | Nature | In git? |
|----|------|------|-----------|
| **The model layer** | `models/**/*.yaml` (pointed to by `LM_MODELS_PATH`, in the life-matters-models repository) | Structural definitions plus published results | Yes, but in the life-matters-models repository, not this one |
| **The output layer** | `output/` | Local run artifacts (CLI) | No (gitignored) |

The GUI's running state lives in the browser's localStorage (a session), never written to disk, never in git.

---

## The full data-flow picture

```
models/**/*.yaml
    │
    ├─ CLI --sim-only ─────────────────► output/*_sim_YYYYMMDD_HHMM.csv
    │                                        (a time series, one output variable per column)
    │
    ├─ CLI --opt-only ─────────────────► output/*_opt_YYYYMMDD_HHMM.csv
    │   (overwritten each generation, nothing lost on interruption)   (the Pareto front, x columns plus f columns)
    │
    ├─ GUI sim tab ────────────────────► an in-memory session (charts)
    │
    └─ GUI opt tab ────────────────────► an in-memory session (the Pareto front)
                                              │
                        output/*_opt.csv ─────┤ imported CSV -> merged into the Pareto set,
                        (the GUI's import button)  │ enabling warm-start
                                              │
                                    "Save results to the model"
                                              │
                                              ▼
                                   models/**/*.yaml
                                   (writing the optimization.results block)
                                              │
                                              ▼
                              git (the life-matters-models repository)
```

---

## Three typical paths

### Path A: local batch optimization (CLI-led)

```
1. Write / adjust models/xxx.yaml
2. python cli/main.py models/xxx.yaml --opt-only
   -> output/xxx_opt_20260606_1130.csv (updated live each generation)
3. To keep searching:
   --opt-continue              warm-starts from the YAML's embedded results
   --opt-continue 20260606_1130  warm-starts from the specified CSV
4. Satisfied with the result -> import the CSV in the GUI's opt tab -> "Save results to the model"
5. git commit in the life-matters-models repository -> publish
```

### Path B: interactive exploration (GUI-led)

```
1. Load the model in the GUI, adjust inputEvents
2. Run the Sim tab -> a live chart
3. Set an objective in the Opt tab -> run the optimization -> view the Pareto front
4. Select a Pareto row -> "Send to Sim" -> verify the optimal plan
5. "Save results to the model" -> git commit in the life-matters-models repository
```

### Path C: CLI output analyzed in the GUI

```
1. The CLI batch-runs output/*_opt.csv in a GUI-less environment
2. Open the GUI -> the opt tab -> "Import CSV"
3. The Pareto solutions merge into the current session, with the warm-start checkbox auto-enabled
4. Continue searching in the GUI, or export to Sim
```

---

## The CSV format (a unified exchange format)

### `*_sim.csv` (a simulation time series)

```
time,var1,var2,...
0,initial value,...
1,...
```

The first column is the time step (measured in step_size.unit), and the remaining columns are the variables named in `output_variables`.

### `*_opt.csv` (a Pareto front)

```
x0,x1,...,xN,obj_var1,obj_var2,...
0.30,0.29,...,65.8,47.1
...
```

The `x*` columns are the decision variables' raw values (corresponding in order to the entries with an `optimize:` sub-block under `optimization.startpoint.regimens`; when a `label` is given, the column name uses the label instead of `x0,x1,...`), and the remaining columns are the objective-variable names. It can be imported directly into the GUI's opt tab for warm-starting or Pareto analysis.

---

## The results-publishing mechanism

Neither the CLI nor the GUI automatically modifies the original YAML. Publishing is an explicit user action:

| Trigger | Action |
|---------|------|
| The GUI's "Save results to the model" | Writes the session's Pareto front into the `optimization.results` block and saves it to the server |
| Downloading the YAML from the GUI | Downloads the complete YAML including `optimization.results` (a local archive, not auto-uploaded) |

The YAML after being written back is fully reproducible: it includes the model definition, the optimization configuration, and the validated results, and can be shared directly or committed to the life-matters-models repository.

---

## The SCS-mode difference

Under SCS (cloud deployment), the CLI is unavailable and the output layer does not exist. The GUI's behavior differs only in write protection:

- Running a simulation / optimization: the same
- Importing a CSV: the same (an in-memory merge)
- Saving results to the server: forbidden (only downloading the YAML is possible)

See [ADR 0078](decisions/0078-2026-05-18_project_scs-mode-design.md) for detail.
