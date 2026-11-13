# Core interface

The core interface is the one contract between an adapter and a computational core. A game, or the adapter written for it, sends concepts in and reads concepts out. A core, whether it integrates an LM model, looks values up in a table or asks a learned model, answers the same messages. Swapping one core for another changes nothing on the adapter side, and the conformance tests below say how closely two cores must agree.

The contract is version 1. The messages are JSON. [core_interface.schema.json](core_interface.schema.json) is the formal description, and a test checks the messages of both shipped cores against it.

## What to open

| Question | Open |
|----------|------|
| Which messages exist and what is in them | Section 1 |
| How a write to a handle is understood, and who merges sources | Section 2 |
| What comes back and who owns a concept | Section 3 |
| How time, steps and determinism work | Section 4 |
| What the two shipped cores do and do not do | Section 5 |
| What is dropped and what is refused | Section 6 |
| How a core is shown to be faithful | Section 7 |
| Versions, files, and copying the runtime into a game | Section 8 |

## 1. Messages

| Message | Direction | Content |
|---------|-----------|---------|
| hello | core to adapter | Name and kind of the core, the readout concepts it answers, the rate concepts, the handles it accepts with their mode, the context concepts, the presets, the internal step in minutes, the tolerance per readout, whether it can snapshot |
| init | adapter to core | The subjects: id, preset, seed, context values, optional clock and overrides. The vocabulary version |
| step | adapter to core | Minutes to advance, and for every subject the list of handle writes |
| readouts | core to adapter | For every subject the readouts, the concepts the core drives, the rates, the warnings |
| snapshot, restore | both | The state of one subject, to save it, to replay it, or to resynchronise |

In the JavaScript runtime a core has the methods `hello()`, `init(msg)`, `step(msg)`, `readouts(ids)`, `snapshot(id)` and `restore(snapshot)`. `init` and `step` return a readouts message. Every message carries `v: 1`; a message of another version is refused.

### hello

```json
{ "v": 1, "kind": "hello", "name": "lm-core-js", "core_kind": "lm", "runtime_version": "0.1.0", "vocabulary_version": 2,
  "system": "diabetes_care", "step_minutes": 1,
  "readouts": ["glycemic_level"], "rates": ["frailty", "mood_valence"],
  "handles": { "carb_intake": { "mode": "total" }, "activity_load": { "mode": "level" } },
  "context": [], "presets": ["default"], "snapshot": true, "tolerance": { "glycemic_level": 1e-9 } }
```

`core_kind` is `lm`, `lookup` or `ai`. A lookup core adds a `table` entry that repeats the table header: where the table came from and which state variables it holds fixed.

### init

```json
{ "v": 1, "kind": "init", "vocabulary_version": 2, "subjects": [
  { "id": "p1", "preset": "default", "seed": 17, "context": { "pathogen_exposure": 0.2 },
    "clock": { "start_date": "2026-01-05", "minute_of_day": 420 }, "overrides": { "blood_glucose": 140 } } ] }
```

- id: required, unique. A missing or repeated id is skipped with a warning.
- preset: the id of a preset. Left out, the preset called `default` is used if the core has one. `null` means no preset, so nothing but the writes drives the inputs.
- seed: kept in the state and in snapshots. A core that draws random numbers draws them only from this seed. The LM core and the lookup core do not draw any.
- context: values of context concepts, which a scenario gives and the step does not change. A concept the system does not use is dropped with a warning.
- clock: where in the calendar the subject starts, for presets that fire at a time of day or on a weekday. `start_date` defaults to the start date of the model, `minute_of_day` to 0.
- overrides: initial values of variables of the flat model by name, clamped to their bounds. The names are those of the flat model in the bridge description, so this is for an adapter that knows its system, for example to set the severity of an illness.
- vocabulary_version: when it differs from the one the core was built for, the init is refused.
- conditions, stage and sex of a subject are not read by the cores. They decide which system is built, not how a built system runs.

### step

```json
{ "v": 1, "kind": "step", "minutes": 5, "subjects": [
  { "id": "p1", "handles": [
    { "concept": "carb_intake", "mode": "total", "value": 35, "source": "player" },
    { "concept": "activity_load", "mode": "level", "value": 0.3, "source": "dispatch" } ] } ] }
```

### readouts

```json
{ "v": 1, "kind": "readouts", "subjects": [
  { "id": "p1", "readouts": { "glycemic_level": 0.36 }, "drives": ["glycemic_level"],
    "rates": { "frailty": 0.00032, "mood_valence": 0 }, "warnings": [] } ] }
```

### snapshot

```json
{ "v": 1, "kind": "snapshot", "core": "lm", "runtime_version": "0.1.0", "system": "diabetes_care", "subject": "p1",
  "state": { "values": { "blood_glucose": 96.2 }, "time": 3600, "step_count": 60, "pending_minutes": 0, "pending_totals": {},
             "preset": "default", "seed": 17, "clock_offset_sec": 0, "epoch_day": 20454 } }
```

The content of `state` belongs to the kind of core. A snapshot restores only into the same kind of core and the same system; anything else is refused. Writing a snapshot as JSON and reading it back gives the same state.

## 2. Handles

A handle is a concept the game writes into the person, such as carbohydrate eaten or effort made. The adapter knows only the concept; the core knows which variable of the model it feeds.

- mode: the vocabulary gives every handle one mode. `level` means the value holds for the whole window of the step. `total` means an amount is put in once in the window, and the core spreads it over the steps of the window. A write with the other mode is dropped with a warning.
- source: `preset`, `dispatch`, `player` or `event`. The core does not read it. It is in the message so that a log or a replay shows where a write came from.
- merging: the adapter merges all sources before it writes. A core receives one value per handle and step. For a `level` handle the adapter takes the source of highest priority, from high to low player, dispatch, event, preset. For a `total` handle it adds the sources. The order is in the adapter's configuration. A core that is given two writes for one handle in one call adds totals and keeps the last level, and says so in a warning for levels.
- presets: a preset is the default input of a core, for example meals and medicines at fixed times of the day. While a handle is written, the write replaces the preset for that handle, in every internal step of the call. When the writing stops, the preset serves again. A handle that is written and has no preset returns to the declared value of its variable when the writing stops.
- context: a context concept is given at init and does not change with the step.

## 3. Readouts, rates and ownership

- A readout is a concept value from 0 to 1, larger meaning worse or more burden. It is a variable of the model, or an expression of its variables, mapped linearly from the range the bridge file gives. The adapter flips it where its game prefers "satisfied". The core answers only the concepts it declared in hello.
- A rate is the push of a model on a concept that has no variable of its own. It is returned raw, in the unit the bridge file of the model defines. The adapter integrates it over its own time.
- drives: the readout concepts the core is responsible for in this call. The adapter lets the core write those and computes every other variable of the game itself. When a core fails or is missing, the adapter takes the concepts back at once.
- The adapter checks every value it receives anyway: unknown concepts are dropped, numbers are clipped to 0..1, unknown subjects are dropped.

## 4. Time and determinism

- The adapter gives the step in minutes. Game time acceleration is the adapter's business; the core only sees minutes.
- A core has an internal step (`step_minutes` in hello). A call of M minutes runs floor(M / step) internal steps. The rest is carried to the next call. A `total` written in a call that runs no internal step is kept and put in at the first internal step that runs. A `level` written in such a call is lost, because the window it describes had no step in it.
- A `total` of T over n internal steps gives T / n to each step.
- Same init, same seed, same sequence of steps gives the same readouts. Neither shipped core uses randomness.
- An LM core follows LM format section 3.3 for every internal step: one pass over the equations by descending priority, a condition first, every write clamped to the bounds of its variable and seen by the equations after it, each equation with its own `step_unit` giving the value of `step`. A value that is not a finite number, or an expression that fails, leaves the variable as it was and is reported once as a warning.

## 5. Cores

### LM core

`runtime/lm_core.js`. It is made from the flat model and the bridge description of a system (`backend.py export lmcore`), which are two JSON documents. It reads presets from the `simulation.plans` of the flat model, with the schedule rules of the LM Reference Engine: a window is `[time_start, time_end)`, the default window is the whole day, a single `time_start` is a window of one step, a total is spread over the steps of its window, a level is held, `days` and `date_range` filter which days fire.

### Lookup core

`runtime/lookup_core.js`. `tools/build_lookup.mjs` runs the LM core on a grid and writes a table that maps the readouts now and one step of handles to the readouts one step later; the lookup core interpolates linearly between grid points. The header of the table names the system, the runtime and vocabulary versions and the hashes of the model and the bridge it came from. A lookup core is exact only where the readouts are the whole state of the system. The builder refuses a system that has other state variables, unless the spec lists them; they are then held at their initial value and the table says so in `hidden_fixed`. The table carries a tolerance per readout, measured against the LM core on random trajectories. A lookup core has no clock and no presets.

### AI core

Not shipped. It must accept only the concepts of the vocabulary, drop what is outside it, clip numbers, and pass the conformance tests with a tolerance it declares.

## 6. What is dropped and what is refused

| Case | Result |
|------|--------|
| Handle write with a concept the system does not use | Dropped, warning |
| Handle write with the wrong mode | Dropped, warning |
| Handle write with a value that is not a number | Dropped, warning |
| Step for a subject that was never initialised | Skipped, reported in the top-level `warnings` |
| Init with a missing or repeated subject id | That subject skipped, warning |
| Unknown preset, unused context concept, unknown override | Ignored, warning |
| Message with another contract version | Refused, error code `version` |
| Init with another vocabulary version | Refused, error code `vocabulary` |
| Snapshot of another core kind or system | Refused, error code `restore` |
| A model value that is not a number, for example a distribution | Refused when the core is made |

## 7. Conformance

For the same init and the same sequence of calls, two cores must give readouts that differ by no more than the tolerance each readout declares in hello. The tests are in `tests/conformance`:

| Test | What it shows |
|------|---------------|
| `run.mjs` with the engine fixtures | The LM core equals the LM Reference Engine on the composed diabetes and meals system, with the preset and with writes of totals and levels. The difference is zero in the recorded numbers |
| `run.mjs` with the `traveler_stay` fixture | The LM core equals the engine on 203 variables and 56 equations of seventeen human body components in the shared namespace, over 40 days of daily writes. The difference is below 4e-15 |
| `run.mjs` with the Care fixtures | The LM core equals the browser integrator of Care for You on its four disease models, for two days of a fixed routine, with the daily schedule as preset and the actions as writes |
| `run_lookup.mjs` | The lookup core stays within its declared tolerance of the LM core on a small system, and keeps the carry, snapshot and drop rules |
| `run_interface.mjs` | Determinism, restore, preset and write, carry of short calls, refusals |
| `run.mjs` negative control | A parameter changed by one percent is detected, so the comparison can fail |

The fixtures are committed. `generate_engine_fixtures.py` needs the reference engine and the models repository, `generate_care_fixtures.mjs` needs the Care repository; run them again only when those change on purpose. `python plugins/game_bridge/tests/run_all.py` runs everything that does not need those repositories, and the parity groups of `test_bridge.py` when the models repository is there.

## 8. Versions and files

- runtime version: `runtime/version.json`, in `hello` and in the stamp of a copied runtime.
- contract version: 1, in every message.
- vocabulary version: `library/concepts.yaml`, in `bridge.vocabulary_version`, in `runtime/vocabulary.json`, in `init`. It rises whenever a concept is added or removed or changes its mode or meaning.

`tools/vendor.py copy <folder>` copies `runtime/` into a game with `RUNTIME_STAMP.json`, which holds the versions and a hash for every file. `tools/vendor.py check <folder>` fails when a copied file was changed, removed or added, and says when the copy is older than the source. A game never edits the copied files.

`runtime/vocabulary.json` is the vocabulary in JSON, for adapters. `tools/build_vocabulary.py` writes it from `library/concepts.yaml`.
