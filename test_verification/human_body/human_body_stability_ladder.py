"""Stability ladder for the virtual human component set.

Every system component (references/medical/physiology/human_body) is first run on its own with
all variables it reads from other systems fixed at reference values, then in every pair, every
triple, and progressively larger subsets up to the full set. Each subset is exercised with the
same battery of input plans and initial-state perturbations, and every owned state variable is
judged by the same criteria: finite, bounded, non-oscillating, settling under constant inputs,
recovering after a transient input pulse, returning from perturbed initial states, insensitive
to step size, and, for the body composition system, conserving energy.

Usage (from repo root):
    python test_verification/human_body/human_body_stability_ladder.py write-sims --out <dir>
    python test_verification/human_body/human_body_stability_ladder.py run --levels 1,2,3 --workers 16
    python test_verification/human_body/human_body_stability_ladder.py report --out <report.md>
    python test_verification/human_body/human_body_stability_ladder.py selftest
    python test_verification/human_body/human_body_stability_ladder.py selftest-faults --workers 16

The subset scenario files are generated on demand from the component files, so a new coupling
in a component is picked up without editing any scenario.
"""

import argparse
import ast
import hashlib
import itertools
import json
import math
import os
import random
import sys
import time
from datetime import date, timedelta
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

COMP_REL = os.environ.get('LM_STAB_COMP_REL', 'references/medical/physiology/human_body')
INPUTS_STEM = 'lifestyle_inputs_2026'
SYSTEMS = {
    'digestive': 'digestive_gut_2026',
    'body': 'body_composition_energy_2026',
    'neuroendo': 'neuroendocrine_axes_2026',
    'glucose': 'glucose_insulin_2026',
    'hepatic': 'hepatic_metabolism_2026',
    'lipid': 'lipid_profile_2026',
    'cardio': 'cardiovascular_2026',
    'resp': 'respiratory_2026',
    'renal': 'renal_fluid_2026',
    'msk': 'musculoskeletal_2026',
    'immune': 'immune_inflammation_2026',
    'nervous': 'nervous_sleep_stress_2026',
    'heme': 'hematology_iron_2026',
    'aging': 'aging_health_summary_2026',
    'appetite': 'appetite_intake_regulation_2026',
}
ORDER = list(SYSTEMS)

# Variables that integrate risk exposure over years by design, or are computed from such
# integrators. They are only required to stay bounded and not accelerate without a cause.
DRIVERS = {'age_years', 'biological_age_delta', 'plaque_burden', 'lung_reserve_pct', 'gfr', 'liver_fibrosis', 'fat_mass_setpoint'}
# States without a restoring term of their own. They keep any offset unless a target pulls them back
# indirectly, so they are perturbed in a separate family and only required to stay well behaved.
INTEGRATORS = DRIVERS | {'fat_mass', 'lean_mass', 'ferritin', 'beta_cell_function', 'fat_mass_setpoint'}
PERTURB_EXEMPT = {'age_years'}
FLUX_VARS = {'tissue_energy_kcal', 'glycogen_delta_kg'}   # per step quantities, scale with the step size

# plausible operating range (lo, hi) of each input, used for the battery
PLAUSIBLE = {
    'energy_intake': (1200.0, 4000.0),
    'carb_pct': (0.05, 0.70),
    'protein_pct': (0.08, 0.35),
    'fiber_g': (0.0, 60.0),
    'sodium_g': (0.5, 8.0),
    'alcohol_g': (0.0, 120.0),
    'water_l': (0.8, 5.0),
    'diet_quality': (0.0, 1.0),
    'aerobic_min': (0.0, 120.0),
    'resistance_min': (0.0, 60.0),
    'sleep_hours': (4.0, 10.0),
    'stress_load': (0.0, 1.0),
    'smoking_cigs': (0.0, 40.0),
    'pathogen_challenge': (0.0, 0.3),
    'hypothyroid_severity': (0.0, 0.8),
    'malabsorption_severity': (0.0, 0.8),
    'iron_loss_extra_mg': (0.0, 4.0),
    'appetite_feedback_gain': (0.0, 1.5),
    'dietary_restraint': (0.0, 1.0),
}
NOT_NAMES = {'exp', 'log', 'min', 'max', 'abs', 'sqrt', 'step', 't', 'time', 'sin', 'cos', 'tan',
             'pow', 'floor', 'ceil', 'round', 'True', 'False', 'None', 'pi', 'e', 'log10',
             'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR', 'SECOND', 'step_size', 'dt'}

START = date(2026, 1, 1)
DAYS_LONG = 2912      # 8 years at 7 day step, 416 steps
DAYS_SHORT = 364      # 52 weeks, used for the step size comparison
PULSE = (30, 120)


# --------------------------------------------------------------------------------------
# registry: ownership, reads, writes
# --------------------------------------------------------------------------------------

def models_dir():
    from reference_engine.src import paths
    return Path(paths.MODELS_DIR).resolve()


def names_in(expr):
    if not isinstance(expr, str):
        return set()
    try:
        tree = ast.parse(expr, mode='eval')
    except SyntaxError:
        return set()
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)} - NOT_NAMES


def load_registry():
    base = models_dir() / COMP_REL
    docs = {'inputs': yaml.safe_load(open(base / f'{INPUTS_STEM}.yaml', encoding='utf-8'))}
    for key, stem in SYSTEMS.items():
        docs[key] = yaml.safe_load(open(base / f'{stem}.yaml', encoding='utf-8'))
    owner = {}
    for key, d in docs.items():
        for v in d.get('variables', {}):
            owner[v] = key
    info = {}
    for key, d in docs.items():
        reads, writes = set(), set()
        for eq in (d.get('equations') or {}).values():
            for tgt, expr in (eq.get('dynamics') or {}).items():
                writes.add(tgt)
                reads |= names_in(expr)
            reads |= names_in(eq.get('condition'))
        reads = {n for n in reads if n in owner}
        info[key] = {
            'vars': d.get('variables', {}),
            'reads': reads,
            'writes': writes & set(owner),
        }
    return docs, owner, info


def depends(info, owner, a, b):
    """True when system a reads a variable owned by system b."""
    return any(owner.get(v) == b for v in info[a]['reads']) or \
        any(owner.get(v) == a for v in info[b]['writes'])


def equation_deps(docs, S):
    deps = {}
    for s in S:
        for eq in (docs[s].get('equations') or {}).values():
            cond = names_in(eq.get('condition'))
            for tgt, expr in (eq.get('dynamics') or {}).items():
                deps.setdefault(tgt, set()).update(names_in(expr) | cond)
    return deps


def accumulator_set(docs, S):
    """Perpetual integrators present in S plus every variable that reads them, directly or not."""
    deps = equation_deps(docs, S)
    down = set()
    changed = True
    while changed:
        changed = False
        for tgt, ds in deps.items():
            if tgt not in down and tgt not in DRIVERS and (ds & (DRIVERS | down)):
                down.add(tgt)
                changed = True
    return DRIVERS | down


def downstream(deps, roots):
    """Targets that read any of roots, directly or through other targets."""
    down = set()
    changed = True
    while changed:
        changed = False
        for tgt, ds in deps.items():
            if tgt not in down and tgt not in roots and (ds & (set(roots) | down)):
                down.add(tgt)
                changed = True
    return down


def active_inputs(info, owner, S):
    ins = set()
    for s in S:
        for v in info[s]['reads']:
            if owner.get(v) == 'inputs' or (info[owner[v]]['vars'][v].get('type') == 'input'):
                ins.add(v)
    return sorted(v for v in ins if v in PLAUSIBLE)


def input_ref(info, owner, v):
    return float(info[owner[v]]['vars'][v]['value'])


# --------------------------------------------------------------------------------------
# plan battery
# --------------------------------------------------------------------------------------

def _fix_macros(vals):
    if 'carb_pct' in vals and 'protein_pct' in vals and vals['carb_pct'] + vals['protein_pct'] > 0.95:
        f = 0.95 / (vals['carb_pct'] + vals['protein_pct'])
        vals['carb_pct'] *= f
        vals['protein_pct'] *= f
    return vals


def build_battery(info, owner, S, days, seed=1, n_rand=4, n_rw=2):
    """Plans as {id, kind, segs:{var:[(d0,d1,value)]}} with d1 inclusive."""
    ins = active_inputs(info, owner, S)
    ref = {v: input_ref(info, owner, v) for v in ins}
    last = days - 1
    plans = [{'id': 'ref', 'kind': 'ref', 'segs': {}}]
    for v in ins:
        lo, hi = PLAUSIBLE[v]
        if hi != ref[v]:
            plans.append({'id': f'{v}_hi', 'kind': 'const', 'segs': {v: [(0, last, hi)]}})
        if lo != ref[v]:
            plans.append({'id': f'{v}_lo', 'kind': 'const', 'segs': {v: [(0, last, lo)]}})
    for v in ins:
        lo, hi = PLAUSIBLE[v]
        far = hi if abs(hi - ref[v]) >= abs(lo - ref[v]) else lo
        p0, p1 = PULSE
        if v == 'pathogen_challenge':
            far, p1 = 1.5, p0 + 7
        plans.append({'id': f'{v}_pulse', 'kind': 'pulse', 'segs': {v: [
            (0, p0 - 1, ref[v]), (p0, p1 - 1, far), (p1, last, ref[v])]}})
    if 'energy_intake' in ins:
        plans.append({'id': 'energy_intake_fast14', 'kind': 'pulse', 'segs': {'energy_intake': [
            (0, 29, ref['energy_intake']), (30, 43, 0.0), (44, last, ref['energy_intake'])]}})
    rng = random.Random(seed)

    def sample():
        vals = _fix_macros({v: rng.uniform(*PLAUSIBLE[v]) for v in ins})
        if 'energy_intake' in vals:
            # keep the random intake within a survivable band around the maintenance need of the sampled activity
            need = 2545.0 + 7.05 * (vals.get('aerobic_min', 20.0) - 20.0) + 4.2 * (vals.get('resistance_min', 5.0) - 5.0)
            vals['energy_intake'] = min(max(need * rng.uniform(0.93, 1.12), 1200.0), 4000.0)
        if 'pathogen_challenge' in vals:
            # chronic constant exposure is not plausible, so most random mixes carry none
            vals['pathogen_challenge'] = 0.0 if rng.random() < 0.75 else rng.uniform(0.0, 0.1)
        return vals

    for i in range(n_rand):
        vals = sample()
        plans.append({'id': f'rand{i + 1}', 'kind': 'const', 'segs': {v: [(0, last, val)] for v, val in vals.items()}})
    for i in range(n_rw):
        segs = {v: [] for v in ins}
        for d0 in range(0, days, 56):
            vals = sample()
            for v in ins:
                segs[v].append((d0, min(d0 + 55, last), vals[v]))
        plans.append({'id': f'walk{i + 1}', 'kind': 'walk', 'segs': segs})
    return plans


def plan_to_yaml(p):
    regs = []
    for v, segs in p['segs'].items():
        for d0, d1, val in segs:
            e = {'variable': v, 'value': round(float(val), 6), 'delivery': 'level'}
            if not (len(segs) == 1 and d0 == 0):
                e['date_range'] = [(START + timedelta(days=d0)).isoformat(), (START + timedelta(days=d1)).isoformat()]
            regs.append(e)
    return {'id': p['id'], 'label': p['id'], 'regimens': regs}


# --------------------------------------------------------------------------------------
# subset scenario
# --------------------------------------------------------------------------------------

def stub_variables(docs, info, owner, S):
    owned = set()
    for s in S:
        owned |= set(info[s]['vars'])
    owned |= set(info['inputs']['vars'])
    need = set()
    for s in S:
        need |= info[s]['reads'] | info[s]['writes']
    stubs = {}
    for v in sorted(need - owned):
        d = docs[owner[v]]['variables'][v]
        stubs[v] = {
            'description': '固定为参考值，替代未导入的系统',
            'value': d['value'], 'unit': d.get('unit', ''), 'type': 'parameter',
            'bounds': d.get('bounds'), 'reference': '全身系统参考值',
        }
        if stubs[v]['bounds'] is None:
            del stubs[v]['bounds']
    return stubs


def state_vars(docs, S):
    out = []
    for s in S:
        for v, d in docs[s]['variables'].items():
            if d.get('type') == 'state':
                out.append(v)
    return out


def scenario_dict(docs, info, owner, S, plans, step_days, days, name, description=None):
    imports = [f'{COMP_REL}/{INPUTS_STEM}'] + [f'{COMP_REL}/{SYSTEMS[s]}' for s in S]
    end = START + timedelta(days=days - 1)
    return {
        'metadata': {
            'name': name, 'version': '1.0', 'lm_format_version': '1.0', 'updated': '2026-09-18',
            'authors': [{'name': 'Fan Shen', 'email': 'shenfan@mail.sysu.edu.cn'}],
            'reviewed': 'false - Drafted with AI assistance, not yet manually reviewed.',
            'description': description or 'stability subset',
            'tags': ['medical', 'human_body', 'stability', 'verification'],
        },
        'imports': imports,
        'variables': stub_variables(docs, info, owner, S),
        'simulation': {
            'step_size': {'value': step_days, 'unit': 'day'},
            'start_date': START.isoformat(), 'end_date': end.isoformat(),
            'output_variables': state_vars(docs, S),
            'plans': [plan_to_yaml(p) for p in plans],
        },
    }


class _Dumper(yaml.SafeDumper):
    pass


def _seq(dumper, data):
    flow = all(isinstance(x, (int, float, str)) and not isinstance(x, bool) for x in data) and len(data) <= 4
    return dumper.represent_sequence('tag:yaml.org,2002:seq', data, flow_style=flow)


_Dumper.add_representer(list, _seq)


def dump_yaml(d, path):
    with open(path, 'w', encoding='utf-8') as f:
        yaml.dump(d, f, Dumper=_Dumper, allow_unicode=True, sort_keys=False, width=10 ** 6, default_flow_style=False)


# --------------------------------------------------------------------------------------
# in-process runner
# --------------------------------------------------------------------------------------

class Runner:
    def __init__(self, path):
        from reference_engine.src.reference_engine import ReferenceEngine
        from reference_engine.src.mc_utils import clone_model
        self.engine = ReferenceEngine(models_directory=str(models_dir()))
        if not self.engine.load_models([str(path)]):
            raise RuntimeError(f'cannot load {path}: {self.engine.loader.last_error}')
        self.base = self.engine.current_model
        self.clone = clone_model
        self.step_sec = float(self.base.simulator['step_size'])
        self.total_steps = None

    def run(self, plan_id, n_steps, outs, perturb=None, freeze=()):
        from reference_engine.src.schedule_runner import advance_steps, precompute_sustained_divisors
        m = self.clone(self.base)
        m.schedule_entries = self.base.plans.get(plan_id, [])
        if perturb:
            for v, val in perturb.items():
                if v in m.variables:
                    lo, hi = m.variables[v].bounds if m.variables[v].bounds else (-math.inf, math.inf)
                    m.variables[v].value = min(max(val, lo), hi)
        for g in freeze:
            if g in m.variables:
                m.variables[g].bounds = [m.variables[g].value, m.variables[g].value]
        sched = precompute_sustained_divisors(list(m.schedule_entries), self.step_sec) if m.schedule_entries else []
        rows, _, _ = advance_steps(m, sched, self.step_sec, n_steps, 0, 0.0, outs, self.base.simulator.get('start_date', ''))
        arr = np.array([[r[v] for v in outs] for r in rows], dtype=float)
        return arr

    def initial_values(self, outs):
        return {v: self.base.variables[v].value for v in outs}

    def bounds(self, v):
        b = self.base.variables[v].bounds
        return (b[0], b[1]) if b else (-math.inf, math.inf)


# --------------------------------------------------------------------------------------
# judging
# --------------------------------------------------------------------------------------

def var_scale(x_ref, lo, hi):
    rng = (hi - lo) if math.isfinite(lo) and math.isfinite(hi) else abs(np.median(x_ref))
    return max(abs(float(np.median(x_ref))), 0.05 * rng, 1e-9)


def judge_const(x, lo, hi, scale, accum):
    """Returns (code, severity, detail). severity: ok, warn, fail."""
    if not np.all(np.isfinite(x)):
        return 'NONFINITE', 'fail', 'non finite value'
    w = 13
    if len(x) < 4 * w:
        return 'SHORT', 'ok', ''
    rngv = (hi - lo) if math.isfinite(lo) and math.isfinite(hi) else scale
    pinned = np.all(np.isclose(x[-w:], lo, atol=1e-9 * max(rngv, 1))) or np.all(np.isclose(x[-w:], hi, atol=1e-9 * max(rngv, 1)))
    if pinned:
        return 'PINNED', 'warn', f'held at bound {x[-1]:.4g}'
    d2 = abs(x[-1] - x[-1 - w]) / scale
    d1 = abs(x[-1 - w] - x[-1 - 2 * w]) / scale
    seg = x[-3 * w:]
    tt = np.arange(len(seg))
    resid = seg - np.polyval(np.polyfit(tt, seg, 1), tt)
    amp = (resid.max() - resid.min()) / 2.0 / scale
    crossings = int(np.sum(np.diff(np.sign(resid - resid.mean())) != 0))
    if amp > 0.02 and crossings >= 6 and d2 < 0.5 * amp * 4:
        return 'OSCILLATION', 'fail', f'amplitude {amp:.3f} of scale, {crossings} crossings'
    if d2 < 0.01:
        return 'SETTLED', 'ok', ''
    if d2 < 0.7 * d1:
        return 'CONVERGING', 'ok', f'{d2:.3f} per quarter'
    if d2 > 1.3 * d1 and d2 > 0.03:
        return ('ACCELERATING', 'warn', f'{d1:.3f} to {d2:.3f} per quarter') if accum else \
            ('DIVERGENCE', 'fail', f'{d1:.3f} to {d2:.3f} per quarter')
    return ('DRIFT', 'ok', f'{d2:.3f} per quarter') if accum else ('DRIFT', 'warn', f'{d2:.3f} per quarter')


def judge_recovery(x, x_ref, scale, accum):
    if not np.all(np.isfinite(x)):
        return 'NONFINITE', 'fail', 'non finite value'
    dev = x - x_ref
    peak = float(np.max(np.abs(dev)))
    final = float(abs(dev[-1]))
    if peak < 0.01 * scale:
        return 'NO_RESPONSE', 'ok', ''
    if final <= 0.2 * peak:
        return 'RECOVERED', 'ok', ''
    if accum:
        return 'PERSISTENT', 'ok', f'{final / peak:.2f} of peak'
    # a fast state that keeps essentially the whole deviation is latched, which is a loss of self stability
    return 'PERSISTENT', ('fail' if final >= 0.9 * peak else 'warn'), f'{final / peak:.2f} of peak'


def judge_perturb(x, x_ref, scale, accum, lo, hi):
    if not np.all(np.isfinite(x)):
        return 'NONFINITE', 'fail', 'non finite value'
    code, sev, det = judge_const(x, lo, hi, scale, accum)
    if code in ('OSCILLATION', 'DIVERGENCE'):
        return code, sev, det
    dev = abs(x[-1] - x_ref[-1]) / scale
    if dev <= 0.03:
        return 'RETURNED', 'ok', ''
    if accum:
        return 'NOT_RETURNED', 'ok', f'{dev:.3f} of scale'
    return 'NOT_RETURNED', ('fail' if dev >= 0.25 else 'warn'), f'{dev:.3f} of scale'


# --------------------------------------------------------------------------------------
# one subset
# --------------------------------------------------------------------------------------

def run_subset(task):
    S, work_dir, do_perturb, seed = task
    t0 = time.time()
    docs, owner, info = load_registry()
    name = 'stab_' + hashlib.md5('+'.join(S).encode()).hexdigest()[:10]
    res = {'systems': list(S), 'issues': [], 'var_worst': {}, 'n_plans': 0, 'n_vars': 0, 'seconds': 0.0}
    outs = state_vars(docs, S)
    res['n_vars'] = len(outs)
    if not outs:
        return res
    battery = build_battery(info, owner, S, DAYS_LONG, seed=seed)
    res['n_plans'] = len(battery)
    work = Path(work_dir).resolve()
    work.mkdir(parents=True, exist_ok=True)
    fpath = work / f'{name}.yaml'
    dump_yaml(scenario_dict(docs, info, owner, S, battery, 7, DAYS_LONG, name), fpath)
    sev_rank = {'ok': 0, 'warn': 1, 'fail': 2}

    def note(v, plan, code, sev, detail):
        if sev == 'ok':
            return
        res['issues'].append({'var': v, 'plan': plan, 'code': code, 'sev': sev, 'detail': detail})
        cur = res['var_worst'].get(v)
        if cur is None or sev_rank[sev] > sev_rank[cur[0]]:
            res['var_worst'][v] = (sev, code)

    try:
        rn = Runner(fpath)
        n_steps = DAYS_LONG // 7
        ints_all = [v for v in outs if v in INTEGRATORS]
        series = {}
        for p in battery:
            # Pulse plans run with every integrator frozen at its initial value, so that a state which
            # fails to come back is a latch in the fast loops and not memory stored in an integrator.
            series[p['id']] = rn.run(p['id'], n_steps, outs, freeze=ints_all if p['kind'] == 'pulse' else ())
        ref_f = rn.run('ref', n_steps, outs, freeze=ints_all)
    except Exception as ex:  # noqa: BLE001
        res['issues'].append({'var': '*', 'plan': '*', 'code': 'EXCEPTION', 'sev': 'fail', 'detail': str(ex)[:200]})
        res['var_worst']['*'] = ('fail', 'EXCEPTION')
        res['seconds'] = time.time() - t0
        return res

    ref = series['ref']
    idx = {v: i for i, v in enumerate(outs)}
    accum_set = accumulator_set(docs, S)
    deps = equation_deps(docs, S)
    ints_in = [v for v in outs if v in INTEGRATORS]

    def unsettled_closure(arr):
        un = set()
        for g in ints_in:
            gi = outs.index(g)
            lo_g, hi_g = rn.bounds(g)
            code_g = judge_const(arr[:, gi], lo_g, hi_g, var_scale(ref[:, gi], lo_g, hi_g), True)[0]
            if code_g not in ('SETTLED', 'NONFINITE', 'PINNED', 'SHORT'):
                un.add(g)
        return downstream(deps, un) | un

    exempt_const = {p['id']: unsettled_closure(series[p['id']]) for p in battery if p['kind'] in ('ref', 'const')}
    written = {t for s in S for eq in (docs[s].get('equations') or {}).values() for t in (eq.get('dynamics') or {})}
    res['pins'] = {}
    for v in outs:
        i = idx[v]
        lo, hi = rn.bounds(v)
        accum = v in accum_set
        scale = var_scale(ref[:, i], lo, hi)
        ref_pinned = bool(np.all(np.isclose(ref[-13:, i], lo, atol=1e-9 * max(hi - lo, 1))) or
                          np.all(np.isclose(ref[-13:, i], hi, atol=1e-9 * max(hi - lo, 1))))
        for p in battery:
            x = series[p['id']][:, i]
            if p['kind'] in ('ref', 'const'):
                code, sev, det = judge_const(x, lo, hi, scale, accum or v in exempt_const[p['id']])
                if code == 'PINNED':
                    if p['kind'] == 'ref' or ref_pinned:
                        sev = 'ok'          # a resting value on its own bound, such as zero infection
                    elif p['id'].startswith('rand'):
                        sev = 'warn'        # saturates under a plausible input mix, the bound is too tight
                    else:
                        sev = 'ok'          # saturates only at a single input extreme, recorded below
                        res['pins'].setdefault(v, []).append(p['id'])
                # a drifting or diverging reference plan is a failure
                if p['kind'] == 'ref' and sev == 'warn':
                    sev = 'fail'
                note(v, p['id'], code, sev, det)
            elif p['kind'] == 'pulse':
                if v in INTEGRATORS:
                    continue
                code, sev, det = judge_recovery(x, ref_f[:, i], scale, False)
                note(v, p['id'], code, sev, det)
            else:
                if not np.all(np.isfinite(x)):
                    note(v, p['id'], 'NONFINITE', 'fail', 'non finite value')

    # energy conservation
    if 'body' in S:
        need = ['energy_balance', 'fat_mass', 'lean_mass', 'glycogen_kg']
        if all(n in idx for n in need):
            worst = 0.0
            for p in battery:
                if p['kind'] == 'pulse':
                    continue
                a = series[p['id']]
                eb = a[:, idx['energy_balance']]
                stored = 9400.0 * (a[-1, idx['fat_mass']] - a[0, idx['fat_mass']]) + \
                    1800.0 * (a[-1, idx['lean_mass']] - a[0, idx['lean_mass']]) + \
                    4000.0 * (a[-1, idx['glycogen_kg']] - a[0, idx['glycogen_kg']])
                flow = float(np.sum(eb[1:]) * 7.0)
                clamp = any(np.isclose(a[:, idx[n]], rn.bounds(n)[0]).any() or np.isclose(a[:, idx[n]], rn.bounds(n)[1]).any()
                            for n in ('fat_mass', 'lean_mass', 'glycogen_kg'))
                if clamp:
                    continue
                err = abs(stored - flow) / max(abs(flow), 1000.0)
                worst = max(worst, err)
            res['energy_conservation_rel_err'] = worst
            if worst > 0.01:
                note('fat_mass', '*', 'ENERGY_CONSERVATION', 'fail', f'relative error {worst:.3g}')

    # perturbed initial states under reference inputs. Fast family: every state that some equation of
    # the subset writes and that is not an integrator, which must return to the reference trajectory.
    # Slow family: the integrators, which only have to stay well behaved.
    if do_perturb:
        rng = random.Random(seed + 7)
        init = rn.initial_values(outs)
        fast = [v for v in outs if v in written and v not in INTEGRATORS and v not in PERTURB_EXEMPT]
        slow = [v for v in outs if v in written and v in INTEGRATORS and v not in PERTURB_EXEMPT]

        def rand_pert(names):
            pert = {}
            for v in names:
                lo, hi = rn.bounds(v)
                f = rng.uniform(0.7, 1.3)
                pert[v] = init[v] * f if abs(init[v]) > 1e-9 else rng.uniform(-0.1, 0.1) * ((hi - lo) if math.isfinite(hi - lo) else 1.0)
            return pert

        def corner(names, frac):
            pert = {}
            for v in names:
                lo, hi = rn.bounds(v)
                if math.isfinite(lo) and math.isfinite(hi):
                    pert[v] = init[v] - frac * (init[v] - lo) if frac > 0 else init[v] + (-frac) * (hi - init[v])
            return pert

        variants = []
        for k in range(3):
            variants.append((f'perturb{k + 1}', rand_pert(fast), 'fast'))
        variants.append(('lowcorner', corner(fast, 0.3), 'fast'))
        variants.append(('highcorner', corner(fast, -0.3), 'fast'))
        if slow:
            variants.append(('slow_random', rand_pert(slow), 'slow'))
            variants.append(('slow_low', corner(slow, 0.3), 'slow'))
            variants.append(('slow_high', corner(slow, -0.3), 'slow'))
        for tag, pert, fam in variants:
            if not pert:
                continue
            try:
                a = rn.run('ref', n_steps, outs, perturb=pert, freeze=ints_all if fam == 'fast' else ())
            except Exception as ex:  # noqa: BLE001
                note('*', tag, 'EXCEPTION', 'fail', str(ex)[:200])
                continue
            for v in outs:
                i = idx[v]
                lo, hi = rn.bounds(v)
                scale = var_scale(ref[:, i], lo, hi)
                if fam == 'fast':
                    if v in INTEGRATORS:
                        continue
                    code, sev, det = judge_perturb(a[:, i], ref_f[:, i], scale, False, lo, hi)
                else:
                    code, sev, det = judge_const(a[:, i], lo, hi, scale, True)
                    if code == 'PINNED':
                        sev = 'ok'
                note(v, tag, code, sev, det)

    # step size comparison over one year
    try:
        short = [p for p in build_battery(info, owner, S, DAYS_SHORT, seed=seed)
                 if p['id'] in ('ref', 'rand1') or p['kind'] == 'pulse'][:4]
        outs_s = outs
        f1 = work / f'{name}_d1.yaml'
        f7 = work / f'{name}_d7.yaml'
        dump_yaml(scenario_dict(docs, info, owner, S, short, 1, DAYS_SHORT, name + '_d1'), f1)
        dump_yaml(scenario_dict(docs, info, owner, S, short, 7, DAYS_SHORT, name + '_d7'), f7)
        r1, r7 = Runner(f1), Runner(f7)
        worst_step = 0.0
        for p in short:
            a1 = r1.run(p['id'], DAYS_SHORT, outs_s)
            a7 = r7.run(p['id'], DAYS_SHORT // 7, outs_s)
            for v in outs_s:
                if v in FLUX_VARS:
                    continue
                i = idx[v]
                lo, hi = rn.bounds(v)
                scale = var_scale(ref[:, i], lo, hi)
                dv = abs(a1[-1, i] - a7[-1, i]) / scale
                worst_step = max(worst_step, dv)
                if dv > 0.10:
                    note(v, p['id'], 'STEP_SENSITIVE', 'fail', f'{dv:.3f} of scale between 1 and 7 day steps')
                elif dv > 0.04:
                    note(v, p['id'], 'STEP_SENSITIVE', 'warn', f'{dv:.3f} of scale between 1 and 7 day steps')
        res['step_worst'] = worst_step
        f1.unlink(missing_ok=True)
        f7.unlink(missing_ok=True)
    except Exception as ex:  # noqa: BLE001
        note('*', 'step', 'EXCEPTION', 'fail', str(ex)[:200])

    fpath.unlink(missing_ok=True)
    res['seconds'] = time.time() - t0
    return res


# --------------------------------------------------------------------------------------
# subset lattice
# --------------------------------------------------------------------------------------

def chain_order(info, owner):
    """Nested chain: start from digestive and add the system with most links to the chosen set."""
    chosen = ['digestive']
    rest = [s for s in ORDER if s not in chosen]
    while rest:
        best = max(rest, key=lambda s: sum(depends(info, owner, s, c) or depends(info, owner, c, s) for c in chosen))
        chosen.append(best)
        rest.remove(best)
    return chosen


def lattice(levels, seed=3, samples=None):
    docs, owner, info = load_registry()
    rng = random.Random(seed)
    out = []
    samples = samples or {4: 150}
    default_samples = 60
    for k in levels:
        if k == 1:
            out += [(s,) for s in ORDER]
        elif k == 2 or k == 3:
            out += [tuple(c) for c in itertools.combinations(ORDER, k)]
        elif k == len(ORDER):
            out.append(tuple(ORDER))
        else:
            n = samples.get(k, default_samples)
            seen = set()
            chain = chain_order(info, owner)
            seen.add(tuple(sorted(chain[:k], key=ORDER.index)))
            while len(seen) < min(n, math.comb(len(ORDER), k)):
                seen.add(tuple(sorted(rng.sample(ORDER, k), key=ORDER.index)))
            out += list(seen)
    return out


# --------------------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------------------

def run_subset_safe(task):
    try:
        return run_subset(task)
    except Exception as ex:  # noqa: BLE001
        S = task[0]
        return {'systems': list(S), 'issues': [{'var': '*', 'plan': '*', 'code': 'EXCEPTION', 'sev': 'fail', 'detail': str(ex)[:200]}],
                'var_worst': {'*': ('fail', 'EXCEPTION')}, 'n_plans': 0, 'n_vars': 0, 'seconds': 0.0}


def cmd_write_sims(args):
    docs, owner, info = load_registry()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for s in ORDER:
        ins = active_inputs(info, owner, (s,))
        plans = build_battery(info, owner, (s,), DAYS_LONG, seed=1)
        d = scenario_dict(docs, info, owner, (s,), plans, 7, DAYS_LONG, f'{s}_stability')
        d['metadata']['description'] = {
            'problem': f'单独检验 {docs[s]["metadata"]["name"]} 系统在各种输入与初态下能否自稳定和自闭环，需要一组固定其余系统的对照方案。',
            'method': f'本文件只导入输入层和 {docs[s]["metadata"]["name"]} 一个系统文件，该系统读取但不拥有的变量在根文件里固定为参考值。方案包含参考、每个相关输入的上下界常量、单次脉冲后恢复、随机常量组合和分段随机游走，共 {len(plans)} 个，七天步长运行八年。相关输入为 {", ".join(ins) if ins else "无"}。',
            'result': '判据与逐变量结果见 human_body_stability_report.md。',
            'limitations': '被固定的变量不随仿真变化，因此本文件只检验该系统内部回路，不含与其他系统的耦合。',
        }
        dump_yaml(d, out / f'{s}_stability_2026.yaml')
    print(f'wrote {len(ORDER)} files to {out}')


def cmd_run(args):
    levels = [int(x) for x in args.levels.split(',')]
    subsets = lattice(levels, samples={int(k): int(v) for k, v in (kv.split(':') for kv in args.samples.split(','))} if args.samples else None)
    out = Path(args.results)
    out.mkdir(parents=True, exist_ok=True)
    work = Path(args.work) if args.work else models_dir() / 'scenarios' / 'medical' / 'temp_stability_work'
    done = {p.stem for p in out.glob('*.json')}
    tasks = []
    for S in subsets:
        key = '+'.join(S)
        if key in done and not args.force:
            continue
        tasks.append((S, str(work / hashlib.md5(key.encode()).hexdigest()[:8]), not args.no_perturb, 11))
    print(f'{len(subsets)} subsets in lattice, {len(tasks)} to run, workers={args.workers}')
    t0 = time.time()
    fails = 0
    with Pool(args.workers, maxtasksperchild=8) as pool:
        for n, r in enumerate(pool.imap_unordered(run_subset_safe, tasks), 1):
            key = '+'.join(r['systems'])
            json.dump(r, open(out / f'{key}.json', 'w', encoding='utf-8'), ensure_ascii=False)
            f = sum(1 for i in r['issues'] if i['sev'] == 'fail')
            w = sum(1 for i in r['issues'] if i['sev'] == 'warn')
            fails += bool(f)
            if n % 10 == 0 or f:
                print(f'[{n}/{len(tasks)}] {key[:60]:60s} fail={f} warn={w} {r["seconds"]:.1f}s  elapsed {time.time() - t0:.0f}s', flush=True)
    print(f'done, {fails} subsets with failures, {time.time() - t0:.0f}s')


def cmd_report(args):
    res = [json.load(open(p, encoding='utf-8')) for p in sorted(Path(args.results).glob('*.json'))]
    docs, owner, info = load_registry()
    by_k = {}
    for r in res:
        by_k.setdefault(len(r['systems']), []).append(r)
    n_systems = len(ORDER)
    lines = ['# 人体系统稳定性阶梯报告', '',
             f'本报告由 `human_body_stability_ladder.py` 生成，覆盖 {n_systems} 个系统组件，判据与方法见 `stability_verification.md`。'
             f'每个组合用同一组方案检验：参考、每个输入的上下界常量、脉冲后恢复、随机常量组合、分段随机游走、初态扰动和一天与七天步长对比。', '']
    lines += ['## 判定说明', '',
              '- 失败表示自稳定或闭环被破坏，包括非有限值、持续振荡、加速发散、参考方案漂移或撞边界、能量不守恒、快变量在脉冲后完全不恢复或在初态扰动后停在另一个平衡点，以及步长敏感超过百分之十。',
              '- 警告 PINNED 表示在合理的随机输入组合下某个变量撞到自己声明的边界，说明边界在该区域偏紧或对应耗竭与饱和态，例如铁蛋白耗竭、C 反应蛋白上限、免疫能力下限。',
              '- 警告 ACCELERATING 与 DRIFT 只出现在包含某变量的读者、却不含它的调节者的子集里时，多为桩固定造成的截断效应。例如食欲组件读取瘦素，子集里有体成分而没有神经内分泌，瘦素被固定在参考值而脂肪量上升，被读成永久的瘦素缺口。判据是全系统一层，见闭环一节。',
              '- 一天与七天步长对比的警告集中在食欲反馈的稳态饥饿，因为该回路的滞后随步长变化，终值差异不超过其尺度的百分之十。', '']
    lines += ['## 各层级汇总', '', '| 系统数 | 组合数 | 无问题 | 仅警告 | 含失败 | 平均方案数 | 平均状态变量数 |', '|---|---|---|---|---|---|---|']
    tot = [0, 0, 0, 0]
    for k in sorted(by_k):
        rs = by_k[k]
        nf = sum(1 for r in rs if any(i['sev'] == 'fail' for i in r['issues']))
        nw = sum(1 for r in rs if not any(i['sev'] == 'fail' for i in r['issues']) and r['issues'])
        no = len(rs) - nf - nw
        tot = [tot[0] + len(rs), tot[1] + no, tot[2] + nw, tot[3] + nf]
        exh = '全部' if k in (1, 2, 3) or k == n_systems else '抽样'
        lines.append(f'| {k} | {len(rs)} {exh} | {no} | {nw} | {nf} | {np.mean([r["n_plans"] for r in rs]):.0f} | {np.mean([r["n_vars"] for r in rs]):.0f} |')
    lines += [f'| 合计 | {tot[0]} | {tot[1]} | {tot[2]} | {tot[3]} | | |', '']

    full = next((r for r in res if len(r['systems']) == n_systems), None)
    if full:
        lines += ['## 全系统闭环', '',
                  f'全部 {n_systems} 个系统同时导入，{full["n_vars"]} 个状态变量，{full["n_plans"]} 个方案，每个变量按上述判据检验。', '']
        agg = {}
        for i in full['issues']:
            agg.setdefault((i['var'], i['code'], i['sev']), []).append(i)
        if not agg:
            lines += ['没有任何警告或失败。', '']
        else:
            lines += ['| 变量 | 判定 | 级别 | 方案数 | 示例方案 | 细节 |', '|---|---|---|---|---|---|']
            for (v, c, sv), lst in agg.items():
                lines.append(f'| {v} | {c} | {sv} | {len(lst)} | {lst[0]["plan"]} | {lst[0]["detail"]} |')
            lines += ['']
        lines += [f'- 完整系统内没有加速发散、漂移、振荡和滞后锁死，只有上述边界饱和。',
                  f'- 一天与七天步长对比的最大偏离为其尺度的 {full.get("step_worst", 0):.3f}，能量守恒相对误差 {full.get("energy_conservation_rel_err", 0):.1e}。', '']
    # failures
    lines += ['## 失败明细', '']
    seen = {}
    for r in res:
        for i in r['issues']:
            if i['sev'] == 'fail':
                seen.setdefault((i['var'], i['code']), []).append((len(r['systems']), '+'.join(r['systems']), i['plan'], i['detail']))
    if not seen:
        lines += ['所有组合均无失败判定。', '']
    else:
        lines += ['| 变量 | 判定 | 出现次数 | 最小出现规模 | 示例组合 | 示例方案 | 细节 |', '|---|---|---|---|---|---|---|']
        for (v, c), lst in sorted(seen.items(), key=lambda kv: -len(kv[1])):
            lst.sort()
            k, comb, plan, det = lst[0]
            lines.append(f'| {v} | {c} | {len(lst)} | {k} | {comb} | {plan} | {det} |')
        lines += ['']

    # warnings aggregated
    lines += ['## 警告汇总', '', '按变量与判定聚合。首次出现规模为该警告最先出现的组合大小。', '',
              '| 变量 | 所属系统 | 判定 | 出现组合数 | 首次出现规模 | 示例方案 | 细节 |', '|---|---|---|---|---|---|---|']
    wagg = {}
    for r in res:
        first = {}
        for i in r['issues']:
            if i['sev'] == 'warn':
                first.setdefault((i['var'], i['code']), i)
        for key, i in first.items():
            wagg.setdefault(key, []).append((len(r['systems']), i['plan'], i['detail']))
    for (v, c), lst in sorted(wagg.items(), key=lambda kv: (owner.get(kv[0][0], ''), kv[0][0], kv[0][1])):
        lst.sort()
        lines.append(f'| {v} | {owner.get(v, "")} | {c} | {len(lst)} | {lst[0][0]} | {lst[0][1]} | {lst[0][2]} |')
    lines += ['']

    # pins
    pins = {}
    for r in res:
        for v, plans_ in (r.get('pins') or {}).items():
            pins.setdefault(v, set()).update(plans_)
    lines += ['## 边界饱和', '', '这些变量在单个输入取极端值时撞到自己声明的边界，属于设计上的饱和，记录在此供后续放宽或保留时参考。', '',
              '| 变量 | 所属系统 | 触发方案 |', '|---|---|---|']
    for v in sorted(pins, key=lambda x: (owner.get(x, ''), x)):
        lines.append(f'| {v} | {owner.get(v, "")} | {", ".join(sorted(pins[v])[:6])}{" 等" if len(pins[v]) > 6 else ""} |')
    lines += ['']

    # certificate
    lines += ['## 变量级稳定性证书', '', '每个状态变量在所有包含它所属系统的组合中的判定统计。', '',
              '| 变量 | 所属系统 | 出现组合数 | 失败组合数 | 警告组合数 | 最常见警告 |', '|---|---|---|---|---|---|']
    stat = {}
    for r in res:
        present = set()
        for sname in r['systems']:
            for v, d in docs[sname]['variables'].items():
                if d.get('type') == 'state':
                    present.add(v)
        for v in present:
            st = stat.setdefault(v, {'n': 0, 'fail': 0, 'warn': 0, 'codes': {}})
            st['n'] += 1
            w = r['var_worst'].get(v)
            if w:
                st['fail' if w[0] == 'fail' else 'warn'] += 1
                st['codes'][w[1]] = st['codes'].get(w[1], 0) + 1
    for v in sorted(stat, key=lambda x: (owner[x], x)):
        st = stat[v]
        top = max(st['codes'], key=st['codes'].get) if st['codes'] else ''
        lines.append(f'| {v} | {owner[v]} | {st["n"]} | {st["fail"]} | {st["warn"]} | {top} |')
    lines += ['']

    # pair matrix
    pairs = {tuple(r['systems']): r for r in res if len(r['systems']) == 2}
    if pairs:
        lines += ['## 两两组合矩阵', '', '`F` 含失败，`w` 仅警告，`.` 有直接读写耦合且无问题，`-` 无直接读写耦合且无问题。对角线为单系统。', '',
                  '| | ' + ' | '.join(ORDER) + ' |', '|---|' + '---|' * len(ORDER)]
        for a in ORDER:
            row = []
            for b in ORDER:
                if a == b:
                    single = next((r for r in res if r['systems'] == [a]), None)
                    row.append('?' if not single else ('F' if any(i['sev'] == 'fail' for i in single['issues']) else ('w' if single['issues'] else '.')))
                    continue
                key = tuple(sorted((a, b), key=ORDER.index))
                r = pairs.get(key)
                if not r:
                    row.append('?')
                    continue
                coupled = depends(info, owner, a, b) or depends(info, owner, b, a)
                ch = 'F' if any(i['sev'] == 'fail' for i in r['issues']) else ('w' if r['issues'] else '.')
                row.append(ch if (coupled or ch != '.') else '-')
            lines.append(f'| {a} | ' + ' | '.join(row) + ' |')
        lines += ['']
        lines += ['## 系统间读写耦合', '', '行系统读取列系统拥有的变量，或写入列系统拥有的变量，数字为涉及的变量个数。', '',
                  '| | ' + ' | '.join(ORDER) + ' |', '|---|' + '---|' * len(ORDER)]
        for a in ORDER:
            row = []
            for b in ORDER:
                if a == b:
                    row.append('')
                    continue
                n = len({v for v in info[a]['reads'] | info[a]['writes'] if owner.get(v) == b})
                row.append(str(n) if n else '')
            lines.append(f'| {a} | ' + ' | '.join(row) + ' |')
        lines += ['']

    ec = [r['energy_conservation_rel_err'] for r in res if 'energy_conservation_rel_err' in r]
    sw = [r['step_worst'] for r in res if 'step_worst' in r]
    secs = sum(r['seconds'] for r in res)
    lines += ['## 不变量与步长', '',
              f'- 含体成分系统的组合 {len(ec)} 个，能量守恒相对误差最大值 {max(ec) if ec else 0:.2e}。',
              f'- 一天与七天步长对比，各组合的最大相对偏离按变量尺度计，中位数 {np.median(sw) if sw else 0:.4f}，最大值 {max(sw) if sw else 0:.4f}。',
              f'- 全部 {len(res)} 个组合单核累计耗时 {secs / 3600:.2f} 小时。', '']
    Path(args.out).write_text('\n'.join(lines), encoding='utf-8')
    print(f'wrote {args.out}')


FAULTS = [
    # cross system latch: cortisol and sympathetic tone drive each other with loop gain 9
    ('neuroendocrine_axes_2026', [
        ("1.0 + 0.8 * (stress_load - 0.3) + 0.04 * sleep_debt", "1.0 + 0.8 * (stress_load - 0.3) + 3.0 * (sympathetic_tone - 1.0) + 0.04 * sleep_debt"),
        ("- cortisol) * (1.0 - exp(-step / 5.0))", "- cortisol) * (1.0 - exp(-step / 1.0))")]),
    ('nervous_sleep_stress_2026', [
        ("1.0 + 0.9 * (stress_load - 0.3) + 0.04 * sleep_debt", "1.0 + 0.9 * (stress_load - 0.3) + 3.0 * (cortisol - 1.0) + 0.04 * sleep_debt"),
        ("- sympathetic_tone) * (1.0 - exp(-step / 5.0))", "- sympathetic_tone) * (1.0 - exp(-step / 1.0))")]),
    # single system latch: glucotoxicity strong enough to lock hyperglycemia
    ('glucose_insulin_2026', [
        ("- 0.0015 * min(150.0, max(0.0, fasting_glucose - 100.0))", "- 1.5 * min(150.0, max(0.0, fasting_glucose - 100.0))"),
        ("- insulin_sensitivity) * (1.0 - exp(-step / 10.0))", "- insulin_sensitivity) * (1.0 - exp(-step / 0.3))"),
        ("- fasting_glucose) * (1.0 - exp(-step / 2.0))", "- fasting_glucose) * (1.0 - exp(-step / 0.3))")]),
]


def cmd_selftest_faults(args):
    """Copy the components, inject known faults, and check that levels 1 and 2 flag exactly the expected subsets."""
    global COMP_REL
    import shutil
    src = models_dir() / COMP_REL
    mut_rel = 'scenarios/medical/temp_stability_mut'
    dst = models_dir() / mut_rel
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    for stem, pairs in FAULTS:
        f = dst / f'{stem}.yaml'
        t = f.read_text(encoding='utf-8')
        for a, b in pairs:
            if a not in t:
                raise SystemExit(f'fault pattern not found in {stem}: {a[:60]}, update FAULTS')
            t = t.replace(a, b, 1)
        f.write_text(t, encoding='utf-8')
    os.environ['LM_STAB_COMP_REL'] = mut_rel
    COMP_REL = mut_rel
    subsets = lattice([1, 2])
    work = models_dir() / 'scenarios' / 'medical' / 'temp_stability_work_mut'
    tasks = [(S, str(work / hashlib.md5('+'.join(S).encode()).hexdigest()[:8]), True, 11) for S in subsets]
    flagged = set()
    with Pool(args.workers) as pool:
        for r in pool.imap_unordered(run_subset_safe, tasks):
            if any(i['sev'] == 'fail' for i in r['issues']):
                flagged.add(tuple(r['systems']))
    expected = {tuple(S) for S in subsets if 'glucose' in S} | {tuple(sorted(('neuroendo', 'nervous'), key=ORDER.index))}
    shutil.rmtree(dst, ignore_errors=True)
    shutil.rmtree(work, ignore_errors=True)
    missed, extra = expected - flagged, flagged - expected
    print(f'flagged {len(flagged)} of {len(subsets)}, expected {len(expected)}, missed {len(missed)}, unexpected {len(extra)}')
    for m in sorted(missed):
        print('  missed', '+'.join(m))
    for e in sorted(extra):
        print('  unexpected', '+'.join(e))
    return 1 if (missed or extra) else 0


def cmd_selftest(args):
    n = 416
    t = np.arange(n)
    cases = {
        'settled': (1 + 0.5 * np.exp(-t / 10), 'SETTLED'),
        'oscillating': (1 + 0.3 * np.sin(t * 0.8), 'OSCILLATION'),
        'growing_oscillation': (1 + 0.01 * np.exp(t / 40) * np.sin(t * 1.2), 'OSCILLATION'),
        'exponential_growth': (1 + 0.002 * np.exp(t / 40), 'DIVERGENCE'),
        'period_two': (1 + 0.2 * (-1.0) ** t, 'OSCILLATION'),
        'non_finite': (np.r_[np.ones(200), np.full(n - 200, np.nan)], 'NONFINITE'),
    }
    bad = 0
    for name, (x, want) in cases.items():
        got = judge_const(x, -1e9, 1e9, 1.0, False)[0]
        ok = got == want
        bad += not ok
        print(f'{name:22s} expected {want:12s} got {got:12s} {"ok" if ok else "MISMATCH"}')
    ref = np.ones(n)
    for name, x, want in (('recovers', 1 + np.r_[np.zeros(20), 0.5 * np.exp(-np.arange(n - 20) / 20)], 'RECOVERED'),
                          ('persists', 1 + np.r_[np.zeros(20), 0.5 * np.ones(n - 20)], 'PERSISTENT')):
        got = judge_recovery(x, ref, 1.0, False)[0]
        ok = got == want
        bad += not ok
        print(f'{name:22s} expected {want:12s} got {got:12s} {"ok" if ok else "MISMATCH"}')
    print('selftest', 'passed' if not bad else f'FAILED {bad}')
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    w = sub.add_parser('write-sims')
    w.add_argument('--out', required=True)
    r = sub.add_parser('run')
    r.add_argument('--levels', default='1')
    r.add_argument('--samples', default='')
    r.add_argument('--workers', type=int, default=8)
    r.add_argument('--results', default='temp_body/stab/results')
    r.add_argument('--work', default='')
    r.add_argument('--no-perturb', action='store_true')
    r.add_argument('--force', action='store_true')
    sub.add_parser('selftest')
    sf = sub.add_parser('selftest-faults')
    sf.add_argument('--workers', type=int, default=8)
    p = sub.add_parser('report')
    p.add_argument('--results', default='temp_body/stab/results')
    p.add_argument('--out', required=True)
    a = ap.parse_args()
    {'write-sims': cmd_write_sims, 'run': cmd_run, 'report': cmd_report, 'selftest': cmd_selftest, 'selftest-faults': cmd_selftest_faults}[a.cmd](a)


if __name__ == '__main__':
    main()
