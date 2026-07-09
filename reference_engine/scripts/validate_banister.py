"""models/test/test_plan.md §2 Protocol V1: compare the LM engine's Euler
integration against the Banister two-compartment model's closed-form
analytical solution under constant load, and report the max relative error.

Usage (from repo root or reference_engine/):
    python reference_engine/scripts/validate_banister.py

Uses models/test/valid/test_banister_v1_analytical.yaml — standalone from
banister_validation.yaml (the paper's model), whose training_load values are
mid-dispute (see its metadata.todo) and which runs at hour granularity. This
fixture uses the protocol's own day-granularity step_size and the standard
Morton 1990 parameters, so the check doesn't depend on that open question.
"""

import csv
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from cli.runner import run_sim  # noqa: E402

MODEL_PATH = ROOT / 'models' / 'test' / 'valid' / 'test_banister_v1_analytical.yaml'
OUT_DIR = ROOT / 'output' / 'validate_banister'

# Morton 1990 Table 1 standard parameters (see test_plan.md §2).
G, H = 1.0, 2.0
K1 = 1 / 45  # fitness decay, per day
K2 = 1 / 15  # fatigue decay, per day
P0 = 494.0
W = 50.0  # constant training load, AU/day

PASS_THRESHOLD_PCT = 2.0


def analytical(t_days: float):
    a = G * W / K1 * (1 - math.exp(-K1 * t_days))
    f = H * W / K2 * (1 - math.exp(-K2 * t_days))
    p = P0 + a - f
    return a, f, p


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = OUT_DIR / 'v1.csv'
    written = run_sim(MODEL_PATH, ROOT, csv_path)
    if not written:
        print('FAIL: simulation did not run')
        return 1

    with open(OUT_DIR / written[0], newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    max_perf_err, max_perf_day = 0.0, None
    max_fitness_err, max_fatigue_err = 0.0, 0.0
    print(f"{'day':>4} {'fitness(LM)':>14} {'fitness(analytic)':>18} "
          f"{'performance(LM)':>16} {'performance(analytic)':>22} {'perf_err%':>10}")
    for row in rows:
        day = int(row['step'])  # step_unit=day, step_size=1day -> step index == day count
        a_lm, f_lm, p_lm = float(row['fitness']), float(row['fatigue']), float(row['performance'])
        a_an, f_an, p_an = analytical(day)
        perf_err = abs(p_lm - p_an) / abs(p_an) * 100 if p_an else 0.0
        fitness_err = abs(a_lm - a_an) / abs(a_an) * 100 if a_an else 0.0
        fatigue_err = abs(f_lm - f_an) / abs(f_an) * 100 if f_an else 0.0
        if day in (1, 7, 14, 30, 60):
            print(f"{day:>4} {a_lm:>14.2f} {a_an:>18.2f} {p_lm:>16.2f} {p_an:>22.2f} {perf_err:>9.2f}%")
        if perf_err > max_perf_err:
            max_perf_err, max_perf_day = perf_err, day
        max_fitness_err = max(max_fitness_err, fitness_err)
        max_fatigue_err = max(max_fatigue_err, fatigue_err)

    verdict = 'PASS' if max_perf_err < PASS_THRESHOLD_PCT else 'FAIL'
    print(f"\nMax performance error: {max_perf_err:.2f}% at day {max_perf_day} "
          f"(threshold: <{PASS_THRESHOLD_PCT}%) — {verdict} (protocol V1 as literally specified: error on p(t))")
    print(f"Max fitness error (state variable itself): {max_fitness_err:.2f}%")
    print(f"Max fatigue error (state variable itself): {max_fatigue_err:.2f}%")
    if verdict == 'FAIL':
        print(
            "\nNote: performance = p0 + fitness - fatigue is a difference of two "
            "comparable-magnitude growing quantities; relative error on it amplifies "
            "wherever p(t) passes near zero, independent of how accurate the underlying "
            "Euler integration of fitness/fatigue (the actual state variables) is. See "
            "fitness/fatigue max error above for the integrator's real accuracy."
        )
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
