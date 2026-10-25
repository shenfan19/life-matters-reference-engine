# 0164 — The One Life Plugin: Replayable Lives on the Virtual Human

**Date**: 2026-10-24
**Status**: ✅ implemented

---

## Background

The virtual human of the model library follows an adult body week by week, with inputs for water, crowding, mosquitoes, vitamin C, medical level, injury and epidemics, and with a yearly risk of death built from an age term, a lifestyle log ratio and a disease term. A life simulator that draws a birth from country statistics and walks through it with tables gives each person a path but no mechanism. The virtual human has the mechanism and no path. The question was how to let a person live one life on it and then ask what a different choice would have done, without adding to the engine core.

- A comparison of two lives is only fair when the luck is the same. Drawing death with a fresh random number for every run makes the difference between two runs mostly noise.
- A plugin backend is rebuilt at every call and cannot hold a running body between calls. The plugin framework of ADR 0157 gives it no session of its own.
- The page must not show what has not happened yet, and a player must be able to act at a moment that depends on the events before it.
- The risk of death of the body model is a formula. A bar that says what a death was made of should not carry its own copy of that formula.

## Decision

**1. A bundle plugin, `one_life`, with three endpoints.** `catalog` describes the cards, levers, packs and names. `live` runs a life up to the next moment that waits for the player. `compare` runs a finished life and up to five variants over the whole span. The host keeps the name `run` for plugins without a page, so the page endpoint is `live`.

**2. A life is a record and a run is a pure function of it.** The record holds a seed, a pack, a world filter, optional card and sex, the postures set so far by phase and the options chosen so far by event. The plugin keeps nothing between calls. Every call replays the body from the start through the engine with a private `ReferenceEngine` object, so no session of the simulation view is taken or left behind. The page keeps the record and shows it as a life code that anyone can paste to replay the same life.

**3. Luck is fixed by the seed and is independent of choices.** Every random thing is drawn from a generator named by the seed and its purpose, such as the card, the sex, the childhood, the events of a given year, and the fate line. Death is one number. The fate line is drawn once, and the person dies in the first week where the chance of being alive given by the body model falls to it. A choice changes the curve and never the line, and events keep their weeks, so a replay differs only through what was changed. An option of an event can carry a mishap, whose outcome is read from a number drawn with the event.

**4. The run stops at the first moment that waits for a decision.** That is the start of a phase, where the player sets a posture, or an event with options. Up to it the curve is the life. Past it the run continues as an outlook with no events that have not happened, and after a death it continues in silence only to give the odds. Nothing past the stop is returned except the outlook.

**5. Three layers, each saying where its numbers come from.** The birth and the childhood are a lookup, one hand-set chance per card plus an age at death drawn from bands, because the body model starts at eighteen. From eighteen the body model runs. Events set inputs of the body model for some weeks. Livelihood points are a game device that buys levels of five levers, each lever moves inputs from the value of the card toward a target but never past the limit of the card.

**6. The risk of death is named by reading it out of the loaded model.** The plugin takes the expressions of `annual_hazard`, `mortality_lnhr` and `disease_hazard` from the equations of the loaded model, cuts the log ratio and the disease term into additive terms, spreads a factor over the burdens it multiplies, evaluates every term on the state of the body, and names each by the first variable it reads that a table lists. The expressions are checked against a whitelist of syntax before they are compiled. The parts add up to the risk of the model to the last digit. The lifestyle part is shared in proportion to the log ratio, which the page states as a convention.

**7. The `fast` solver of ADR 0163.** It gives the same numbers as the reference solver to the last digit in the lives that were compared, in about a third of the time. The `numba` solver pays a compile cost of tens of seconds and is not used.

**8. Data in YAML files and checks at load.** Cards, levers, events, packs, names and labels are in `plugins/one_life/data/`, and a catalog that contradicts itself is refused with a list of what is wrong. The body model must have every input the files name. At most three runs go at once, and a fourth is refused with a message.

## Alternatives considered

- Keep a body running between calls in a session of the engine: the answers would be faster, but the plugin would own sessions that the host cleans up on a timer, and a replay with a changed choice would still need a second body. Replaying from the record costs a second or two and removes the state.
- Draw death with a random number at every week: the difference between a life and its replay would then include the noise of the draw, so a change of care could look harmful. One fate line per seed makes the comparison paired.
- Copy the mortality formulas into the plugin to name the causes: the names would drift from the model at the first change of a coefficient. Reading the expressions keeps them together.
- A pack of historical lives that is mostly lookup, with an event table for each episode: this is what a lookup layer can do, and it was kept for childhood only. The body responses are the reason to use the virtual human at all.
- Show the whole projected curve from the start: the dips of the curve would reveal the events to come.

## Scope of impact

- New: `plugins/one_life/` with `manifest.yaml`, `backend.py`, the package `one_life_core/`, `data/`, `dist/index.html` and `docs/README_one_life_ai.md`. `test_verification/test_plugin_one_life.py` holds the tests.
- Changed: `CHANGELOG.md` and `plugins/README_bundle_plugins.md`. The engine core, the plugin framework and the GUI are not changed.
- Needed from the model library: the scenario named in `config.yaml` and the inputs the data files use. A missing input is reported when the plugin starts.

## Result

- The plugin appears on the view rail and runs a life in the GUI in both themes and both languages.
- The tests cover the data checks, the draws, the composition of inputs, the order of decisions, the split of the risk on a stand-in body, the stop at a decision, the fate line, the replay under the same luck, the plugin manager, and the plugin on the real virtual human.
- A whole life takes about a second with the `fast` solver, and a comparison of five variants takes several seconds.

## Open items

- The childhood chances, the environment of each card, the livelihood points and the chances of mishaps are set values of an order of magnitude and are not checked against demographic or historical sources. They are listed as limits in the page and in the plugin documentation.
- The body starts from the adult male reference size for everyone, so body weight is not shown, and pregnancy and childbirth are not in the body model.
- Combat, camps and persecution have no component. A pack gives their injury, crowding, hunger and infection through events.
- A search for the best posture of a life is not provided. A sweep that puts every point into one lever is the nearest thing, and it needs a body that can be restored from a snapshot to be fast enough to go further.
