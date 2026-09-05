# Changelog

This file records engineering changes to the LM Reference Engine repository (`cli/`, `reference_engine/`, `gui/`), grouped by subsystem and ordered chronologically within each group. Each entry tries to state what changed in one sentence; the full decision background is in the corresponding numbered ADR under `docs/decisions/`.

The YAML model library is outside this file's coverage; it is maintained independently in [life-matters-models](https://github.com/shenfan19/life-matters-models), and each model's own change history is recorded in that file's `metadata.log` field.

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
