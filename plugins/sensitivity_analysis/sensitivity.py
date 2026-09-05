"""
sensitivity_analysis — Pearson correlation-based sensitivity ranking.

For each numeric state variable, computes Pearson correlation with the
target variable across the simulated time series. Returns a ranked list
(tornado chart data) sorted by absolute correlation.

Dependencies: numpy (already required by reference_engine)
"""
import json
from typing import Any, Dict, List


class SensitivityAnalysis:
    def __init__(self, context):
        self.ctx = context

    def run(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        sim_results: List[dict] = inputs.get('sim_results', [])
        params: dict = inputs.get('params', {})

        if len(sim_results) < 5:
            return {
                'result_type': 'text',
                'title': 'Sensitivity Analysis',
                'data': 'At least 5 simulation steps are required.',
            }

        sample = sim_results[0]
        all_vars = [k for k, v in sample.items()
                    if k != 'time' and isinstance(v, (int, float))]

        if len(all_vars) < 2:
            return {
                'result_type': 'text',
                'title': 'Sensitivity Analysis',
                'data': 'At least 2 numeric variables are required.',
            }

        target_var = params.get('target_var', '')
        if not target_var or target_var not in all_vars:
            target_var = all_vars[0]

        predictors = [v for v in all_vars if v != target_var]

        try:
            import numpy as np
        except ImportError:
            return {
                'result_type': 'text',
                'title': 'Sensitivity Analysis',
                'error': 'numpy not installed',
            }

        target_series = np.array([r.get(target_var, 0.0) for r in sim_results],
                                  dtype=float)
        target_std = float(np.std(target_series))

        correlations = []
        for var in predictors:
            series = np.array([r.get(var, 0.0) for r in sim_results], dtype=float)
            if np.std(series) == 0 or target_std == 0:
                continue
            corr = float(np.corrcoef(series, target_series)[0, 1])
            if not (corr != corr):  # skip NaN
                correlations.append({
                    'variable': var,
                    'correlation': round(corr, 4),
                })

        correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)

        if not correlations:
            return {
                'result_type': 'text',
                'title': 'Sensitivity Analysis',
                'data': 'All variables have zero variance; a correlation coefficient cannot be computed.',
            }

        self.ctx.log(
            f"SensitivityAnalysis: target={target_var}, "
            f"{len(correlations)} correlations computed"
        )

        return {
            'result_type': 'json',
            'title': f'Sensitivity Analysis — target: {target_var}, {len(correlations)} variables',
            'data': {
                'target': target_var,
                'method': 'Pearson correlation',
                'n_steps': len(sim_results),
                'correlations': correlations,
            },
        }
