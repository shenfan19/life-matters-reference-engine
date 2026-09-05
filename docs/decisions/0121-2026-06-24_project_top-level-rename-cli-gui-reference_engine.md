# ADR 0121 — Top-level directory rename: `sim_cli`/`sim_engine`/`sim_gui` → `cli`/`reference_engine`/`gui`

**Date**: 2026-06-24
**Status**: Accepted
**Scope**: the repository's three top-level directories and every internal reference to them, `docs/` reorganization, the `SimulatorEngine` class name

---

## Background

The release model layers multiple repositories: `life-matters-reference-engine` (this repo), `life-matters-models`, and `life-matters-game` are each packaged and released independently, and users download and unpack them into the same directory for combined use. The original top-level structure, `sim_cli/`, `sim_engine/`, `sim_gui/`, had two problems with its `sim_` prefix:

1. **Inaccurate naming**: this repo's engine handles both simulation (sim) and optimization (opt) — names like the `SimulatorEngine` class and `app_state.simulator_engine` only reflect sim, with opt added later as a symmetric capability. Prefixing with `sim_` while giving opt no corresponding prefix creates an asymmetric naming that can make opt look like a secondary/bolted-on feature.
2. **`docs/` collision across repositories**: `life-matters-reference-engine/docs/`, `life-matters-models/docs/`, and `life-matters-game/docs/` would overwrite one another once all three repositories are unpacked into the same directory. `models/` and `output/` are directories intentionally shared/merged, but `docs/` should not be overwritten.

Renaming schemes using prefixes like `docs_sim`/`docs_model` were discussed but judged to mix "categorical naming" with "class naming" in an unprofessional way. The final approach nests documentation by product: `docs/reference_engine/`, `docs/model/` (models repo), `docs/game/` (game repo) — `docs/` itself carries no prefix, with content sorted into subdirectories by product, consistent with the principle already applied to `cli/`, `gui/`, and `reference_engine/` as top-level directories: "name it what it is; don't prefix for a hypothetical future collision" (these three directories currently have no actual collision across the three repositories, so no rename is needed there).

An intermediate version had settled on `ref_engine/` for the top-level directory and `docs/engine/` for the documentation directory, but `ref_engine` is an unintuitive abbreviation, and `engine` alone is too generic (it doesn't say which engine), disconnected from this repo's official brand term "LM Reference Engine" (see `lm_nomenclature.md`). The final choice spells it out in full as `reference_engine`/`docs/reference_engine`, matching wording already in use elsewhere (`class ReferenceEngine`, the README, etc.) exactly, without introducing a new word (such as `core`) that would create yet another layer of naming/concept mismatch.

## Decision

**Drop the `sim_` prefix, following one of two options: either no prefix at all, or wording like "reference engine" that emphasizes "a reference implementation" rather than "the only implementation." `sim_` is not used because there is also a symmetric `opt`, and prefixing one while leaving the other unprefixed is an unsuitable either/or choice. Abbreviations are always spelled out in full — readability is never sacrificed for brevity.**

| Change target | New name |
|---------|------|
| `sim_cli/` | `cli/` |
| `sim_engine/` | `reference_engine/` |
| `sim_gui/` | `gui/` |
| `sim_engine/src/simulator_engine.py` | `reference_engine/src/reference_engine.py` |
| `class SimulatorEngine` | `class ReferenceEngine` |
| `app_state.simulator_engine` | `app_state.engine` |
| `PluginContext.__init__(simulator_engine=...)` | `PluginContext.__init__(engine=...)` |
| `gui/public/locales/sim/` | `gui/public/locales/engine/` (aligned with the game repo's `game/public/locales/game/`) |
| `<I18nProvider section="sim">` | `<I18nProvider section="engine">` |
| `docs/` (this repo's content) | `docs/reference_engine/`, with `sim_design.md`/`sim_impl.md`/`sim_requirements.md` → `design.md`/`impl.md`/`requirements.md` |

**Not changed (out of scope for this change)**:

- The `models/`/`output/` top-level directory names — these are already intentionally shared/merged directories across repositories, with no naming problem to solve.
- `plugins/` — has no `sim_`/asymmetry problem.
- Historical ADR file content (`docs/reference_engine/decisions/*.md`) — an ADR is immutable historical record; a filename label such as the `sim_` in `0074-..._sim_gui-working-state-priority.md` is a content-scope tag for that ADR, not a target of this rename, and references to actual paths at the time in the body text are left as-is.
- `gui/src/components/sim_tab/` and similar frontend internal component folder names — this folder was found to have the same "`sim_`-prefixed but containing opt" asymmetry, but that belongs to a larger-scope frontend internal refactor, beyond this "top-level directory rename," and is left for separate evaluation.
- `tests/test_sim_cli_consistency.py`'s filename — test filenames are not within this rename's scope; only its internal imports were updated.

## 2026-07-24 update: the `docs/reference_engine/` nesting has been reverted

The premise for introducing the `docs/reference_engine/` nesting in this ADR was "multiple repositories unpacked into the same directory for combined use" (background point 2). That release model has since been abandoned in favor of each repository being stored independently, as sibling directories under the same parent, with the models repository's path specified via the `LM_MODELS_PATH` environment variable, no longer relying on directory overlap/overwriting. The premise of `docs/` colliding across repositories no longer holds, and `docs/reference_engine/` has been flattened back to `docs/` (the documentation index and `@`-include paths in `README.md`/`CLAUDE.md`/`AGENTS.md` were updated accordingly). This ADR's original text is left unchanged; this note only records that the nesting decision has since been superseded by later practice.

## Outcome

- The `cli/`, `gui/`, and `reference_engine/` top-level directories and all internal Python imports, TS imports, `sys.path`, `build.spec` (PyInstaller hiddenimports), `.vscode/tasks.json`, `.vscode/settings.json`, `lm.code-workspace`, `.pre-commit-config.yaml`, `scripts/check_hardcoded_constants.py`, and `run_server_and_log.py` path references were all updated.
- `docs/` was reorganized into `docs/reference_engine/` (including the `decisions/` subdirectory), with the documentation index and `@`-include paths in `README.md`/`CLAUDE.md`/`AGENTS.md` (`@docs/ui_guidelines.md` → `@docs/reference_engine/ui_guidelines.md`, etc.) updated accordingly.
- The cross-repo relative-path references to `life-matters-models` ADRs in `docs/reference_engine/decisions/README.md` gained an extra `../` (because `decisions/` is now nested one level deeper, the original `../../../life-matters-models/...` was invalidated and became `../../../../life-matters-models/...`).
- The internal imports of `tests/test_sim_cli_consistency.py` and `tests/models/test_mc_distributions/.../test_dose_scaling.py` were updated; all 8 tests in `pytest tests/` passed.
- `python cli/main.py <model.yaml> --sim-only` was manually verified to run correctly.
- The GUI backend's `reference_engine/src/api_server.py` and `reference_engine/src/reference_engine.py` imports were verified to work.

## Related

- ADR 0116 — a previous similar rename eliminating internal terminology asymmetry (`regimen_runner.py` → `schedule_runner.py`); this change follows the same rename-record format
- ADR 0072/0101 — historical decisions on the CLI interface's status; this rename does not affect their conclusions, only the directory names
