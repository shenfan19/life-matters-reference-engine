/* The LM core: runs a flat LM 1.0 model and answers the core interface of the game bridge (docs/README_core_interface.md).
   It follows LM format section 3.3: one pass per step, equations by descending priority, a condition first, every write
   clamped to the variable's bounds and visible to the equations after it, each equation with its own step unit.
   Inputs follow the engine's schedule rules: a variable controlled by a preset is zero outside the windows and the
   contributions of the windows that fire are added, a total is spread over the steps of its window, a level is held.

   The core knows the concepts only through the bridge description (readouts, rates, handles, context, step_minutes).
   It has no randomness: the same init and the same steps give the same readouts. */
import { compile } from './expr.js';
import { RUNTIME_VERSION, CONTRACT_VERSION } from './version.js';

const UNIT_SEC = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
const DAY_NAMES = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const TIME_CONSTANTS = { SECOND: 1, MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000 };
const EPSILON = 1e-9;

/* Days since 1970-01-01 of a civil date, valid for any year (no Date object, which mishandles years before 100). */
function civilDays(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function parseDate(text) {
  const m = /^(-?\d+)-(\d{1,2})-(\d{1,2})$/.exec(String(text || '').trim());
  return m ? civilDays(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}
const weekdayOf = days => (((days + 3) % 7) + 7) % 7;   /* 0 is Monday, as in the engine; 1970-01-01 was a Thursday */

class CoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function clampTo(v, x) { return Math.max(Math.min(x, v.hi), v.lo); }

/* "HH:MM" to seconds of the day, or null when it cannot be read. "24:00" is the end of the day. */
function clockSeconds(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text));
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null;
}

/* One preset: a list of regimens, read once, answering "what does each controlled variable receive in this step window". */
class PresetSignal {
  constructor(regimens, stepSec, epochDay) {
    this.epochDay = epochDay;
    this.scheds = [];
    this.variables = [];
    for (const r of regimens || []) {
      if (!r || !r.variable) continue;
      const ev = this.event(r, stepSec);
      if (!ev) continue;
      this.scheds.push({ variable: r.variable, ev });
      if (!this.variables.includes(r.variable)) this.variables.push(r.variable);
    }
  }
  event(r, stepSec) {
    let ts = r.time_start, te = r.time_end;
    if (ts === undefined && te === undefined) { ts = '00:00'; te = '24:00'; }
    else if (ts === undefined) ts = '00:00';
    if (te === undefined) te = ts;
    const a = clockSeconds(ts), b = clockSeconds(te);
    if (a === null || b === null) return null;
    let win = null, at = null, nSteps = 1;
    if (ts !== te) {
      win = a >= b ? [[a, 86400], [0, b]] : [[a, b]];
      const daySec = b > a ? b - a : 86400 - a + b;
      nSteps = Math.max(1, Math.round(daySec / stepSec));
    } else at = a;
    const days = Array.isArray(r.days) && r.days.length ? new Set(r.days.map(d => DAY_NAMES[String(d).toLowerCase().slice(0, 3)]).filter(x => x !== undefined)) : null;
    const dr = Array.isArray(r.date_range) && r.date_range.length === 2 ? [parseDate(r.date_range[0]), parseDate(r.date_range[1])] : null;
    const value = Number(r.value === undefined ? 0 : r.value);
    return { days, dr, win, at, delta: r.delivery === 'level' ? value : value / nSteps };
  }
  /* The contributions of every controlled variable in the window [prev, next) of the clock, in seconds. */
  at(prev, next) {
    const out = {};
    for (const v of this.variables) out[v] = [];
    const prevDay = Math.floor(prev / 86400), prevSec = prev - prevDay * 86400, nextSec = next % 86400;
    const crossed = Math.floor(next / 86400) > prevDay;
    const day = this.epochDay + prevDay, dow = weekdayOf(day);
    const ranges = crossed ? [[prevSec, 86400], [0, nextSec]] : [[prevSec, nextSec]];
    for (const { variable, ev } of this.scheds) {
      if (ev.days && !ev.days.has(dow)) continue;
      if (ev.dr) {
        if (ev.dr[0] !== null && day < ev.dr[0]) continue;
        if (ev.dr[1] !== null && day > ev.dr[1]) continue;
      }
      let fires;
      if (ev.win) fires = ranges.some(([a0, a1]) => ev.win.some(([b0, b1]) => a0 < b1 && b0 < a1));
      else if (crossed) fires = ev.at >= prevSec || ev.at < nextSec;
      else fires = prevSec <= ev.at && ev.at < nextSec;
      if (fires) out[variable].push(ev.delta);
    }
    return out;
  }
}

export class LMCore {
  /* config.model: the flat LM model as a plain object. config.bridge: the bridge description of the same system.
     config.presets: optional { id: [regimen, ...] }, replaces the plans of the model. */
  constructor(config) {
    const model = config && config.model, bridge = config && config.bridge;
    if (!model || !bridge) throw new CoreError('config', 'LMCore requires a flat model and its bridge description');
    this.bridge = bridge;
    this.name = (model.metadata && model.metadata.name) || bridge.system || 'model';
    const sim = model.simulation || {};
    const stepMinutes = Number(bridge.step_minutes);
    if (!(stepMinutes > 0)) throw new CoreError('config', 'the bridge description requires step_minutes');
    this.stepMinutes = stepMinutes;
    this.stepSec = stepMinutes * 60;
    const unit = String(((sim.step_size || {}).unit) || 'minute').toLowerCase();
    this.timeUnitSec = UNIT_SEC[unit] || 60;
    this.startDay = parseDate(sim.start_date);
    this.vars = {};
    for (const [k, v] of Object.entries(model.variables || {})) {
      const d = v || {}, b = Array.isArray(d.bounds) ? d.bounds : [null, null];
      const value = Number(d.value === undefined ? 0 : d.value);
      if (!Number.isFinite(value)) throw new CoreError('config', `variable ${k} has no numeric value (${d.value}); a distribution cannot run here`);
      this.vars[k] = { type: d.type || 'state', value, lo: b[0] === null || b[0] === undefined ? -Infinity : Number(b[0]), hi: b[1] === null || b[1] === undefined ? Infinity : Number(b[1]) };
    }
    this.aux = Object.entries(model.auxiliary || {}).map(([k, e]) => [k, compile(e, `auxiliary.${k}`)]);
    this.eqs = Object.entries(model.equations || {}).map(([name, e], order) => {
      const u = String(e.step_unit || '').toLowerCase();
      const cond = typeof e.condition === 'string' ? compile(e.condition, `${name}.condition`) : null;
      const alwaysOff = e.condition === false || e.condition === 0;
      return { name, order, priority: Number(e.priority || 0), unitSec: UNIT_SEC[u] || null, cond, alwaysOff,
        dyn: Object.entries(e.dynamics || {}).map(([v, x]) => [v, compile(x, `${name}.${v}`)]) };
    }).sort((a, b) => b.priority - a.priority || a.order - b.order);
    const symbolNames = ['step', 'step_size', 'dt', 't', 'time'];
    this.symbols = symbolNames.filter(n => !(n in this.vars));
    /* concepts */
    this.readoutSpecs = Object.entries(bridge.readouts || {}).map(([concept, s]) =>
      [concept, s.sources.map((src, i) => (src.expr === undefined ? src : { ...src, fn: compile(src.expr, `readout ${concept}.${i}`).fn }))]);
    this.rateSpecs = Object.entries(bridge.rates || {}).map(([concept, s]) => [concept, s.combine, s.terms.map((t, i) => compile(t, `rate ${concept}.${i}`))]);
    this.handles = bridge.handles || {};
    this.modes = bridge.modes || {};
    this.context = bridge.context || {};
    for (const list of [...Object.values(this.handles), ...Object.values(this.context)]) {
      for (const v of list) if (!(v in this.vars)) throw new CoreError('config', `the bridge names the variable ${v}, which the model does not declare`);
    }
    for (const [concept, sources] of this.readoutSpecs) for (const s of sources) if (s.var !== undefined && !(s.var in this.vars)) throw new CoreError('config', `readout ${concept} reads ${s.var}, which the model does not declare`);
    /* presets */
    const plans = config.presets
      ? Object.entries(config.presets)
      : (sim.plans || []).map((p, i) => [p.id || `plan_${i}`, p.regimens || []]);
    this.presetRegimens = new Map(plans);
    this.presetIds = [...this.presetRegimens.keys()];
    this.signals = new Map();
    this.subjects = new Map();
  }

  hello() {
    const b = this.bridge;
    const tolerance = {};
    for (const [concept] of this.readoutSpecs) tolerance[concept] = EPSILON;
    return {
      v: CONTRACT_VERSION, kind: 'hello', name: 'lm-core-js', core_kind: 'lm', runtime_version: RUNTIME_VERSION,
      vocabulary_version: b.vocabulary_version === undefined ? null : b.vocabulary_version, system: b.system,
      step_minutes: this.stepMinutes,
      readouts: this.readoutSpecs.map(r => r[0]), rates: this.rateSpecs.map(r => r[0]),
      handles: Object.fromEntries(Object.keys(this.handles).map(c => [c, { mode: this.modes[c] || null }])),
      context: Object.keys(this.context), presets: this.presetIds, snapshot: true, tolerance,
    };
  }

  signalFor(presetId, epochDay) {
    const key = presetId + '@' + epochDay;
    if (!this.signals.has(key)) this.signals.set(key, new PresetSignal(this.presetRegimens.get(presetId), this.stepSec, epochDay));
    return this.signals.get(key);
  }

  init(msg) {
    this.expect(msg, 'init');
    const warnings = [];
    if (msg.vocabulary_version !== undefined && this.bridge.vocabulary_version !== undefined && msg.vocabulary_version !== this.bridge.vocabulary_version) {
      throw new CoreError('vocabulary', `init carries vocabulary_version ${msg.vocabulary_version}, this core was built for ${this.bridge.vocabulary_version}`);
    }
    this.subjects.clear();
    const ids = [];
    for (const s of msg.subjects || []) {
      if (s.id === undefined || s.id === null || this.subjects.has(String(s.id))) { warnings.push(`subject without a usable id or a repeated id: ${s.id}`); continue; }
      const id = String(s.id);
      const values = {};
      for (const [k, v] of Object.entries(this.vars)) values[k] = v.value;
      Object.assign(values, TIME_CONSTANTS);
      for (const [k, x] of Object.entries(s.overrides || {})) {
        if (!(k in this.vars)) { warnings.push(`${id}: override of unknown variable ${k} dropped`); continue; }
        values[k] = clampTo(this.vars[k], Number(x));
      }
      for (const [concept, x] of Object.entries(s.context || {})) {
        if (!(concept in this.context)) { warnings.push(`${id}: context ${concept} is not used by this system, dropped`); continue; }
        if (!Number.isFinite(Number(x))) { warnings.push(`${id}: context ${concept} is not a number, dropped`); continue; }
        for (const v of this.context[concept]) values[v] = clampTo(this.vars[v], Number(x));
      }
      /* no preset field: the plan named default, if there is one. null: no preset at all. */
      let preset = s.preset === undefined ? (this.presetIds.includes('default') ? 'default' : null) : s.preset === null ? null : String(s.preset);
      if (preset !== null && !this.presetRegimens.has(preset)) { warnings.push(`${id}: unknown preset ${preset}, none is used`); preset = null; }
      const clock = s.clock || {};
      const startDay = clock.start_date ? parseDate(clock.start_date) : null;
      if (clock.start_date && startDay === null) warnings.push(`${id}: clock.start_date is not a date, the model's start date is used`);
      this.subjects.set(id, { id, values, time: 0, stepCount: 0, pendingMinutes: 0, pendingTotals: {}, preset, seed: s.seed === undefined ? null : s.seed,
        clockOffsetSec: Number(clock.minute_of_day || 0) * 60, epochDay: startDay !== null ? startDay : (this.startDay !== null ? this.startDay : civilDays(1900, 1, 1)), warned: new Set() });
      ids.push(id);
    }
    return { v: CONTRACT_VERSION, kind: 'readouts', subjects: ids.map(id => this.report(this.subjects.get(id), [])), warnings };
  }

  expect(msg, kind) {
    if (!msg || msg.v !== CONTRACT_VERSION) throw new CoreError('version', `the ${kind} message must carry v: ${CONTRACT_VERSION}`);
    if (msg.kind !== undefined && msg.kind !== kind) throw new CoreError('kind', `expected a ${kind} message, got ${msg.kind}`);
  }

  step(msg) {
    this.expect(msg, 'step');
    const minutes = Number(msg.minutes);
    if (!(minutes >= 0) || !Number.isFinite(minutes)) throw new CoreError('step', 'minutes must be a number of zero or more');
    const out = [], dropped = [];
    for (const entry of msg.subjects || []) {
      const sub = this.subjects.get(String(entry.id));
      if (!sub) { dropped.push(`unknown subject ${entry.id}`); continue; }
      const warnings = [];
      this.advance(sub, minutes, entry.handles || [], warnings);
      out.push(this.report(sub, warnings));
    }
    const r = { v: CONTRACT_VERSION, kind: 'readouts', subjects: out };
    if (dropped.length) r.warnings = dropped;
    return r;
  }

  /* Current readouts without moving time. */
  readouts(ids) {
    const subs = ids ? ids.map(id => this.subjects.get(String(id))).filter(Boolean) : [...this.subjects.values()];
    return { v: CONTRACT_VERSION, kind: 'readouts', subjects: subs.map(s => this.report(s, [])) };
  }

  /* Resolve the writes of one call into { level: {var: x}, total: {var: x} }. */
  resolveWrites(writes, warnings) {
    const level = {}, total = {}, seen = {};
    for (const w of writes) {
      const concept = w && w.concept;
      if (!(concept in this.handles)) { warnings.push(`handle ${concept} is not used by this system, dropped`); continue; }
      const mode = this.modes[concept] || w.mode;
      if (w.mode !== mode) { warnings.push(`handle ${concept} takes mode ${mode}, not ${w.mode}, dropped`); continue; }
      const x = Number(w.value);
      if (!Number.isFinite(x)) { warnings.push(`handle ${concept} got a value that is not a number, dropped`); continue; }
      if (seen[concept] && mode === 'level') warnings.push(`handle ${concept} was written twice in one step, the last level is used`);
      seen[concept] = true;
      for (const v of this.handles[concept]) {
        if (mode === 'level') level[v] = x;
        else total[v] = (total[v] || 0) + x;
      }
    }
    return { level, total };
  }

  advance(sub, minutes, writes, warnings) {
    const { level, total } = this.resolveWrites(writes, warnings);
    sub.pendingMinutes += minutes;
    const n = Math.floor(sub.pendingMinutes / this.stepMinutes + EPSILON);
    for (const [v, x] of Object.entries(total)) sub.pendingTotals[v] = (sub.pendingTotals[v] || 0) + x;
    if (n === 0) return;
    sub.pendingMinutes = Math.max(0, sub.pendingMinutes - n * this.stepMinutes);
    const perStep = {};
    for (const [v, x] of Object.entries(sub.pendingTotals)) perStep[v] = x / n;
    sub.pendingTotals = {};
    const signal = sub.preset === null ? null : this.signalFor(sub.preset, sub.epochDay);
    for (let k = 0; k < n; k++) {
      const prev = sub.clockOffsetSec + sub.time;
      if (signal) {
        const sig = signal.at(prev, prev + this.stepSec);
        for (const v of signal.variables) {
          if (v in level || v in perStep) continue;
          if (!(v in this.vars)) continue;
          sub.values[v] = 0;
          for (const d of sig[v]) sub.values[v] = clampTo(this.vars[v], sub.values[v] + d);
        }
      }
      for (const [v, x] of Object.entries(level)) sub.values[v] = clampTo(this.vars[v], x);
      for (const [v, x] of Object.entries(perStep)) sub.values[v] = clampTo(this.vars[v], (v in level ? sub.values[v] : 0) + x);
      this.substep(sub, warnings);
    }
    /* A written input falls back to its declared value when the writing stops; a written state stays where the model left it. */
    for (const v of new Set([...Object.keys(level), ...Object.keys(perStep)])) {
      if (this.vars[v].type === 'input' && !(signal && signal.variables.includes(v))) sub.values[v] = this.vars[v].value;
    }
  }

  substep(sub, warnings) {
    const env = sub.values, stepSec = this.stepSec;
    const t = sub.time / this.timeUnitSec, declared = stepSec / this.timeUnitSec;
    for (const s of this.symbols) env[s] = s === 't' || s === 'time' ? t : declared;
    const fail = (where, e) => {
      if (!sub.warned.has(where)) { sub.warned.add(where); warnings.push(`${where}: ${e.message}`); }
    };
    for (const [k, e] of this.aux) {
      try { const x = e.fn(env); if (Number.isFinite(x)) env[k] = x; } catch (err) { fail('auxiliary ' + k, err); }
    }
    for (const eq of this.eqs) {
      if (eq.alwaysOff) continue;
      const eqStep = eq.unitSec ? stepSec / eq.unitSec : 1;
      for (const s of this.symbols) if (s !== 't' && s !== 'time') env[s] = eqStep;
      if (eq.cond) {
        let ok;
        try { ok = eq.cond.fn(env); } catch (err) { fail(eq.name + ' condition', err); continue; }
        if (!ok) continue;
      }
      for (const [v, e] of eq.dyn) {
        let x;
        try { x = e.fn(env); } catch (err) { fail(`${eq.name}.${v}`, err); continue; }
        if (!Number.isFinite(x)) continue;
        const spec = this.vars[v];
        env[v] = spec ? clampTo(spec, x) : x;
      }
    }
    sub.time += stepSec;
    sub.stepCount += 1;
  }

  report(sub, warnings) {
    const env = sub.values, readouts = {}, rates = {};
    for (const [concept, sources] of this.readoutSpecs) {
      let best = 0;
      for (const s of sources) {
        let x;
        try { x = s.fn ? s.fn(env) : env[s.var]; } catch (err) { warnings.push(`readout ${concept}: ${err.message}`); continue; }
        best = Math.max(best, Math.min(1, Math.max(0, (x - s.lo) / (s.hi - s.lo))));
      }
      readouts[concept] = best;
    }
    for (const [concept, combine, terms] of this.rateSpecs) {
      try {
        const vals = terms.map(t => t.fn(env));
        rates[concept] = combine === 'product' ? vals.reduce((a, b) => a * b, 1) : vals.reduce((a, b) => a + b, 0);
      } catch (err) { warnings.push(`rate ${concept}: ${err.message}`); }
    }
    const r = { id: sub.id, readouts, drives: this.readoutSpecs.map(x => x[0]), warnings };
    if (this.rateSpecs.length) r.rates = rates;
    return r;
  }

  /* Everything needed to continue a subject later, in a form that can be written as JSON. */
  snapshot(id) {
    const sub = this.subjects.get(String(id));
    if (!sub) throw new CoreError('subject', `unknown subject ${id}`);
    const values = {};
    for (const k of Object.keys(this.vars)) values[k] = sub.values[k];
    return { v: CONTRACT_VERSION, kind: 'snapshot', core: 'lm', runtime_version: RUNTIME_VERSION, system: this.bridge.system, subject: sub.id,
      state: { values, time: sub.time, step_count: sub.stepCount, pending_minutes: sub.pendingMinutes, pending_totals: { ...sub.pendingTotals },
        preset: sub.preset, seed: sub.seed, clock_offset_sec: sub.clockOffsetSec, epoch_day: sub.epochDay } };
  }

  restore(snap) {
    this.expect(snap, 'snapshot');
    if (snap.core !== 'lm' || snap.system !== this.bridge.system) throw new CoreError('restore', `this snapshot belongs to ${snap.core}/${snap.system}`);
    const st = snap.state, values = {};
    Object.assign(values, TIME_CONSTANTS);
    for (const k of Object.keys(this.vars)) {
      if (!(k in st.values)) throw new CoreError('restore', `the snapshot has no value for ${k}`);
      values[k] = Number(st.values[k]);
    }
    this.subjects.set(String(snap.subject), { id: String(snap.subject), values, time: st.time, stepCount: st.step_count, pendingMinutes: st.pending_minutes,
      pendingTotals: { ...st.pending_totals }, preset: st.preset, seed: st.seed, clockOffsetSec: st.clock_offset_sec, epochDay: st.epoch_day, warned: new Set() });
    return this.report(this.subjects.get(String(snap.subject)), []);
  }

  /* All variable values of a subject, for tests and tools. */
  variables(id) {
    const sub = this.subjects.get(String(id));
    const out = {};
    for (const k of Object.keys(this.vars)) out[k] = sub.values[k];
    return out;
  }
}

export { CoreError };
