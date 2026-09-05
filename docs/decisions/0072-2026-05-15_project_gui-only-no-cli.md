# 0072 · GUI-only: dropping the CLI as a formal interface

**Date**: 2026-05-15 (backfilled; the original decision predates the ADR numbering system)
**Status**: ⚠️ Partially revised — the GUI remains the sole formal interface for human users; `sim_cli/` was added as a developer/batch tool (see ADR 0091),
and has since been upgraded into a formally published interface for AI/automation scenarios (see ADR 0101)
**Category**: architecture / interface design

---

## Background

The LM system originally maintained both:
- `sim_gui/`: a React + Vite frontend, talking to the engine via `/api`
- `sim_engine/src/optimizer_cli.py`: a command-line entry point calling directly into the engine layer

As the GUI's feature set grew (multi-objective Pareto visualization, MC curve overlays, history archives, drag-reordering, etc.), the CLI's and GUI's feature sets began to permanently diverge — the CLI cannot render charts, cannot interactively tune parameters, and cannot give real-time progress feedback.

The target users are **doctors/researchers who understand the science but aren't comfortable with a command line**. The CLI has no value for them. Maintaining two interfaces at once carries significant documentation, testing, and compatibility costs, and would continually drain effort away from feature development.

## Decision

**LM's formal user interface is the GUI (`sim_gui/`). The CLI is no longer a formal entry point: it does not ship with the code and does not accept new feature requests.**

Specific constraints:

1. **No new CLI features**: all new functionality is implemented only in the GUI, never mirrored to the CLI
2. **No CLI bug fixes**: `optimizer_cli.py` and similar files remain for internal debugging only; bugs found in them are not fixed
3. **The CLI is not a test entry point**: tests call the engine-layer Python functions directly, bypassing the CLI parsing layer
4. ~~The CLI is not advertised in documentation~~ (revised by ADR 0101: the CLI is now documented in the README/docs as an interface for AI/automation scenarios,
   though the human-facing parts of the README/docs still center on the GUI)
5. **The API server (`api_server.py`) is the engine's formal programmatic interface**: automation/batch scenarios go through the HTTP API, not the CLI

## Why not maintain the CLI

| Reason | Explanation |
|------|------|
| User mismatch | the target users are doctors/researchers, not comfortable with command-line arguments |
| Feature parity is unattainable | charts, history, drag-reordering, and similar GUI capabilities are inherently absent from a CLI |
| Double maintenance cost | the CLI's argument parsing and error handling fully duplicate the GUI's interface layer |
| Clearer security boundary | the GUI → HTTP API → engine three-layer architecture isolates more safely than the CLI calling the engine directly |

## Rejected approaches

| Approach | Reason for rejection |
|------|------|
| Maintain both CLI and GUI | double the maintenance cost; the CLI's feature set would always lag the GUI |
| CLI as a batch-scripting entry point | the HTTP API is safer, better tested, and needs no argparse layer |
| Rebuild the CLI as a TUI (terminal interactive interface) | no benefit to the target users; very poor cost-benefit ratio |

## Exceptions

- Internal development/debugging may use CLI scripts on an ad hoc basis, without going through PR review
- Engine-layer Python functions may be imported and called directly by test scripts (bypassing the CLI)

## Related

- `sim_impl.md` §interface-layer constraints — this constraint is also recorded there
- `sim_engine/src/optimizer_cli.py` — file kept for now, marked as deprecated
