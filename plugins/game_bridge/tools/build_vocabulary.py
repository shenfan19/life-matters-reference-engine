"""Writes runtime/vocabulary.json from library/concepts.yaml.

The runtime has no YAML reader, and an adapter needs to know the mode of every handle and which concepts exist. This file is that
knowledge in JSON, copied into a game together with the runtime. A test checks that it matches the YAML.

    python plugins/game_bridge/tools/build_vocabulary.py          write it
    python plugins/game_bridge/tools/build_vocabulary.py --check  exit 1 if the file on disk differs
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
sys.path.insert(0, PLUGIN)
import bridge as br  # noqa: E402

SOURCE = os.path.join(PLUGIN, 'library', 'concepts.yaml')
TARGET = os.path.join(PLUGIN, 'runtime', 'vocabulary.json')


def render():
    data = br.load_yaml(SOURCE)
    br.Vocabulary(data)              # refuses a vocabulary that is not consistent
    return json.dumps({'vocabulary_version': data['vocabulary_version'], 'concepts': data['concepts']}, ensure_ascii=False, indent=1) + '\n'


def main(argv):
    text = render()
    if '--check' in argv:
        have = open(TARGET, encoding='utf-8').read() if os.path.isfile(TARGET) else ''
        if have != text:
            print('runtime/vocabulary.json is out of date; run tools/build_vocabulary.py')
            return 1
        print('runtime/vocabulary.json matches library/concepts.yaml')
        return 0
    with open(TARGET, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('wrote', TARGET)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
