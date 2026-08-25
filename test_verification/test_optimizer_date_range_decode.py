"""Regression test: optimizer T4 collapsed end-window must still set valid_end.

optimize.date_range = [[start_lo, start_hi], [end_lo, end_hi]]. When the end
window collapses to a single fixed date (end_lo == end_hi, "not searched"),
run_optimizer()'s parsing stage (T4, around _n_e == 0) never creates a
date_end search dimension for it, and _build_regimen_events() previously only
populated a decoded entry's valid_end from a real date_end dimension or from
the entry's own top-level date_range — never from the collapsed
optimize.date_range value itself. The fixed end date was silently discarded,
so the regimen kept firing all the way to the simulation's end_date instead
of stopping where declared. See tasks/2026-08-12_task_optimizer-nsteps-and-t4-decode-audit.md
(life-matters-home) for the original diagnosis and full-library impact scan.
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402
from reference_engine.src.optimizer_engine import run_optimizer  # noqa: E402

FIXTURE_YAML = """
metadata:
  name: test_valid_optimizer_t4_collapsed_end_date
  lm_format_version: "1.0"
  description:
    problem: "Regression fixture for the optimizer T4 collapsed end-window decode bug."
    result: "dose must return to 0 by the simulation's final day, 2026-01-10."
  tags: [test, optimizer, date_range, regression]
  references: ["TEST: T4 collapsed end-window must still set valid_end"]

variables:
  dose:
    type: input
    value: 0.0
    unit: "au"
    bounds: [0.0, 2.0]
    description: Daily point pulse; fires only under the optimizer-decoded regimen.

simulation:
  step_size:
    value: 1
    unit: day
  start_date: "2026-01-01"
  end_date: "2026-01-10"
  output_variables: [dose]
  plans:
  - id: default
    label: "no fixed regimen"
    regimens: []

optimization:
  method: nsga2
  algorithm:
    population_size: 4
    n_generations: 1
  objectives:
    - variable: dose
      metric: final
      direction: minimize
      description: "placeholder objective; this fixture only exercises regimen decode"
  startpoint:
    regimens:
      - variable: dose
        value: 1.0
        time_start: "08:00"
        label: "daily point pulse"
        optimize:
          date_range: [["2026-01-01", "2026-01-03"], ["2026-01-05", "2026-01-05"]]
"""


def test_t4_collapsed_end_window_stops_regimen_at_fixed_date(tmp_path):
    fixture_path = tmp_path / "test_valid_optimizer_t4_collapsed_end_date.yaml"
    fixture_path.write_text(FIXTURE_YAML, encoding='utf-8')

    engine = ReferenceEngine(models_directory=str(tmp_path))
    model_name = str(fixture_path)[:-len('.yaml')]

    # A no-op progress_callback is required here: optimizer_backends._run_nsga2
    # passes callback=None straight through to pymoo's minimize() when none is
    # given, which overwrites pymoo's own no-op Callback() default and crashes
    # every nsga2 run with no progress_callback (TypeError: 'NoneType' object
    # is not callable) — a separate, pre-existing bug unrelated to T4 decode.
    # All real callers (CLI, API) always pass one, so it never surfaces there.
    result = run_optimizer(engine, model_name, progress_callback=lambda entry: False)
    assert result['success'], result.get('error')

    # date_start is searched over 2026-01-01..2026-01-03 (all < the collapsed
    # end date 2026-01-05), so under every candidate in this bounded search
    # space the regimen fires daily starting on or before 2026-01-03. If the
    # collapsed end date is honored (fix), firing stops by 2026-01-05 and
    # `dose` on the simulation's final day (2026-01-10) is back to 0. If the
    # collapsed end date is discarded (bug), valid_end stays unset and the
    # regimen keeps firing through end_date, so final `dose` is still 1.0.
    assert result['best_f'][0] == pytest.approx(0.0, abs=1e-9), (
        f"final dose = {result['best_f'][0]}; expected 0.0 "
        "(1.0 would indicate the T4 collapsed end-window is being discarded "
        "and the regimen never stopped firing)"
    )
