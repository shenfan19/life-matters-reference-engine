"""Pareto-front CSV writer shared by the CLI (cli/output.py) and the GUI
backend (routes/optimizer.py:export_optimizer_csv).

Lives in reference_engine/src rather than cli/ so the GUI backend never has to
import from cli/ — the two ship as separate artifacts (CLI as a
PyInstaller exe, GUI backend as a plain Python server) and only share this
engine layer, not each other's entry-point code.
"""

import csv
from pathlib import Path
from typing import Dict, List


def write_opt_csv(pareto_front: List[Dict], objectives: List[Dict], out_path: Path,
                   x_labels: List[str] = None) -> None:
    """Write Pareto front as CSV: one row per solution, x cols then f cols.

    x_labels (if provided and length-matched) names each decision-variable column
    after its optimization.startpoint.regimens label instead of the generic x0,x1,...
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
