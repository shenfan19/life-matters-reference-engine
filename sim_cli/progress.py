"""Real-time progress display and stop-input handler for CLI runs."""

import sys
import threading
import logging

logger = logging.getLogger('lm_cli')


class ProgressTracker:
    """Displays per-generation progress; stops when user types 'q' + Enter."""

    def __init__(self):
        self._stop_requested = threading.Event()
        self._listener = None

    def start(self):
        print('  Type  q + Enter  at any time to stop and save current results.\n')
        self._listener = threading.Thread(target=self._stdin_loop, daemon=True)
        self._listener.start()

    def _stdin_loop(self):
        try:
            for line in sys.stdin:
                if line.strip().lower() in ('q', 'quit', 'stop', 'x'):
                    print('\n  [q] Finishing current generation then stopping...')
                    logger.info('Early stop requested by user (q)')
                    self._stop_requested.set()
                    break
        except Exception:
            pass

    # ── callbacks ────────────────────────────────────────────────────────────────

    def make_opt_callback(self):
        """Return a progress_callback for run_optimizer.

        Returning True from the callback signals the optimizer to stop after
        the current generation (picked up by _ProgressCb in optimizer_engine).
        """
        def callback(entry: dict) -> bool:
            gen      = entry.get('iteration', '?')
            n_eval   = entry.get('n_eval', '?')
            fr       = entry.get('feasible_ratio')
            front    = entry.get('pareto_front') or []

            feas_str = f'{fr * 100:.0f}%' if fr is not None else '  ?'
            best_f   = front[0]['f'] if front else []
            f_str    = '[' + ', '.join(f'{v:.3g}' for v in best_f) + ']'

            line = f'  Gen {gen:>3} | eval: {n_eval:>6} | feasible: {feas_str:>4} | best_f: {f_str}'
            logger.info(line.strip())
            print(f'\r{line}', end='', flush=True)

            return self._stop_requested.is_set()

        return callback
