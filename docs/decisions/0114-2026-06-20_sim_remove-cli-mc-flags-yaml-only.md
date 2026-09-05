# ADR 0114 — Removing the CLI's `--mc-runs`/`--seed`, Making MC Configuration Read-Only from YAML (Revising 0113)

**Date**: 2026-06-20
**Status**: accepted
**Scope**: sim_cli (`main.py` / `runner.py`), docs (`cli.md` / `data_flow.md` / `sim_design.md`)

---

## Background

ADR 0113 (2026-06-19, the day before) added `--mc-runs N` / `--seed X` to the CLI, letting `--sim` run
Monte Carlo too. The user then pointed out that these two flags were "an unclean extension": the YAML specification (`model.md`) had already long defined `simulation.mc.runs`/`simulation.mc.seed` as the model's own declared MC configuration, and the GUI already read this field for its defaults; but `sim_cli/runner.py::run_sim` never read this field at all — `n_runs` defaulted to a hardcoded `1`, passed straight to the engine, ignoring whatever configuration the model's YAML had already declared, and the user had to pass `--mc-runs` again on the command line just to match it. This meant that for the same model, the CLI's default run could come out inconsistent with the configuration the YAML itself declared.

The investigation found this inconsistency existed only on the sim side. The opt side's `optimizer.mc.runs`/`optimizer.mc.seed`
(`optimizer_engine.py:290-294`) had, from the start, **only ever read from YAML, with no CLI flag at all**:
`mc_cfg = opt_block.get('mc', {})`. The `--mc-runs`/`--seed` just added on the sim side was the project's first time opening a command-line override for "MC configuration the model already declares," inconsistent with the existing pattern on the opt side.

A side effect: `sim_cli/batch.py` never passed `n_runs` when calling `run_sim()`, so a batch run of all models was always a deterministic single run — even if a given model's YAML specified `mc.runs: 30`, the batch test would never actually run it 30 times.

## Decision

1. **Remove the `--mc-runs`/`--seed` CLI parameters** (`main.py`); no more command-line override.
2. **Have `runner.py::run_sim` read the MC configuration from the loaded model instead**:
   ```python
   mc_cfg = engine.current_model.simulator.get('mc', {})
   n_runs = max(1, int(mc_cfg.get('runs', 1)))
   seed = mc_cfg.get('seed')
   seed = int(seed) if seed is not None else None
   ```
   This is copied directly from the pattern `optimizer_engine.py` already uses to read `optimizer.mc`; the two paths (the sim CLI and the opt global) are now unified into "MC configuration lives only in YAML, with no runtime override."
3. **The engine layer's signature is unchanged**: `SimulatorEngine.run_simulation_mc`/`run_simulation_all_plans` still accept
   `n_runs`/`seed` as ordinary parameters — this layer should stay generic regardless, since the GUI's `session_manager.py` (which receives frontend session override values) and the tests (which pass values directly to verify consistency) both still need the ability to pass them explicitly. The change happens only in "how the CLI, as a caller, decides what value to pass," not in the engine API.
4. **A knock-on effect (already confirmed acceptable by the user)**: `batch.py` needs no code change, but its runtime behavior will change — a batch test will now honestly run MC according to each model's own YAML `mc.runs`, no longer always a deterministic single run. If some models declare a large `mc.runs`, the batch regression test will get slower, but this is "the behavior becoming correct," not a regression.

## Out of scope for this round

- The GUI's session-override mechanism (`sim_runs`/`mcSeed` stored in localStorage, not written back to YAML) is left unchanged — the GUI is aimed at interactive exploration, and temporarily changing the MC settings to see the effect is a reasonable scenario there, unlike the CLI's need for "automated batch runs whose results must be reproducible."
- No form of "explicit override" flag (e.g. `--mc-runs-override`) is added to the CLI. The user's request was that "configuration should live in one place only"; adding a relabeled override door back in would leave the problem unsolved.

## Result

```
sim_cli/main.py     removed the --mc-runs / --seed parameters and their pass-through
sim_cli/runner.py   run_sim's signature simplified to (model_path, project_root, csv_path);
                     internally reads runs/seed from engine.current_model.simulator['mc']
docs/cli.md         removed the --mc-runs/--seed documentation; noted that MC comes from YAML, the same pattern as optimizer.mc;
                     updated the MC row in the "Relationship with the GUI" table; added a note in the batch.py section that it "will slow down according to a model's mc.runs"
docs/data_flow.md   path A's example no longer involves an MC flag (it never mentioned one, no change needed)
docs/sim_design.md  the CLI row's annotation synced to --sim-only/--opt-only (incidentally fixing a leftover from the previous rename, alongside this ADR)
```

## Related

- ADR 0045 — the MC probabilistic-simulation architecture (the source of the YAML `mc:` field's definition)
- ADR 0113 — the subject of this revision: adding `--mc-runs`/`--seed` to the CLI (one day earlier)
