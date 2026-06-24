"""Life Matters CLI — simulation and optimization for a single model.

Usage:
  python cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml             # sim + opt
  python cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --sim-only
  python cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt-only
  python cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt-only --opt-continue
  python cli/main.py models/papers/s2/masld_insulin_a7_s2.yaml --opt-only --opt-continue output/2026-06-06_13-00-34/masld_insulin_a7_s2_2026-06-06_13-00-34_opt.csv

Monte Carlo run count/seed are not CLI flags — they come from the model's own
`simulation.mc.runs`/`simulation.mc.seed` (model.md spec), same as how
optimizer.mc.* already works. Edit the YAML to change them.

Outputs go to output/<model>/ at the project root (override with --output-dir):
  <model>_<YYYY-MM-DD_HH-MM-SS>_sim.csv    (simulation time-series)
  <model>_<YYYY-MM-DD_HH-MM-SS>_opt.csv    (Pareto front table; also saved incrementally per gen)
  <model>_<YYYY-MM-DD_HH-MM-SS>_<mode>.log
"""

import argparse
import sys
from pathlib import Path


def _project_root() -> Path:
    """Resolve project root whether running as script or frozen exe."""
    if getattr(sys, 'frozen', False):          # PyInstaller exe
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


def _shared_paths(root: Path):
    """Import the GUI/CLI-shared path config (reference_engine/src/paths.py)."""
    s = str(root)
    if s not in sys.path:
        sys.path.insert(0, s)
    from reference_engine.src import paths
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(
        prog='lm-sim',
        description='Life Matters CLI — run simulation and/or optimization from a model YAML.',
    )
    parser.add_argument('model', help='Path to model YAML file')
    step_group = parser.add_mutually_exclusive_group()
    step_group.add_argument('--sim-only', action='store_true',
                             help='Only run simulation, skip the optimizer. '
                                  'Writes one CSV per simulation.plans entry '
                                  '(<stem>__<plan_id>.csv).')
    step_group.add_argument('--opt-only', action='store_true',
                             help='Only run the optimizer (NSGA-II), skip simulation.')
    parser.add_argument(
        '--opt-continue', dest='warm', nargs='?', const=True, default=False,
        metavar='PATH',
        help=(
            'Warm-start the optimizer (requires the opt step to run, i.e. not --sim-only). '
            'No argument: use stored results in model YAML. '
            'PATH: path to a previous _opt.csv file (relative to project root or absolute).'
        ),
    )
    parser.add_argument(
        '--output-dir', metavar='PATH', default=None,
        help=(
            'Base output directory (relative to project root, or absolute). '
            'Default: output/. Results are written to <output-dir>/<model-stem>/.'
        ),
    )
    args = parser.parse_args()

    run_sim_step = not args.opt_only
    run_opt_step = not args.sim_only

    if args.warm is not False and not run_opt_step:
        print('Error: --opt-continue requires the optimizer step (remove --sim-only).')
        sys.exit(1)

    model_path = Path(args.model).resolve()
    if not model_path.exists():
        print(f'Error: model not found: {model_path}')
        sys.exit(1)

    from runner import model_declares_step

    # Default invocation (neither --sim-only nor --opt-only): a model not
    # declaring a step is by design (sim-only/opt-only model), not a failure —
    # skip it quietly instead of attempting and failing. An explicit
    # --sim-only/--opt-only/--opt-continue still fails loudly if the step is
    # missing (the user asked for it specifically).
    if run_sim_step and run_opt_step:
        if not model_declares_step(model_path, 'sim'):
            run_sim_step = False
            print('  (model has no simulation:/simulator: block — skipping sim step)')
        if not model_declares_step(model_path, 'opt') and args.warm is False:
            run_opt_step = False
            print('  (model has no optimizer: block — skipping opt step)')
        if not run_sim_step and not run_opt_step:
            print('Error: model declares neither simulation:/simulator: nor optimizer: — nothing to run.')
            sys.exit(1)

    root = _project_root()
    shared_paths = _shared_paths(root)

    import logging
    from output import setup_output_dir, make_stem, setup_logging
    out_dir = setup_output_dir(root, model_path.stem, args.output_dir,
                                default_output_dir=shared_paths.OUTPUT_DIR)

    def start_step(mode: str) -> Path:
        """Point logging at a fresh per-step log file, print the run header, return the CSV path."""
        for h in list(logging.getLogger().handlers):
            logging.getLogger().removeHandler(h)
            if isinstance(h, logging.FileHandler):
                h.close()
        stem = make_stem(model_path, mode)
        log_path = out_dir / f'{stem}.log'
        setup_logging(log_path)
        logging.getLogger('lm_cli').info(f'lm-sim  model={model_path.name}  mode={mode}')
        print(f'\n  Life Matters CLI')
        print(f'  Model : {model_path.name}')
        print(f'  Mode  : {mode}')
        print(f'  Log   : {log_path.name}\n')
        return out_dir / f'{stem}.csv'

    from runner import run_sim, run_opt

    if run_sim_step:
        csv_path = start_step('sim')
        written = run_sim(model_path, root, csv_path)
        if written:
            print('\n  Done →')
            for name_ in written:
                print(f'    {name_}')
        else:
            print('\n  Simulation failed. Check log for details.')
            sys.exit(1)

    if run_opt_step:
        csv_path = start_step('opt')

        from progress import ProgressTracker
        tracker = ProgressTracker()
        tracker.start()

        # Resolve warm-start source
        if args.warm is False:
            warm_start = False
        elif args.warm is True:
            warm_start = True
        else:
            warm_csv = Path(str(args.warm))
            if not warm_csv.is_absolute():
                warm_csv = root / warm_csv
            if not warm_csv.exists():
                print(f'  Error: warm-start CSV not found: {warm_csv}')
                sys.exit(1)
            warm_start = warm_csv
            print(f'  Warm CSV : {warm_csv.name}\n')

        result = run_opt(model_path, root, warm_start=warm_start,
                         opt_callback=tracker.make_opt_callback(),
                         incremental_csv=csv_path)

        if result is None:
            print('\n  Optimization failed. Check log for details.')
            sys.exit(1)

        from output import write_opt_csv
        objectives = result.get('objectives', [])
        write_opt_csv(result.get('pareto_front', []), objectives, csv_path,
                      x_labels=result.get('decision_var_labels'))

        stopped = result.get('stopped', False)
        tag = '  (stopped early — resume with --opt-continue)' if stopped else ''
        print(f'\n  Done{tag}')
        print(f'  → {csv_path.name}')


if __name__ == '__main__':
    main()
