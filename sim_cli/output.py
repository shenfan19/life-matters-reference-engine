"""File output utilities: log setup and CSV writing (sim time-series + opt Pareto front)."""

import csv
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List

logger = logging.getLogger('lm_cli')

_OUTPUT_DIR_NAME = 'output'


def setup_output_dir(project_root: Path, model_stem: str, output_dir: str = None) -> Path:
    """Resolve and create <output_dir or 'output'>/<model_stem>/."""
    if output_dir:
        base = Path(output_dir)
        if not base.is_absolute():
            base = project_root / base
    else:
        base = project_root / _OUTPUT_DIR_NAME
    out = base / model_stem
    out.mkdir(parents=True, exist_ok=True)
    return out


def make_stem(model_path: Path, mode: str) -> str:
    """e.g. masld_insulin_a7_s2_2026-06-01_14-23-05_sim"""
    ts = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    return f'{model_path.stem}_{ts}_{mode}'


class _CliFilter(logging.Filter):
    """Pass lm_cli at INFO+, everything else only at WARNING+."""
    def filter(self, record: logging.LogRecord) -> bool:
        if record.name.startswith('lm_cli'):
            return True
        return record.levelno >= logging.WARNING


def setup_logging(log_path: Path) -> None:
    fh = logging.FileHandler(log_path, encoding='utf-8')
    fh.setLevel(logging.INFO)
    fh.setFormatter(logging.Formatter('%(asctime)s  %(levelname)-7s  %(message)s',
                                      datefmt='%H:%M:%S'))
    fh.addFilter(_CliFilter())
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(fh)


def write_opt_csv(pareto_front: List[Dict], objectives: List[Dict], out_path: Path,
                   x_labels: List[str] = None) -> None:
    """Write Pareto front as CSV: one row per solution, x cols then f cols.

    x_labels (if provided and length-matched) names each decision-variable column
    after its optimizer.startpoint.regimens label instead of the generic x0,x1,...
    """
    if not pareto_front:
        return
    n_x = len(pareto_front[0].get('x', []))
    obj_names = [o.get('variable', f'f{i}') for i, o in enumerate(objectives)]
    x_headers = x_labels if x_labels and len(x_labels) == n_x else [f'x{i}' for i in range(n_x)]
    headers = x_headers + obj_names

    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(headers)
        for sol in pareto_front:
            w.writerow(sol.get('x', []) + sol.get('f', []))
    logger.info(f'Pareto CSV: {out_path.name}  ({len(pareto_front)} solutions)')


