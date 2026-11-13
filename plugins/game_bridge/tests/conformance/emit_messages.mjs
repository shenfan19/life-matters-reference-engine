// Prints, as one JSON array, a message of every kind from both shipped cores, for the schema test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LMCore } from '../../runtime/lm_core.js';
import { LookupCore } from '../../runtime/lookup_core.js';
import { buildLookupTable } from '../../tools/build_lookup.mjs';
import { model as toyModel, bridge as toyBridge, spec as toySpec } from './toy_system.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'diabetes_meals_writes.json'), 'utf8'));
const out = [];
function exercise(core, init, handles) {
  out.push(core.hello());
  out.push(init);
  out.push(core.init(init));
  const step = { v: 1, kind: 'step', minutes: 15, subjects: [{ id: 'a', handles }] };
  out.push(step);
  out.push(core.step(step));
  out.push(core.readouts());
  const snap = core.snapshot('a');
  out.push(snap);
  out.push(JSON.parse(JSON.stringify(snap)));
}
exercise(new LMCore({ model: fx.model, bridge: fx.bridge }),
  { v: 1, kind: 'init', vocabulary_version: fx.bridge.vocabulary_version, subjects: [{ id: 'a', preset: 'default', seed: 5, clock: { start_date: '2026-01-05', minute_of_day: 420 }, overrides: { diabetes_blood_glucose: 140 } }] },
  [{ concept: 'food_intake', mode: 'total', value: 40, source: 'player' }, { concept: 'activity_load', mode: 'level', value: 0.3, source: 'dispatch' }]);
const table = buildLookupTable({ model: toyModel, bridge: toyBridge, spec: { ...toySpec, validate: { rollouts: 3, steps: 20, seed: 1 } } });
exercise(new LookupCore(table), { v: 1, kind: 'init', vocabulary_version: 2, subjects: [{ id: 'a', overrides: { fatigue: 0.4 } }] },
  [{ concept: 'fluid_intake', mode: 'total', value: 0.5, source: 'event' }]);
process.stdout.write(JSON.stringify(out));
