"""Behavior snapshot: a hash of the full output of fixed simulation, Monte Carlo and optimization cases.

Runs a fixed set of sim, MC and opt cases through the public engine entry points and records, per
case, a sha256 of the full trajectory (CSV bytes) or of the optimizer result. Two snapshots taken
before and after a refactor must be identical, which is the acceptance test for a refactor that claims zero
behavior change. golden.json was recorded before the solver, input signal and trajectory refactor (ADR 0163)
and the current code reproduces it. Replace it only when a change is meant to alter results.

    python behavior_snapshot.py snapshot OUT.json
    python behavior_snapshot.py compare BEFORE.json AFTER.json
"""

import hashlib
import json
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402
from reference_engine.src.optimizer_engine import run_optimizer  # noqa: E402

MODELS = ROOT / 'models'

SIM_MODELS = [
    'test_fixtures/valid/test_valid_plans',
    'test_fixtures/valid/test_valid_sustained_mode',
    'test_fixtures/valid/test_valid_schedules_phased',
    'test_fixtures/valid/test_valid_pulse_reset_bounds_floor',
    'test_fixtures/valid/test_valid_banister_v1_step_6h',
    'test_fixtures/valid/test_valid_step_hour',
    'test_fixtures/valid/test_valid_import_top',
    'papers/lm_format/ckd_protein/ckd_protein_sim',
    'papers/s2_masld_insulin/masld_insulin/masld_insulin_sim',
    'papers/s3_systems_science_paradigm/sleep_schedule/sleep_schedule_sim',
]
MC_MODELS = [
    ('test_fixtures/valid/test_valid_mc_distributions', 'low_dose'),
]
OPT_MODELS = [
    'test_fixtures/valid/test_valid_opt_t1_single',
    'test_fixtures/valid/test_valid_opt_t1_pareto',
    'test_fixtures/valid/test_valid_opt_t2',
    'test_fixtures/valid/test_valid_opt_t3',
    'test_fixtures/valid/test_valid_opt_t4',
    'test_fixtures/valid/test_valid_opt_inner_mc',
    'test_fixtures/valid/test_valid_opt_metric_min',
]
MAX_PLANS_PER_MODEL = 4


def _engine() -> ReferenceEngine:
    return ReferenceEngine(models_directory=str(MODELS))


def _hours(sim: dict) -> float:
    s, e = sim.get('start_date'), sim.get('end_date')
    return max(1.0, (date.fromisoformat(str(e)) - date.fromisoformat(str(s))).days * 24.0)


def _sha_file(path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _sha_json(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=repr).encode()).hexdigest()


def snapshot_sim(tmp: Path) -> dict:
    out = {}
    for name in SIM_MODELS:
        eng = _engine()
        if not eng.load_models([name]):
            out[name] = {'error': 'load failed'}
            continue
        plans = list(eng.current_model.plans.keys())[:MAX_PLANS_PER_MODEL] or [None]
        hours = _hours(eng.current_model.simulator)
        for plan in plans:
            e = _engine()
            e.load_models([name])
            if plan is not None:
                e.current_model.schedule_entries = e.current_model.plans.get(plan, [])
            csv_path = tmp / f'{abs(hash((name, plan)))}.csv'
            res = e.run_simulation(None, hours, output_path=str(csv_path))
            key = f'sim::{name}::{plan}'
            out[key] = (
                {'csv_sha': _sha_file(csv_path), 'state_sha': _sha_json(res['state']), 'steps': res['steps']}
                if res.get('success') else {'error': res.get('error')}
            )
    return out


def snapshot_mc(tmp: Path) -> dict:
    out = {}
    for name, plan in MC_MODELS:
        e = _engine()
        e.load_models([name])
        e.current_model.schedule_entries = e.current_model.plans.get(plan, [])
        hours = _hours(e.current_model.simulator)
        paths = {}

        def path_fn(i, _paths=paths):
            p = tmp / f'mc_{abs(hash(name))}_{i}.csv'
            _paths[i] = p
            return str(p)

        res = e.run_simulation_mc(None, hours, n_runs=3, seed=19, output_path_fn=path_fn)
        key = f'mc::{name}::{plan}'
        out[key] = (
            {'runs': [{'csv_sha': _sha_file(paths[i]), 'seed': r['seed'], 'state_sha': _sha_json(r['state'])}
                      for i, r in enumerate(res['runs'])]}
            if res.get('success') else {'error': res.get('error')}
        )
    return out


def snapshot_opt() -> dict:
    out = {}
    for name in OPT_MODELS:
        t0 = time.time()
        res = run_optimizer(_engine(), name, optimizer_override={'warm_start': []},
                            progress_callback=lambda entry: False)
        key = f'opt::{name}'
        if res.get('success'):
            out[key] = {
                'best_x_sha': _sha_json(res.get('best_x')),
                'best_f_sha': _sha_json(res.get('best_f')),
                'front_sha': _sha_json(res.get('pareto_front')),
                'n_solutions': res.get('n_solutions'),
                'seconds': round(time.time() - t0, 1),
            }
        else:
            out[key] = {'error': res.get('error')}
    return out


def main(argv):
    if len(argv) >= 3 and argv[1] == 'snapshot':
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            snap = {}
            snap.update(snapshot_sim(tmp))
            snap.update(snapshot_mc(tmp))
            snap.update(snapshot_opt())
        Path(argv[2]).write_text(json.dumps(snap, indent=1, sort_keys=True), encoding='utf-8')
        errs = [k for k, v in snap.items() if 'error' in v]
        print(f'{len(snap)} cases written to {argv[2]}; {len(errs)} with error: {errs}')
        return 0
    if len(argv) >= 4 and argv[1] == 'compare':
        a = json.loads(Path(argv[2]).read_text(encoding='utf-8'))
        b = json.loads(Path(argv[3]).read_text(encoding='utf-8'))
        strip = lambda d: {k: {kk: vv for kk, vv in v.items() if kk != 'seconds'} for k, v in d.items()}
        a, b = strip(a), strip(b)
        diff = [k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]
        print(f'{len(a)} vs {len(b)} cases; {len(diff)} differ')
        for k in diff:
            print('  DIFF', k)
        return 1 if diff else 0
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
