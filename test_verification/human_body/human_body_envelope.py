"""Input envelope sweep for the virtual human (references/medical/physiology/human_body).

Every plausible input of the full 15 system set is swept one at a time over its plausible range
while all other inputs stay at reference values, held constant for eight years at a seven day
step. Two questions are answered for each input and each horizon (2 and 8 years):

    validity range   the widest interval around the reference value in which no state variable is
                     non-finite or held at a bound it declares, so the model is still operating
                     inside its own design envelope
    clinical range   the widest interval around the reference value in which every tracked marker
                     stays on the unremarkable side of a conventional clinical cut point

Usage (from repo root, LM_MODELS_PATH pointing at the model library):
    python test_verification/human_body/human_body_envelope.py run --out <envelope.json> --workers 8
    python test_verification/human_body/human_body_envelope.py pairs --out <envelope_pairs.json> --workers 8

`pairs` sweeps two inputs together on a grid of PAIR_LEVELS by PAIR_LEVELS for the pairs in PAIRS, the
others staying at reference, and records which markers cross their cut point at each cell.
"""

import argparse
import json
import math
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import human_body_stability_ladder as L  # noqa: E402

DAYS = L.DAYS_LONG          # 2912 days, 416 weekly steps
STEP_DAYS = 7
HORIZONS = {'y2': 104, 'y8': 416}
LEVELS = 21

# Conventional cut points, (lower, upper) with None for an open side. A marker outside its
# interval is flagged. They are common screening thresholds, not diagnoses.
MARKERS = {
    'bmi': (18.5, 30.0),
    'fasting_glucose': (None, 126.0),
    'hba1c': (None, 6.5),
    'systolic_bp': (None, 140.0),
    'ldl_c': (None, 160.0),
    'triglycerides': (None, 200.0),
    'liver_fat': (None, 5.5),
    'hemoglobin': (13.0, None),
    'ferritin': (30.0, None),
    'gfr_effective': (60.0, None),
    'fev1_pct': (80.0, None),
    'crp': (None, 3.0),
    'depressive_symptoms': (None, 10.0),
    'uric_acid': (None, 7.0),
    'alt': (None, 40.0),
}

# States whose lower bound is the quiescent state of a driver, for example a drive that falls to zero when
# nothing provokes it. Resting on that bound is not saturation and does not count against the input.
QUIESCENT_FLOORS = {'hedonic_eating_drive', 'homeostatic_hunger', 'ketone_bodies', 'illness_anorexia', 'infection_load'}

# pairs of inputs whose joint effect is worth checking, and the grid resolution per axis
PAIRS = [('energy_intake', 'aerobic_min'), ('sleep_hours', 'stress_load'), ('alcohol_g', 'energy_intake'),
         ('diet_quality', 'aerobic_min'), ('sodium_g', 'stress_load'), ('smoking_cigs', 'aerobic_min')]
PAIR_LEVELS = 7

WORK_REL = ('scenarios', 'medical', 'temp_vh_envelope')


def level_values(v, ref):
    lo, hi = L.PLAUSIBLE[v]
    vals = sorted({round(lo + (hi - lo) * i / (LEVELS - 1), 6) for i in range(LEVELS)} | {round(ref, 6)})
    return vals


def build_scenario(work):
    docs, owner, info = L.load_registry()
    S = tuple(L.ORDER)
    ins = L.active_inputs(info, owner, S)
    plans = [{'id': 'ref', 'kind': 'ref', 'segs': {}}]
    grid = {}
    for v in ins:
        ref = L.input_ref(info, owner, v)
        grid[v] = level_values(v, ref)
        for i, val in enumerate(grid[v]):
            plans.append({'id': f'{v}@{i}', 'kind': 'const', 'segs': {v: [(0, DAYS - 1, val)]}})
    d = L.scenario_dict(docs, info, owner, S, plans, STEP_DAYS, DAYS, 'virtual_human_envelope')
    work.mkdir(parents=True, exist_ok=True)
    path = work / 'full_envelope_2026.yaml'
    L.dump_yaml(d, path)
    return path, ins, grid, {v: L.input_ref(info, owner, v) for v in ins}, L.state_vars(docs, S)


def _pinned(x, lo, hi):
    w = 13
    rngv = (hi - lo) if math.isfinite(lo) and math.isfinite(hi) else max(abs(float(np.median(x))), 1.0)
    tol = 1e-9 * max(rngv, 1.0)
    tail = x[-w:]
    return bool(np.all(np.isclose(tail, lo, atol=tol)) or np.all(np.isclose(tail, hi, atol=tol)))


def _pinned_vars(r, seg, names, idx):
    pins = []
    for name in names:
        lo, hi = r.bounds(name)
        if (math.isfinite(lo) or math.isfinite(hi)) and _pinned(seg[:, idx[name]], lo, hi):
            pins.append(name)
    return pins


def sweep_input(task):
    path, v, values, outs = task
    r = L.Runner(path)
    names = list(outs)
    idx = {n: i for i, n in enumerate(names)}
    # variables that sit on their own bound in the reference run (an infection load of 0, say) are
    # part of the reference state and do not count as saturation
    ref_arr = r.run('ref', DAYS // STEP_DAYS, names)
    ref_pins = {hz: set(_pinned_vars(r, ref_arr[:n], names, idx)) for hz, n in HORIZONS.items()}
    rows = []
    for i, val in enumerate(values):
        arr = r.run(f'{v}@{i}', DAYS // STEP_DAYS, names)
        rec = {'value': val}
        for hz, n in HORIZONS.items():
            seg = arr[:n]
            fin = bool(np.all(np.isfinite(seg)))
            pins = [p for p in _pinned_vars(r, seg, names, idx) if p not in ref_pins[hz] and p not in QUIESCENT_FLOORS] if fin else []
            rec[hz] = {
                'finite': fin,
                'pins': pins,
                'markers': {m: float(seg[-1, idx[m]]) for m in MARKERS if m in idx},
            }
        rows.append(rec)
    return v, rows


def marker_flags(markers):
    bad = []
    for m, val in markers.items():
        lo, hi = MARKERS[m]
        if (lo is not None and val < lo) or (hi is not None and val > hi):
            bad.append(m)
    return bad


def contiguous(levels, ref_idx, ok):
    """Indices [a, b] of the widest run of ok levels containing ref_idx, or None."""
    if not ok(levels[ref_idx]):
        return None
    a = b = ref_idx
    while a - 1 >= 0 and ok(levels[a - 1]):
        a -= 1
    while b + 1 < len(levels) and ok(levels[b + 1]):
        b += 1
    return a, b


def _range_record(rows, rng, hz, limit_of):
    """Interval of a contiguous run plus what stopped it on each side."""
    if rng is None:
        return None
    a, b = rng
    below = rows[a - 1] if a > 0 else None
    above = rows[b + 1] if b + 1 < len(rows) else None
    return {
        'lo': rows[a]['value'], 'hi': rows[b]['value'],
        'lo_limit': None if below is None else limit_of(below[hz]),
        'hi_limit': None if above is None else limit_of(above[hz]),
    }


def _valid_limit(hz_rec):
    return hz_rec['pins'][:3] or ['nonfinite']


def _clinical_limit(hz_rec):
    return marker_flags(hz_rec['markers'])[:3] or ['nonfinite']


def summarize(sweep, refs):
    out = {}
    for v, rows in sweep.items():
        ref_idx = min(range(len(rows)), key=lambda i: abs(rows[i]['value'] - refs[v]))
        rec = {'ref': refs[v], 'lo': rows[0]['value'], 'hi': rows[-1]['value']}
        for hz in HORIZONS:
            valid = contiguous(rows, ref_idx, lambda r: r[hz]['finite'] and not r[hz]['pins'])
            clin = contiguous(rows, ref_idx, lambda r: r[hz]['finite'] and not marker_flags(r[hz]['markers']))
            rec[hz] = {
                'valid': _range_record(rows, valid, hz, _valid_limit),
                'clinical': _range_record(rows, clin, hz, _clinical_limit),
            }
        out[v] = rec
    return out


def pair_grid(v):
    lo, hi = L.PLAUSIBLE[v]
    return [round(lo + (hi - lo) * i / (PAIR_LEVELS - 1), 6) for i in range(PAIR_LEVELS)]


def build_pair_scenario(work):
    docs, owner, info = L.load_registry()
    S = tuple(L.ORDER)
    plans = [{'id': 'ref', 'kind': 'ref', 'segs': {}}]
    for k, (a, b) in enumerate(PAIRS):
        for i, va in enumerate(pair_grid(a)):
            for j, vb in enumerate(pair_grid(b)):
                plans.append({'id': f'p{k}_{i}_{j}', 'kind': 'const',
                              'segs': {a: [(0, DAYS - 1, va)], b: [(0, DAYS - 1, vb)]}})
        for i, va in enumerate(pair_grid(a)):
            plans.append({'id': f'a{k}_{i}', 'kind': 'const', 'segs': {a: [(0, DAYS - 1, va)]}})
        for j, vb in enumerate(pair_grid(b)):
            plans.append({'id': f'b{k}_{j}', 'kind': 'const', 'segs': {b: [(0, DAYS - 1, vb)]}})
    d = L.scenario_dict(docs, info, owner, S, plans, STEP_DAYS, DAYS, 'virtual_human_envelope_pairs')
    work.mkdir(parents=True, exist_ok=True)
    path = work / 'full_envelope_pairs_2026.yaml'
    L.dump_yaml(d, path)
    return path, L.state_vars(docs, S)


def sweep_pair(task):
    path, k, outs = task
    a, b = PAIRS[k]
    r = L.Runner(path)
    names = list(outs)
    idx = {n: i for i, n in enumerate(names)}
    ref_arr = r.run('ref', DAYS // STEP_DAYS, names)
    ref_pins = {hz: set(_pinned_vars(r, ref_arr[:n], names, idx)) for hz, n in HORIZONS.items()}
    cells = []
    axes = {'a': [], 'b': []}
    for side in ('a', 'b'):
        for i in range(PAIR_LEVELS):
            arr = r.run(f'{side}{k}_{i}', DAYS // STEP_DAYS, names)
            rec = {}
            for hz, n in HORIZONS.items():
                seg = arr[:n]
                fin = bool(np.all(np.isfinite(seg)))
                rec[hz] = {'finite': fin, 'flags': marker_flags({m: float(seg[-1, idx[m]]) for m in MARKERS if m in idx})}
            axes[side].append(rec)
    for i in range(PAIR_LEVELS):
        for j in range(PAIR_LEVELS):
            arr = r.run(f'p{k}_{i}_{j}', DAYS // STEP_DAYS, names)
            rec = {'i': i, 'j': j}
            for hz, n in HORIZONS.items():
                seg = arr[:n]
                fin = bool(np.all(np.isfinite(seg)))
                markers = {m: float(seg[-1, idx[m]]) for m in MARKERS if m in idx}
                pins = [p for p in _pinned_vars(r, seg, names, idx) if p not in ref_pins[hz] and p not in QUIESCENT_FLOORS] if fin else []
                rec[hz] = {'finite': fin, 'flags': marker_flags(markers), 'pins': pins, 'markers': markers}
            cells.append(rec)
    return k, {'cells': cells, 'axes': axes}


def cmd_pairs(args):
    path, outs = build_pair_scenario(L.models_dir().joinpath(*WORK_REL))
    tasks = [(str(path), k, outs) for k in range(len(PAIRS))]
    out = {}
    with Pool(args.workers) as pool:
        for k, res in pool.imap_unordered(sweep_pair, tasks):
            out[k] = res
            print(f'pair {PAIRS[k]} done', flush=True)
    _, owner, info = L.load_registry()
    result = {'horizons_steps': HORIZONS, 'levels': PAIR_LEVELS, 'markers': MARKERS,
              'pairs': [{'a': a, 'b': b, 'a_values': pair_grid(a), 'b_values': pair_grid(b),
                         'ref_a': L.input_ref(info, owner, a), 'ref_b': L.input_ref(info, owner, b),
                         'cells': out[k]['cells'], 'axes': out[k]['axes']} for k, (a, b) in enumerate(PAIRS)]}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(result, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'wrote {args.out}')


def cmd_run(args):
    path, ins, grid, refs, outs = build_scenario(L.models_dir().joinpath(*WORK_REL))
    tasks = [(str(path), v, grid[v], outs) for v in ins]
    sweep = {}
    with Pool(args.workers) as pool:
        for v, rows in pool.imap_unordered(sweep_input, tasks):
            sweep[v] = rows
            print(f'{v}: {len(rows)} levels done', flush=True)
    result = {
        'horizons_steps': HORIZONS, 'step_days': STEP_DAYS, 'markers': MARKERS,
        'refs': refs, 'summary': summarize(sweep, refs), 'sweep': sweep,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(result, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'wrote {args.out}')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run')
    r.add_argument('--out', required=True)
    r.add_argument('--workers', type=int, default=8)
    pr = sub.add_parser('pairs')
    pr.add_argument('--out', required=True)
    pr.add_argument('--workers', type=int, default=8)
    args = ap.parse_args()
    {'run': cmd_run, 'pairs': cmd_pairs}[args.cmd](args)


if __name__ == '__main__':
    main()
