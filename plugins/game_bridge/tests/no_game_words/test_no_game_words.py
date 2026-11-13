"""No game word may appear in the runtime folder.

The runtime is the computational core, and a core knows concepts, handles and readouts, not games. This test reads every file under
runtime/ and fails on a word of game_words.txt. Run from anywhere:

    python plugins/game_bridge/tests/no_game_words/test_no_game_words.py
"""
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(os.path.dirname(HERE))
RUNTIME = os.path.join(PLUGIN, 'runtime')


def load_words(path=os.path.join(HERE, 'game_words.txt')):
    whole, pieces = [], []
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        (whole if line.startswith('w:') else pieces).append(line[2:] if line.startswith('w:') else line)
    rx = re.compile(r'(?<![A-Za-z0-9_])(' + '|'.join(re.escape(w) for w in whole) + r')(?![A-Za-z0-9_])', re.IGNORECASE) if whole else None
    return rx, pieces


def scan(folder, words=None):
    """Hits as (path, line number, word). Files that are not text are skipped."""
    rx, pieces = words or load_words()
    hits = []
    for dirpath, _dirs, files in os.walk(folder):
        for fn in sorted(files):
            path = os.path.join(dirpath, fn)
            try:
                lines = open(path, encoding='utf-8').read().splitlines()
            except UnicodeDecodeError:
                continue
            for n, line in enumerate(lines, 1):
                for m in (rx.finditer(line) if rx else []):
                    hits.append((path, n, m.group(1)))
                for p in pieces:
                    if p in line:
                        hits.append((path, n, p))
    return hits


def main():
    failed = []

    def check(name, ok, detail=''):
        print(('pass ' if ok else 'FAIL ') + name + (('  ' + str(detail)) if detail else ''))
        if not ok:
            failed.append(name)

    hits = scan(RUNTIME)
    check('the runtime folder holds no game word', not hits, [(os.path.relpath(p, PLUGIN), n, w) for p, n, w in hits][:10])
    files = [f for _d, _s, fs in os.walk(RUNTIME) for f in fs]
    check('the scan saw the runtime files', len(files) >= 6, len(files))

    with tempfile.TemporaryDirectory(prefix='temp_game_words_probe_') as tmp:
        with open(os.path.join(tmp, 'a.js'), 'w', encoding='utf-8') as f:
            f.write('// the Mood of the Player\nconst mood_valence = 1;\nconst 需求 = 2;\nfunction dispatchNow() {}\n')
        found = sorted({w.lower() for _p, _n, w in scan(tmp)})
        check('the scan finds a whole word in any case and a Chinese word, and leaves mood_valence and dispatchNow alone', found == ['mood', 'player', '需求'], found)
    print('\n' + ('all passed' if not failed else f'{len(failed)} failed'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
