# Game Bridge plugin

Game Bridge lets a game use LM models without knowing them. A model keeps its equations. Next to it sits a small bridge file that says which game-neutral concept each variable answers to, for example that `blood_glucose` is the concept `glycemic_level`. A game asks for concepts in a system file. The plugin picks the models that give those concepts, joins them into one flat LM model, and exports it for the game: as it is for any LM engine, as a Care for You condition model, or as a fragment of a Teleporter era file. When a new model is added to the library with its bridge file, every game that asks for the concept gets it, and the game code does not change.

The output does not depend on how a game runs it. A game that rewrites the equations in JavaScript reads two files, and a game that calls a backend engine runs the flat file in the LM Reference Engine. Both read the same concept description.

## What to open

| Question | Open |
|----------|------|
| What is a concept and which ones exist | Section 2, and [library/concepts.yaml](../library/concepts.yaml) |
| How do I describe a model for the bridge | Section 3 |
| How does a game ask for a set of models | Section 4 |
| Why was this model chosen, and how are models joined | Sections 5 and 6 |
| What do I get out and how do I run it | Sections 7 and 8 |
| Which command or endpoint do I call | Section 9 |
| How do I know it is faithful, and what can it not do | Sections 10 and 11 |

## 1. The layers

- Models and bridge files belong to the library. They know nothing about games.
- The system file and the composition belong to this plugin. They run once, when a game is built or a save is set up, and write plain files.
- The adapter belongs to each game. It maps concepts to the game's own states, actions and texts. For Care that is a care_export recipe, for Teleporter it is the era file that receives the fragment.

A dependency goes only upward. A model never mentions a concept it does not provide or need, a bridge file never mentions a game.

## 2. The vocabulary

[library/concepts.yaml](../library/concepts.yaml) lists every concept. A concept has a role.

- readout: a quantity from 0 to 1 that a game reads. A larger value is worse or more burden. A game that prefers "satisfied" flips it.
- handle: something put into the person. A game writes it, or another model provides it, as a diet gives carbohydrate to a glucose model.
- context: given by the scenario and not changed by the step, for example the exposure to a pathogen at a place and time.

The fields of a concept:

| Field | Meaning |
|-------|---------|
| domain | body, mind or society |
| role | readout, handle or context |
| combine | readouts only. How several models that each give a variable are joined: `replace` allows one provider, `max` takes the largest. Default `replace` |
| rate_combine | readouts only. How the rates several models give are joined: `sum_rate` adds, `product` multiplies. Default `sum_rate` |

The vocabulary stays small on purpose: a concept is added only when a model provides it or a game consumes it.

## 3. The bridge file

One file per model, named `<model>.bridge.yaml`, placed anywhere under the plugin's `library/bridges` folder, under a folder named with `--bridges`, or next to the model. Two files for one model are an error.

```yaml
bridge_version: 1
model: references/medical/disease/metabolic/diabetes_2026   # path under the models folder, no .yaml
tags: [diabetes]
provides:
  glycemic_level: { var: blood_glucose, scale: [70, 300] }
  frailty:        { rate: "0.002 * complication_score / 100.0" }
  mood_valence:   { rate: "0.02 * max(0.0, (blood_glucose - 190.0) / 100.0)" }
requires:
  carb_intake:    { var: carb_intake }
  activity_load:  { var: exercise_intensity, optional: true }
```

| Key | Meaning |
|-----|---------|
| tags | Names a system can ask for, for example the condition |
| provides.C.var | A variable of the model that answers to concept C |
| provides.C.scale | `[lo, hi]`. A readout is the variable mapped linearly from this range to 0..1 and clipped. Required for a readout given by a variable |
| provides.C.rate | An expression in the model's names. The model's push on a readout that has no variable of its own, such as frailty and mood. The unit of a rate is defined by the adapter that uses it |
| requires.C.var | The model's input (or state) that the concept C feeds. If the model reads it without declaring it, the bridge declares it as an input |
| requires.C.optional | If true, a missing provider is not an error and the variable keeps its default |
| requires.C.convert | An expression in `x`, the provider's value, to convert units. Default none |
| requires.C.default, unit | For a variable the bridge has to declare |

`backend.py check` compares every bridge file with its model and the vocabulary: concepts must exist, variables must be declared, a readout needs a scale, a required variable must not be a parameter.

## 4. The system file

```yaml
system_version: 1
id: diabetes_care
goal: [glycemic_level, frailty, mood_valence]   # what the game will read
include_tags: [diabetes]                         # members named by tag
include_models: []                               # members named by path
supply_from_game: [carb_intake, activity_load]   # handles or contexts the game writes
policy:
  min_ratings: { confidence: 0.25 }              # a provider must reach these scores in metadata.ratings
  exclude: []                                    # models never to choose
pins: {}                                         # concept: model, a hand choice
```

## 5. How the models are chosen

1. Pinned models and models with an `include_tags` tag or listed in `include_models` are members.
2. For each goal that no member provides, the plugin looks for the models that provide it, removes the excluded ones and those under `min_ratings`, and takes the one with the highest `confidence`. A tie is an error that names the candidates. A hand choice is a pin.
3. For each requirement of each member that the game does not supply and no member provides, the same search runs. An optional requirement with no provider is skipped. A required one with no provider is an error that names who required it.
4. This repeats until nothing new appears.
5. A readout that is given by a variable and has a `replace` rule must have one provider. Models that feed each other in a cycle are refused.

Every choice is written to the report with its reason.

## 6. How the models are joined

- Names: each member's names get its prefix, taken from the model's file name. A system with one member keeps the original names. Nothing clashes, and the same model could appear twice.
- Wires: an input that another member provides becomes a state of the flat model, and a generated equation `wire_<prefix>_<var>` sets it from the provider's variable. This uses the rule that the importing file may redeclare a name. The engine runs it as ordinary equations.
- Order: equations run in one pass by descending priority. Each member's priorities are shifted into a band of 1000 per level, a level being the longest chain of consumers below it, and a wire sits in the middle of the consumer's band. So a provider updates first, then the wire, then the consumer, and the consumer sees the provider's value of the same step with no lag. Member priorities must stay within plus or minus 100.
- Time: each equation keeps its own `step_unit`. The flat model's `simulation.step_size` is the finest of the members.
- Plans: the default regimens of the members are kept for the inputs that stay inputs, and dropped, with a warning, for the ones that are wired.
- Metadata: ratings are the lowest of the members, the review status of an unreviewed source is kept, and a single-member system keeps the source's description. The model is marked as generated.
- A member that imports other models is refused. Add the imported models as members instead.

## 7. What comes out

`compose` writes four files per system:

| File | Content |
|------|---------|
| `<id>.lm.yaml` | The flat model. It uses LM 1.0 blocks only and runs in the LM Reference Engine as it is |
| `<id>.bridge.yaml` and `<id>.bridge.json` | The concept description, same content in two formats |
| `<id>.report.yaml` | Members, prefixes, why each was chosen, wires, warnings |

The bridge description:

| Key | Meaning |
|-----|---------|
| readouts.C.sources | List of `{var, lo, hi}`. The readout C is each variable mapped to 0..1 and clipped, joined by `combine` |
| rates.C.terms, combine | The expressions the members give C, joined by sum or product |
| handles.C | The variables the game writes for C. A concept several members need lists several variables |
| context.C | Same for context concepts |
| members, wires | Prefix per model, and which variable follows which |
| step_minutes | The step of the flat model |

`read_concepts` and `read_rates` in bridge.py are the reference for a runtime: a few lines each.

## 8. Using the output

### 8.1 A backend engine

Run `<id>.lm.yaml` in the LM Reference Engine, or any LM-compatible engine, and read the variables named in the bridge description. The game writes its handles as inputs.

### 8.2 JavaScript in the browser

Load the flat model, run its equations as LM format section 3.3 says (descending priority, conditions, writes clamped to bounds, each equation's own `step_unit`), and read concepts as section 7 says. Nothing else is needed: no imports, no bridge file, no vocabulary at run time. The expression checks below say which functions the flat model uses.

### 8.3 Care for You

`export care` turns the flat model into a Care condition model with the care_export converter, so the converter's checks, the player-facing readouts, actions and story stay in a care_export recipe. The recipe may use the concepts:

- `@concept` stands for the variable that answers to the concept: `signal: "@glycemic_level"`. As a key, or as the `input` of a pulse, it expands to one entry per variable.
- `@prefix.name` names a variable of the member that has that prefix, for what is not a concept.
- Rates the members give to `frailty` and `mood_valence` become the model's `effects`, unless the recipe sets them. The mood effect is the negative of the rate, because a larger `mood_valence` is a worse mood.

### 8.4 Teleporter

`export tp` makes a fragment for an era file:

- Names become `<instance>.<name>`, and every variable carries `source: lm_model`.
- Teleporter counts its step in days. The `step` of an equation written for hours is rewritten to `step * 24`, so the coefficients stay as they are.
- Teleporter has no auxiliary variables, so they are inlined. It does not have `pow`, `tanh`, `ceil`, `clip` and the like, so they are rewritten into the functions it has, and `True` and `False` become 1 and 0.
- A parameter that is a distribution cannot run in Teleporter and is an error.
- `merge_into_era` adds the fragment to an era file. It refuses a name that exists, and a step that differs from the era's.
- Actions, agents, events and scoring of the era remain the game's own. They write the handles and read the concepts.

### 8.5 What each target accepts

| Target | Functions and names | Checked by |
|--------|---------------------|------------|
| lm | The LM expression language | The engine runs the file |
| care | `min max abs exp log sqrt pow floor tanh sin cos`, the names Care provides | care_export's translator |
| tp | `min max abs exp log sqrt sin cos floor round clamp`, `day`, `step`, `arrived` | Teleporter's own expr.js, see section 10 |

A name or function a target does not have is reported, and nothing is written.

## 9. Commands

From a terminal, without the engine. Only PyYAML is needed.

```
python plugins/game_bridge/backend.py check   --models ../life-matters-models/models
python plugins/game_bridge/backend.py compose library/systems/diabetes_care.system.yaml --models ../life-matters-models/models --out out
python plugins/game_bridge/backend.py export care library/systems/diabetes_care.system.yaml --models ... --recipe plugins/care_export/recipes/diabetes.yaml --out out
python plugins/game_bridge/backend.py export tp   library/systems/diabetes_care.system.yaml --models ... --instance traveler --step-days 0.25 --era some_era.lm.yaml --out out
```

As a plugin of the Reference Engine it answers `concepts`, `systems`, `compose` and `export` at `POST /api/plugins/game_bridge/<name>`.

## 10. How faithful it is

`python plugins/game_bridge/tests/test_bridge.py` runs three groups.

- Small models written in the test: the vocabulary, every bridge check, every way a choice can fail (no provider, a tie, a pin that does not provide, a cycle, a policy that removes all candidates), a chain of three members and the order of its equations, names, wires, the exports, and the recipe placeholders.
- Parity with the LM Reference Engine, on the real diabetes model with a small diet in front of it. The composed model and the diabetes model fed the carbohydrate by hand agree to the last digit after 72 hours, so the wired input as a state works in the engine. The Care model made from the composed system, run by the care_export evaluator, agrees with the engine to 1e-8. A single-member system gives the same Care model as care_export alone.
- Teleporter: every equation of the fragment is compiled with Teleporter's own `js/expr.js` through node and evaluated at five states, and the result equals the source expression (35 cases, difference 0). It needs node and the game-teleporter folder next to this repository, or `TP_PATH`.

The parity groups need the models repository (`LM_MODELS_PATH` or a sibling folder) and are skipped without it.

## 11. Limits

- Members must be standalone models. Imports are refused.
- Priorities of a member's equations must stay within plus or minus 100.
- The library has one real bridge file so far, for diabetes_2026. A model without a bridge file is invisible to a system.
- The unit of a `rate` is not defined by the bridge. The adapter that uses it fixes it. Care uses it as care_export's `effects`.
- A cycle between members is refused, although a real feedback loop could be modelled with one step of lag. That is not built.
- Teleporter has neither the LM time symbols (`t`, `HOUR` and so on) nor per-equation step units, so an expression that reads them is reported.
- Composition keeps the sources' flaws. Ratings and the review status of the least reliable member are carried, so a composed system never looks better than its parts.
