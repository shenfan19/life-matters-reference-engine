# ADR 0066 — Simulator Decomposition and Sim/Opt Result Workspaces

## Status

✅ Implemented; the Sim/Opt separation refactor needs further design

## Date

2026-05-08

## Background

`sim_gui/src/components/Simulator.tsx` had long carried the model tree, toolbar, setup form, simulation results, optimization results, report, state persistence, and run control all at once. As imports, output selection, Monte Carlo, async optimization, Pareto process charts, and result placeholder states were added, the single file's continued growth was hurting maintainability and would make a later Sim/Opt separation harder.

At the same time, the Sim and Opt result tabs behaved more like terminal areas that only showed content "after a run." An empty tab left the page looking too blank for users to understand what results to expect, and the opt process data needed to grow from plain text logs into observable process charts and tables.

## Decision

### 1. Simulator as a state-orchestration container

`Simulator.tsx` remains the main container, responsible for:

- Global state and run-state orchestration.
- Talking to the backend API.
- Session attach, localStorage persistence, model selection, and tab switching.
- Passing data, callbacks, and theme tokens down to child components.

The concrete UI is broken out into child components:

- `SimTopBar.tsx`: top-level actions and mode entry points.
- `SimModelTree.tsx`: the left-hand model tree, filtering, and expansion state.
- `SimIntroTab.tsx`: the Overview / model info display.
- `SimSetupTab.tsx`: simulation and optimization input configuration.
- `SimPlotTab.tsx`: Sim Result.
- `SimOptTab.tsx`: Opt Result.
- `SimReportTab.tsx`: Report.
- `OptProgressChart.tsx`, `ParetoChart.tsx`, `SimChart.tsx`: chart components.

The goal of this decomposition is not to introduce abstraction for its own sake, but to separate "state orchestration" from "tab presentation," so a given workspace can be changed independently going forward.

### 2. Sim Result and Opt Result adopt a result-workspace shape

The result tabs are not blank placeholder pages but stable workspaces:

- Before a run, they already show a status bar, collapsible sections, and chart placeholders.
- Once data arrives, the placeholders are naturally replaced by real curves, tables, and logs.
- Sim Result reserves slots for output-variable charts; if the model has no explicit output variables, non-parameter variables in the model are used to generate preview slots.
- Opt Result reserves the Front, Live, Process, Best, Solutions, and Log areas.
- The Process area includes placeholders for process charts of hypervolume, Pareto count, feasible ratio, evaluations, mean constraint violation, etc.

This lets users see the result structure as soon as they click a tab, rather than just a "no data" message.

### 3. Optimization result display grows from a log into process visualization

Opt no longer shows only a text log; it also shows:

- A Pareto front preview.
- The current generation, evaluation count, front size, feasible ratio, constraint violation, and elapsed time.
- Process curves, including normalized hypervolume.
- Tables of the recommended solution and candidate solutions.
- A Log area is still kept for viewing optimization process messages.

NSGA-II remains the primary algorithm for now. The process visualization leaves room for future operations such as "continue for N more generations," "warm-start from the current front," or "set a reference point and continue."

### 4. Post-run tab navigation differs by mode

- After a Sim run, the view jumps to `Sim Result`.
- After an Opt run, the view jumps to `Opt Result`.
- Tab labels use `Sim Result` / `Opt Result` rather than the generic `Plot` / `Optimize`, to avoid conflating "run configuration" with "result presentation."

## Consequences

- `Simulator.tsx` is still large, but its responsibility is more focused: orchestrating overall state and API calls.
- Each tab can evolve independently, and Opt Result in particular can keep adding warm-start and Pareto operation buttons.
- The empty state looks more stable, and users can anticipate what results will appear after a run.
- Sim and Opt still share the same setup configuration; this addresses the display and maintenance problem but not the deeper issue of Sim/Opt experiment state contaminating each other.

## Follow-up

Keep the task name: **the Sim/Opt separation refactor task**.

In a later, more detailed discussion, use the workspace conventions of large-scale simulation/FEA software as a reference point to evaluate whether the current `Setup + Sim Result + Opt Result` should be refactored into:

- A `Sim` tab: simulation inputs, run button, trajectory results, and simulation export.
- An `Opt` tab: optimization variable ranges, objectives, constraints, algorithm parameters, warm-start controls, Pareto results, and candidate-solution actions.
- `Opt -> Sim` uses an explicit transfer action to write a selected candidate solution into the Sim configuration, instead of implicitly rewriting the shared setup on a mode switch.

The goal of this refactor is to make `simConfig` and `optConfig` two independent experiment states that share model context but keep their run configurations and results from contaminating each other.
