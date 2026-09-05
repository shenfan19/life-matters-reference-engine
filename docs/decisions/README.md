# Design Decision Records

Each file records one design decision, in a format modeled on [ADR](https://adr.github.io/).

> **†** — the file is located in the `life-matters-models` repository ([`../../../life-matters-models/docs/decisions/`](../../../life-matters-models/docs/decisions/))
>
> **The numbering rule**: this index and the two repositories have always shared one global numbering sequence
> (0001-0127 has † and non-† entries interleaved). During 2026-07-10 through 2026-07-14 the two sides briefly
> counted independently, producing a collision at 0128/0129/0130 (this repository's native 0128/0129/0130
> has different content from `life-matters-models`' original 0128/0129) — the latter was renamed to
> 0131/0132, and the former was left unchanged, with no retroactive renumbering. From that point on, before
> creating a new ADR, check both repositories' latest numbers first and use the maximum plus 1.

## Index

| # | Title | Status | Date |
|---|------|------|------|
| [0001](0001-simulator-two-column-layout.md) | Simulator two-column layout and multi-chart scheme | ✅ implemented | 2026-03-28 |
| [0002](0002-left-panel-accordion.md) | The left panel's accordion (VSCode style) | ✅ implemented | 2026-04-01 |
| [0003](0003-toolbar-flow-validate-mode-run.md) | The toolbar action flow: validate -> mode -> run | ✅ implemented | 2026-04-01 |
| [0004](0004-i18n-locale-files.md) | The multilingual scheme: JSON locale files | ✅ implemented | 2026-04-01 |
| [0005](0005-localstorage-persistence.md) | Client-side state persistence: localStorage | ✅ implemented | 2026-04-02 |
| [0007](0007-unified-titlebar.md) | Unifying the Sim/Game top bar | ✅ implemented | 2026-04-04 |
| [0013](0013-relative-font-scale-selector.md) | A relative font-scale system plus a font-size selector | ✅ implemented | 2026-04-05 |
| [0019](0019-disclaimer-placement-and-content.md) | The disclaimer: placement, content, and presentation rules | ✅ implemented | 2026-04-07 |
| [0020](0020-app-naming-life-matters.md) | App naming: unified as Life Matters, with the Chinese subtitle shown only in About | ✅ implemented | 2026-04-07 |
| [0021](0021-about-contact-info-github-only.md) | The About dialog's contact info: keep only GitHub, drop email and homepage | ✅ implemented | 2026-04-09 |
| [0022 †](../../../life-matters-models/docs/decisions/0022-models-three-level-taxonomy.md) | Models' three-level taxonomy (medical/social -> discipline -> subfield) | ✅ implemented | 2026-04-12 |
| [0023](0023-models-runnable-from-gui.md) | Models can be run directly from the GUI's file tree, plus the standalone convention | ✅ implemented | 2026-04-12 |
| [0024](0024-asteval-rebuild-over-clear.md) | Rebuilding the asteval Interpreter rather than symtable.clear() | ✅ implemented | 2026-04-12 |
| [0026](0026-simulator-report-tab.md) | The Simulator's Report tab: left-column checkboxes plus a right-side collapsible preview plus MD export | ✅ implemented, DOCX pending | 2026-04-13 |
| [0035](0035-2026-04-19_sim_report-generation-design.md) | Sim report generation: section order, the meaning column, separate CSV, inline charts | ✅ implemented | 2026-04-19 |
| [0038](0038-2026-04-20_sim_regimen-k4-input-scheduling.md) | Regimen K×4 input scheduling: time, intake amount, execution days, validity period | ✅ implemented | 2026-04-20 |
| [0040 †](../../../life-matters-models/docs/decisions/0040-2026-04-22_sim_medical-evidence-types-and-variable-mapping.md) | Sim medical evidence types and variable mapping (the 8 evidence subtypes) | ✅ implemented | 2026-04-22 |
| [0041 †](../../../life-matters-models/docs/decisions/0041-2026-04-22_project_naming-convention-underscore-preferred.md) | Project naming convention: snake_case underscores preferred | ✅ implemented | 2026-04-22 |
| [0042 †](../../../life-matters-models/docs/decisions/0042-2026-04-23_project_mod-to-model-rename.md) | A full mod -> model rename, keeping sim_xxx unchanged | ✅ implemented | 2026-04-23 |
| [0044 †](../../../life-matters-models/docs/decisions/0044-2026-04-30_sim_schedule-as-simulation-input-subtype.md) | `simulation.schedules`: a time-driven input belongs under the `simulation` block; the pulse mode; the rule against writing zero-value points for a discrete input | ✅ implemented | 2026-04-30 |
| [0045](0045-2026-04-30_sim_mc-probabilistic-simulation-and-random-parameter-architecture.md) | The MC probabilistic-simulation architecture: a parameter distribution expression, the multi-run engine, semi-transparent curve rendering, the Opt inner-loop mean evaluation, seed management | ✅ implemented | 2026-04-30 |
| [0046 †](../../../life-matters-models/docs/decisions/0046-2026-04-30_sim_step-size-design-metadata-and-formula-symbol.md) | The final step-size scheme: `metadata.step_size.{value,unit}`; an equation uses `step`; `simulation` drops step/step_unit | ✅ implemented | 2026-04-30 |
| [0049](0049-2026-05-02_sim_optimizer-async-job-system-design.md) | The Optimizer's asynchronous job-system design | ✅ implemented | 2026-05-02 |
| [0050](0050-2026-05-04_sim_inputevent-flattening-and-interactive-state-color-rules.md) | InputEvent flattening and the interactive-state color rules | ✅ implemented | 2026-05-04 |
| [0052](0052-2026-05-04_sim_schedule-format-unification-and-opt-regimen-support.md) | Unifying the schedule format (a flat list) and adding optimization.regimen support | ✅ implemented | 2026-05-04 |
| [0053 †](../../../life-matters-models/docs/decisions/0053-2026-05-03_sim_date_range-scheduling-field-and-yaml-schedule-priority-fix.md) | The `date_range` date-interval field; a YAML Schedule taking priority over a GUI Regimen | ✅ implemented | 2026-05-03 |
| [0054](0054-2026-05-04_sim_unified-apply-regimens.md) | Unifying the Sim/Opt Regimen-execution function: removing `_apply_regimen_events` | ✅ implemented | 2026-05-04 |
| [0055](0055-2026-05-04_project_docs-go-public-private-split.md) | The `docs/` published-publicly versus `go/` internal-not-published split rule | ✅ implemented | 2026-05-04 |
| [0056](0056-2026-05-04_project_three-tier-validation-framework.md) | The three-tier validation framework: tier 1 numerical precision / tier 2 literature benchmarking / tier 3 optimization plausibility | ✅ framework implemented, scripts pending | 2026-05-04 |
| [0057 †](../../../life-matters-models/docs/decisions/0057-2026-05-04_project_models-paper-directory.md) | `models/published/paper1-3/`, a dedicated scenario directory for the paper | ✅ implemented | 2026-05-04 |
| [0062 †](../../../life-matters-models/docs/decisions/0062-2026-05-06_project_models-directory-rename.md) | The models directory renaming convention (source/ -> in_process/, scenarios/ -> published/) | ✅ implemented | 2026-05-06 |
| [0063 †](../../../life-matters-models/docs/decisions/0063-2026-05-07_sim_resolved-imports-and-output-selection.md) | Resolved imports and the simulation-output selection rule | ✅ implemented | 2026-05-07 |
| [0064](0064-2026-05-07_project-edit-refresh-run-snapshot.md) | Editing state refreshes from the source file, running state is a fixed snapshot | ✅ implemented | 2026-05-07 |
| [0065 †](../../../life-matters-models/docs/decisions/0065-2026-05-08_sim_structured-description.md) | metadata.description supporting both a structured form and free text | ✅ implemented | 2026-05-08 |
| [0066](0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md) | The Simulator decomposition and Sim/Opt result workspaces | ✅ implemented, the OPT/SIM separation refactor pending | 2026-05-08 |
| [0067](0067-2026-05-15_sim_optimizer-algo-preset-slider-ui.md) | Optimization-algorithm parameter presets (fast/standard/fine) with linked slider UI | ✅ implemented | 2026-05-15 |
| [0068](0068-2026-05-15_sim_formula-precompile-to-python-function.md) | Equation precompilation: from runtime asteval parsing to a Python function generated at load time | ✅ implemented | 2026-05-15 |
| [0069](0069-2026-05-15_sim_run-history-auto-archive.md) | Automatic run-history archiving: auto-archiving after a sim/opt run completes, loading/deleting from the history drawer | ✅ implemented | 2026-05-15 |
| [0070](0070-2026-05-15_sim_asteval-as-safety-sandbox-constraint.md) | asteval as the equation safety sandbox: forbidding a direct substitution with Python's eval() (a core constraint recorded after the fact) | ⭐⭐ a core constraint | 2026-05-15 |
| [0071](0071-2026-05-15_sim_ui-rounded-cards-settings-gear-drag-sort.md) | Global rounded-corner card panels, a settings-gear Popover (font size/language), and drag-to-reorder blocks | ✅ implemented | 2026-05-15 |
| [0072](0072-2026-05-15_project_gui-only-no-cli.md) | GUI-only: dropping the CLI as a formal interface (a core constraint recorded after the fact) | ⭐⭐ a core constraint | 2026-05-15 |
| [0073](0073-2026-05-16_sim_multi-plan-simulation.md) | Multi-plan simulation: the Plan terminology, the data model, MC running independently per plan | pending | 2026-05-16 |
| [0074](0074-2026-05-16_sim_gui-working-state-priority.md) | The GUI Working State taking priority over a YAML Schedule (reversing ADR 0053's GUI-variable rule) | pending | 2026-05-16 |
| [0074](0074-2026-05-16_sim_single-tab-group-and-builder-tab.md) | Single-tier tab-group navigation: a dynamic Builder Tab plus a unified directory-tree dual mode | ✅ implemented | 2026-05-16 |
| [0075 †](../../../life-matters-models/docs/decisions/0075-2026-05-17_model_remove-type-standalone-fields.md) | Removing the top-level type/standalone fields | ✅ implemented | 2026-05-17 |
| [0076](0076-2026-05-17_sim_yaml-simulation-plans.md) | YAML simulation.plans pre-configuring multiple plans | ✅ implemented | 2026-05-17 |
| [0077](0077-2026-05-17_sim_session-model-import.md) | Session model import: atomic upload (UUID plus inline parsing plus immediate deletion) into localStorage | ✅ implemented (rewritten 2026-05-18) | 2026-05-17 |
| [0078](0078-2026-05-18_project_scs-mode-design.md) | SCS_MODE: write-operation protection for cloud deployment, frontend behavior adaptation, and merging into the session model | ✅ implemented | 2026-05-18 |
| [0079](0079-2026-05-18_sim_workspace-layout-4-6-split.md) | The Sim/Opt workspace layout: a 4:6 percentage split | ✅ implemented | 2026-05-18 |
| [0080](0080-2026-05-20_sim_optimizer-schedule-tiers-T2T3T4.md) | The optimizer's schedule-granularity tier design (T2/T3/T4: time window / weekday pattern / start date) | ✅ implemented | 2026-05-20 |
| [0081](0081-2026-05-20_sim_lm-score-health-span-metric.md) | LM Score: the Life Matters core healthy-lifespan metric (recoverable versus irreversible dual modes) | ✅ implemented | 2026-05-20 |
| [0082](0082-2026-05-21_sim_lock-unlock-refresh-behavior.md) | The session-state design for lock/unlock/model-switching (a two-layer separated architecture), D3-D5 superseded by 0085 | ✅ implemented (partly superseded) | 2026-05-21 |
| [0083](0083-2026-05-22_sim_optimizer-evaluation-time-window.md) | The Optimization evaluation time window as an independent configuration (start_date / end_date / step_size) | ✅ implemented | 2026-05-22 |
| [0084](0084-2026-05-23_sim_sim-opt-separation.md) | Full Sim/Opt separation: independent InputEvent/OptInput types, a new OptSetupTab component | ✅ implemented | 2026-05-23 |
| [0085](0085-2026-05-25_sim_remove-lock-free-switch-running-indicator.md) | Removing the lock mechanism, freely switching models, a double-arrow running indicator, blocking runs in cloud deployment | ✅ implemented | 2026-05-25 |
| [0086 †](../../../life-matters-models/docs/decisions/0086-2026-05-26_project_lmml-rename-from-lmf.md) | Format naming: LMF -> LMML (Life Matters Model Language) | ✅ implemented | 2026-05-26 |
| [0087](0087-2026-05-27_sim_schedules-plans-coexistence.md) | The coexistence semantics of `simulation.schedules` and `plans`: plans takes priority, mixing them is forbidden in papers/ | ✅ implemented | 2026-05-27 |
| [0088](0088-2026-05-28_sim_optimizer-schedules-unified-format.md) | The unified optimization.schedules format: a merged list of decision variables and fixed background quantities | ✅ accepted | 2026-05-28 |
| [0089](0089-2026-05-30_sim_session-refactor-warm-start-dirty-active-model.md) | Session refinement: separating useSession, tracking userEdited, warm-start dirty detection | ✅ implemented | 2026-05-30 |
| [0090](0090-2026-05-31_sim_remove-second-step-unit.md) | Removing the second step-size unit, unifying to minute/hour/day | ✅ accepted | 2026-05-31 |
| [0091](0091-2026-06-01_project_cli-batch-tool.md) | `sim_cli/`: a batch-simulation CLI tool | ✅ implemented | 2026-06-01 |
| [0092 †](../../../life-matters-models/docs/decisions/0092-2026-06-05_model_input-variable-bare-unit-rule.md) | The `type: input` unit convention: a bare unit (an event quantity), forbidding a rate unit (/day, etc.) | ✅ implemented | 2026-06-05 |
| [0093](0093-2026-06-05_sim_runtime-log-panel.md) | The Sim/Opt runtime log panel: content layering (model info, NaN/bounds warnings, completion stats) and its implementation | ✅ implemented | 2026-06-05 |
| [0096 †](../../../life-matters-models/docs/decisions/0096-2026-06-06_model_filename-quality-markers.md) | The model filename quality-marker convention (_nosim / _noopt / _noref) | ✅ implemented | 2026-06-06 |
| [0096](0096-2026-06-11_sim_simulation-step-input-unit-convention.md) | The unit convention for `Simulation.step()`'s input argument: seconds | ✅ accepted | 2026-06-11 |
| [0097 †](../../../life-matters-models/docs/decisions/0097-2026-06-08_model_description-3-fields.md) | A papers/ model's description simplified to three fields (brief / problem / method) | ✅ implemented | 2026-06-08 |
| [0098 †](../../../life-matters-models/docs/decisions/0098-2026-06-11_sim_optimizer-schedule-sustained-mode.md) | Adding `mode: sustained` to optimization.schedules (a sub-day-step-size continuous input) | ✅ implemented | 2026-06-11 |
| [0099 †](../../../life-matters-models/docs/decisions/0099-2026-06-11_sim_sustained-value-step-invariance.md) | Correcting the sustained mode's value semantics: a window total divided by N_steps (step-size invariance) | ✅ implemented (revises 0098) | 2026-06-11 |
| [0100 †](../../../life-matters-models/docs/decisions/0100-2026-06-11_sim_unify-pulse-sustained-time-interval.md) | Unifying pulse/sustained into a time interval [start,end); the GUI drops the three-state full day/time/sustained choice | ✅ done | 2026-06-11 |
| [0101](0101-2026-06-13_project_cli-public-release-interface.md) | Upgrading the CLI to a publicly released interface (aimed at AI/automation scenarios), partly revising 0072/0091 | ✅ implemented | 2026-06-13 |
| [0101 †](../../../life-matters-models/docs/decisions/0101-2026-06-14_model_hold-suffix-todo-field.md) | Unifying the filename quality marker to `_HOLD` plus a `metadata.todo` task list (replacing 0096 model) | ⚪ the filename part superseded by 0120 | 2026-06-14 |
| [0102 †](../../../life-matters-models/docs/decisions/0102-2026-06-14_model_formula-priority-execution-order.md) | Clarifying the equation `priority` execution order and update visibility within the same step | ✅ implemented | 2026-06-14 |
| [0103 †](../../../life-matters-models/docs/decisions/0103-2026-06-14_model_metadata-log-field.md) | Adding `metadata.log`: an in-model improvement-history record | ✅ implemented | 2026-06-14 |
| [0104 †](../../../life-matters-models/docs/decisions/0104-2026-06-16_model_step-unit-per-formula-and-sim-step-size.md) | Reworking the step-size design: a per-equation step_unit plus simulation.step_size (replacing 0046) | ✅ adopted | 2026-06-16 |
| [0105 †](../../../life-matters-models/docs/decisions/0105-2026-06-16_model_step-unit-conditional-and-deprecate-dt.md) | Making step_unit conditionally required and deprecating the dt/step_size dynamics symbols (revising 0104) | ✅ adopted | 2026-06-16 |
| [0106 †](../../../life-matters-models/docs/decisions/0106-2026-06-16_model_remove-formula-dict-unify-to-dynamics.md) | Removing the formula: dictionary form, unifying variable updates to dynamics: (supplementing 0105) | ✅ adopted | 2026-06-16 |
| [0107 †](../../../life-matters-models/docs/decisions/0107-2026-06-16_model_output-variables-import-overwrite.md) | Unifying output_variables/output_types import behavior to overwrite (replacing union) | ✅ implemented | 2026-06-16 |
| [0108](0108-2026-06-16_sim_sim-export-zip-per-variable.md) | Redesigning the Sim export: with multiple plans, output a ZIP of per-variable CSVs (revising 0094) | ✅ implemented | 2026-06-16 |
| [0109](0109-2026-06-17_sim_schedules-structure-enforced.md) | Enforcing where schedules live: sim -> plans, opt -> startpoint | ✅ accepted | 2026-06-17 |
| [0110](0110-2026-06-17_sim_unify-plan-schedule-parsing.md) | A single source of truth for Plan/Schedule parsing: the backend's `self.plans`, the frontend no longer re-parsing the YAML | ✅ accepted | 2026-06-17 |
| [0111](0111-2026-06-18_sim_sim-cli-consistency-test-suite.md) | The Sim/CLI consistency regression test suite: the repository's first automated test suite, pinning down the MC determinism bug | ✅ accepted | 2026-06-18 |
| [0112](0112-2026-06-19_sim_opt-startpoint-faithfulness-fix.md) | A fidelity fix for Opt startpoint parsing: a hardcoded seed plus a silently dropped T4 date_range, adding a vitest fidelity test | ✅ accepted | 2026-06-19 |
| [0113](0113-2026-06-19_sim_execution-core-merge-and-cli-mc.md) | Merging the Sim execution core (CLI/GUI sharing advance_steps) plus adding MC capability to the CLI (--mc-runs/--seed) | ✅ accepted | 2026-06-19 |
| [0114](0114-2026-06-20_sim_remove-cli-mc-flags-yaml-only.md) | Removing the CLI's `--mc-runs`/`--seed`: MC configuration becomes read-only via YAML `simulation.mc`, unified with the optimization.mc pattern (revises 0113) | ✅ accepted | 2026-06-20 |
| [0115](0115-2026-06-21_sim_remove-daily-inputs-and-gui-working-state.md) | Removing `daily_inputs`/`_apply_schedules`/`manual_overrides`: cleaning up the leftover code after plans became mandatory (revises 0074) | ✅ accepted | 2026-06-21 |
| [0116](0116-2026-06-21_sim_rename-regimen-runner-to-schedule-runner.md) | Unifying an internal name: `regimen_runner.py` -> `schedule_runner.py`, with the API contract's field names unchanged (revises 0115) | ✅ accepted | 2026-06-21 |
| [0117](0117-2026-06-21_sim_regimen-vs-recommended-final-naming.md) | Keeping `regimen` as the API/YAML concept-level name (consistent with 0116); `optimization.results.reference` -> `recommended`, and removing the decoding dictionary | ✅ accepted | 2026-06-21 |
| [0118](0118-2026-06-22_sim_upfront-datetime-validation.md) | Upfront validation of date/time fields: eliminating the silent fallback shared by the CLI/GUI (several `except: pass` sites in schedule_runner/optimizer_engine) | ✅ accepted | 2026-06-22 |
| [0119](0119-2026-06-22_sim_unify-sim-run-logging-core.md) | Merging the Sim run-logging core: a new run_logging.py, with content generation shared between the CLI and GUI and each implementing its own IO output (following up on a question from 0118) | ✅ accepted | 2026-06-22 |
| [0120 †](../../../life-matters-models/docs/decisions/0120-2026-06-23_model_drop-hold-filename-suffix.md) | Dropping the `_HOLD` filename suffix, with status determined solely by `metadata.todo` (partly superseding 0101) | 🟢 implemented | 2026-06-23 |
| [0121](0121-2026-06-24_project_top-level-rename-cli-gui-reference_engine.md) | Top-level directory rename: `sim_cli`/`sim_engine`/`sim_gui` -> `cli`/`reference_engine`/`gui`; reorganizing `docs/` into `docs/reference_engine/`; `SimulatorEngine` -> `ReferenceEngine` | ✅ accepted | 2026-06-24 |
| [0122](0122-2026-07-02_sim_report-export-and-per-plan-png.md) | Reworking report export: consolidating Sim/Opt report data plus independent per-plan PNG downloads (previously only a whole-page screenshot could be exported) | ✅ accepted | 2026-07-02 |
| [0123](0123-2026-07-06_project_test-plan-and-report-consolidation.md) | Consolidating the test documentation into an outline-plus-report pair (`models/test/test_plan.md` plus `test_report.md`), replacing a scattered `validation.md`/model checklist/task list | ✅ accepted | 2026-07-06 |
| [0124](0124-2026-07-05_sim_loader-engine-last-error-propagation.md) | Adding `last_error` to `LoaderEngine.fetch()`: `Loader`/`Validator`'s specific error messages are no longer swallowed into a bare `None`/`False` | ✅ accepted | 2026-07-05 |
| [0125 †](../../../life-matters-models/docs/decisions/0125-2026-07-05_model_test-valid-invalid-split.md) | Splitting `models/test/` into `valid/`+`invalid/`: adding 11 error-detection fixtures (regression locks in `tests/errors/`) | ✅ accepted | 2026-07-05 |
| [0126 †](../../../life-matters-models/docs/decisions/0126-2026-07-09_model_regimen-semantics-scope-decision.md) | Settling three scope questions in the regimen-semantics-completeness discussion (not changing the engine, drawing the boundary between model/documentation/future improvement) | ✅ accepted | 2026-07-09 |
| [0127 †](../../../life-matters-models/docs/decisions/0127-2026-07-09_model_input-unified-sustained-window-defaults.md) | Unifying an input variable to sustained (no more separate pulse mode), with the window width defaulting per an explicit rule; adding a shared `resolve_time_interval` function to `schedule_runner.py` | 🟢 implemented | 2026-07-09 |
| [0128](0128-2026-07-10_sim_gui-session-idle-timeout.md) | Automatically destroying a GUI session after 30 minutes of inactivity (a P0 for public deployment): a `last_active` timestamp plus a background 5-minute sweep task, isolated in timing from `optimizer_jobs` | ✅ accepted | 2026-07-10 |
| [0129](0129-2026-07-10_sim_concurrency-limits-opt-jobs-and-sim-sessions.md) | Concurrent-resource protection (P1/P2): global caps on optimization jobs/simulation sessions, with the routing layer returning 503 directly once exceeded (P3/P4 deferred, not implemented for now) | ✅ accepted | 2026-07-10 |
| [0130](0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md) | Fixing the bug where `optimization.mc.runs>1` was silently zeroed by `reset_simulation()` (affecting 19 paper models), plus decoupling the Opt tab's MC controls from the Sim tab (partly reverting ADR 0045's decision 2) | ✅ accepted | 2026-07-10 |
| _(0128-0130 collided with independently numbered entries from the same period in life-matters-models; from 0131/0132 onward the two repositories resumed sharing one sequence, see the note above)_ | | | |
| [0131 †](../../../life-matters-models/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md) | Correcting the sustained value semantics: each matched day is filled independently, replacing 0099's "total across the whole span" (also replaces item 3 of 0126) | ✅ implemented | 2026-07-13 |
| [0132 †](../../../life-matters-models/docs/decisions/0132-2026-07-14_model_sustained-delivery-total-vs-level.md) | Adding `delivery: total\|level` to a sustained regimen, distinguishing "spreading a total" (a training-load style) from "a constant level" (a sleep-duration style) | ✅ implemented | 2026-07-14 |
| _(0133-0145 are all ADRs on the life-matters-models side; this index has not yet backfilled the † entries for the 0133-0140 range, pending a later consolidated pass; 0140 is this repository's own native ADR, see `0140-2026-08-03_sim_pareto-regroup-panel-and-decision-var-labels-fix.md`)_ | | | |
| [0146](0146-2026-07-21_sim_opt-progress-snapshot-and-sim-pause-resume-sync.md) | GUI sessions scoped per model: persisting an optimization-progress snapshot (Gen/Eval/Front/Feasible/Mean CV) plus frontend-backend sync for simulation pause/resume | ✅ accepted | 2026-07-21 |
| [0147](0147-2026-08-04_sim_optimizer-t1-value-step-grid-quantization.md) | Adding `value_step` to the optimizer's T1 decision variable: quantizing a continuous solution to a readable grid precision, the same pattern as T2's `time_step`; also fixing pareto_front/best_x recording the pre-snap old values | ✅ accepted | 2026-08-04 |
