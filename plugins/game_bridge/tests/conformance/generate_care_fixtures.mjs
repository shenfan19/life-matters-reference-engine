// Makes the fixtures of the existing disease models of Care for You, for the conformance tests of the LM core.
//
// Care's own browser integrator (src/backend/lm.js) is run headless through the helper of its test folder (tests/cond_sim.js), for two days,
// with a fixed daily routine. The model files are then turned into flat LM models: the parameters of the chosen severity become parameters,
// the daily schedule becomes the preset, the windows of an action become level writes and an action that adds to a state becomes a
// state_adds entry of the call. The runner (run.mjs) replays the calls on the LM core and compares every state variable.
//
//   node plugins/game_bridge/tests/conformance/generate_care_fixtures.mjs
//
// It needs the Care repository (CARE_PATH or a sibling folder game-care-for-you). The fixtures are committed; run this again when Care's
// disease models or its integrator change on purpose, and look at what differs before accepting the new baseline.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from '../../runtime/expr.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const care = process.env.CARE_PATH || path.resolve(here, '../../../../../game-care-for-you');
const frontend = path.join(care, 'frontend');
if (!fs.existsSync(path.join(frontend, 'tests', 'cond_sim.js'))) { console.log('the Care repository was not found at', care); process.exit(1); }
const require = createRequire(import.meta.url);
const { loadLm, person } = require(path.join(frontend, 'tests', 'cond_sim.js'));
const yaml = require(path.join(frontend, 'vendor', 'js-yaml.min.js'));

const STEP_MIN = 2, DAYS = 2, SAMPLE_EVERY = 15, SEVERITY = 'moderate';
const UNIT_PER_HOUR = { second: 3600, minute: 60, hour: 1, day: 1 / 24 };
const CONDITIONS = { diabetes: 'cond_diabetes', hypertension: 'cond_hypertension', arthritis: 'cond_arthritis', depress: 'cond_depress' };
const hhmm = minute => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(Math.round(minute % 60)).padStart(2, '0')}`;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function flatten(doc, cond, p, lm) {
  const name = doc.metadata.name, care = doc.care || {};
  if (care.fixed_step_minutes) throw new Error(`${name}: fixed_step_minutes is not covered by this baseline`);
  if (care.step_scale) throw new Error(`${name}: step_scale is not covered by this baseline`);
  const m = lm.lib.modelsOfCondition(cond)[0];
  const unit = m.unit, perHour = UNIT_PER_HOUR[unit];
  const variables = {}, declared = new Set();
  const own = new Set([...Object.keys(m.vars), ...Object.keys(m.inputs), ...Object.keys(m.params), ...m.aux.map(a => a[0])]);
  for (const [k, v] of Object.entries(doc.variables || {})) {
    declared.add(k);
    if (v.type === 'input') variables[k] = { type: 'input', value: Number(v.value || 0), unit: v.unit };
    else if (v.type === 'parameter') variables[k] = { type: 'parameter', value: p.params[k] !== undefined ? p.params[k] : Number(v.value) };
    else variables[k] = { type: 'state', value: p.state[k], bounds: v.bounds, unit: v.unit };
  }
  for (const k of Object.keys(doc.parameters || {})) { declared.add(k); variables[k] = { type: 'parameter', value: p.params[k] }; }
  const equations = {}, exprNames = new Set();
  const take = (src, where) => { for (const n of compile(src, where).names) exprNames.add(n); };
  for (const [k, e] of Object.entries(doc.auxiliary || {})) take(e, k);
  for (const [k, e] of Object.entries(doc.equations || {})) {
    equations[k] = { step_unit: e.step_unit || 'hour', priority: e.priority || 0, dynamics: e.dynamics };
    if (typeof e.condition === 'string') { equations[k].condition = e.condition; take(e.condition, k + '.condition'); }
    for (const [v, x] of Object.entries(e.dynamics)) take(x, `${k}.${v}`);
  }
  /* names the game provides to a model: sleep as a write, the rest as fixed numbers taken from the character the baseline ran */
  const auxNames = new Set(Object.keys(doc.auxiliary || {}));
  const handles = {};
  for (const n of exprNames) {
    if (declared.has(n) || auxNames.has(n) || n === 'step' || n === 't' || n === 'time') continue;
    if (n === 'asleep') { variables.asleep = { type: 'input', value: 0 }; handles.care_asleep = ['asleep']; }
    else if (n === 'hour') { variables.hour = { type: 'input', value: 0 }; handles.care_hour = ['hour']; }
    else if (n.startsWith('speed_')) variables[n] = { type: 'parameter', value: 1 };
    else if (n === 'mood_now') variables[n] = { type: 'parameter', value: 0.7 };
    else if (n.startsWith('n_') && !(n.slice(2) in (doc.drives || {}))) variables[n] = { type: 'parameter', value: 1 - 0.8 };
    else throw new Error(`${name}: the expression reads ${n}, which this baseline does not provide`);
  }
  /* preset: the daily schedule, as the level the integrator turns each entry into */
  const regimens = [];
  for (const s of care.schedule || []) {
    if (variables[s.var].value !== 0) throw new Error(`${name}: ${s.var} is scheduled but its default is not 0`);
    const hrs = Math.max(1 / 60, Number(s.minutes || 1) / 60);
    const level = s.delivery === 'level' ? Number(s.value) : Number(s.value) / (hrs * perHour);
    const r = { variable: s.var, time_start: hhmm(s.hour * 60), time_end: hhmm(s.hour * 60 + hrs * 60), value: level, delivery: 'level' };
    if (Array.isArray(s.days)) r.days = s.days.map(d => WEEKDAYS[d]);
    regimens.push(r);
  }
  return { variables, equations, handles, regimens, perHour, pulses: care.pulses || {} };
}

function build(cond) {
  const lm = loadLm();
  const file = CONDITIONS[cond];
  const doc = yaml.load(fs.readFileSync(path.join(frontend, 'src/data/lm', file + '.yaml'), 'utf8'));
  const snap = person([cond], { cond_set: { [cond]: { severity: SEVERITY } } });
  const eng = lm.engineCond;
  /* a call of zero minutes only introduces the character: the severity and the first sync of the drives are applied */
  eng.drive({ minutes: 0, world: { hour: 0, date: { weekday: 0 } }, people: [snap] });
  const p = eng.people[snap.id];
  const flat = flatten(doc, cond, p, lm);
  const keys = Object.keys(flat.variables).filter(k => flat.variables[k].type === 'state');
  /* one pulse of the routine every 150 minutes from 08:00, taking the pulses in turn, so that every kind is used on both days */
  const pulseKeys = Object.keys(flat.pulses);
  const calls = [], expected = [], active = [];
  const total = DAYS * 1440 / STEP_MIN;
  for (let i = 0; i < total; i++) {
    const t = i * STEP_MIN, dayMin = t % 1440, hour = dayMin / 60;
    snap.sleeping = hour < 6.5 || hour >= 22.5;
    const fired = [];
    if (dayMin >= 480 && (dayMin - 480) % 150 === 0 && dayMin < 1260) fired.push(pulseKeys[(Math.floor(t / 1440) + (dayMin - 480) / 150) % pulseKeys.length]);
    snap.pulses = fired;
    const call = { minutes: STEP_MIN, handles: [] };
    for (const key of fired) for (const x of flat.pulses[key]) {
      if (x.add !== undefined) call.state_adds = Object.assign(call.state_adds || {}, { [x.var]: (call.state_adds && call.state_adds[x.var] || 0) + x.add });
      else active.push({ var: x.var, level: x.delivery === 'level' ? x.total : x.total / (Math.max(1, x.minutes) / 60 * flat.perHour), until: t + Math.max(1, x.minutes) });
    }
    const levels = {};
    for (const a of active) if (a.until > t) levels[a.var] = (levels[a.var] || 0) + a.level;
    for (const [v, x] of Object.entries(levels)) { const h = `care_in_${v}`; flat.handles[h] = [v]; call.handles.push({ concept: h, mode: 'level', value: x }); }
    call.handles.push({ concept: 'care_asleep', mode: 'level', value: snap.sleeping ? 1 : 0 });
    if ('care_hour' in flat.handles) call.handles.push({ concept: 'care_hour', mode: 'level', value: hour });
    calls.push(call);
    const req = { minutes: STEP_MIN, world: { hour: (t + STEP_MIN) % 1440 / 60, date: { weekday: Math.floor(t / 1440) % 7 } }, people: [snap] };
    const r = eng.drive(req);
    for (const d of r.directives) if (d.op === 'need') snap.needs[d.need] = Math.min(1, Math.max(0, snap.needs[d.need] + d.delta));
    if ((i + 1) % SAMPLE_EVERY === 0 || i === total - 1) expected.push({ after_call: i, variables: Object.fromEntries(keys.map(k => [k, p.state[k]])) });
  }
  const handleModes = Object.fromEntries(Object.keys(flat.handles).map(h => [h, 'level']));
  const model = {
    metadata: { name: `care_${cond}`, lm_format_version: '1.0' }, variables: flat.variables, equations: flat.equations,
    auxiliary: doc.auxiliary, simulation: { step_size: { value: STEP_MIN, unit: 'minute' }, start_date: '2026-01-05', end_date: '2026-03-05', plans: [{ id: 'default', regimens: flat.regimens }] },
  };
  if (!model.auxiliary) delete model.auxiliary;
  const bridge = { bridge_version: 1, system: `care_${cond}`, step_minutes: STEP_MIN, handles: flat.handles, modes: handleModes };
  return { fixture_version: 1, kind: 'care', name: `care_${cond}`,
    description: `The Care for You model ${CONDITIONS[cond]}, severity ${SEVERITY}, ${DAYS} days in steps of ${STEP_MIN} minutes with a fixed routine. Expected values are the states of Care's own integrator.`,
    source: { reference: 'Care for You frontend/src/backend/lm.js through tests/cond_sim.js', model_file: `src/data/lm/${CONDITIONS[cond]}.yaml` },
    model, bridge, tolerance: { relative: 1e-9, absolute: 1e-12 }, init: { subjects: [{ id: 'p1', preset: 'default', clock: { start_date: '2026-01-05', minute_of_day: 0 } }] }, calls, expected };
}

const out = path.join(here, 'fixtures');
fs.mkdirSync(out, { recursive: true });
for (const cond of Object.keys(CONDITIONS)) {
  const fx = build(cond);
  fs.writeFileSync(path.join(out, fx.name + '.json'), JSON.stringify(fx, null, 1));
  console.log('wrote', fx.name, fx.calls.length, 'calls,', fx.expected.length, 'samples');
}
