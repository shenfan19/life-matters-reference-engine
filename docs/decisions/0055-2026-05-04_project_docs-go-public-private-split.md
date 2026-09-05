# 0055 — The `docs/` public / `go/` internal boundary rule

**Date**: 2026-05-04
**Status**: implemented

---

## Background

The project's directories contain two categories of documents:

- Technical specifications, architecture decisions, model formats — suitable for external readers and contributors.
- Paper strategy, career planning, business analysis, internal AI working prompts — not suitable for public release.

Both categories were mixed together under `docs/`, risking leaking internal information when published to GitHub.

---

## Decision

| Directory | Nature | Published | Content standard |
|------|------|------|---------|
| `docs/` | **public** | published to GitHub with the code | only technical content usable by external readers |
| `go/` | **internal** | not published | paper strategy, career planning, positioning analysis, AI working documents |
| `CLAUDE.md` | **internal** | not committed | Claude Code working instructions, added to `.gitignore` |

**Forbidden**: `docs/` referencing a `go/` path; `docs/` containing internal markers such as paper numbers (Paper N) or internal task numbers (c_matter_*).

---

## Rationale

- The `docs/` directory of a GitHub open-source project functions as its external technical manual, read directly by users and contributors.
- If internal planning documents were made public, they would expose immature business strategy and personal career plans, falling short of professional publication standards.
- A clear boundary keeps AI working tools (CLAUDE.md) from propagating along with the code.

---

## Implementation

- `go/` is added to `.gitignore` (or managed as a separate private repository).
- All internal references such as `c_matter_*` and `c_paper_*` have been removed from `docs/sim_design.md`, `docs/sim_requirements.md`, and `docs/sim_impl.md`.
- Paper references in `docs/sim_impl.md` were changed to publication-plan annotations in the `[scheduled:: YYYY-MM-DD]` format (containing no internal file paths).
