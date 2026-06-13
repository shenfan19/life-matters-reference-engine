"""Life Matters CLI batch runner — Python port of script/test_batch.sh.

Iterates over a folder of model YAMLs, runs --sim and/or --opt for each one
in-process (no subprocess/stdout parsing), and writes a batch_report.md
summarizing PASS/FAIL.

Usage (no-arg invocation prints --help instead of running with defaults):
  python sim_cli/batch.py --folder models/papers --sim-only
  python sim_cli/batch.py --no-skip --all-plans --output-dir /tmp/lm_out

Each model's results go to <output-dir>/<batch-timestamp>/<model-stem>/,
following the same layout main.py uses for a single run.
"""

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

logger = logging.getLogger('lm_cli')


def _project_root() -> Path:
    if getattr(sys, 'frozen', False):          # PyInstaller exe
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


def _resolve(root: Path, path_str: str) -> Path:
    p = Path(path_str)
    return p if p.is_absolute() else root / p


class _ErrorCapture(logging.Handler):
    """Collects ERROR-level log messages for the report's error summary."""

    def __init__(self):
        super().__init__(level=logging.ERROR)
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def _reset_logging(log_path: Path, setup_logging) -> _ErrorCapture:
    """Replace all handlers on the root logger with a fresh file handler + error capture."""
    root_logger = logging.getLogger()
    for h in list(root_logger.handlers):
        root_logger.removeHandler(h)
        if isinstance(h, logging.FileHandler):
            h.close()
    setup_logging(log_path)
    capture = _ErrorCapture()
    root_logger.addHandler(capture)
    return capture


def main() -> None:
    parser = argparse.ArgumentParser(
        prog='lm-sim-batch',
        description='Run --sim and/or --opt for every model YAML in a folder, '
                     'writing a batch_report.md.',
    )
    parser.add_argument('--folder', default='../b_lm_model/models/references',
                         help='Folder to scan for *.yaml models (recursive). '
                              'Default: ../b_lm_model/models/references')
    parser.add_argument('--output-dir', default='../b_lm_model/output',
                         help='Where the timestamped batch directory is created. '
                              'Default: ../b_lm_model/output')
    step_group = parser.add_mutually_exclusive_group()
    step_group.add_argument('--sim-only', action='store_true',
                             help='Only run --sim, skip the optimizer.')
    step_group.add_argument('--opt-only', action='store_true',
                             help='Only run --opt, skip the simulation.')
    parser.add_argument('--no-skip', action='store_true',
                         help='Test all *.yaml files. Default: only files with '
                              '_nosim or _noopt in the name (repair-queue mode).')
    parser.add_argument('--all-plans', action='store_true',
                         help='Pass --all-plans for --sim (one CSV per simulation.plans entry).')

    if len(sys.argv) == 1:
        parser.print_help()
        return

    args = parser.parse_args()

    root = _project_root()
    folder = _resolve(root, args.folder)
    output_dir = _resolve(root, args.output_dir)

    if args.no_skip:
        yamls = sorted(folder.rglob('*.yaml'))
    else:
        yamls = sorted(p for p in folder.rglob('*.yaml')
                        if '_nosim' in p.stem or '_noopt' in p.stem)
    total = len(yamls)

    run_sim_step = not args.opt_only
    run_opt_step = not args.sim_only

    batch_stamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    batch_dir = output_dir / batch_stamp
    batch_dir.mkdir(parents=True, exist_ok=True)
    report_path = batch_dir / 'batch_report.md'

    steps = []
    if run_sim_step:
        steps.append('sim')
    if run_opt_step:
        steps.append('opt')

    print('=' * 60)
    print('  Life Matters 批量模型测试')
    print(f'  文件夹：{folder}')
    print(f'  模型数：{total}')
    print(f'  运行步骤：{" + ".join(steps)}')
    print(f'  All plans：{args.all_plans}')
    if not args.no_skip:
        print('  过滤：仅 _nosim/_noopt')
    print('=' * 60)
    print()

    report_lines = [
        '# Batch Test Report',
        '',
        f'- 时间：{batch_stamp}',
        f'- 文件夹：`{folder}`',
        f'- 模型数：{total}',
        '',
        '| # | 模型 | Sim | Opt | 错误摘要 |',
        '|---|------|-----|-----|---------|',
    ]

    from output import setup_output_dir, make_stem, setup_logging, write_opt_csv
    from runner import run_sim, run_sim_all_plans, run_opt

    def _opt_callback(entry: dict) -> bool:
        return False  # never stop early in batch mode

    pass_count = 0
    fail_count = 0
    fail_rows = []

    for idx, yaml_path in enumerate(yamls, 1):
        model_name = yaml_path.stem
        print(f'[{idx}/{total}] {yaml_path}')

        sim_status, sim_err, sim_csvs = '⏭ SKIP', '', []
        opt_status, opt_err, opt_csv = '⏭ SKIP', '', ''

        out_dir = setup_output_dir(root, model_name, str(batch_dir))

        # ── Sim ──────────────────────────────────────────────────────────────
        if run_sim_step:
            stem = make_stem(yaml_path, 'sim')
            capture = _reset_logging(out_dir / f'{stem}.log', setup_logging)
            csv_path = out_dir / f'{stem}.csv'

            try:
                if args.all_plans:
                    written = run_sim_all_plans(yaml_path, root, csv_path)
                    ok, sim_csvs = bool(written), (written or [])
                else:
                    ok = run_sim(yaml_path, root, csv_path)
                    sim_csvs = [csv_path.name] if ok else []
            except Exception as e:
                logger.exception('Simulation crashed')
                ok = False

            if ok:
                sim_status = '✓ PASS'
                print(f'    -> sim      PASS -> {" ".join(sim_csvs)}')
            else:
                sim_status = '✗ FAIL'
                sim_err = capture.messages[-1] if capture.messages else ''
                print(f'    -> sim      FAIL -- {sim_err}')

        # ── Opt ──────────────────────────────────────────────────────────────
        if run_opt_step:
            stem_opt = make_stem(yaml_path, 'opt')
            capture = _reset_logging(out_dir / f'{stem_opt}.log', setup_logging)
            csv_path_opt = out_dir / f'{stem_opt}.csv'

            try:
                result = run_opt(yaml_path, root, warm_start=False,
                                  opt_callback=_opt_callback, incremental_csv=csv_path_opt)
            except Exception as e:
                logger.exception('Optimizer crashed')
                result = None

            if result is not None:
                write_opt_csv(result.get('pareto_front', []), result.get('objectives', []), csv_path_opt)
                opt_status = '✓ PASS'
                opt_csv = csv_path_opt.name
                print(f'    -> opt      PASS -> {opt_csv}')
            else:
                opt_status = '✗ FAIL'
                opt_err = capture.messages[-1] if capture.messages else ''
                print(f'    -> opt      FAIL -- {opt_err}')

        if '✗ FAIL' in (sim_status, opt_status):
            fail_count += 1
        else:
            pass_count += 1

        # ── Report row ───────────────────────────────────────────────────────
        sim_cell = sim_status
        for csv in sim_csvs:
            sim_cell += f'<br>[{csv}](./{model_name}/{csv})'

        opt_cell = opt_status
        if opt_csv:
            opt_cell = f'[{opt_status}](./{model_name}/{opt_csv})'

        err_cell = sim_err
        if opt_err:
            err_cell = f'{err_cell} / {opt_err}' if err_cell else opt_err

        report_lines.append(f'| {idx} | `{model_name}` | {sim_cell} | {opt_cell} | {err_cell} |')

        if sim_status == '✗ FAIL' or opt_status == '✗ FAIL':
            fail_rows.append(f'{idx}. {model_name}  sim={sim_status} opt={opt_status}')

        print()

    report_lines += [
        '',
        '## 汇总',
        '',
        f'- 通过：{pass_count} / {total}',
        f'- 失败：{fail_count} / {total}',
    ]
    report_path.write_text('\n'.join(report_lines) + '\n', encoding='utf-8')

    print('=' * 60)
    print(f'  完成：{pass_count} PASS，{fail_count} FAIL（共 {total} 个模型）')
    print(f'  报告：{report_path}')
    print('=' * 60)

    if fail_rows:
        print()
        print('  失败列表：')
        for row in fail_rows:
            print(f'    {row}')


if __name__ == '__main__':
    main()
