"""Runs every test of the game bridge plugin and says which groups passed.

    python plugins/game_bridge/tests/run_all.py

The conformance fixtures are committed, so the groups below need neither the models repository nor the Care repository. The parity
groups inside test_bridge.py use the models repository when it is next to this repository (or LM_MODELS_PATH) and say so when they skip.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
NODE = shutil.which('node')

GROUPS = [
    ('bridge, composition and exports (test_bridge.py)', [PY, os.path.join(HERE, 'test_bridge.py')]),
    ('copying the runtime (test_vendor.py)', [PY, os.path.join(HERE, 'test_vendor.py')]),
    ('no game word in the runtime', [PY, os.path.join(HERE, 'no_game_words', 'test_no_game_words.py')]),
    ('messages against the schema (test_interface_schema.py)', [PY, os.path.join(HERE, 'test_interface_schema.py')]),
    ('vocabulary.json matches concepts.yaml', [PY, os.path.join(HERE, '..', 'tools', 'build_vocabulary.py'), '--check']),
]
if NODE:
    conf = os.path.join(HERE, 'conformance')
    GROUPS += [
        ('LM core against the engine and Care fixtures (conformance/run.mjs)', [NODE, os.path.join(conf, 'run.mjs')]),
        ('lookup core against the LM core (conformance/run_lookup.mjs)', [NODE, os.path.join(conf, 'run_lookup.mjs')]),
        ('interface behaviour (conformance/run_interface.mjs)', [NODE, os.path.join(conf, 'run_interface.mjs')]),
    ]


def main():
    if not NODE:
        print('node was not found; the JavaScript groups cannot run')
    bad = []
    for name, cmd in GROUPS:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=900, encoding='utf-8', errors='replace')
        ok = p.returncode == 0
        lines = [l for l in (p.stdout + p.stderr).splitlines() if l.strip()]
        print(('pass ' if ok else 'FAIL ') + name + ('' if ok else '\n    ' + '\n    '.join(lines[-8:])))
        skipped = [l for l in lines if l.startswith('skip')]
        for l in skipped:
            print('     ' + l)
        if not ok:
            bad.append(name)
    print('\n' + ('everything passed' if not bad and NODE else f'{len(bad)} group(s) failed' if bad else 'the JavaScript groups did not run'))
    return 1 if bad or not NODE else 0


if __name__ == '__main__':
    sys.exit(main())
