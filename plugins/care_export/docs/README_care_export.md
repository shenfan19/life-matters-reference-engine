# Care Export plugin

Care Export turns an LM disease model into a disease model for Care for You, a quiet game about looking after the people at home. In the game, the person's numbers (a need such as "time to check the blood sugar", mood, frailty) follow from the model, and the player's care actions feed the model's inputs. The same model file also runs in the game's lab page, so a model can be tried without playing.

The format of the converted model (the `care:` section, readouts, pulses and so on) is defined on the game's side, in the Disease models section of `README_backend_protocol.md` in the Care for You repository, and the game's `docs/architecture.md` shows where it sits in the data flow. This page covers only the conversion.

The plugin does the mechanical part of the conversion and refuses to guess. What needs a decision, such as which Care need a disease drives and what a pill does in the model, is written in a recipe file by a person. A name, an expression or a setting that cannot be carried over is an error and nothing is written.

## What to open

| Question | Open |
|----------|------|
| How do I convert a model | Section 1 |
| What goes into a recipe | Section 2 and the two files in [recipes](../recipes) |
| What is done to the equations | Section 3 |
| How do I know the conversion is faithful | Section 4 |
| What can it not do | Section 5 |

## 1. Using it

From a terminal, no engine needed, only PyYAML:

```
python plugins/care_export/backend.py recipes/diabetes.yaml recipes/hypertension_gout.yaml --models ../life-matters-models/models --out care_pack --zip
```

- `--models` is the models folder in which the recipes find their `source`.
- `--out` receives `templates/lm/models/<name>.yaml` for every recipe and `templates/conditions/<id>.yaml` for recipes that carry a condition template. With `--zip` it also writes `careforyou-disease-pack.zip`, which Care's import dialog (settings, save and data) accepts. The import adds the files to the game's templates and does not touch anyone in the save.
- As a plugin of the Reference Engine it answers `recipes` (list), `convert` (one or several recipes, with a 48 hour preview run) and `pack` (the zip, base64 encoded).

A group of recipes is checked together: two recipes may not use the same prefix or condition id, and a warning is given when two models drive the same Care need.

## 2. The recipe

One recipe per source model. Keys:

| Key | Meaning |
|-----|---------|
| source | Path of the LM model below the models folder, without .yaml |
| prefix | 2 to 9 lowercase letters. Every name of the model gets this prefix, so models can live together in one game |
| condition | id of the Care condition. `supersedes` names the hand-written Care model it replaces. `template` is the Care condition (needs, actions, first lines) for a condition that Care does not have yet |
| inputs | For each input variable: `ignore`, `schedule` (the daily plan of the source model becomes the day's routine) or `{schedule: auto, window_minutes: n}` |
| pulses | Care action id or story choice key to what it does: `{input, total, minutes}` puts an amount into an input over a window, `{state, add}` adds to a state variable |
| needs | Care need to `{kind: monitor, signal, lo, hi, rate, gain}`, a need that grows faster while the signal is high and is reset by the player's check, or `{kind: direct, state, lo, hi}` |
| step_scale | Equation name to factor, for slow processes that should happen within a game day |
| presets, default_preset | Severity levels as starting values of parameters and states |
| readouts | What the player can observe, with bands and the actions that reveal it |
| effects | Slow leaning on mood and frailty, as expressions in the source model's names |
| story | The two sentences shown when the player picks the condition |

Every name in a recipe is a name of the source model. The plugin renames them.

## 3. What is done to the model

- Variables of type parameter and the top-level parameters become parameters. State and input variables are kept with their bounds and units. Everything is renamed with the prefix.
- Each expression is parsed as Python and checked against the subset Care understands: `min max abs exp log sqrt pow floor tanh sin cos`, arithmetic, comparisons, `if else`, `and or not`. `round`, `clip`, `ceil`, `log10`, `log2`, `//` and `pi` are rewritten into that subset. Anything else, such as a list, an attribute or an unknown function, is an error.
- Equation conditions are kept. The step unit of every equation is kept, and the model runs on the step of its own simulation (`fixed_step_minutes`), so an input in a window is spread over the steps exactly as LM does.
- The source model's `ratings`, description and review status are copied into the metadata, together with the source path, so a converted model never looks more reviewed than its source.
- The generated need equations are the only thing added that is not in the source model, and they are marked as generated.

## 4. How faithful it is

`tests/test_convert.py` checks the conversion on small models, on every error path, and against the LM Reference Engine:

- the diabetes model after 72 hours: the converted model run by the plugin's evaluator matches the engine to 7e-6 relative on the worst variable (the equations switch on thresholds, so noise of 1e-13 between solvers can move one step) and to 1e-13 on the glucose;
- the hypertension and gout model after 96 hours: exact.

Care's own engine (frontend/src/backend/lm.js in the game repository) is checked against the same evaluator on both converted models at every twelfth hour, and the difference is zero. So the chain is the LM engine, the evaluator in this plugin, and the game.

## 5. Limits

- Standalone models only. A model that imports another is refused.
- The game has fixed Care needs and actions. The recipe maps onto them, and an input that no Care action feeds simply stays at its default. The source diabetes model has an insulin input that none of its equations uses, so the pill action has no effect in the converted model, and the recipe says so by not mapping it.
- Slow processes keep their real speed unless the recipe speeds them up with `step_scale`.
- Time inside the game is not the model's calendar. Dates in the source plan are ignored, and the daily routine repeats every day.
- A converted model is a caricature of a disease for a game about care, and it keeps whatever flaws the source model has. The source diabetes model, for example, lets the glucose fall to its floor overnight. Read the source's ratings before relying on a number.
