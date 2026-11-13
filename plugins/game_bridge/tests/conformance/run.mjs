// Replays the fixtures of tests/conformance on the LM core and compares them with what the reference recorded.
//   node plugins/game_bridge/tests/conformance/run.mjs            every fixture
//   node plugins/game_bridge/tests/conformance/run.mjs <name>     the fixtures whose name contains <name>
// A fixture holds a flat model, its bridge description, the calls to make and the variables expected after each call.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LMCore } from '../../runtime/lm_core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'fixtures');
const only = process.argv[2] || '';
let failed = 0;

function close(got, want, tol) {
  const d = Math.abs(got - want);
  return { ok: d <= tol.absolute + tol.relative * Math.abs(want), rel: d / (Math.abs(want) + tol.absolute) };
}

function replay(fx) {
  const core = new LMCore({ model: fx.model, bridge: fx.bridge, presets: fx.presets });
  const init = core.init({ v: 1, kind: 'init', vocabulary_version: fx.bridge.vocabulary_version, subjects: fx.init.subjects });
  const id = fx.init.subjects[0].id;
  const tol = fx.tolerance;
  let worst = 0, worstWhere = '', checked = 0, bad = null;
  const note = (where, got, want) => {
    checked++;
    const c = close(got, want, tol);
    if (c.rel > worst && c.rel > 0) { worst = c.rel; worstWhere = where; }
    if (!c.ok && !bad) bad = `${where}: got ${got}, want ${want}`;
  };
  const wanted = new Map(fx.expected.map(e => [e.after_call, e]));
  fx.calls.forEach((call, i) => {
    if (call.state_adds) {
      const snap = core.snapshot(id);
      for (const [k, x] of Object.entries(call.state_adds)) snap.state.values[k] = Math.min(core.vars[k].hi, Math.max(core.vars[k].lo, snap.state.values[k] + x));
      core.restore(snap);
    }
    const r = core.step({ v: 1, kind: 'step', minutes: call.minutes, subjects: [{ id, handles: call.handles }] });
    const sub = r.subjects[0], vars = core.variables(id), exp = wanted.get(i);
    if (sub.warnings.length) bad = bad || `call ${i} warnings: ${sub.warnings.join('; ')}`;
    if (!exp) return;
    /* An input is what the last step was given, which is not state: after a write the core puts it back to its declared value. */
    for (const [k, want] of Object.entries(exp.variables)) if (typeof want === 'number' && k in vars && core.vars[k].type !== 'input') note(`call ${i} ${k}`, vars[k], want);
    for (const [k, want] of Object.entries(exp.readouts || {})) note(`call ${i} readout ${k}`, sub.readouts[k], want);
    for (const [k, want] of Object.entries(exp.rates || {})) note(`call ${i} rate ${k}`, sub.rates[k], want);
  });
  return { checked, worst, worstWhere, bad, initWarnings: init.warnings };
}

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.includes(only)).sort()) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  let r;
  try { r = replay(fx); } catch (e) { r = { bad: 'threw ' + e.message, checked: 0, worst: 0, worstWhere: '', initWarnings: [] }; }
  const ok = !r.bad && r.checked > 0 && !(r.initWarnings || []).length;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'} ${fx.name}  ${r.checked} numbers compared, worst relative difference ${r.worst.toExponential(2)}${r.worst ? ' at ' + r.worstWhere : ''}${r.bad ? '  ' + r.bad : ''}`);
}
/* Negative control: a fixture replayed on a model that differs by one percent in one parameter must be reported as different. */
if (!only) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, 'care_diabetes.json'), 'utf8'));
  const name = Object.keys(fx.model.variables).find(k => fx.model.variables[k].type === 'parameter' && fx.model.variables[k].value !== 0);
  fx.model.variables[name].value *= 1.01;
  const r = replay(fx);
  const ok = !!r.bad;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'} negative control: a parameter changed by one percent is detected`);
}
console.log(failed ? `${failed} fixture(s) failed` : 'all fixtures passed');
process.exit(failed ? 1 : 0);
