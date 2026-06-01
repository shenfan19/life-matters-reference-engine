"""File output utilities: log setup, CSV (Pareto front), YAML (full model + results)."""

import csv
import logging
import yaml
from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger('lm_cli')

_OUTPUT_DIR_NAME = 'output'


def setup_output_dir(project_root: Path) -> Path:
    out = project_root / _OUTPUT_DIR_NAME
    out.mkdir(exist_ok=True)
    return out


def make_stem(model_path: Path, mode: str) -> str:
    """e.g. masld_insulin_a7_s2_20260601_1423_sim"""
    ts = datetime.now().strftime('%Y%m%d_%H%M')
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


def write_opt_csv(pareto_front: List[Dict], objectives: List[Dict], out_path: Path) -> None:
    """Write Pareto front as CSV: one row per solution, x cols then f cols."""
    if not pareto_front:
        return
    n_x = len(pareto_front[0].get('x', []))
    obj_names = [o.get('variable', f'f{i}') for i, o in enumerate(objectives)]
    headers = [f'x{i}' for i in range(n_x)] + obj_names

    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(headers)
        for sol in pareto_front:
            w.writerow(sol.get('x', []) + sol.get('f', []))
    logger.info(f'Pareto CSV: {out_path.name}  ({len(pareto_front)} solutions)')


def write_opt_yaml(model_path: Path, opt_result: Dict[str, Any],
                   objectives: List[Dict], out_path: Path) -> None:
    """Write full model YAML with optimizer.results block injected."""
    with open(model_path, 'r', encoding='utf-8') as f:
        model = yaml.safe_load(f)

    results_block = {
        'generated_at': date.today().isoformat(),
        'method': opt_result.get('method', 'nsga2'),
        'n_solutions': opt_result.get('n_solutions', 0),
        'elapsed_seconds': round(opt_result.get('elapsed_seconds', 0), 1),
        'stopped_early': opt_result.get('stopped', False),
        'pareto_front': opt_result.get('pareto_front', []),
    }

    # Build human-readable reference point (best solution = first in front)
    front = opt_result.get('pareto_front', [])
    if front:
        best = front[0]
        results_block['reference'] = {
            'x': best.get('x', []),
            'f': best.get('f', []),
            'objectives': {
                o.get('variable', f'f{i}'): v
                for i, (o, v) in enumerate(zip(objectives, best.get('f', [])))
            },
        }

    if 'optimizer' not in model:
        model['optimizer'] = {}
    model['optimizer']['results'] = results_block

    with open(out_path, 'w', encoding='utf-8') as f:
        yaml.dump(model, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
    logger.info(f'Opt YAML: {out_path.name}')
