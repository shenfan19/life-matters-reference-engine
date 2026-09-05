# 0101 — Upgrading the CLI into a Public Release Interface (for AI / Automation Scenarios)

**Date:** 2026-06-13
**Status:** Implemented (docs + code: `--output-dir`, per-model subdirectories, `batch.py`; CI not included)
**Category:** Architecture / Interface Design
**Revises:** partially revises ADR 0072, ADR 0091

---

## Background

ADR 0072 established the GUI as the sole formal user interface; ADR 0091 built on it by adding `sim_cli/`,
positioned as a "developer/power-user tool" — one that could be compiled into an exe and distributed to
collaborating researchers with batch needs, but **not covered in the GUI documentation, and not advertised to ordinary users**.

As AI assistants (such as Claude Code and other LLM agents) increasingly operate on this repository directly, or on distributed release packages,
a new class of "user" has emerged: **AI agents that don't interact through a browser, but need to run simulations/optimizations and read back the results**.
For this kind of user, a command-line interface — explicit input, structured output as CSV/logs, no rendering required — is naturally a better fit than a GUI.

## Decision

**`sim_cli/` (`lm-sim`) is upgraded from an "internal developer tool" to a formal, publicly released interface aimed at AI
and automation scripts, existing alongside the GUI (which targets human users) and shipped to external users with each code release.**

Specific changes:

1. **Add a CLI entry to the README:** document `lm-sim`'s purpose and basic invocation in the repository structure and quick-start sections,
   making clear that its target user is "scripts/AI agents," distinct from the human-facing GUI.
2. **Add an "AI / automation scenarios" section to `docs/cli.md`:** emphasize that the output is structured CSV plus logs,
   suitable for scripts or agents to parse; also fill in the previously missing documentation for the `--all-plans` parameter.
3. **Release artifacts now include the CLI:** the release package (GitHub Release) now bundles `dist/lm-sim.exe` (or a source-run alternative),
   not just the source code and GUI. The build remains a manual `pyinstaller sim_cli/build.spec`; this round does not introduce
   automated CI builds (deferred after weighing the effort involved; a future ADR can revisit this if needed).
4. **`--output-dir` plus per-model subdirectories:** `lm-sim` gains an `--output-dir PATH` parameter (default `output/`);
   output is now uniformly written to `<output-dir>/<model-name>/`. In a single-model debugging loop, that model's run history
   naturally accumulates in one directory; in a batch scenario, the orchestration layer simply passes the batch directory as `--output-dir`, and different models never conflict.
5. **`script/test_batch.sh` → `sim_cli/batch.py`:** the original bash batch script depended on Git Bash,
   which conflicted with the "publicly released to AI" positioning on plain Windows (no bash) environments;
   it was rewritten as `sim_cli/batch.py`, pure Python, calling `runner.py` directly in-process rather than through subprocess/stdout parsing.
   Behavior, parameters, and report format match the original script; see the 2026-06-13 revision to ADR 0091 for detail.

What remains unchanged:

- **The GUI is still the primary interface for human researchers** — charting, interactive parameter tuning, history archives, and similar capabilities will not be pushed down into the CLI.
- **The CLI does not gain the GUI's visualization capabilities**; the feature-set gap (see the "Relationship with the GUI" table in `cli.md`) remains.
- **Results are not written back to the model YAML** (the decision from ADR 0091 stands).
- The HTTP API (`api_server.py`) remains the interface for remote/web automation scenarios; the CLI targets local/CI scenarios (including locally run AI agents).

## Why Now

| Reason | Explanation |
|------|------|
| AI agents are a real, new user population | Not a hypothetical need — day-to-day development on this very repository is already largely done by AI agents through the CLI/scripts |
| The CLI was already feature-complete | After ADR 0091, the CLI already supported sim/opt/warm-start/early-stop; no new development was needed, only a change in whether it's publicly advertised |
| Documentation cost is low | No code changes involved; this is simply writing already-existing capabilities into the README/docs so external users (including AI) can discover and use them correctly |

## Rejected Alternatives

| Alternative | Reason rejected |
|------|---------|
| Also set up GitHub Actions to auto-build and release the exe | Significant effort and needs cross-platform verification; this round is documentation-only, with CI left for a later ADR |
| Build a separate new interface for AI scenarios (e.g. an MCP server) | The existing CLI already satisfies the core need of "YAML in → CSV/logs out," with no need to duplicate that effort |
| Fold CLI capabilities into the GUI documentation as one unified description | The CLI and GUI have different target users and interaction models; mixing them together would confuse both kinds of readers, so `cli.md` stays independent |

## Related

- `docs/cli.md` — CLI usage documentation (updated this round)
- `README.md` — repository overview (updated this round, adding the CLI entry)
- ADR 0072 — the GUI-only decision (partially revised this round: the CLI is no longer "not advertised to users," but the GUI remains the primary interface for humans)
- ADR 0091 — the `sim_cli/` batch tool (partially revised this round: the CLI expands from a "collaborator tool" to a "public release interface")
