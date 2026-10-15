import os
import re

import yaml

MAX_MODELS = 24
MAX_IMPORTS = 40
SEARCH_FOLDERS = ('references', 'scenarios')
HEAD_BYTES = 6000
SITES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sites.yaml')


def _words(text: str) -> set:
    return {w for w in re.split(r'[^a-z0-9]+', str(text).lower()) if w}


def _load_rules() -> dict:
    """The keywords of sites.yaml as {'organs': [...], 'inputs': [...]}, each a list of (slot, exact words, word prefixes)."""
    with open(SITES_FILE, encoding='utf-8') as f:
        raw = yaml.safe_load(f) or {}
    groups = {}
    for group in ('organs', 'inputs'):
        rules = []
        for slot, keywords in (raw.get(group) or {}).items():
            exact, prefixes = set(), []
            for k in keywords or []:
                k = str(k).lower()
                if k.endswith('*'):
                    prefixes.append(k[:-1])
                else:
                    exact |= _words(k) if '_' not in k else {k}
            rules.append((str(slot), exact, prefixes))
        groups[group] = rules
    return groups


def _match(words: set, joined: str, rules: list) -> dict:
    """The slots a set of words points to, each with the words that did it."""
    found = {}
    for slot, exact, prefixes in rules:
        why = sorted(w for w in words if w in exact)
        why += sorted(k for k in exact if '_' in k and k in joined and k not in why)
        why += sorted(w for w in words if any(w.startswith(p) for p in prefixes) and w not in why)
        if why:
            found[slot] = why
    return found


def _clean_path(path: str) -> str:
    n = str(path).replace('\\', '/')
    if n.startswith('models/'):
        n = n[len('models/'):]
    return n[:-5] if n.endswith('.yaml') else n


class BodyMap:
    """Places models on the organs of a paper-doll body, and on the everyday inputs that reach it, from their tags, path and name."""

    def __init__(self, context):
        self.ctx = context

    def _read_yaml(self, path: str):
        """The raw YAML of a model, or None when the path is unsafe or the file is missing or broken."""
        if os.path.isabs(path) or '..' in path.split('/'):
            return None
        full = os.path.join(self.ctx.models_directory, path + '.yaml')
        if not os.path.isfile(full):
            return None
        try:
            with open(full, encoding='utf-8') as f:
                data = yaml.safe_load(f)
        except (OSError, yaml.YAMLError):
            return None
        return data if isinstance(data, dict) else None

    @staticmethod
    def _facts(path: str, data: dict) -> tuple:
        meta = data.get('metadata') or {}
        tags = [str(t) for t in (meta.get('tags') or []) if t]
        name = str(meta.get('name') or os.path.basename(path))
        # The folder names count too: fitness/individual/running_2026 is a muscle model.
        return name, tags, _words(' '.join(tags + [path, name])), ' '.join(tags + [path, name]).lower()

    def _locate_one(self, path: str, groups: dict) -> dict:
        data = self._read_yaml(path)
        if data is None:
            return {'path': path, 'error': 'Model file not found or unreadable'}
        name, tags, words, joined = self._facts(path, data)
        found = {g: {slot: {'slot': slot, 'why': why, 'via': []} for slot, why in _match(words, joined, rules).items()}
                 for g, rules in groups.items()}

        # A scenario carries no body words of its own beyond its tags, so the components it imports
        # light up their own organs and inputs, and the component is recorded as the reason.
        imports = data.get('imports') or []
        imported = 0
        for imp in imports[:MAX_IMPORTS] if isinstance(imports, list) else []:
            sub_path = _clean_path(imp if isinstance(imp, str) else (imp or {}).get('path', ''))
            sub = self._read_yaml(sub_path) if sub_path else None
            if sub is None:
                continue
            imported += 1
            sub_name, _, sub_words, sub_joined = self._facts(sub_path, sub)
            for g, rules in groups.items():
                for slot, why in _match(sub_words, sub_joined, rules).items():
                    site = found[g].setdefault(slot, {'slot': slot, 'why': [], 'via': []})
                    site['via'].append(sub_name)
                    site['why'] += [w for w in why if w not in site['why']][:3]

        return {
            'path': path, 'name': name, 'tags': tags, 'imports': imported,
            'sites': sorted(found['organs'].values(), key=lambda x: x['slot']),
            'inputs': sorted(found['inputs'].values(), key=lambda x: x['slot']),
        }

    def endpoint_locate(self, inputs: dict) -> dict:
        paths = inputs.get('paths') or []
        if not isinstance(paths, list) or not paths:
            return {'success': False, 'error': 'No model paths given'}
        groups = _load_rules()
        models = [self._locate_one(_clean_path(p), groups) for p in paths[:MAX_MODELS]]
        return {
            'success': True,
            'slots': [r[0] for r in groups['organs']],
            'input_slots': [r[0] for r in groups['inputs']],
            'models': models,
            'truncated': len(paths) > MAX_MODELS,
        }

    # search the library for the models that belong to one organ or one input

    @staticmethod
    def _head_facts(text: str, path: str) -> tuple:
        """The words of a model's tags, path and name, read from the head of its file without parsing the YAML."""
        tags = []
        flow = re.search(r'^[ \t]+tags:[ \t]*\[([^\]]*)\]', text, re.M)
        if flow:
            tags = [t.strip().strip('\'"') for t in flow.group(1).split(',')]
        else:
            block = re.search(r'^[ \t]+tags:[ \t]*\n((?:[ \t]+-[^\n]*\n)+)', text, re.M)
            if block:
                tags = [re.sub(r'^[ \t]+-[ \t]*', '', ln).strip().strip('\'"') for ln in block.group(1).splitlines()]
        name = re.search(r'^[ \t]+name:[ \t]*([^\n#]+)', text, re.M)
        parts = [t for t in tags if t] + [path, name.group(1).strip().strip('\'"') if name else '']
        return _words(' '.join(parts)), ' '.join(parts).lower()

    def endpoint_search(self, inputs: dict) -> dict:
        """The models of the library whose tags, path or name point to one organ or one input."""
        kind, slot = inputs.get('kind'), str(inputs.get('id') or '')
        if kind not in ('organ', 'input'):
            return {'success': False, 'error': 'kind must be organ or input'}
        rules = [r for r in _load_rules()['organs' if kind == 'organ' else 'inputs'] if r[0] == slot]
        if not rules:
            return {'success': False, 'error': 'Unknown ' + kind + ': ' + slot}
        root = self.ctx.models_directory
        paths = []
        for folder in SEARCH_FOLDERS:
            for dirpath, _dirs, files in os.walk(os.path.join(root, folder)):
                for fn in files:
                    if not fn.endswith('.yaml'):
                        continue
                    full = os.path.join(dirpath, fn)
                    rel = os.path.relpath(full, root).replace('\\', '/')[:-5]
                    try:
                        with open(full, encoding='utf-8') as f:
                            head = f.read(HEAD_BYTES)
                    except OSError:
                        continue
                    words, joined = self._head_facts(head, rel)
                    if _match(words, joined, rules):
                        paths.append(rel)
        paths.sort()
        return {'success': True, 'kind': kind, 'id': slot, 'paths': paths, 'count': len(paths)}
