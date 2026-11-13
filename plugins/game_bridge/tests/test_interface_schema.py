"""The messages of both shipped cores against docs/core_interface.schema.json.

tests/conformance/emit_messages.mjs prints a message of every kind from the LM core and from the lookup core; this test checks each of
them against the schema, and checks that the validator itself rejects messages that are wrong. jsonschema is not needed: the schema uses a
small set of keywords and the validator below handles exactly those (type, const, enum, required, properties, additionalProperties, items,
pattern, oneOf, $ref into $defs). A keyword the schema starts to use that the validator does not know makes the test fail.

    python plugins/game_bridge/tests/test_interface_schema.py
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
SCHEMA = json.load(open(os.path.join(PLUGIN, 'docs', 'core_interface.schema.json'), encoding='utf-8'))
KNOWN = {'$schema', '$id', 'title', 'description', 'type', 'const', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'pattern', 'oneOf', '$ref', '$defs'}
TYPES = {'object': dict, 'array': list, 'string': str, 'boolean': bool, 'null': type(None)}


def is_type(value, name):
    if name == 'number':
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if name == 'integer':
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, TYPES[name])


def validate(value, schema, root, path='$'):
    """Returns a list of problems."""
    unknown = set(schema) - KNOWN
    if unknown:
        return [f'{path}: the validator does not know the keyword(s) {sorted(unknown)}']
    if '$ref' in schema:
        node = root
        for part in schema['$ref'].lstrip('#/').split('/'):
            node = node[part]
        return validate(value, node, root, path)
    if 'oneOf' in schema:
        results = [validate(value, s, root, path) for s in schema['oneOf']]
        ok = [r for r in results if not r]
        if len(ok) == 1:
            return []
        return [f'{path}: matches {len(ok)} of the {len(results)} alternatives' + ('' if ok else '; closest: ' + min(results, key=len)[0])]
    problems = []
    if 'type' in schema:
        names = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
        if not any(is_type(value, n) for n in names):
            return [f'{path}: expected {names}, got {type(value).__name__}']
    if 'const' in schema and value != schema['const']:
        problems.append(f'{path}: must be {schema["const"]!r}, got {value!r}')
    if 'enum' in schema and value not in schema['enum']:
        problems.append(f'{path}: {value!r} is not one of {schema["enum"]}')
    if 'pattern' in schema and isinstance(value, str) and not re.search(schema['pattern'], value):
        problems.append(f'{path}: {value!r} does not match {schema["pattern"]}')
    if isinstance(value, dict):
        for k in schema.get('required', []):
            if k not in value:
                problems.append(f'{path}: missing {k}')
        props = schema.get('properties', {})
        for k, v in value.items():
            if k in props:
                problems += validate(v, props[k], root, f'{path}.{k}')
            elif isinstance(schema.get('additionalProperties'), dict):
                problems += validate(v, schema['additionalProperties'], root, f'{path}.{k}')
    if isinstance(value, list) and 'items' in schema:
        for i, v in enumerate(value):
            problems += validate(v, schema['items'], root, f'{path}[{i}]')
    return problems


failed = []


def check(name, ok, detail=''):
    print(('pass ' if ok else 'FAIL ') + name + (('  ' + str(detail)) if detail else ''))
    if not ok:
        failed.append(name)


def main():
    node = shutil.which('node')
    if not node:
        print('node was not found; the schema test needs it to make the messages')
        return 1
    p = subprocess.run([node, os.path.join(HERE, 'conformance', 'emit_messages.mjs')], capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        print(p.stdout, p.stderr)
        return 1
    messages = json.loads(p.stdout)
    kinds = {}
    for m in messages:
        probs = validate(m, SCHEMA, SCHEMA)
        kinds[m['kind']] = kinds.get(m['kind'], 0) + 1
        check(f'{m["kind"]} message of {m.get("core_kind") or m.get("core") or "an adapter"} is valid', not probs, probs[:3])
    check('every kind of message was seen', set(kinds) == {'hello', 'init', 'step', 'readouts', 'snapshot'}, kinds)

    good = next(m for m in messages if m['kind'] == 'step')
    wrong = []
    for name, edit in [
        ('a step with the wrong contract version', lambda m: m.update(v=2)),
        ('a step with a mode that is not level or total', lambda m: m['subjects'][0]['handles'][0].update(mode='burst')),
        ('a step with a value that is not a number', lambda m: m['subjects'][0]['handles'][0].update(value='lots')),
        ('a step with a source that does not exist', lambda m: m['subjects'][0]['handles'][0].update(source='wish')),
        ('a step without minutes', lambda m: m.pop('minutes')),
        ('a step with a concept written in capitals', lambda m: m['subjects'][0]['handles'][0].update(concept='Carb')),
    ]:
        bad = json.loads(json.dumps(good))
        edit(bad)
        wrong.append((name, validate(bad, SCHEMA, SCHEMA)))
    for name, probs in wrong:
        check(f'the validator rejects {name}', bool(probs), probs[:1])
    print('\n' + ('all passed' if not failed else f'{len(failed)} failed: {failed}'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
