/* The lookup core: answers the core interface from a table that tools/build_lookup.mjs made by running the LM core.
   The table maps a point of (readouts now, handle values of one step) to the readouts one step later. Between the grid points the core
   interpolates linearly in every dimension. It has no clock and no preset; whoever uses it writes the handles of every step.
   It is exact only where the readouts are the whole state of the system, which the builder checks and writes into the table header. */
import { RUNTIME_VERSION, CONTRACT_VERSION } from './version.js';

const EPSILON = 1e-9;

class LookupError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* Position of x in a sorted grid: the lower index and the fraction to the next point, with x clamped to the grid. */
function locate(grid, x) {
  const n = grid.length;
  if (n === 1 || x <= grid[0]) return [0, 0];
  if (x >= grid[n - 1]) return [n - 2, 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (grid[mid] <= x) lo = mid; else hi = mid; }
  return [lo, (x - grid[lo]) / (grid[lo + 1] - grid[lo])];
}

export class LookupCore {
  constructor(table) {
    if (!table || table.table_version !== 1 || table.kind !== 'lookup') throw new LookupError('config', 'not a lookup table of version 1');
    this.table = table;
    this.stepMinutes = table.step_minutes;
    this.concepts = table.readouts.map(r => r.concept);
    this.handleSpecs = table.handles;
    this.axes = [...table.readouts.map(r => r.grid), ...table.handles.map(h => h.grid)];
    this.strides = [];
    let s = 1;
    for (let i = this.axes.length - 1; i >= 0; i--) { this.strides[i] = s; s *= this.axes[i].length; }
    this.cells = s;
    for (let k = 0; k < this.concepts.length; k++) if (table.next[k].length !== this.cells) throw new LookupError('config', 'the table does not match its grid');
    this.subjects = new Map();
  }

  hello() {
    const t = this.table, tolerance = {};
    for (const r of t.readouts) tolerance[r.concept] = t.tolerance && t.tolerance[r.concept] !== undefined ? t.tolerance[r.concept] : null;
    return {
      v: CONTRACT_VERSION, kind: 'hello', name: 'lookup-core-js', core_kind: 'lookup', runtime_version: RUNTIME_VERSION,
      vocabulary_version: t.source.vocabulary_version === undefined ? null : t.source.vocabulary_version, system: t.source.system,
      step_minutes: this.stepMinutes, readouts: this.concepts, rates: [],
      handles: Object.fromEntries(this.handleSpecs.map(h => [h.concept, { mode: h.mode }])), context: [], presets: [], snapshot: true, tolerance,
      table: { source: t.source, hidden_fixed: t.hidden_fixed || {} },
    };
  }

  expect(msg, kind) {
    if (!msg || msg.v !== CONTRACT_VERSION) throw new LookupError('version', `the ${kind} message must carry v: ${CONTRACT_VERSION}`);
    if (msg.kind !== undefined && msg.kind !== kind) throw new LookupError('kind', `expected a ${kind} message, got ${msg.kind}`);
  }

  init(msg) {
    this.expect(msg, 'init');
    const warnings = [], v = this.table.source.vocabulary_version;
    if (msg.vocabulary_version !== undefined && v !== undefined && msg.vocabulary_version !== v) {
      throw new LookupError('vocabulary', `init carries vocabulary_version ${msg.vocabulary_version}, this table was built for ${v}`);
    }
    this.subjects.clear();
    for (const s of msg.subjects || []) {
      if (s.id === undefined || s.id === null || this.subjects.has(String(s.id))) { warnings.push(`subject without a usable id or a repeated id: ${s.id}`); continue; }
      const state = this.table.initial.slice();
      for (const [concept, x] of Object.entries(s.overrides || {})) {
        const k = this.concepts.indexOf(concept);
        if (k < 0 || !Number.isFinite(Number(x))) { warnings.push(`${s.id}: override of ${concept} dropped`); continue; }
        state[k] = Math.min(1, Math.max(0, Number(x)));
      }
      if (s.preset) warnings.push(`${s.id}: a lookup core has no presets, ${s.preset} is ignored`);
      this.subjects.set(String(s.id), { id: String(s.id), state, pendingMinutes: 0, pendingTotals: {}, stepCount: 0, seed: s.seed === undefined ? null : s.seed });
    }
    return { v: CONTRACT_VERSION, kind: 'readouts', subjects: [...this.subjects.values()].map(x => this.report(x, [])), warnings };
  }

  step(msg) {
    this.expect(msg, 'step');
    const minutes = Number(msg.minutes);
    if (!(minutes >= 0) || !Number.isFinite(minutes)) throw new LookupError('step', 'minutes must be a number of zero or more');
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

  readouts(ids) {
    const subs = ids ? ids.map(id => this.subjects.get(String(id))).filter(Boolean) : [...this.subjects.values()];
    return { v: CONTRACT_VERSION, kind: 'readouts', subjects: subs.map(s => this.report(s, [])) };
  }

  advance(sub, minutes, writes, warnings) {
    const level = {}, total = {};
    for (const w of writes) {
      const h = this.handleSpecs.find(x => x.concept === (w && w.concept));
      if (!h) { warnings.push(`handle ${w && w.concept} is not used by this table, dropped`); continue; }
      if (w.mode !== h.mode) { warnings.push(`handle ${h.concept} takes mode ${h.mode}, not ${w.mode}, dropped`); continue; }
      const x = Number(w.value);
      if (!Number.isFinite(x)) { warnings.push(`handle ${h.concept} got a value that is not a number, dropped`); continue; }
      if (h.mode === 'level') level[h.concept] = x; else total[h.concept] = (total[h.concept] || 0) + x;
    }
    sub.pendingMinutes += minutes;
    const n = Math.floor(sub.pendingMinutes / this.stepMinutes + EPSILON);
    for (const [c, x] of Object.entries(total)) sub.pendingTotals[c] = (sub.pendingTotals[c] || 0) + x;
    if (n === 0) return;
    sub.pendingMinutes = Math.max(0, sub.pendingMinutes - n * this.stepMinutes);
    const point = new Array(this.axes.length);
    for (let j = 0; j < this.handleSpecs.length; j++) {
      const h = this.handleSpecs[j];
      point[this.concepts.length + j] = h.mode === 'level' ? (h.concept in level ? level[h.concept] : h.default) : (sub.pendingTotals[h.concept] || 0) / n;
    }
    sub.pendingTotals = {};
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < this.concepts.length; k++) point[k] = sub.state[k];
      sub.state = this.interpolate(point);
      sub.stepCount += 1;
    }
  }

  interpolate(point) {
    const D = this.axes.length, lo = new Array(D), frac = new Array(D);
    for (let d = 0; d < D; d++) [lo[d], frac[d]] = locate(this.axes[d], point[d]);
    const out = new Array(this.concepts.length).fill(0);
    for (let corner = 0; corner < (1 << D); corner++) {
      let weight = 1, index = 0;
      for (let d = 0; d < D; d++) {
        const up = (corner >> d) & 1;
        if (this.axes[d].length === 1) { if (up) { weight = 0; break; } continue; }
        weight *= up ? frac[d] : 1 - frac[d];
        index += (lo[d] + up) * this.strides[d];
        if (weight === 0) break;
      }
      if (weight === 0) continue;
      for (let k = 0; k < out.length; k++) out[k] += weight * this.table.next[k][index];
    }
    return out.map(x => Math.min(1, Math.max(0, x)));
  }

  report(sub, warnings) {
    const readouts = {};
    this.concepts.forEach((c, k) => { readouts[c] = sub.state[k]; });
    return { id: sub.id, readouts, drives: this.concepts.slice(), warnings };
  }

  snapshot(id) {
    const sub = this.subjects.get(String(id));
    if (!sub) throw new LookupError('subject', `unknown subject ${id}`);
    return { v: CONTRACT_VERSION, kind: 'snapshot', core: 'lookup', runtime_version: RUNTIME_VERSION, system: this.table.source.system, subject: sub.id,
      state: { values: sub.state.slice(), step_count: sub.stepCount, pending_minutes: sub.pendingMinutes, pending_totals: { ...sub.pendingTotals }, seed: sub.seed } };
  }

  restore(snap) {
    this.expect(snap, 'snapshot');
    if (snap.core !== 'lookup' || snap.system !== this.table.source.system) throw new LookupError('restore', `this snapshot belongs to ${snap.core}/${snap.system}`);
    const st = snap.state;
    if (!Array.isArray(st.values) || st.values.length !== this.concepts.length) throw new LookupError('restore', 'the snapshot does not match the table');
    this.subjects.set(String(snap.subject), { id: String(snap.subject), state: st.values.slice(), pendingMinutes: st.pending_minutes, pendingTotals: { ...st.pending_totals },
      stepCount: st.step_count, seed: st.seed });
    return this.report(this.subjects.get(String(snap.subject)), []);
  }
}

export { LookupError };
