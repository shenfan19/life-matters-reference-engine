# Body Map plugin

Body Map shows where models act on a paper-doll body. Tick one or more models in the tree and each one is placed on the organs it works on, in its own color, and on the everyday inputs it responds to: air, food and water, work stress, study and social life, sleep, smoke and alcohol, medication, commute and exercise. The stage has a plain background and thin lines, so color appears only where a model sits. A scenario that imports body components lights up the organs of every component it imports. Click a model, an organ or an input to follow it: the rest dims and dashed lines join the inputs of what you follow to its organs.

## What to open

| Question | Open |
|----------|------|
| Which words put a model on which organ | [sites.yaml](../sites.yaml) |
| How an organ is drawn and where its label sits | `SLOTS` in [dist/index.html](../dist/index.html) |
| What the `locate` endpoint receives and returns | the section below |
| What every bundle plugin must follow | [README_bundle_plugins.md](../../README_bundle_plugins.md) |

## How a model is placed

- The backend reads the raw YAML of the model, not the resolved one, because `metadata.tags` is not part of what `load_model` returns.
- The words of the tags, the model path and the model name are matched against the keyword lists of [sites.yaml](../sites.yaml). A keyword ending in `*` matches every word that starts with it, and a keyword with an underscore, such as `blood_pressure`, matches as a piece of text.
- A model lights up every organ it matches. The folder names count as words, so a model under `fitness/` lands on the muscle.
- Each `imports:` entry of a scenario is read the same way, one level deep, and the component name is recorded as the reason.
- Inputs are matched the same way from the `inputs:` section of the same file, and a scenario lights the inputs of its components too.
- A model with no match is listed as not placed. Nothing is guessed from variable names.

## Filtering the model tree

Clicking an organ or an input searches the whole library for the models that point to it, with the same keyword lists, and sends `lm-filter-models` so that the model tree shows only those models. The side panel says how many were found, with a button to tick the first twelve and one to clear the filter. Clicking again, or clicking a model, clears the filter. A button at the top of the panel sends `lm-open-plugin` to open Compose with the ticked models. A search that finds nothing leaves the tree empty and says so, which shows a gap in the library or in the keyword list.

Only a model's own tags, path and name are searched. A scenario is found through what it says about itself, not through the components it imports.

## The `search` endpoint

Request: `{"inputs": {"kind": "organ" | "input", "id": "liver"}}`. Response: `{success, kind, id, paths, count}`, with paths relative to the models directory and without a suffix. Only `references/` and `scenarios/` are searched, and each file is read for its first 6000 bytes with a regular expression, so a search over the library takes about a second.

## The `locate` endpoint

Request: `{"inputs": {"paths": ["references/.../a", "scenarios/.../b"]}}`, at most 24 paths.

Response: `{success, slots, input_slots, models, truncated}`, where each model is `{path, name, tags, imports, sites, inputs}` and each site or input is `{slot, why, via}`. `why` holds the words that matched and `via` the imported components that carried the match. A path that is unsafe or unreadable gives `{path, error}` and the rest are still answered.

## Limits

- The keyword lists are a first guess made by hand and have not been checked against the whole library, so some models land on a generic organ or on none.
- Placement uses words, not the equations. A model that never says liver in its tags, path or name does not reach the liver even if its equations use liver variables.
- The organs are a fixed set of fifteen slots for a physiological body and the inputs a fixed set of nine. Social, historical and other models without a body part are listed as not placed.
- Read only. The page does not rewrite any scenario.

## Tests

`test_body_map_plugin_places_models_on_organs` and `test_body_map_search_finds_the_models_of_an_organ_or_input` in test_plugin_framework.py cover tag and folder matching, a scenario with imports, a model with no organ, unsafe and missing paths. The page was checked in a headless browser in both themes with the endpoint answered from real model files.
