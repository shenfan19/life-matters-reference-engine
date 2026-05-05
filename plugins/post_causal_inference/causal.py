"""
post_causal_inference — Granger causality analysis on LM simulation output.

Estimates pairwise causal direction between state variables using Granger
causality (lag-1 F-test). Returns an adjacency dict and plain-text summary.

Dependencies: statsmodels (pip install statsmodels)
"""
from typing import Any, Dict, List


class CausalInference:
    def __init__(self, context):
        self.ctx = context

    def run(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        sim_results: List[dict] = inputs.get('sim_results', [])
        if len(sim_results) < 10:
            return {
                'result_type': 'text',
                'title': 'Causal Inference',
                'data': 'Need at least 10 simulation steps for causal analysis.',
            }

        # Discover numeric state columns (exclude 'time')
        sample = sim_results[0]
        vars_ = [k for k, v in sample.items()
                 if k != 'time' and isinstance(v, (int, float))]
        if len(vars_) < 2:
            return {
                'result_type': 'text',
                'title': 'Causal Inference',
                'data': 'Need at least 2 numeric variables.',
            }

        try:
            import numpy as np
            from statsmodels.tsa.stattools import grangercausalitytests
        except ImportError:
            return {
                'result_type': 'text',
                'title': 'Causal Inference',
                'error': 'statsmodels not installed — run: pip install statsmodels',
            }

        matrix = {v: [row.get(v, 0.0) for row in sim_results] for v in vars_}
        edges = []
        p_threshold = 0.05

        for target in vars_:
            for cause in vars_:
                if cause == target:
                    continue
                try:
                    data = np.column_stack([matrix[target], matrix[cause]])
                    result = grangercausalitytests(data, maxlag=1, verbose=False)
                    p_val = result[1][0]['ssr_ftest'][1]
                    if p_val < p_threshold:
                        edges.append({
                            'cause': cause,
                            'target': target,
                            'p_value': round(p_val, 4),
                        })
                except Exception as e:
                    self.ctx.log(f"Granger {cause}→{target}: {e}")

        lines = [f"{e['cause']} → {e['target']}  (p={e['p_value']})" for e in edges]
        summary = '\n'.join(lines) if lines else 'No significant causal links (p < 0.05).'

        return {
            'result_type': 'json',
            'title': f'Causal Graph — {len(edges)} edges, p < {p_threshold}',
            'data': {
                'edges': edges,
                'variables': vars_,
                'summary': summary,
            },
        }
