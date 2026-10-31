"""Which body model a life runs on, and how a custom choice of components becomes a scenario file.

A scenario is a model file that imports the components of the body and carries the simulation settings. The page
lists the scenarios named in config.yaml. Ticking other components in the model tree makes a custom scenario: the
file of the chosen base scenario with its `imports` replaced by the ticked components, written under a temp_
folder of the models directory so that it never reaches the repository.
"""

import hashlib
import re
from pathlib import Path
from typing import List, Optional, Tuple

import yaml

CUSTOM_DIR = 'temp_one_life_custom'
MAX_COMPONENTS = 40
_NAME = re.compile(r'[^A-Za-z0-9_\-]+')


def norm_path(path: str) -> str:
    """A model path without a models/ prefix and without the .yaml suffix."""
    n = str(path).replace('\\', '/').strip('/')
    if n.startswith('models/'):
        n = n[len('models/'):]
    return n[:-5] if n.endswith('.yaml') else n


def same_components(a: List[str], b: List[str]) -> bool:
    return {norm_path(x) for x in a} == {norm_path(x) for x in b}


def _file(models_directory: str, path: str) -> Path:
    root = Path(models_directory).resolve()
    target = (root / (norm_path(path) + '.yaml')).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise ValueError(f'No such model: {path}')
    return target


def custom_text(models_directory: str, base: str, components: List[str], name: Optional[str] = None) -> Tuple[str, str]:
    """The text of the scenario file for these components, and the name it carries."""
    if not components or len(components) > MAX_COMPONENTS:
        raise ValueError(f'Choose between 1 and {MAX_COMPONENTS} components')
    paths = []
    for c in components:
        n = norm_path(c)
        _file(models_directory, n)
        if n not in paths:
            paths.append(n)
    with open(_file(models_directory, base), 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    digest = hashlib.sha1('|'.join([norm_path(base)] + paths).encode('utf-8')).hexdigest()[:10]
    stem = _NAME.sub('_', name).strip('_') if name else ''
    stem = stem or f'custom_{digest}'
    data['imports'] = paths
    metadata = data.setdefault('metadata', {})
    metadata['name'] = stem
    tags = metadata.setdefault('tags', [])
    if 'custom' not in tags:
        tags.append('custom')
    return yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000), stem


def write_custom(models_directory: str, base: str, components: List[str], name: Optional[str] = None) -> str:
    """Writes the scenario file and returns its model path. The same components give the same path."""
    text, stem = custom_text(models_directory, base, components, name)
    folder = Path(models_directory) / CUSTOM_DIR
    folder.mkdir(exist_ok=True)
    target = folder / f'{stem}.yaml'
    if not target.exists() or target.read_text(encoding='utf-8') != text:
        target.write_text(text, encoding='utf-8')
    return f'{CUSTOM_DIR}/{stem}'
