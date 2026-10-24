"""The result of a run: one columnar trajectory that simulation, Monte Carlo and the optimizer share.

A Trajectory holds the step numbers, the times and one list of values per variable, plus the
identity of the solver that produced it, because a published result and a validation grade
only mean something together with the solver and its version (ADR 0163).
"""

from dataclasses import dataclass, field
from typing import Dict, List, Sequence


@dataclass
class Trajectory:
    step: List[int] = field(default_factory=list)
    time: List[float] = field(default_factory=list)
    columns: Dict[str, List[float]] = field(default_factory=dict)
    solver: Dict = field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.step)

    @classmethod
    def from_rows(cls, rows: Sequence[Dict], variables: Sequence[str], solver: Dict = None) -> 'Trajectory':
        """Build from the row form {'step', 'time', **{variable: value}} that sessions and CSV use."""
        return cls(
            step=[r['step'] for r in rows],
            time=[r['time'] for r in rows],
            columns={v: [r[v] for r in rows] for v in variables},
            solver=dict(solver or {}),
        )

    def rows(self) -> List[Dict]:
        """Back to one dict per step, the form the GUI and the CSV export read."""
        names = list(self.columns)
        return [
            {'step': s, 'time': t, **{n: self.columns[n][i] for n in names}}
            for i, (s, t) in enumerate(zip(self.step, self.time))
        ]

    def history(self) -> Dict[str, List[float]]:
        """The per-variable lists the objective and constraint evaluation reads."""
        return self.columns
