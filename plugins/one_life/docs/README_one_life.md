# One Life plugin

One Life draws a birth, lives it on the virtual human from the age of eighteen until death, and then replays the same life with one thing decided differently. The birth and the childhood are a lookup. Everything after is the body model of this engine, stepped week by week, so a choice shows up as a changed risk of death that can be split into named parts. Because the luck of a life is fixed by its seed, a replay differs from the original only through what was changed.

## What to open

| Question | Open |
|----------|------|
| What a birth is made of and how to add one | [cards.yaml](../data/cards.yaml) |
| What the player can set and how far it reaches | [levers.yaml](../data/levers.yaml) |
| Which events a place can meet and what they do | [events.yaml](../data/events.yaml) |
| How a run is shaped, with fixed events | [packs.yaml](../data/packs.yaml) |
| Which body model runs and which solver | [config.yaml](../data/config.yaml) |
| How the risk of death is named | [risk_groups.yaml](../data/risk_groups.yaml) |
| What every bundle plugin must follow | [README_bundle_plugins.md](../../README_bundle_plugins.md) |

## How a life is made

A life has three layers, and each one says where its numbers come from.

- Lookup: a birth card gives the chance of living through childhood. The body model starts at eighteen, so childhood is one hand-set chance per card and an age at death drawn from bands in config.yaml. It is not a simulation.
- Body: from eighteen on, the life is the virtual human scenario named in config.yaml. The plugin sets its inputs for each stretch of weeks from the birth card, the posture the player chose for the phase and the events that are running, and reads back the risk of death and the state of the body.
- Events: every year the deck of events.yaml is drawn for the tags of the card. An event sets inputs of the body model for some weeks, such as an epidemic, a failed harvest, a call-up or an injury. Some events ask the player to choose between options.

Some events ask the player to choose, and an option can carry a mishap, a chance that it goes wrong. Whether it does is read from a number drawn with the event, so a replay that picks the same option meets the same outcome, and the page shows the chance before the choice and the outcome only after it.

The player does not choose the birth. The seed does, so the same seed gives the same card, sex, childhood, events and fate line. A pack fixes the birth instead and scripts events at set times. Three packs ship.

- A whole life: a drawn birth, lived from eighteen to the end.
- Gold rush: a young man on the road to the diggings for eight years, with a choice of route, camp water, a snowbound winter and a collapsing shaft.
- Siege: a resident of a walled city for three years, with the choice between staying on a ration and slipping through the lines at the risk of being caught between them.

## Posture and livelihood points

At the start of every phase the player sets a posture. Work has three levels and costs nothing. It sets how many livelihood points the phase brings and changes activity, injury, stress and sleep by the work profile of the card. Food, care, home and water, rest and exercise have four levels each and every level costs one point. Level 0 leaves the card as it is. Level 3 moves each input of the lever toward a target but never past the limit of the card, and never in the worse direction. A lever with no room to move for a card is shown as having no effect. Points left over are counted as savings.

Livelihood points are a game device. They stand for what a household can put into each part of life, and the card decides how far they can reach. The effect of a point is whatever the body model gives for the inputs it moves, so the same point does more where the body is exposed to more.

## Luck is one number

Death is decided by a fate line. It is drawn once from the seed, a number between 0 and 1, and the person dies in the first week where the chance of being alive, given by the body model, falls to that line or below. A different decision changes the curve and never the line. The events keep their weeks as well, because each event is drawn from a generator named by the seed, the year and the event, and never from anything the player chose.

For that reason the difference between a life and its replay is the effect of what was changed under one draw of luck. The page also shows the curve of the chance of being alive carried on past the death, from which it reads the age that half of such lives reach, and how many in a hundred such lives end sooner than this one.

## What the player can and cannot see

The run stops at the first moment that waits for a decision, which is the start of a phase or an event with options. Up to that moment the curve is the life. Past it the curve is an outlook that assumes the current posture and no further events, so the page never shows what has not happened yet. After a death the run continues in silence only to give the odds.

## Naming the risk of death

The body model writes the yearly risk of death as an age term times the exponential of a lifestyle log ratio, plus a disease term made of burdens. The plugin does not copy these formulas. It reads the three expressions out of the loaded model, cuts the log ratio and the disease term into their additive terms, evaluates every term on the state of the body, and names each term by the first variable it reads that risk_groups.yaml lists. A changed coefficient in the model moves the numbers without breaking the names, and the parts add up to the risk of the model to the last digit.

The disease parts are exact terms of the model. The lifestyle part is shared among its terms in proportion to their share of the log ratio, which is a convention for presenting the risk and not a causal decomposition. The page says so beside the bars.

## Endpoints

All three take `POST /api/plugins/one_life/{endpoint}` with `{"inputs": {...}}` and answer `{success, ...}`. An error comes back as `{success: false, error}` with a message the page can show.

- `catalog`: the packs, cards, levers, labels, names of risk parts and the limitations in both languages, and whether the body model could be loaded.
- `live`: takes `life` and an optional `outlook` flag. The host keeps the name `run` for plugins without a page, so this endpoint has another name. It returns the status, which is one of `pending`, `ended`, `completed` and `child_death`, the birth, the phases with their postures, the revealed events, a yearly timeline, the odds, the named sources of risk and, when the life waits, the pending decision with the values each lever would give.
- `compare`: takes a finished `life` and up to five variants, and returns each variant with its age at death, median age, curve and sources beside the life as lived. A variant can patch the posture of one phase or of all phases, flip the option of an event, or change the card or the sex. A variant that changes what the budget allows sets `ignore_budget`.

The plugin keeps nothing between calls. A life is a record the page sends each time.

- `seed`: an integer from 0 to 2147483647.
- `pack`: a pack id, `full_life` by default.
- `world`: `all`, `history` or `modern`, which filters the random draw of the card.
- `card` and `sex`: optional, to fix what the seed would draw.
- `postures`: a map from phase index to the levels of the levers.
- `decisions`: a map from an event key to the option chosen.

A life code in the page is this record encoded in base64, so any life can be shared and replayed exactly.

## Adding to the catalog

Everything a life is made of is in the data files and is checked when it is loaded, so a typo in a card shows up as an error from `catalog` and not as a wrong life. The body model must have every input that a file names, and the plugin refuses to run otherwise.

- A birth card needs a world, a weight, the chance of living through childhood, a work profile, income for light, steady and heavy work, a title and story in both languages, the baseline inputs it sets and the limits of each lever. Mark it `pack_only` to keep it out of the random draw.
- An event needs tags, a yearly chance, an age range, a range of weeks and its effects. With a `decision` it asks the player to choose, and the option effects replace the event effects.
- A pack sets whether the birth is drawn or fixed, the length of the run, where the phases start and the scripted events with the year and week of each.
- An option of an event may set `weeks` for its own duration and a `mishap` with a chance, a title, a text and the effects that are added when it happens.

## Limits

- Childhood is a lookup. The chance for each card is a hand-set value of the right order of magnitude, and the age at death comes from three bands.
- The environment of each card, the livelihood points and the events are set values. They show how the body model responds. They do not reconstruct a place or a year.
- The body model follows the expected burden of disease. Outbreaks, famines and wars enter only as the events listed in the data files, and the risk of death is an average rate.
- The body starts from the adult male reference size for everyone, so body weight is not shown. Sex changes the references of the model and not the starting body.
- Pregnancy and childbirth are not in the body model, so the large risk of childbirth in earlier centuries is missing for women.
- Combat, camps and persecution are not modelled as such. What the body model can take from them is injury, crowding, hunger and infection. A pack that uses them gives these inputs through its events, and the chance of an option going wrong is a set value.
- After an event that lasts a few weeks, such as a flight from a city, the life goes back to the inputs of the birth card, so a change of place is shown only for the weeks it takes.
- The review coverage of the cards and events is limited. Comments and corrections are welcome.

## Running and cost

Living a life steps the body model for up to four thousand weeks. With the `fast` solver, which gives the same numbers as the reference solver, a whole life takes a second or two, and a comparison of five variants takes several seconds. At most three runs go at once, and a fourth call is refused until one has finished.

## Tests

`test_plugin_one_life.py` covers the data checks, the seeded draws, the inputs from card, posture and events, the order of decisions, the split of the risk of death on a stand-in body with known coefficients, the stop at a decision, the fate line, the replay with the same luck, the cap on runs, the plugin manager, and the plugin on the real virtual human when the model library is present. The page was checked in a headless browser in both themes and both languages.
