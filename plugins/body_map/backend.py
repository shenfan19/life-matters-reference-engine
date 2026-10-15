import os
import re

import yaml

MAX_MODELS = 24
MAX_IMPORTS = 40
SITES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sites.yaml')


def _words(text: str) -> set:
    return {w for w in re.split(r'[^a-z0-9]+', str(text).lower()) if w}


def _load_rules() -> list:
    """The slot keywords of sites.yaml as a list of (slot, exact words, word prefixes)."""
    with open(SITES_FILE, encoding='utf-8') as f:
        raw = yaml.safe_load(f) or {}
    rules = []
    for slot, keywords in raw.items():
        exact, prefixes = set(), []
        for k in keywords or []:
            k = str(k).lower()
            if k.endswith('*'):
                prefixes.append(k[:-1])
            else:
                exact |= _words(k) if '_' not in k else {k}
        rules.append((str(slot), exact, prefixes))
    return rules


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
    """Places models on the organs of a paper-doll body from their tags, path and name."""

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

    def _locate_one(self, path: str, rules: list) -> dict:
        data = self._read_yaml(path)
        if data is None:
            return {'path': path, 'error': 'Model file not found or unreadable'}
        name, tags, words, joined = self._facts(path, data)
        sites = {slot: {'slot': slot, 'why': why, 'via': []} for slot, why in _match(words, joined, rules).items()}

        # A scenario carries no body words of its own beyond its tags, so the components it imports
        # light up their own organs, and the component is recorded as the reason.
        imports = data.get('imports') or []
        imported = 0
        for imp in imports[:MAX_IMPORTS] if isinstance(imports, list) else []:
            sub_path = _clean_path(imp if isinstance(imp, str) else (imp or {}).get('path', ''))
            sub = self._read_yaml(sub_path) if sub_path else None
            if sub is None:
                continue
            imported += 1
            sub_name, _, sub_words, sub_joined = self._facts(sub_path, sub)
            for slot, why in _match(sub_words, sub_joined, rules).items():
                site = sites.setdefault(slot, {'slot': slot, 'why': [], 'via': []})
                site['via'].append(sub_name)
                site['why'] += [w for w in why if w not in site['why']][:3]

        return {
            'path': path, 'name': name, 'tags': tags, 'imports': imported,
            'sites': sorted(sites.values(), key=lambda s: s['slot']),
        }

    def endpoint_locate(self, inputs: dict) -> dict:
        paths = inputs.get('paths') or []
        if not isinstance(paths, list) or not paths:
            return {'success': False, 'error': 'No model paths given'}
        rules = _load_rules()
        models = [self._locate_one(_clean_path(p), rules) for p in paths[:MAX_MODELS]]
        return {
            'success': True,
            'slots': [r[0] for r in rules],
            'models': models,
            'truncated': len(paths) > MAX_MODELS,
        }
