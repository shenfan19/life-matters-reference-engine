# ADR 0060 — Game Repository Separation and UI Architecture

**Date:** 2026-05-05
**Status:** Accepted
**Scope:** overall project structure, sim_gui, game

---

## Background

The sim repo is planned to go public alongside a paper submission. The game layer is unrelated to the paper, and its code style and target audience differ from the sim layer; keeping them in the same repo would confuse paper readers, so they must be separated first.

---

## Decision

### 1. Separation boundary

| Content | Destination |
|------|------|
| `game/` | game repo |
| `models/stories/` | game repo (game story content) |
| `sim_gui/src/components/StoryEditor.tsx` | game repo (moves with game) |
| `sim_gui/src/components/StoryEngine.tsx` | game repo (moves with game) |
| game-specific ADRs (0006, 0010, 0011, etc.) | game repo `docs/decisions/` |
| `sim_gui/` | sim repo (stays) |
| `sim_engine/` | sim repo (stays) |
| `models/published/`, `models/source/` | sim repo (stays) |
| `plugins/`, `docs/` | sim repo (stays) |

The sim `App.tsx` removes the Game Builder tab and StoryEngine-related code, keeping a "Game Player ↗" button that opens `localhost:5174` across repos.

### 2. Game's internal UI architecture

**Two top-level nav tabs, with Play as the default entry point:**

```
[♠ Life Matters Game]  [Play]  [Build]
```

- **Play**: the existing StorySelect → CardGame flow, unchanged
- **Build**: GameBuilder (evolved from StoryEditor)

No separate landing page — the two features don't yet warrant a router of their own. Add one once a third feature appears.

### 3. Future standalone models/ repo (decided but deferred)

Split `models/` into a third repo (`lm-models`), referenced by sim and game as a git submodule, and open to external model contributors.

**Reason for deferral:** close to a paper submission deadline; the submodule workflow adds debugging friction with a poor cost-benefit ratio at this point. Revisit once the paper is submitted and external contributors express interest. Execution steps at that point:
1. Split `models/` into the `lm-models` repo
2. sim repo adds it as a submodule
3. game repo adds it as a submodule, and StoryEditor switches to reading local YAML directly via js-yaml

### 4. How game reads sim data

When Game's StoryEditor/Builder reads a model's variable structure:
- **Short term**: parse the YAML under `models/stories/` directly (js-yaml, no API dependency)
- **Medium term** (once models/ is standalone): read YAML from the submodule
- **Not doing**: calling the sim API (the two repos cannot assume the other is online)

---

## Consequences

- `sim_gui/src/App.tsx`: removes the story page, StoryEditor, and StoryEngine imports
- `game/src/App.tsx`: adds the Play/Build top nav
- `game/src/components/GameBuilder.tsx`: new file
- `models/stories/` moves with the game repo
- Game-specific ADRs migrate with the game repo (the sim repo's docs/ keeps sim-specific ADRs)
