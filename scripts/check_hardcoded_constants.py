"""Scans `cli/` and `reference_engine/` for business parameters hardcoded as literal constants.

Background: a business parameter such as an MC seed was once written directly as a literal
(e.g. seed=42) instead of being read from the yaml/session config, causing the CLI and GUI to
produce inconsistent results (see ADR 0113). This script maintains a blacklist of such field
names; any assignment/call form of `<field>=<number>` or `<field> = <number>` is flagged.

Add a `# allow-const` comment on a line to allow a genuine exception that needs a literal (e.g. a test fixture).

Usage:
    python scripts/check_hardcoded_constants.py            # scan the default directories
    python scripts/check_hardcoded_constants.py a.py b.py  # scan only the given files (used by pre-commit)
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Field names known to have caused a bug, or to be at risk of one, from "a business parameter being hardcoded"; append as needed.
BUSINESS_CONST_FIELDS = [
    'seed',
    'n_runs',
    'sim_runs',
    'mc_runs',
    'pop_size',
    'n_gen',
]

FIELD_PATTERN = re.compile(
    r'\b(' + '|'.join(BUSINESS_CONST_FIELDS) + r')\s*=\s*-?\d+(\.\d+)?\b'
)

DEFAULT_SCAN_DIRS = ['cli', 'reference_engine']
EXCLUDE_DIR_PARTS = {'test_verification', '__pycache__', 'test', 'node_modules'}
SUPPRESS_COMMENT = '# allow-const'


def iter_default_files():
    for dirname in DEFAULT_SCAN_DIRS:
        base = ROOT / dirname
        if not base.exists():
            continue
        for path in base.rglob('*.py'):
            if EXCLUDE_DIR_PARTS & set(path.relative_to(ROOT).parts):
                continue
            yield path


def check_file(path: Path):
    violations = []
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except (UnicodeDecodeError, OSError):
        return violations
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith('#') or SUPPRESS_COMMENT in line:
            continue
        match = FIELD_PATTERN.search(line)
        if match:
            violations.append((lineno, match.group(0), line.strip()))
    return violations


def main(argv):
    if argv:
        files = [Path(arg) for arg in argv if arg.endswith('.py')]
    else:
        files = list(iter_default_files())

    found = False
    for path in files:
        for lineno, snippet, full_line in check_file(path):
            found = True
            rel = path.relative_to(ROOT) if path.is_absolute() else path
            print(f'{rel}:{lineno}: suspected hardcoded business parameter `{snippet}` -- {full_line}')

    if found:
        print(
            '\nThe fields above should be read from yaml/config/session, not written as a literal constant. '
            f'When a literal is genuinely required, add `{SUPPRESS_COMMENT}` on that line to allow it.'
        )
        return 1

    print('check_hardcoded_constants: OK, no hardcoded business parameters found.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
