"""test_verification/verification_report.md §2 Protocol V2 + step_size heuristic: run the
Banister two-compartment model at 6 step sizes (1day/12h/6h/3h/1h/30min), compare
against the closed-form analytical solution at 4 checkpoint days (7/14/30/60) for
all three reported variables (fitness, fatigue, performance), and check the
tau_min/10 step_size heuristic (see verification_report.md "step_size 选取的通用
启发式") against the resulting error grid.

Usage (from repo root or reference_engine/):
    python reference_engine/scripts/validate_banister_step_grid.py

Reuses the physics/parameters from validate_banister.py (Protocol V1's single
day-step run) rather than duplicating them — this script is Protocol V2's
multi-step-size companion over the same closed-form solution.
"""

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from cli.runner import run_sim  # noqa: E402
from validate_banister import analytical  # noqa: E402

MODEL_DIR = ROOT / 'models' / 'test_fixtures' / 'valid'
OUT_DIR = ROOT / 'output' / 'validate_banister_step_grid'

# step label -> fixture filename; all six share the same 60-day date_range and
# physical parameters, differing only in simulation.step_size (2026-07-15 decision,
# see each fixture's metadata.description).
STEP_FILES = {
    '24h':   'test_valid_banister_v1_analytical.yaml',
    '12h':   'test_valid_banister_v1_step_12h.yaml',
    '6h':    'test_valid_banister_v1_step_6h.yaml',
    '3h':    'test_valid_banister_v1_step_3h.yaml',
    '1h':    'test_valid_banister_v1_step_1h.yaml',
    '30min': 'test_valid_banister_v1_step_30min.yaml',
}
STEP_HOURS = {'24h': 24, '12h': 12, '6h': 6, '3h': 3, '1h': 1, '30min': 0.5}
CHECKPOINT_DAYS = [7, 14, 30, 60]
PASS_THRESHOLD_PCT = 2.0

# tau_min for this fixture: min(training_load's regimen window, fastest state
# time constant). training_load runs 00:00-24:00 (24h window); fatigue's 1/k2 =
# 15 days = 360h is far looser. So tau_min = 24h here, and the heuristic
# recommends step_size <= tau_min / 10 = 2.4h.
TAU_MIN_HOURS = 24.0
HEURISTIC_DIVISOR = 10.0


def relative_error_pct(lm_value: float, analytical_value: float) -> float:
    return abs(lm_value - analytical_value) / abs(analytical_value) * 100 if analytical_value else 0.0


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    recommended_step_h = TAU_MIN_HOURS / HEURISTIC_DIVISOR
    print(f"tau_min = {TAU_MIN_HOURS:.1f}h (training_load window) -> heuristic step_size <= {recommended_step_h:.2f}h\n")

    header = f"{'step':>6} {'day':>4} {'fitness_err%':>13} {'fatigue_err%':>13} {'perf_err%':>10}  heuristic  all<2%"
    print(header)

    any_heuristic_fail = False
    for label, fname in STEP_FILES.items():
        model_path = MODEL_DIR / fname
        csv_path = OUT_DIR / f'{label}.csv'
        written = run_sim(model_path, ROOT, csv_path)
        if not written:
            print(f'FAIL: simulation did not run for {label}')
            return 1
        with open(OUT_DIR / written[0], newline='', encoding='utf-8') as f:
            rows = list(csv.DictReader(f))

        satisfies_heuristic = STEP_HOURS[label] <= recommended_step_h
        for day in CHECKPOINT_DAYS:
            target_sec = day * 86400
            best = min(rows, key=lambda r: abs(float(r['time']) - target_sec))
            a_lm, f_lm, p_lm = float(best['fitness']), float(best['fatigue']), float(best['performance'])
            a_an, f_an, p_an = analytical(day)
            fit_err = relative_error_pct(a_lm, a_an)
            fat_err = relative_error_pct(f_lm, f_an)
            perf_err = relative_error_pct(p_lm, p_an)
            all_pass = perf_err < PASS_THRESHOLD_PCT and fit_err < PASS_THRESHOLD_PCT and fat_err < PASS_THRESHOLD_PCT
            if satisfies_heuristic and not all_pass:
                any_heuristic_fail = True
            print(f"{label:>6} {day:>4} {fit_err:>13.3f} {fat_err:>13.3f} {perf_err:>10.3f}  "
                  f"{'yes' if satisfies_heuristic else 'no':>9}  {'PASS' if all_pass else 'FAIL':>6}")

    print()
    if any_heuristic_fail:
        print('FAIL: at least one step_size satisfying the heuristic still exceeded the 2% threshold '
              'somewhere in the grid — the tau_min/10 divisor is too loose for this fixture.')
        return 1
    print('PASS: every step_size satisfying the heuristic (step_size <= tau_min/10) stayed under the 2% '
          'threshold for fitness/fatigue/performance across all four checkpoint days.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
