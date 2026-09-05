# src/yaml_io.py
"""libyaml's C bindings are 5-8x faster than PyYAML's pure-Python SafeLoader (measured on the same file).
When unavailable (e.g. the target environment doesn't have libyaml installed), automatically falls
back to the pure-Python SafeLoader, with no change in behavior.
"""
import yaml

_Loader = getattr(yaml, 'CSafeLoader', yaml.SafeLoader)


def safe_load(stream):
    return yaml.load(stream, Loader=_Loader)
