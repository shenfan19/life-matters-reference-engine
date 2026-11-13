"""Tests of tools/vendor.py and of the files it copies. Run from anywhere:

    python plugins/game_bridge/tests/test_vendor.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(PLUGIN, 'tools'))
sys.path.insert(0, PLUGIN)
import vendor  # noqa: E402
import bridge as br  # noqa: E402

failed = []


def check(name, ok, detail=''):
    print(('pass ' if ok else 'FAIL ') + name + (('  ' + str(detail)) if detail else ''))
    if not ok:
        failed.append(name)


def main():
    # the files of the runtime agree with each other
    v = json.load(open(os.path.join(PLUGIN, 'runtime', 'version.json'), encoding='utf-8'))
    js = open(os.path.join(PLUGIN, 'runtime', 'version.js'), encoding='utf-8').read()
    check('version.js and version.json carry the same runtime and contract version', f"'{v['runtime_version']}'" in js and f"CONTRACT_VERSION = {v['contract_version']}" in js)
    voc = json.load(open(os.path.join(PLUGIN, 'runtime', 'vocabulary.json'), encoding='utf-8'))
    yml = br.load_yaml(os.path.join(PLUGIN, 'library', 'concepts.yaml'))
    check('vocabulary.json is the vocabulary of concepts.yaml, and version.json names its version',
          voc == json.loads(json.dumps({'vocabulary_version': yml['vocabulary_version'], 'concepts': yml['concepts']})) and v['vocabulary_version'] == yml['vocabulary_version'])

    tmp = tempfile.mkdtemp(prefix='temp_vendor_check_')
    try:
        target = os.path.join(tmp, 'game', 'src', 'core')
        st = vendor.copy(target)
        files = sorted(st['files'])
        check('copy puts every runtime file and the stamp into the target', all(os.path.isfile(os.path.join(target, f)) for f in files) and os.path.isfile(os.path.join(target, vendor.STAMP)), files)
        check('the stamp carries the versions and one hash per file', st['runtime_version'] == v['runtime_version'] and len(st['files']) == len(files) and all(len(h) == 64 for h in st['files'].values()))
        code, lines = vendor.check(target)
        check('check passes on an untouched copy', code == 0, lines)

        victim = os.path.join(target, 'lm_core.js')
        with open(victim, 'a', encoding='utf-8') as f:
            f.write('\n// edited by a game\n')
        code, lines = vendor.check(target)
        check('check finds a changed file', code == 1 and lines == ['modified: lm_core.js'], lines)
        refused = False
        try:
            vendor.copy(target)
        except SystemExit:
            refused = True
        check('copy refuses to overwrite a changed copy', refused)
        vendor.copy(target, force=True)
        check('copy with force restores the files', vendor.check(target)[0] == 0)

        os.remove(os.path.join(target, 'expr.js'))
        code, lines = vendor.check(target)
        check('check finds a removed file', code == 1 and lines == ['missing: expr.js'], lines)
        vendor.copy(target, force=True)
        with open(os.path.join(target, 'extra.js'), 'w', encoding='utf-8') as f:
            f.write('export {};\n')
        code, lines = vendor.check(target)
        check('check finds a file added to the copied folder', code == 1 and lines == ['added: extra.js'], lines)

        os.remove(os.path.join(target, 'extra.js'))
        stamp = vendor.read_stamp(target)
        stamp['digest'] = '0' * 64
        with open(os.path.join(target, vendor.STAMP), 'w', encoding='utf-8') as f:
            json.dump(stamp, f)
        code, lines = vendor.check(target)
        code_strict, _ = vendor.check(target, strict=True)
        check('a copy older than the source is reported, and fails only with strict', code == 0 and code_strict == 2 and lines[0].startswith('outdated'), lines)

        bare = os.path.join(tmp, 'bare')
        os.makedirs(bare)
        check('check on a folder without a stamp fails', vendor.check(bare)[0] == 1)

        # the copied runtime runs where it was copied to
        vendor.copy(target, force=True)
        node = shutil.which('node')
        if node:
            probe = os.path.join(tmp, 'probe.mjs')
            with open(probe, 'w', encoding='utf-8') as f:
                f.write("import { LMCore, LookupCore, RUNTIME_VERSION } from './game/src/core/index.js';\nconsole.log(typeof LMCore, typeof LookupCore, RUNTIME_VERSION);\n")
            p = subprocess.run([node, probe], capture_output=True, text=True, cwd=tmp)
            check('the copy loads as a module from its new place', p.returncode == 0 and p.stdout.split() == ['function', 'function', v['runtime_version']], (p.stdout + p.stderr).strip()[-200:])
        else:
            print('skip loading the copy: node not found')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print('\n' + ('all passed' if not failed else f'{len(failed)} failed: {failed}'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
