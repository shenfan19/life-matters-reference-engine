"""File output utilities: log setup and CSV writing (sim time-series + opt Pareto front)."""

import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List

logger = logging.getLogger('lm_cli')

def setup_output_dir(project_root: Path, model_stem: str, output_dir: str = None,
                      default_output_dir: Path = None) -> Path:
    """Resolve and create <output_dir or default_output_dir>/<model_stem>/.

    default_output_dir is the shared OUTPUT_DIR from sim_engine/src/paths.py
    (falls back to <project_root>/output if the caller doesn't pass one, e.g. tests).
    """
    if output_dir:
        base = Path(output_dir)
        if not base.is_absolute():
            base = project_root / base
    else:
        base = default_output_dir if default_output_dir is not None else project_root / 'output'
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
    """Write the Pareto front CSV (sim_engine/src/csv_export.py — shared with the
    GUI backend) and log it to the CLI's own log file.
    """
    from sim_engine.src.csv_export import write_opt_csv as _write_opt_csv
    _write_opt_csv(pareto_front, objectives, out_path, x_labels=x_labels)
    if pareto_front:
        logger.info(f'Pareto CSV: {out_path.name}  ({len(pareto_front)} solutions)')


