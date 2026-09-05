"""Heuristically scans `gui/src`, `reference_engine/src`, and `cli/` for source files that "look unreferenced."

Background: code_review_guide.md's §5 "Known gaps" notes that dead-code detection currently
relies entirely on manual ad hoc grep (for each suspicious file, search the whole codebase for
its filename; zero hits confirms it's an orphan — this method was used on 2026-06-24 to find two
orphan files, PluginLoader.tsx/plugin_ui_server.py, which were deleted on 2026-07-10). This
script automates the first step of that manual method (a codebase-wide search for the filename),
producing a "candidate list" that narrows the scope of manual review — it is not a final verdict.

**This is a first-pass screening tool, not a verdict** — static filename matching cannot detect:
  - a module dynamically loaded via importlib/directory scanning (e.g. plugins/*/backend.py,
    which PluginManager loads by directory structure, not by an import statement referencing the filename)
  - a resource referenced only by a string path (a locale json key, a path inside manifest.yaml)
  - the framework's own entry-point files/conventional filenames (partly excluded via
    KNOWN_ENTRY_POINTS, but that exclusion list can never be exhaustive)
  - a false negative where, after a file is renamed/moved, another location's old-name string
    coincidentally still "hits" and the file is missed
Every item the report surfaces still needs a human to re-confirm its reference paths with the
Grep tool before drawing a conclusion, the same way the 2026-06-24 case was handled (that case
was likewise a two-step process — script/grep first pass, then human judgment of product scope
— the human-judgment step was never skipped).

Usage:
    python scripts/find_dead_code.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCAN_DIRS = ['gui/src', 'reference_engine/src', 'cli']
SCAN_EXTS = {'.py', '.ts', '.tsx'}
EXCLUDE_DIR_PARTS = {'node_modules', '__pycache__', '.git', 'dist', 'build'}

# A filename that is itself a framework/toolchain conventional entry point, not referenced via an
# in-repo import statement, does not constitute an "orphan" signal.
KNOWN_ENTRY_POINTS = {
    '__init__', 'main', 'app', 'api_server', 'conftest', 'setupTests',
    'vite-env.d', 'index', 'App', 'index.test',
}


def iter_source_files():
    for dirname in SCAN_DIRS:
        base = ROOT / dirname
        if not base.exists():
            continue
        for path in base.rglob('*'):
            if path.suffix not in SCAN_EXTS or not path.is_file():
                continue
            if EXCLUDE_DIR_PARTS & set(path.relative_to(ROOT).parts):
                continue
            yield path


def build_haystack(all_files):
    """{file: full text} for every scanned source file, read once."""
    text = {}
    for path in all_files:
        try:
            text[path] = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            text[path] = ''
    return text


def main():
    all_files = list(iter_source_files())
    haystack = build_haystack(all_files)

    candidates = []
    for path in all_files:
        stem = path.stem
        if stem in KNOWN_ENTRY_POINTS or stem.endswith('.test') or stem.endswith('.d'):
            continue
        hits = sum(
            1 for other, text in haystack.items()
            if other != path and stem in text
        )
        if hits == 0:
            candidates.append(path.relative_to(ROOT))

    if not candidates:
        print('find_dead_code: no candidate orphan files found (this does not mean zero dead code, see the detection blind spots noted at the top of this script).')
        return 0

    print(f'find_dead_code: {len(candidates)} candidate orphan files (the filename has zero hits across the rest of the scanned scope):\n')
    for rel in sorted(candidates):
        print(f'  {rel}')
    print(
        '\nThe above is a first-pass screening result, not a conclusion -- each item still needs a '
        'human to confirm with the Grep tool that it truly has zero references (including cases '
        'this script cannot detect, such as dynamic loading or a string-path reference), and then '
        'judge whether it is a product-scope issue (as in the plugin-system case) or a pure orphan '
        'file that can simply be deleted.'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
