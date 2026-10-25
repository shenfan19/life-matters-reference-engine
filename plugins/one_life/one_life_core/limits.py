"""A cap on how many lives run at once.

Living a life steps the body model for thousands of weeks, so a handful of calls at the same time can keep the
server busy. This module stays loaded between calls, unlike backend.py, so the count is shared by all of them.
"""

import threading
from contextlib import contextmanager

MAX_CONCURRENT_RUNS = 3

_slots = threading.BoundedSemaphore(MAX_CONCURRENT_RUNS)


class Busy(RuntimeError):
    pass


@contextmanager
def run_slot():
    """Holds one slot while a life runs. Raises Busy at once when all slots are taken."""
    if not _slots.acquire(blocking=False):
        raise Busy('Too many lives are being lived at the moment, try again in a few seconds')
    try:
        yield
    finally:
        _slots.release()
