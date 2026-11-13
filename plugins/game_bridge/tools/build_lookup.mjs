// Builds the table of a lookup core by running the LM core of the runtime on a grid.
//
//   node plugins/game_bridge/tools/build_lookup.mjs <system.lm.json> <system.bridge.json> <spec.json> <table.json>
//
// spec.json:
//   readout_points   number of grid points per readout concept, from 0 to 1 (default 11), or an object { concept: [points] }
//   handles          { concept: [values] }  the grid of every handle of the system, in the unit and mode the bridge description gives
//   allow_hidden     names of state variables that are not the source of any readout; they are held at their initial value and the table
//                    says so in hidden_fixed. Without this a system whose readouts are not its whole state is refused.
//   validate         { rollouts, steps, seed }  random trajectories on which the table is compared with the LM core; the largest difference
//                    per concept, with a margin of one and a half, becomes the tolerance of the table
//
// The table maps (readouts now, one step of handles) to the readouts one step later; see runtime/lookup_core.js.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LMCore } from '../runtime/lm_core.js';
import { LookupCore } from '../runtime/lookup_core.js';
import { RUNTIME_VERSION } from '../runtime/version.js';

const sha = obj => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildLookupTable({ model, bridge, spec }) {
  const core = new LMCore({ model, bridge });
  const concepts = Object.keys(bridge.readouts || {});
  if (!concepts.length) throw new Error('the system has no readout concepts');
  for (const c of concepts) {
    const src = bridge.readouts[c].sources;
    if (src.length !== 1 || src[0].var === undefined) throw new Error(`readout ${c} must come from exactly one variable for a lookup table`);
  }
  const readoutVars = new Set(concepts.map(c => bridge.readouts[c].sources[0].var));
  const allowed = new Set(spec.allow_hidden || []);
  const hidden = Object.entries(core.vars).filter(([k, v]) => v.type !== 'input' && v.type !== 'parameter' && !readoutVars.has(k));
  const refused = hidden.filter(([k]) => !allowed.has(k)).map(([k]) => k);
  if (refused.length) throw new Error(`the readouts are not the whole state: ${refused.join(', ')} are not read by any concept (list them in allow_hidden to hold them at their initial value)`);
  const handleConcepts = Object.keys(bridge.handles || {});
  for (const h of handleConcepts) if (!spec.handles || !Array.isArray(spec.handles[h]) || !spec.handles[h].length) throw new Error(`the spec needs a grid of values for the handle ${h}`);
  const points = c => {
    const p = typeof spec.readout_points === 'object' && spec.readout_points ? spec.readout_points[c] : null;
    if (Array.isArray(p)) return p;
    const n = typeof spec.readout_points === 'number' ? spec.readout_points : 11;
    return Array.from({ length: n }, (_, i) => i / (n - 1));
  };
  const readoutAxes = concepts.map(c => ({ concept: c, grid: points(c) }));
  const handleAxes = handleConcepts.map(h => ({ concept: h, mode: bridge.modes[h], grid: spec.handles[h].slice().sort((a, b) => a - b),
    default: core.vars[bridge.handles[h][0]].value }));
  const axes = [...readoutAxes.map(a => a.grid), ...handleAxes.map(a => a.grid)];
  const cells = axes.reduce((n, g) => n * g.length, 1);
  const next = concepts.map(() => new Array(cells));
  const index = new Array(axes.length).fill(0);
  core.init({ v: 1, kind: 'init', subjects: [{ id: 'init', preset: null }] });
  const initial = concepts.map(c => core.readouts(['init']).subjects[0].readouts[c]);
  for (let cell = 0; cell < cells; cell++) {
    const overrides = {};
    concepts.forEach((c, k) => { const s = bridge.readouts[c].sources[0]; overrides[s.var] = s.lo + axes[k][index[k]] * (s.hi - s.lo); });
    core.init({ v: 1, kind: 'init', subjects: [{ id: 'b', preset: null, overrides }] });
    const handles = handleAxes.map((a, j) => ({ concept: a.concept, mode: a.mode, value: a.grid[index[concepts.length + j]] }));
    const r = core.step({ v: 1, kind: 'step', minutes: bridge.step_minutes, subjects: [{ id: 'b', handles }] }).subjects[0];
    concepts.forEach((c, k) => { next[k][cell] = r.readouts[c]; });
    for (let d = axes.length - 1; d >= 0; d--) { if (++index[d] < axes[d].length) break; index[d] = 0; }
  }
  const table = {
    table_version: 1, kind: 'lookup', step_minutes: bridge.step_minutes,
    source: { system: bridge.system, runtime_version: RUNTIME_VERSION, built_with: 'lm-core-js', vocabulary_version: bridge.vocabulary_version,
      model_name: model.metadata && model.metadata.name, model_sha256: sha(model), bridge_sha256: sha(bridge) },
    readouts: readoutAxes, handles: handleAxes, initial, next,
    hidden_fixed: Object.fromEntries(hidden.map(([k, v]) => [k, v.value])),
  };
  if (spec.validate) table.tolerance = measure(table, core, bridge, spec.validate);
  return table;
}

/* Random trajectories, the table against the LM core. Returns the tolerance per concept: one and a half times the largest difference seen. */
function measure(table, core, bridge, v) {
  const rnd = mulberry32(v.seed === undefined ? 1 : v.seed), worst = Object.fromEntries(Object.keys(bridge.readouts).map(c => [c, 0]));
  const lookup = new LookupCore(table);
  for (let run = 0; run < (v.rollouts || 20); run++) {
    const init = { v: 1, kind: 'init', subjects: [{ id: 'm', preset: null }] };
    core.init(init); lookup.init(init);
    for (let i = 0; i < (v.steps || 200); i++) {
      const handles = table.handles.map(a => ({ concept: a.concept, mode: a.mode, value: a.grid[0] + rnd() * (a.grid[a.grid.length - 1] - a.grid[0]) }));
      const msg = { v: 1, kind: 'step', minutes: table.step_minutes, subjects: [{ id: 'm', handles }] };
      const a = core.step(msg).subjects[0].readouts, b = lookup.step(msg).subjects[0].readouts;
      for (const c of Object.keys(worst)) worst[c] = Math.max(worst[c], Math.abs(a[c] - b[c]));
    }
  }
  return Object.fromEntries(Object.entries(worst).map(([c, x]) => [c, Math.max(1.5 * x, 1e-9)]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [modelPath, bridgePath, specPath, outPath] = process.argv.slice(2);
  if (!outPath) { console.log('usage: node build_lookup.mjs <system.lm.json> <system.bridge.json> <spec.json> <table.json>'); process.exit(2); }
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
  const table = buildLookupTable({ model: read(modelPath), bridge: read(bridgePath), spec: read(specPath) });
  fs.writeFileSync(outPath, JSON.stringify(table));
  console.log('wrote', outPath, table.readouts.length, 'readouts,', table.handles.length, 'handles,', table.next[0].length, 'cells');
}
