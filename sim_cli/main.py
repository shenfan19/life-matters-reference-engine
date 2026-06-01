"""Life Matters CLI — batch simulation and optimization.

Usage:
  python sim_cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --sim
  python sim_cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt
  python sim_cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt --continue

Outputs go to output/ at the project root:
  <model>_<YYYYMMDD_HHMM>_sim.csv
  <model>_<YYYYMMDD_HHMM>_opt.yaml   (full model + optimizer.results)
  <model>_<YYYYMMDD_HHMM>_opt.csv    (Pareto front table)
  <model>_<YYYYMMDD_HHMM>_<mode>_log.txt
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
    parser.add_argument('--continue', dest='warm', action='store_true',
                        help='Warm-start optimizer from stored results in model YAML')
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
    log_path = out_dir / f'{stem}_log.txt'
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

        result = run_opt(model_path, root, warm_start=args.warm,
                         opt_callback=tracker.make_opt_callback())

        if result is None:
            print('\n  Optimization failed. Check log for details.')
            sys.exit(1)

        from output import write_opt_csv, write_opt_yaml
        objectives = result.get('objectives', [])
        yaml_path = out_dir / f'{stem}.yaml'
        csv_path  = out_dir / f'{stem}.csv'
        write_opt_yaml(model_path, result, objectives, yaml_path)
        write_opt_csv(result.get('pareto_front', []), objectives, csv_path)

        stopped = result.get('stopped', False)
        tag = '  (stopped early — resume with --continue)' if stopped else ''
        print(f'\n  Done{tag}')
        print(f'  → {yaml_path.name}')
        print(f'  → {csv_path.name}')


if __name__ == '__main__':
    main()
