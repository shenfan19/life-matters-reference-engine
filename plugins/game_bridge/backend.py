"""Game bridge plugin: lets games use LM models without knowing them.

Endpoints (POST /api/plugins/game_bridge/<name>):
  concepts   the vocabulary, the bridge files found, and problems in them
  systems    the system files shipped in library/systems
  compose    resolve one system and return the flat model, the bridge description and a report
  export     compose, then export for a target: lm, care or tp

From a terminal, without the engine (only PyYAML is needed):
  python plugins/game_bridge/backend.py check   --models ../life-matters-models/models
  python plugins/game_bridge/backend.py compose library/systems/diabetes_care.system.yaml --models ../life-matters-models/models --out out
  python plugins/game_bridge/backend.py export care library/systems/diabetes_care.system.yaml --recipe ../care_export/recipes/diabetes.yaml --models ... --out out
  python plugins/game_bridge/backend.py export tp   library/systems/diabetes_care.system.yaml --models ... --out out --instance traveler --step-days 0.25
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bridge as br  # noqa: E402
import targets as tg  # noqa: E402

LIBRARY = os.path.join(HERE, 'library')
SYSTEMS = os.path.join(LIBRARY, 'systems')


def open_library(models_dir, extra_bridge_dirs=()):
    vocab = br.Vocabulary(br.load_yaml(os.path.join(LIBRARY, 'concepts.yaml')))
    return br.Library(models_dir, [os.path.join(LIBRARY, 'bridges'), *extra_bridge_dirs, models_dir], vocab)


def load_system(ref):
    """A system is a path, or the file name of a shipped system without folder."""
    path = ref if os.path.isfile(ref) else os.path.join(SYSTEMS, os.path.basename(ref))
    if not os.path.isfile(path):
        raise br.BridgeError([f'system "{ref}" not found'])
    return br.load_yaml(path)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def write_composed(res, out):
    sid = res['bridge']['system']
    write(os.path.join(out, f'{sid}.lm.yaml'), br.dump_yaml(res['model']))
    write(os.path.join(out, f'{sid}.bridge.yaml'), br.dump_yaml(res['bridge']))
    write(os.path.join(out, f'{sid}.bridge.json'), json.dumps(res['bridge'], ensure_ascii=False, indent=2))
    write(os.path.join(out, f'{sid}.report.yaml'), br.dump_yaml(res['report']))


class GameBridge:
    def __init__(self, context):
        self.ctx = context

    def _lib(self):
        return open_library(self.ctx.models_directory)

    def endpoint_concepts(self, inputs):
        lib = self._lib()
        try:
            probs = br.check_library(lib)
            files = {k: b.get('_file', '') for k, b in lib.bridges().items()}
        except br.BridgeError as e:
            return {'success': False, 'error': 'bridge files cannot be read', 'problems': e.problems}
        return {'success': True, 'concepts': lib.vocab.concepts, 'bridges': sorted(files), 'problems': probs}

    def endpoint_systems(self, inputs):
        names = sorted(f for f in os.listdir(SYSTEMS) if f.endswith('.system.yaml')) if os.path.isdir(SYSTEMS) else []
        return {'success': True, 'systems': names}

    def endpoint_compose(self, inputs):
        try:
            res = br.compose_system(load_system(str(inputs.get('system', ''))), self._lib())
        except br.BridgeError as e:
            return {'success': False, 'error': 'composition failed', 'problems': e.problems}
        return {'success': True, 'model_yaml': br.dump_yaml(res['model']), 'bridge': res['bridge'], 'report': res['report']}

    def endpoint_export(self, inputs):
        target = str(inputs.get('target', 'lm'))
        try:
            res = br.compose_system(load_system(str(inputs.get('system', ''))), self._lib())
            if target == 'lm':
                return {'success': True, 'model_yaml': br.dump_yaml(res['model']), 'bridge': res['bridge'], 'report': res['report']}
            if target == 'care':
                recipe = br.load_yaml(str(inputs['recipe'])) if os.path.isfile(str(inputs.get('recipe', ''))) else inputs.get('recipe_data')
                if not recipe:
                    raise br.BridgeError(['a care export needs recipe (a file path) or recipe_data'])
                out = tg.to_care(res['model'], res['bridge'], recipe)
                return {'success': True, 'model_yaml': br.dump_yaml(out['model']), 'condition_yaml': br.dump_yaml(out['condition']) if out['condition'] else None,
                        'report': out['report']}
            if target == 'tp':
                frag = tg.to_tp(res['model'], res['bridge'], str(inputs.get('instance', 'traveler')), float(inputs.get('step_days', 0.25)))
                return {'success': True, 'fragment_yaml': br.dump_yaml({k: frag[k] for k in ('variables', 'equations')}), 'bridge': frag['bridge'],
                        'notes': frag['notes']}
            raise br.BridgeError([f'unknown target "{target}"'])
        except br.BridgeError as e:
            return {'success': False, 'error': 'export failed', 'problems': e.problems}

    def run(self, inputs):
        return self.endpoint_systems(inputs)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Game bridge: concepts, systems and exports for games.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('check', 'compose', 'export'):
        p = sub.add_parser(name)
        p.add_argument('--models', required=True, help='the LM models directory')
        p.add_argument('--bridges', action='append', default=[], help='extra folders with *.bridge.yaml files')
        if name != 'check':
            p.add_argument('--out', default='game_bridge_out')
        if name == 'export':
            p.add_argument('target', choices=['lm', 'care', 'tp'])
            p.add_argument('--recipe', help='care: a care_export recipe file')
            p.add_argument('--instance', default='traveler', help='tp: name prefix of the variables')
            p.add_argument('--step-days', type=float, default=0.25, help='tp: the step of the era file, in days')
            p.add_argument('--era', help='tp: an era file to merge the fragment into, written as <out>/<name>')
        if name != 'check':
            p.add_argument('system', help='a system file')
    args = ap.parse_args(argv)
    try:
        lib = open_library(args.models, args.bridges)
        if args.cmd == 'check':
            probs = br.check_library(lib)
            for k, ps in probs.items():
                for p in ps:
                    print('  -', p)
            print(f'{len(lib.bridges())} bridge file(s), {sum(len(v) for v in probs.values())} problem(s)')
            return 1 if probs else 0
        res = br.compose_system(load_system(args.system), lib)
        if args.cmd == 'compose' or args.target == 'lm':
            write_composed(res, args.out)
            print('wrote', os.path.join(args.out, res['bridge']['system'] + '.lm.yaml'), res['report']['counts'])
        elif args.target == 'care':
            if not args.recipe:
                raise br.BridgeError(['export care needs --recipe'])
            out = tg.to_care(res['model'], res['bridge'], br.load_yaml(args.recipe))
            write(os.path.join(args.out, 'templates', 'lm', 'models', out['report']['model_name'] + '.yaml'), br.dump_yaml(out['model']))
            if out['condition']:
                write(os.path.join(args.out, 'templates', 'conditions', out['report']['condition'] + '.yaml'), br.dump_yaml(out['condition']))
            print('wrote Care model', out['report']['model_name'], out['report']['counts'])
            for w in out['report']['warnings']:
                print('  warning:', w)
        else:
            frag = tg.to_tp(res['model'], res['bridge'], args.instance, args.step_days)
            write(os.path.join(args.out, f'{res["bridge"]["system"]}.tp_fragment.yaml'), br.dump_yaml({k: frag[k] for k in ('variables', 'equations')}))
            write(os.path.join(args.out, f'{res["bridge"]["system"]}.tp_bridge.json'), json.dumps(frag['bridge'], ensure_ascii=False, indent=2))
            if args.era:
                era = tg.merge_into_era(br.load_yaml(args.era), frag)
                write(os.path.join(args.out, os.path.basename(args.era)), br.dump_yaml(era))
            for n in frag['notes']:
                print('  note:', n)
            print('wrote Teleporter fragment', len(frag['variables']), 'variables', len(frag['equations']), 'equations')
        for w in res['report']['warnings']:
            print('  warning:', w)
        return 0
    except br.BridgeError as e:
        print('Failed:')
        for p in e.problems:
            print('  -', p)
        return 1


if __name__ == '__main__':
    sys.exit(main())
