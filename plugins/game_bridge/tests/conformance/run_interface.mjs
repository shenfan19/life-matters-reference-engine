// Behaviour of the LM core that the interface promises and the fixtures do not show: determinism, snapshot and restore, what is dropped,
// the way a preset gives way to a write and comes back, and the way a total is spread.
//   node plugins/game_bridge/tests/conformance/run_interface.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LMCore } from '../../runtime/lm_core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'diabetes_meals_writes.json'), 'utf8'));
const { model, bridge } = fx;
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'pass' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };
const fresh = (preset, extra = {}) => {
  const core = new LMCore({ model, bridge });
  const r = core.init({ v: 1, kind: 'init', vocabulary_version: bridge.vocabulary_version, subjects: [{ id: 's', preset, ...extra }] });
  return { core, init: r };
};
const step = (core, minutes, handles = []) => core.step({ v: 1, kind: 'step', minutes, subjects: [{ id: 's', handles }] }).subjects[0];
const meal = value => ({ concept: 'food_intake', mode: 'total', value, source: 'player' });

/* determinism: the same init and the same steps give the same readouts, in a second instance and after a restore */
{
  const run = () => { const { core } = fresh('default'); let r; for (let i = 0; i < 200; i++) r = step(core, 15, i % 17 === 3 ? [meal(40)] : []); return r.readouts.glycemic_level; };
  check('the same init and steps give the same readouts in two instances', run() === run());
  const a = fresh('default').core, b = fresh('default').core;
  for (let i = 0; i < 60; i++) { step(a, 15, i === 5 ? [meal(40)] : []); step(b, 15, i === 5 ? [meal(40)] : []); }
  const snap = JSON.parse(JSON.stringify(a.snapshot('s')));
  for (let i = 0; i < 60; i++) step(a, 15);
  const c = new LMCore({ model, bridge });
  c.restore(snap);
  for (let i = 0; i < 60; i++) step(c, 15);
  check('a restored subject continues exactly like the one it was taken from', a.readouts().subjects[0].readouts.glycemic_level === c.readouts().subjects[0].readouts.glycemic_level);
}

/* a preset gives way to a write of the same handle for the window of that write and serves again afterwards */
{
  const keep = fresh('default').core, skip = fresh('default').core;
  const g = (c) => c.readouts().subjects[0].readouts.glycemic_level;
  const at = {};
  for (let i = 0; i < 52; i++) {
    step(keep, 15);
    step(skip, 15, i === 32 ? [meal(0)] : []);          /* the call from 08:00 to 08:15 holds the breakfast of the preset */
    if (i === 39 || i === 47 || i === 51) at[i] = [g(keep), g(skip)];
  }
  check('a write of zero over the window of a preset meal removes that meal', at[39][1] < at[39][0], JSON.stringify(at[39]));
  check('the preset serves again after the write: the next preset meal raises the glucose of the subject that skipped breakfast', at[51][1] > at[47][1], JSON.stringify([at[47][1], at[51][1]]));
}

/* a total is spread over the steps that run; calls shorter than the internal step add up, and a total written meanwhile is not lost */
{
  const a = fresh(null).core, b = fresh(null).core;
  step(a, 60, [meal(60)]);
  for (let i = 0; i < 4; i++) step(b, 15, i === 0 ? [meal(60)] : []);
  check('the same total spread over an hour and put in within the first quarter ends in different places', a.variables('s').diabetes_blood_glucose !== b.variables('s').diabetes_blood_glucose);
  const c = fresh(null).core, e = fresh(null).core;
  for (let i = 0; i < 60; i++) step(c, 0.5, i === 0 ? [meal(60)] : []);
  step(e, 1, [meal(60)]);
  step(e, 29);
  const vc = c.variables('s'), ve = e.variables('s');
  check('sixty calls of half a minute, the first carrying a total, equal a one-minute call with that total followed by 29 minutes', Object.keys(vc).every(k => vc[k] === ve[k]));
}

/* drops and refusals */
{
  const { core } = fresh(null);
  const r = step(core, 15, [{ concept: 'food_intake', mode: 'level', value: 5 }, { concept: 'loneliness', mode: 'level', value: 1 }, { concept: 'activity_load', mode: 'level', value: 'x' }]);
  check('a wrong mode, an unknown concept and a value that is not a number are each dropped with a warning', r.warnings.length === 3, JSON.stringify(r.warnings));
  const out = core.step({ v: 1, kind: 'step', minutes: 15, subjects: [{ id: 'ghost', handles: [] }] });
  check('a subject that was never initialised is reported and skipped', out.subjects.length === 0 && out.warnings.length === 1);
  let code = '';
  try { core.step({ v: 2, kind: 'step', minutes: 15, subjects: [] }); } catch (e) { code = e.code; }
  check('a message of another contract version is refused', code === 'version');
  code = '';
  try { core.init({ v: 1, kind: 'init', vocabulary_version: 99, subjects: [] }); } catch (e) { code = e.code; }
  check('an init carrying another vocabulary version is refused', code === 'vocabulary');
  code = '';
  try { core.restore({ v: 1, kind: 'snapshot', core: 'lookup', system: bridge.system, subject: 's', state: {} }); } catch (e) { code = e.code; }
  check('a snapshot of another kind of core is refused', code === 'restore');
  const bad = core.init({ v: 1, kind: 'init', subjects: [{ id: 'x', preset: 'nope', context: { loneliness: 1 }, overrides: { not_a_variable: 1 } }, { id: 'x' }, {}] });
  check('an unknown preset, an unused context, an unknown override and a repeated or missing id are each reported', bad.warnings.length === 5, JSON.stringify(bad.warnings));
}

/* hello */
{
  const h = fresh('default').core.hello();
  check('hello names the readouts, the rates, the handles with their modes and the presets',
    h.readouts.includes('glycemic_level') && h.rates.includes('frailty') && h.handles.food_intake.mode === 'total' && h.handles.activity_load.mode === 'level' && h.presets.includes('default') && h.snapshot === true && h.vocabulary_version === bridge.vocabulary_version);
}

console.log(failed ? `${failed} interface check(s) failed` : 'all interface checks passed');
process.exit(failed ? 1 : 0);
