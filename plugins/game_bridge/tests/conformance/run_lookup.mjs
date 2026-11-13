// The lookup core against the LM core, on a small system whose readouts are its whole state.
//   node plugins/game_bridge/tests/conformance/run_lookup.mjs
import { LMCore } from '../../runtime/lm_core.js';
import { LookupCore } from '../../runtime/lookup_core.js';
import { buildLookupTable } from '../../tools/build_lookup.mjs';

import { model, bridge, spec } from './toy_system.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'pass' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };

const table = buildLookupTable({ model, bridge, spec });
check('the table header names the system and the versions it came from', table.source.system === bridge.system && table.source.runtime_version && table.source.vocabulary_version === 2 && /^[0-9a-f]{64}$/.test(table.source.model_sha256),
  JSON.stringify(table.source).slice(0, 160));
check('the table carries a measured tolerance for every readout', Object.keys(bridge.readouts).every(c => table.tolerance[c] > 0), JSON.stringify(table.tolerance));

const lm = new LMCore({ model, bridge }), lookup = new LookupCore(table);
const init = { v: 1, kind: 'init', vocabulary_version: 2, subjects: [{ id: 'a', preset: null }] };
lm.init(init); lookup.init(init);
const rnd = (() => { let a = 99; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
let worst = { hydration_deficit: 0, fatigue: 0 };
for (let i = 0; i < 3 * 96; i++) {
  const handles = [];
  if (i % 24 === 8 || i % 24 === 20) handles.push({ concept: 'fluid_intake', mode: 'total', value: 0.4 + rnd() * 1.4 });
  if (i % 24 >= 12 && i % 24 < 16) handles.push({ concept: 'activity_load', mode: 'level', value: 0.3 + rnd() * 0.6 });
  const msg = { v: 1, kind: 'step', minutes: 15, subjects: [{ id: 'a', handles }] };
  const a = lm.step(msg).subjects[0].readouts, b = lookup.step(msg).subjects[0].readouts;
  for (const c of Object.keys(worst)) worst[c] = Math.max(worst[c], Math.abs(a[c] - b[c]));
}
check('the lookup core follows the LM core within the tolerance the table declares, over three days', Object.keys(worst).every(c => worst[c] <= table.tolerance[c]),
  `difference ${JSON.stringify(worst)}, declared ${JSON.stringify(table.tolerance)}`);
check('the difference is small on the 0 to 1 scale of the readouts', Object.values(worst).every(x => x <= 0.03), JSON.stringify(worst));

/* calls shorter than the table step wait for the others; a total written meanwhile is put in at the first step that runs */
{
  const A = new LookupCore(table), B = new LookupCore(table);
  A.init(init); B.init(init);
  const h = [{ concept: 'fluid_intake', mode: 'total', value: 0.6 }];
  A.step({ v: 1, kind: 'step', minutes: 15, subjects: [{ id: 'a', handles: h }] });
  for (let i = 0; i < 3; i++) B.step({ v: 1, kind: 'step', minutes: 5, subjects: [{ id: 'a', handles: i === 0 ? h : [] }] });
  const ra = A.readouts().subjects[0].readouts, rb = B.readouts().subjects[0].readouts;
  check('three calls of 5 minutes with one total equal one call of 15 minutes with that total', Math.abs(ra.hydration_deficit - rb.hydration_deficit) < 1e-12, `${ra.hydration_deficit} ${rb.hydration_deficit}`);
}

/* snapshot and restore */
{
  const snap = lookup.snapshot('a'), before = lookup.readouts(['a']).subjects[0].readouts;
  lookup.step({ v: 1, kind: 'step', minutes: 60, subjects: [{ id: 'a', handles: [{ concept: 'activity_load', mode: 'level', value: 1 }] }] });
  lookup.restore(JSON.parse(JSON.stringify(snap)));
  const after = lookup.readouts(['a']).subjects[0].readouts;
  check('restore puts a subject back where the snapshot was taken', before.fatigue === after.fatigue && before.hydration_deficit === after.hydration_deficit);
}

/* what is dropped */
{
  const r = lookup.step({ v: 1, kind: 'step', minutes: 15, subjects: [{ id: 'a', handles: [{ concept: 'fluid_intake', mode: 'level', value: 1 }, { concept: 'loneliness', mode: 'level', value: 1 }] }, { id: 'nobody', handles: [] }] });
  check('a write with the wrong mode and a write for a concept the table does not have are dropped with a warning', r.subjects[0].warnings.length === 2, JSON.stringify(r.subjects[0].warnings));
  check('a subject that does not exist is reported and skipped', r.subjects.length === 1 && r.warnings.length === 1);
  let threw = false;
  try { lookup.init({ v: 1, kind: 'init', vocabulary_version: 99, subjects: [] }); } catch (e) { threw = e.code === 'vocabulary'; }
  check('an init carrying another vocabulary version is refused', threw);
}

/* a system whose readouts are not its whole state is refused */
{
  const hiddenModel = JSON.parse(JSON.stringify(model));
  hiddenModel.variables.reserve = { type: 'state', value: 1, bounds: [0, 2] };
  let msg = '';
  try { buildLookupTable({ model: hiddenModel, bridge, spec }); } catch (e) { msg = e.message; }
  check('a hidden state is refused unless the spec allows it', /not the whole state: reserve/.test(msg), msg.slice(0, 120));
  const t = buildLookupTable({ model: hiddenModel, bridge, spec: { ...spec, allow_hidden: ['reserve'], validate: undefined } });
  check('an allowed hidden state is held fixed and the table says so', t.hidden_fixed.reserve === 1);
}

console.log(failed ? `${failed} lookup check(s) failed` : 'all lookup checks passed');
process.exit(failed ? 1 : 0);
