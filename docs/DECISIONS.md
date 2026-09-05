# Sim Decisions Summary

> This file is a **topic-grouped summary** of the ADRs in `docs/decisions/` for the simulation engine, optimizer, UI, and project structure.  
> For ADRs related to the YAML model format, see `life-matters-models/docs/DECISIONS.md`.  
> For the complete chronological index, see [decisions/README.md](decisions/README.md).

**Importance**: ⭐⭐ = a core constraint, affecting the format specification or architecture, not to be changed casually; ⭐ = an important implementation decision; unmarked = already implemented, a historical record

---

## I. Simulation Engine (→ design.md, impl.md)

| ADR | Title | Importance | Status |
|-----|------|---------|------|
| [0038](decisions/0038-2026-04-20_sim_regimen-k4-input-scheduling.md) | **Regimen K x 4 input scheduling: time/dose/execution days/validity period** | ⭐⭐ | Done |
| [0024](decisions/0024-asteval-rebuild-over-clear.md) | Rebuilding the asteval Interpreter rather than symtable.clear() | ⭐ | Done |
| [0070](decisions/0070-2026-05-15_sim_asteval-as-safety-sandbox-constraint.md) | **asteval as the equation safety sandbox: forbidding a direct substitute using Python eval()** | ⭐⭐ | Done |
| [0045](decisions/0045-2026-04-30_sim_mc-probabilistic-simulation-and-random-parameter-architecture.md) | **MC probabilistic simulation: parameter distribution expressions, a multi-run engine, semi-transparent curve rendering** | ⭐⭐ | Done |
| [0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md) | **Fixed the bug where optimization.mc.runs was silently zeroed by reset_simulation() (affecting 19 paper models); decoupled the Opt tab's MC control from the Sim tab** | ⭐⭐⭐ | Done |
| [0054](decisions/0054-2026-05-04_sim_unified-apply-regimens.md) | **Unified the simulation/optimization Regimen-execution function; removed `_apply_regimen_events`** | ⭐⭐ | Done |
| [0064](decisions/0064-2026-05-07_project-edit-refresh-run-snapshot.md) | **Editing state refreshes from the source file, running state is a fixed snapshot (two different model-loading semantics)** | ⭐⭐ | Done |
| [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md) | **Simulator decomposition; separating the Sim/Opt result workspaces** | ⭐⭐ | Done (the OPT/SIM separation refactor is ongoing) |
| [0099](decisions/0099-2026-06-11_sim_sustained-value-step-invariance.md) | A semantic correction to sustained mode's `value`: window total / N_steps (step-size invariance) | | Superseded by [life-matters-models 0131](../../life-matters-models/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md) |
| [0100](decisions/0100-2026-06-11_sim_unify-pulse-sustained-time-interval.md) | **Unified pulse/sustained into the time interval `time_start`/`time_end`; the GUI removed the full-day/time/sustained three-state toggle** | ⭐⭐ | Partially implemented (papers' terminology has been annotated, no full rewrite done) |
| [life-matters-models 0131](../../life-matters-models/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md) | **Changed sustained `value` to independently reach full amount on each matching day (`N_steps` = the hit window's own duration / step_size), superseding 0099's "total across the whole span"** | ⭐⭐ | Done |
| [life-matters-models 0132](../../life-matters-models/docs/decisions/0132-2026-07-14_model_sustained-delivery-total-vs-level.md) | **Added `delivery: total\|level` to regimen, distinguishing "spread total" (default) from "constant level, not spread"** | ⭐⭐ | Done |

---

## III. The Optimizer (→ opt.md)

| ADR | Title | Importance | Status |
|-----|------|---------|------|
| [0049](decisions/0049-2026-05-02_sim_optimizer-async-job-system-design.md) | **The Optimizer's asynchronous job system: the API returns a job_id immediately, polling for progress** | ⭐⭐ | Done |
| [0052](decisions/0052-2026-05-04_sim_schedule-format-unification-and-opt-regimen-support.md) | The Schedule flat-list format; optimization.regimen support | ⭐ | Done |
| [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md) | **The three-tier validation framework: numerical precision / literature benchmarking / optimization plausibility** | ⭐⭐ | Done (scripts still to be written) |
| [0080](decisions/0080-2026-05-20_sim_optimizer-schedule-tiers-T2T3T4.md) | **The tiered design of optimizer scheduling granularity (T2/T3/T4)** | ⭐⭐ | Partially implemented (T2-T4 decoding is implemented, see opt.md §3.6; the R13 feasibility guardrail is not implemented) |
| [0088](decisions/0088-2026-05-28_sim_optimizer-schedules-unified-format.md) | The unified format for optimizer.schedules (the title notes it has been updated by ADR 0109 to optimizer.startpoint.schedules) | ⭐ | Done |
| [0098](decisions/0098-2026-06-11_sim_optimizer-schedule-sustained-mode.md) | Added `mode: sustained` to optimization.schedules (sub-day-step-size sustained input) | ⭐ | Done (the old format, superseded by 0100 but still supported) |
| [0147](decisions/0147-2026-08-04_sim_optimizer-t1-value-step-grid-quantization.md) | **Added value_step grid-quantization decoding to the optimizer's T1 decision variables** | ⭐ | Done |

---

## IV. UI / Frontend (→ ui_guidelines.md)

| ADR | Title | Importance | Status |
|-----|------|---------|------|
| [0001](decisions/0001-simulator-two-column-layout.md) | The simulator's two-column layout | | Done |
| [0003](decisions/0003-toolbar-flow-validate-mode-run.md) | The toolbar flow: validate then mode then run | ⭐ | Done |
| [0004](decisions/0004-i18n-locale-files.md) | Multilingual support: JSON locale files | ⭐ | Done |
| [0005](decisions/0005-localstorage-persistence.md) | Client-side state persistence: localStorage | ⭐ | Done |
| [0012](decisions/0012-neutral-theme-unified-colors.md) | **A neutral theme plus unified color tokens across both apps** | ⭐⭐ | Done |
| [0013](decisions/0013-relative-font-scale-selector.md) | A relative font-scale system plus a font-size selector | ⭐ | Done |
| [0050](decisions/0050-2026-05-04_sim_inputevent-flattening-and-interactive-state-color-rules.md) | **Flattening InputEvent; the active/inactive color rules (green = active)** | ⭐⭐ | Done |
| [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md) | Separating the Sim/Opt tabs and the result-workspace UI | ⭐ | Done (partly ongoing) |
| [0067](decisions/0067-2026-05-15_sim_optimizer-algo-preset-slider-ui.md) | The optimizer's algorithm-preset and parameter-slider UI | | Done |
| [0068](decisions/0068-2026-05-15_sim_formula-precompile-to-python-function.md) | Precompiling an equation into a Python function (asteval to fn) | ⭐ | Done |
| [0069](decisions/0069-2026-05-16_sim_optimizer-results-stateless-design.md) | **optimization.results embedded, a stateless service, warm-start, and CSV export** | ⭐⭐ | Done |
| [0071](decisions/0071-2026-05-15_sim_ui-rounded-cards-settings-gear-drag-sort.md) | **A global rounded-card panel style, a settings-gear popover, and drag-to-sort blocks** | ⭐ | Done |
| [0073](decisions/0073-2026-05-16_sim_multi-plan-simulation.md) | **Multi-plan simulation: the Plan terminology, its data model, MC running independently per plan** | ⭐⭐ | To be implemented |
| [0074](decisions/0074-2026-05-16_sim_gui-working-state-priority.md) | **The GUI working state takes priority over the YAML schedule (reversing ADR 0053's rule for GUI variables)** | ⭐⭐ | To be implemented |
| [0074](decisions/0074-2026-05-16_sim_single-tab-group-and-builder-tab.md) | **A single-tier tab-group navigation: removing the top-level Tools/Sim two-tier split; a dynamic Builder tab plus a unified directory-tree dual mode** | ⭐ | Done |
| [0077](decisions/0077-2026-05-17_sim_session-model-import.md) | **Session model import: an atomic upload (a UUID temp file, inline parsing, immediate deletion) into localStorage; a session/ key prefix** | ⭐ | Done (rewritten 2026-05-18, the original two-step approach deprecated) |
| [0078](decisions/0078-2026-05-18_project_scs-mode-design.md) | **SCS_MODE: write-operation protection for cloud deployment, frontend behavior adaptation, merged into the session model** | ⭐ | Done |
| [0082](decisions/0082-2026-05-21_sim_lock-unlock-refresh-behavior.md) | **Separating two layers of state: modelContent / modelSession; localStorage persists the session** | ⭐ | Done (D3-D5 superseded by 0085; D3's reloadFromYAML updated by 0089) |
| [0084](decisions/0084-2026-05-23_sim_sim-opt-separation.md) | **Full Sim/Opt separation: InputEvent / OptInput as independent types; an OptSetupTab; optimization.schedules** | ⭐ | Done |
| [0085](decisions/0085-2026-05-25_sim_remove-lock-free-switch-running-indicator.md) | **Removed the lock mechanism; free model switching; a dual-arrow running indicator; SCS mode only blocks a new start** | ⭐ | Done |
| [0089](decisions/0089-2026-05-30_sim_session-refactor-warm-start-dirty-active-model.md) | **Session refinement: `useSession` separated out, `userEdited` tracking (an `(edited)` marker), warm-start dirty detection (an orange warning), Opt-tab isolation for an inactive model, a rawContent fallback** | ⭐ | Done |
| [0093](decisions/0093-2026-06-05_sim_runtime-log-panel.md) | The Sim/Opt runtime log panel: content layering (model info, NaN/bounds warnings, completion statistics) and its implementation | | Done |
| [0140](decisions/0140-2026-08-03_sim_pareto-regroup-panel-and-decision-var-labels-fix.md) | **The Pareto Regroup panel (choosing axes/grouping from any objective/decision variable) plus a fix to decision-variable label conventions** | ⭐ | Done |
| [0146](decisions/0146-2026-07-21_sim_opt-progress-snapshot-and-sim-pause-resume-sync.md) | **GUI sessions scoped per model: optimization-progress-snapshot persistence plus simulation pause/resume frontend-backend sync** | ⭐ | Done |

---

## V. Project Structure

| ADR | Title | Importance | Status |
|-----|------|---------|------|
| [0055](decisions/0055-2026-05-04_project_docs-go-public-private-split.md) | **The docs/ public versus go/ internal-not-published boundary rule** | ⭐⭐ | Done |
| [0060](decisions/0060-2026-05-05_project_game-repo-separation.md) | **The Game repo made independent (sim and game separated into independent repos)** | ⭐⭐ | Done |
| [0061](decisions/0061-2026-05-06_project_temp-storage-no-user-accounts.md) | The temporary-storage approach, no user-account system built (the upload-temp concurrency issue is revised in ADR 0077) | ⭐ | Done |
| [0078](decisions/0078-2026-05-18_project_scs-mode-design.md) | **SCS_MODE: write-operation protection for cloud deployment, frontend behavior adaptation, merged into the session model** | ⭐ | Done |
| [0128](decisions/0128-2026-07-10_sim_gui-session-idle-timeout.md) | **The GUI session is automatically destroyed after 30 minutes of inactivity** (P0 for public deployment, preventing zombie-session buildup) | ⭐ | Done |
| [0129](decisions/0129-2026-07-10_sim_concurrency-limits-opt-jobs-and-sim-sessions.md) | Concurrency resource protection (P1/P2): a global cap on optimization jobs / simulation sessions, returning 503 when exceeded | ⭐ | Done |
| [0072](decisions/0072-2026-05-15_project_gui-only-no-cli.md) | **GUI-only: the CLI is not a formal interface, gets no new features, with the HTTP API used for batch scenarios** (partly revised by 0101) | ⭐⭐ | Done |
| [0091](decisions/0091-2026-06-01_project_cli-batch-tool.md) | `cli/`: a batch-simulation CLI tool | ⭐ | Done |
| [0101](decisions/0101-2026-06-13_project_cli-public-release-interface.md) | **The CLI upgraded to a public release interface: aimed at AI/automation scenarios, shipped with each release** | ⭐⭐ | Done |
| [0121](decisions/0121-2026-06-24_project_top-level-rename-cli-gui-reference_engine.md) | **Top-level directory rename: `sim_cli`/`sim_engine`/`sim_gui` to `cli`/`reference_engine`/`gui`; eliminating the sim/opt naming asymmetry** | ⭐⭐ | Done |

---

## VI. The Validation Framework (→ test_verification/verification_report.md plus models/test_validation/validation_report.md)

| ADR | Title | Importance | Status |
|-----|------|---------|------|
| [0056](decisions/0056-2026-05-04_project_three-tier-validation-framework.md) | **The three-tier validation framework**: tier 1, numerical precision (analytical solutions) / tier 2, literature benchmarking (effect-size range) / tier 3, optimization plausibility | ⭐⭐ | Done (validation scripts still to be written) |
| [0123](decisions/0123-2026-07-06_project_test-plan-and-report-consolidation.md) | **Test-document consolidation**: the validation protocol, engine numerical checks, and the model-by-model checklist merged into `models/test_validation/test_plan.md` (the outline) plus `test_report.md` (the report) | ⭐⭐ | Done |
| [0023](decisions/0023-models-runnable-from-gui.md) | Models can be run directly from the GUI's file tree; the standalone convention | ⭐ | Done |

---

## VII. Game-Related (pre-separation, a historical record)

The following ADRs were written before the game repo became independent; their content has migrated to the game repo's design documents and is kept in the sim repo only as a historical record:

| ADR | Topic |
|-----|------|
| 0006 | The Game Story folder format |
| 0010/0011 | A Hearthstone-style layout / a 6-row symmetric layout |
| 0015/0016 | The hand mechanic / game terminology |
| 0027/0028/0029 | The discard mechanic / drag-and-drop zones / responsive layout |
| 0033/0034 | The discard mechanic's design / hand-size |
| 0036/0037 | Animation timing / the i18n design |
| 0043 | The battlefield-tension framework |

---

## Maintenance rules

- A new ADR: write it into `decisions/` and add a row to `decisions/README.md`, and add a row to the corresponding category in this file at the same time
- When a ⭐⭐ decision changes: update the corresponding design/impl document at the same time
- This repository's content stays independent; it does not reference the game repo's file paths or content
