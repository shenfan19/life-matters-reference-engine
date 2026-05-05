# Plugin System — Requirements, Design & Implementation Plan

> Internal task plan. Public API contract is in `plugins/INTERFACE.md`.

---

## 1. Requirements

| ID  | Requirement |
|-----|-------------|
| R1  | Backend-only plugins (no UI) must be discoverable, loadable, and callable via REST |
| R2  | Plugins with a custom HTML UI must be servable as isolated iframes |
| R3  | Frontend must list available plugins and let the user trigger a run |
| R4  | Plugin inputs: `model`, `sim_results`, `sim_config` (auto-injected) + plugin-specific `params` |
| R5  | Plugin outputs rendered by result type: `html` / `json` / `text` / `table` |
| R6  | Plugin context provides: `log()`, `get_cached()`, `set_cached()`, `run_simulation()` |
| R7  | Missing optional dependencies (e.g. `statsmodels`) return a user-visible error, not a 500 |
| R8  | Plugin errors are caught and surfaced to the user, never crash the API server |

---

## 2. Design

### 2.1 Backend (complete)

```
plugins/
└── post_causal_inference/
    ├── manifest.yaml     ← plugin identity and wiring
    └── causal.py         ← CausalInference.run(inputs) → dict

sim_engine/src/
├── plugin_manager.py     ← scan / load / run
├── plugin_context.py     ← PluginContext injected at call time
└── api_server.py         ← /api/plugins GET, /{id}/run POST, /{id}/ui-page GET
```

Routes already wired in `api_server.py`:
- `GET  /api/plugins`                → list all plugins
- `GET  /api/plugins/{id}/ui-page`   → serve iframe HTML (ui.type=component only)
- `POST /api/plugins/{id}/{endpoint}` → call backend (typically `run`)

### 2.2 Frontend (missing)

New component needed: **`PluginPanel`** — a lightweight panel that:
1. Fetches `GET /api/plugins` on mount
2. Renders a list of available plugins (name + description)
3. For each plugin: a "Run" button that calls `POST /api/plugins/{id}/run`
4. Renders the result by `result_type`: html (iframe/dangerouslySetInnerHTML), json (code block), text (plain), table (antd Table)

**Entry point decision** (pick one before implementing):

| Option | Tradeoff |
|--------|----------|
| New "Plugins" center tab (after Report) | Most visible; adds a 6th tab |
| Button in Report tab header | Keeps tab count at 5; less discoverable |
| Floating action button (bottom-right) | Non-intrusive; unclear affordance |

Recommended: **new center tab "Plugins" / "插件"** — cleanest separation.

### 2.3 Known Bug

`api_server.py` line 408 passes `context=None` to `plugin_manager.run_plugin()`.
PluginContext is constructed but never injected, so `self.ctx.log()` calls inside plugins
will raise `AttributeError: 'NoneType' object has no attribute 'log'`.

Fix: construct and pass `PluginContext(simulator_engine)` at call time.

---

## 3. Implementation Tasks

### Phase 1 — Fix and wire backend (prerequisite for everything)

- [ ] **T1** Fix `context=None` in `api_server.py`:
  ```python
  from src.plugin_context import PluginContext
  ctx = PluginContext(simulator_engine=simulator_engine)
  result = plugin_manager.run_plugin(plugin_id, inputs=payload.get('inputs', {}), context=ctx)
  ```
  Verify: `post_causal_inference` logs appear in server output when called.

- [ ] **T2** End-to-end smoke test of `post_causal_inference` via curl or Postman:
  ```bash
  POST /api/plugins/post_causal_inference/run
  { "inputs": { "sim_results": [...10+ rows...] } }
  ```
  Expected: `{"result_type": "json", "data": {"edges": [...], ...}}`

### Phase 2 — Frontend PluginPanel

- [ ] **T3** Decision: confirm entry point (new tab recommended)

- [ ] **T4** Add locale keys:
  - `sim.tab.plugins` = "Plugins" / "插件" / "插件"
  - `plugins.noPlugins` = "No plugins available" / "暂无插件"
  - `plugins.run` = "Run" / "运行"
  - `plugins.running` = "Running…" / "运行中…"

- [ ] **T5** Implement `PluginPanel.tsx`:
  ```
  sim_gui/src/components/PluginPanel.tsx
  ```
  - Fetch plugin list on mount (`GET /api/plugins`)
  - List: antd Card per plugin (name, description, version, author)
  - Run button per plugin → POST `{inputs: {model, sim_results, sim_config}}`
  - Result renderer: switch on `result_type`
    - `text`: `<Typography.Text>`
    - `json`: `<pre>` monospace block
    - `html`: `<div dangerouslySetInnerHTML>` (plugins are trusted internal code)
    - `table`: antd `<Table>` with auto-detected columns
  - Loading spinner during run; error message on failure

- [ ] **T6** Wire into `Simulator.tsx`:
  - Add `plugins` key to center tab list
  - Pass `{model, simResults, simConfig}` as props to `<PluginPanel>`

- [ ] **T7** Visual check: dark + light mode, empty state (no plugins), error state

### Phase 3 — sensitivity_analysis plugin

Purpose: one-at-a-time parameter perturbation with tornado chart. Useful for Paper 2
Layer 2 validation (sensitivity to MC-sampled parameters).

- [ ] **T8** Create `plugins/sensitivity_analysis/manifest.yaml`

- [ ] **T9** Implement `plugins/sensitivity_analysis/sensitivity.py`:
  - Inputs: `model`, `sim_results`, `sim_config`, `params.target_var`, `params.perturbation_pct` (default 10%)
  - For each numeric parameter in model: re-run simulation with ±perturbation, record
    delta of `target_var` at final time step
  - Sort by absolute delta (largest = most sensitive)
  - Return `result_type: html` with a horizontal bar (tornado) chart using Chart.js
  - Requires: `ctx.run_simulation()` — depends on T1 being done

- [ ] **T10** Add to INTERFACE.md planned-plugins table: `sensitivity_analysis` → 🚧 stub

### Phase 4 — Future (not scheduled)

- [ ] `sbml_importer` — convert SBML/CellML → LM YAML; useful for Paper 1 interoperability positioning
- [ ] `report_latex` — export simulation report as LaTeX/PDF
- [ ] Plugins with custom HTML UI (iframe path, already wired in backend)

---

## 4. Plugin Inventory

| Plugin ID | Status | Phase | Notes |
|-----------|--------|-------|-------|
| `post_causal_inference` | backend done, untested | P1 T2 | Granger causality, needs statsmodels |
| `sensitivity_analysis` | planned | P3 | needs ctx.run_simulation working first |
| `sbml_importer` | future | P4 | |
| `report_latex` | future | P4 | |
