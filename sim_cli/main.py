"""Life Matters CLI — batch simulation and optimization.

Usage:
  python sim_cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --sim
  python sim_cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt
  python sim_cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt --continue
  python sim_cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt --continue 20260606_1122

Outputs go to output/ at the project root:
  <model>_<YYYYMMDD_HHMM>_sim.csv    (simulation time-series)
  <model>_<YYYYMMDD_HHMM>_opt.csv    (Pareto front table; also saved incrementally per gen)
  <model>_<YYYYMMDD_HHMM>_<mode>.log
"""

import argparse
import sys
from pathlib import Path


def _project_root() -> Path:
    """Resolve project root whether running as script or frozen exe."""
    if getattr(sys, 'frozen', False):          # PyInstaller exe
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(
        prog='lm-sim',
        description='Life Matters CLI — run simulation or optimization from a model YAML.',
    )
    parser.add_argument('model', help='Path to model YAML file')
    parser.add_argument('--sim', action='store_true', help='Run simulation')
    parser.add_argument('--opt', action='store_true', help='Run optimizer (NSGA-II)')
    parser.add_argument(
        '--continue', dest='warm', nargs='?', const=True, default=False,
        metavar='TIMESTAMP',
        help=(
            'Warm-start optimizer. No argument: use stored results in model YAML. '
            'With TIMESTAMP (e.g. 20260606_1122): load output/<model>_<TIMESTAMP>_opt.csv.'
        ),
    )
    args = parser.parse_args()

    if not args.sim and not args.opt:
        parser.print_help()
        sys.exit(0)

    model_path = Path(args.model).resolve()
    if not model_path.exists():
        print(f'Error: model not found: {model_path}')
        sys.exit(1)

    root = _project_root()

    from output import setup_output_dir, make_stem, setup_logging
    out_dir = setup_output_dir(root)
    mode = 'sim' if args.sim else 'opt'
    stem = make_stem(model_path, mode)
    log_path = out_dir / f'{stem}.log'
    setup_logging(log_path)

    import logging
    logger = logging.getLogger('lm_cli')
    logger.info(f'lm-sim  model={model_path.name}  mode={mode}')
    print(f'\n  Life Matters CLI')
    print(f'  Model : {model_path.name}')
    print(f'  Mode  : {mode}')
    print(f'  Log   : {log_path.name}\n')

    from runner import run_sim, run_opt

    if args.sim:
        csv_path = out_dir / f'{stem}.csv'
        ok = run_sim(model_path, root, csv_path)
        if ok:
            print(f'\n  Done → {csv_path.name}')
        else:
            print('\n  Simulation failed. Check log for details.')
            sys.exit(1)

    elif args.opt:
        from progress import ProgressTracker
        tracker = ProgressTracker()
        tracker.start()

        # Resolve warm-start source
        if args.warm is False:
            warm_start = False
        elif args.warm is True:
            warm_start = True
        else:
            ts = str(args.warm)
            warm_csv = out_dir / f'{model_path.stem}_{ts}_opt.csv'
            if not warm_csv.exists():
                print(f'  Error: warm-start CSV not found: {warm_csv.name}')
                sys.exit(1)
            warm_start = warm_csv
            print(f'  Warm CSV : {warm_csv.name}\n')

        csv_path  = out_dir / f'{stem}.csv'
        result = run_opt(model_path, root, warm_start=warm_start,
                         opt_callback=tracker.make_opt_callback(),
                         incremental_csv=csv_path)

        if result is None:
            print('\n  Optimization failed. Check log for details.')
            sys.exit(1)

        from output import write_opt_csv
        objectives = result.get('objectives', [])
        write_opt_csv(result.get('pareto_front', []), objectives, csv_path)

        stopped = result.get('stopped', False)
        tag = '  (stopped early — resume with --continue)' if stopped else ''
        print(f'\n  Done{tag}')
        print(f'  → {csv_path.name}')


if __name__ == '__main__':
    main()
