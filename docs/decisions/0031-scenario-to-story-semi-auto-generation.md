# 0031 — Scenario-to-Story Semi-Automatic Generation Pattern

Date: 2026-04-15  
Status: Accepted

## Context

The B·Matter project maintains two parallel artifacts for each historical scenario:

1. **Scenario YAML** (`models/scenarios/`): A system-dynamics simulation model used in the Simulator GUI. It defines continuous-time ODEs/difference equations, input variables, and optimizer targets.
2. **Story package** (`models/stories/`): A card-game representation used in the Game GUI. It defines a turn-based deck-building experience with the same narrative content.

As the number of historical characters grows, it becomes impractical to design each game story independently from scratch. We need a **repeatable workflow** that derives game card effects directly from scenario formula coefficients, keeping the two representations consistent.

The first three stories generated under this workflow were:
- `ad0228_cn_zhuge_liang` (228–234 CE, overwork tragedy)
- `ad1847_hu_semmelweis` (1847–1865, institutional rejection)
- `ad1945_jp_hiroshima_nurse` (1945, radiation self-sacrifice)

## Decision

We adopt a **scenario-to-story conversion workflow** with the following steps:

### Step 1 — Define the Scenario
Write a scenario YAML with:
- `variables`: continuous state variables, with `io_role: output` for those that become game variables
- `formulas`: the simulation update rules (the source of truth for magnitudes)
- `simulation.time`: step size and total duration
- `optimizer`: what the player is trying to optimize

### Step 2 — Derive Time Mapping
Calculate `days_per_turn = total_duration / game_turns`. This is the multiplier applied to per-step formula rates to get card deltas.

Example: Semmelweis scenario runs 216 months over 12 turns → 18 months/turn.

### Step 3 — Map Variables
Variables with `io_role: output` become `initial_state` entries in `game_story.yaml`. The initial value matches the scenario's initial condition. A `_mapping.json` file documents the correspondence.

### Step 4 — Derive Card Effects
For each player action (scenario input variable at a representative level):
```
card_delta = input_rate × days_per_turn × efficiency_factor
```
- **Representative level**: typically 60–70% of max input (e.g., `work_intensity=2` out of max 3)
- **Efficiency factor**: accounts for nonlinear formula terms (fatigue dampening, sigmoid resistance, etc.)
- **Health/mental costs**: derived from penalty terms in formulas (e.g., `fatigue >= 70 → health loss`)

For env cards (events): use scenario event magnitudes directly or scale to one-turn impact.

Each card's `source.sim_notes` field documents the derivation formula and parameter values.

### Step 5 — Balance Check
Verify that win condition is achievable:
- Sum theoretical max card output across all copies × turns
- Check that health/mental_health drain doesn't make win impossible
- Ensure there are meaningful trade-offs (e.g., high-output cards that also increase risk)

### Step 6 — Write `_mapping.json`
Document in `models/stories/<id>/_mapping.json`:
- `time_mapping`: turn duration and total
- `variable_mapping`: scenario var → game var
- `input_mapping`: scenario input → player card
- `card_derivations`: formula → effect values
- `win_loss_derivation`: how win/lose conditions relate to scenario optimization target

## Rationale

**Consistency**: Card effect magnitudes are grounded in simulation math, not subjective guessing. A player who understands the simulation can predict card strengths.

**Traceability**: The `source.sim_notes` field in every card and the `_mapping.json` file form an audit trail from game mechanic to historical model.

**Scalability**: With the workflow documented, new stories can be generated efficiently from existing scenarios. The pattern is repeatable across wildly different time scales (hours for Hiroshima, decades for Semmelweis).

**Narrative fidelity**: The win/lose conditions directly mirror the scenario's optimizer target and penalty thresholds, so the game communicates the same historical dilemma as the simulation.

## Time Scale Examples

| Story | Scenario step | Turn duration | Game turns |
|-------|--------------|---------------|------------|
| Zhuge Liang | 1 day | 12 days | 15 |
| Semmelweis | 1 month | 18 months | 12 |
| Hiroshima nurse | 1 hour | 24 hours | 15 |

The pattern works across orders-of-magnitude differences in time scale because card deltas scale linearly with turn duration.

## Consequences

- Each scenario must document formula coefficients clearly enough to read off magnitudes.
- `_mapping.json` is a generated/maintained artifact — it must be updated if either the scenario or story changes.
- The `source.sim_notes` field in card YAMLs is not displayed in-game; it is metadata for maintainers.
- Env card weights in `env_deck` should roughly reflect the formula's event frequency in the original simulation.
- Game balance may require post-hoc tuning of individual card deltas; the mapping documents the *intended* derivation, not a strict constraint.

## File Structure

```
models/
  scenarios/social/
    ad0228_cn_zhuge_liang.yaml       ← sim model (source of truth)
    ad1847_hu_semmelweis.yaml
    ad1945_jp_hiroshima_nurse.yaml
  stories/social/
    ad0228_cn_zhuge_liang/
      game_story.yaml                ← game representation
      _mapping.json                  ← derivation documentation
      cards/
        player_*.yaml                ← derived from scenario inputs
        env_*.yaml                   ← derived from scenario events
    ad1847_hu_semmelweis/
      ...
    ad1945_jp_hiroshima_nurse/
      ...
```
