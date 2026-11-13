"""Copies the runtime into a game repository with a version stamp, and checks later that nobody changed the copy.

    python plugins/game_bridge/tools/vendor.py copy  <target folder>          copy runtime/ into the folder, write RUNTIME_STAMP.json
    python plugins/game_bridge/tools/vendor.py check <target folder>          verify the copy against its stamp, and against the source if it is here

The stamp lists the sha256 of every copied file. `check` fails (exit 1) when a file was changed, removed or added in the copied folder;
it only reports (exit 0, or 2 with --strict) when the copy is older than the runtime it came from. A game never edits the copied files:
a change belongs in the plugin, and the game copies again. `copy` refuses to overwrite a copy that was edited, unless --force.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
SOURCE = os.path.join(PLUGIN, 'runtime')
STAMP = 'RUNTIME_STAMP.json'
SKIP_DIRS = {'__pycache__', 'node_modules'}


def digest(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def listing(folder):
    """{relative path with forward slashes: sha256} of every file under folder, without the stamp."""
    out = {}
    for dirpath, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for fn in sorted(files):
            if fn == STAMP:
                continue
            full = os.path.join(dirpath, fn)
            out[os.path.relpath(full, folder).replace('\\', '/')] = digest(full)
    return out


def source_version():
    with open(os.path.join(SOURCE, 'version.json'), encoding='utf-8') as f:
        return json.load(f)


def make_stamp(files):
    v = source_version()
    whole = hashlib.sha256(''.join(f'{k}:{files[k]}\n' for k in sorted(files)).encode()).hexdigest()
    return {'notice': 'Copied by plugins/game_bridge/tools/vendor.py. Do not edit these files; change the plugin and copy again.',
            'source': 'plugins/game_bridge/runtime', 'runtime_version': v['runtime_version'], 'contract_version': v['contract_version'],
            'vocabulary_version': v['vocabulary_version'], 'digest': whole, 'files': files}


def read_stamp(target):
    path = os.path.join(target, STAMP)
    if not os.path.isfile(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def compare(target):
    """Problems of a copied folder against its own stamp: lists of modified, missing and added files."""
    stamp = read_stamp(target)
    if stamp is None:
        return None, {'no_stamp': True}
    have = listing(target)
    want = stamp['files']
    return stamp, {'modified': sorted(k for k in want if k in have and have[k] != want[k]),
                   'missing': sorted(k for k in want if k not in have), 'added': sorted(k for k in have if k not in want)}


def copy(target, force=False):
    if not os.path.isdir(SOURCE):
        raise SystemExit('the runtime folder was not found at ' + SOURCE)
    stamp, problems = compare(target) if os.path.isdir(target) else (None, {})
    if stamp is not None and any(problems.values()) and not force:
        raise SystemExit('the copy in %s was changed (%s); it would be overwritten. Look at it, or use --force' % (target, json.dumps(problems)))
    files = listing(SOURCE)
    if stamp is not None:
        for rel in stamp['files']:                       # files of the old copy that the new runtime no longer has
            old = os.path.join(target, rel)
            if rel not in files and os.path.isfile(old):
                os.remove(old)
    os.makedirs(target, exist_ok=True)
    for rel in files:
        dst = os.path.join(target, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(SOURCE, rel), dst)
    new = make_stamp(files)
    with open(os.path.join(target, STAMP), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(new, f, indent=1)
        f.write('\n')
    return new


def check(target, strict=False):
    """Returns (exit code, lines to print)."""
    stamp, problems = compare(target)
    if stamp is None:
        return 1, [f'{target}: no {STAMP}; this folder was not made by vendor.py']
    lines, code = [], 0
    for kind in ('modified', 'missing', 'added'):
        for rel in problems[kind]:
            lines.append(f'{kind}: {rel}')
            code = 1
    if os.path.isdir(SOURCE):
        src = make_stamp(listing(SOURCE))
        if src['digest'] != stamp['digest']:
            lines.append(f'outdated: the copy is runtime {stamp["runtime_version"]}, the source is runtime {src["runtime_version"]} with other content')
            code = code or (2 if strict else 0)
    if not lines:
        lines.append(f'ok: runtime {stamp["runtime_version"]}, contract {stamp["contract_version"]}, vocabulary {stamp["vocabulary_version"]}, {len(stamp["files"])} files unchanged')
    return code, lines


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('copy')
    c.add_argument('target')
    c.add_argument('--force', action='store_true')
    k = sub.add_parser('check')
    k.add_argument('target')
    k.add_argument('--strict', action='store_true', help='exit 2 when the copy is older than the source')
    args = ap.parse_args(argv)
    if args.cmd == 'copy':
        st = copy(args.target, args.force)
        print(f'copied runtime {st["runtime_version"]} ({len(st["files"])} files) into {args.target}')
        return 0
    code, lines = check(args.target, args.strict)
    print('\n'.join(lines))
    return code


if __name__ == '__main__':
    sys.exit(main())
