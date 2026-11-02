"""Care export plugin: turns LM disease models into Care for You condition packs.

Endpoints (POST /api/plugins/care_export/<name>):
  recipes   list the recipes shipped with the plugin and whether their source model exists
  convert   convert one recipe (or several, as a group) and return the Care model, the condition template, a report
            and a short preview run of the converted model
  pack      convert and return a Care import zip, base64 encoded, ready for Care's "import save" dialog

Run from a terminal without the engine:
  python plugins/care_export/backend.py recipes/diabetes.yaml recipes/hypertension_gout.yaml --models ../life-matters-models/models --out out
"""
import argparse
import base64
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert as cv  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RECIPES_DIR = os.path.join(HERE, 'recipes')
ZIP_ROOT = 'careforyou-data/'


def _recipe_files():
    return sorted(f for f in os.listdir(RECIPES_DIR) if f.endswith('.yaml'))


def _model_file(models_dir, source):
    path = os.path.join(models_dir, str(source).replace('\\', '/') + '.yaml')
    return path if os.path.isfile(path) else None


def convert_recipes(recipe_paths, models_dir, preview_hours=48):
    """Convert recipes (file paths) against a models directory. Returns the group results with previews."""
    items = []
    for rp in recipe_paths:
        recipe = cv.load_yaml(rp)
        src = _model_file(models_dir, recipe.get('source', ''))
        if not src:
            raise cv.ConvertError([f'{os.path.basename(rp)}: source model "{recipe.get("source")}" not found under {models_dir}'])
        items.append((cv.load_yaml(src), recipe, os.path.relpath(src, models_dir).replace('\\', '/')))
    results = cv.convert_group(items)
    for r in results:
        m = r['model']
        names = [k for k, v in m['variables'].items() if v['type'] == 'state'][:6]
        sim = cv.simulate(m, preview_hours, outputs=names, record_every_min=60)
        r['preview'] = {'hours': preview_hours, 'every_minutes': 60, 'series': sim}
    return results


def make_pack(results):
    """A zip Care's import dialog accepts: the model files and the condition templates."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        files = {}
        for r in results:
            files[f'templates/lm/models/{r["report"]["model_name"]}.yaml'] = cv.dump_yaml(r['model'])
            if r['condition']:
                files[f'templates/conditions/{r["report"]["condition"]}.yaml'] = cv.dump_yaml(r['condition'])
        files['README.txt'] = ('Care for You disease pack, generated from Life Matters models by the care_export plugin.\n'
                               + ''.join(f'- {r["report"]["condition"]}: {r["report"]["model_name"]}\n' for r in results))
        for name, text in files.items():
            z.writestr(ZIP_ROOT + name, text.encode('utf-8'))
    return buf.getvalue()


class CareExport:
    def __init__(self, context):
        self.ctx = context

    def _models_dir(self):
        return self.ctx.models_directory

    def endpoint_recipes(self, inputs):
        rows = []
        for f in _recipe_files():
            r = cv.load_yaml(os.path.join(RECIPES_DIR, f))
            rows.append({'file': f, 'condition': (r.get('condition') or {}).get('id'), 'source': r.get('source'),
                         'available': bool(_model_file(self._models_dir(), r.get('source', '')))})
        return {'success': True, 'recipes': rows}

    def _paths(self, inputs):
        names = inputs.get('recipes') or []
        if not isinstance(names, list) or not names:
            raise cv.ConvertError(['no recipes given'])
        out = []
        for n in names:
            n = str(n)
            if os.sep in n or '/' in n or '..' in n or n not in _recipe_files():
                raise cv.ConvertError([f'unknown recipe "{n}"'])
            out.append(os.path.join(RECIPES_DIR, n))
        return out

    def endpoint_convert(self, inputs):
        try:
            results = convert_recipes(self._paths(inputs), self._models_dir(), int(inputs.get('preview_hours', 48)))
        except cv.ConvertError as e:
            return {'success': False, 'error': 'conversion failed', 'problems': e.problems}
        return {'success': True, 'results': [{'report': r['report'], 'model_yaml': cv.dump_yaml(r['model']),
                                              'condition_yaml': cv.dump_yaml(r['condition']) if r['condition'] else None,
                                              'preview': r['preview']} for r in results]}

    def endpoint_pack(self, inputs):
        try:
            results = convert_recipes(self._paths(inputs), self._models_dir(), 1)
        except cv.ConvertError as e:
            return {'success': False, 'error': 'conversion failed', 'problems': e.problems}
        return {'success': True, 'filename': 'careforyou-disease-pack.zip', 'zip_base64': base64.b64encode(make_pack(results)).decode('ascii'),
                'conditions': [r['report']['condition'] for r in results]}

    def run(self, inputs):
        return self.endpoint_recipes(inputs)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Convert LM disease models into a Care for You pack.')
    ap.add_argument('recipes', nargs='+', help='recipe files, for example recipes/diabetes.yaml')
    ap.add_argument('--models', required=True, help='the LM models directory that the recipes name their sources in')
    ap.add_argument('--out', default='care_pack_out', help='folder to write the pack into')
    ap.add_argument('--zip', action='store_true', help='also write careforyou-disease-pack.zip for Care\'s import dialog')
    args = ap.parse_args(argv)
    paths = [p if os.path.isfile(p) else os.path.join(HERE, p) for p in args.recipes]
    try:
        results = convert_recipes(paths, args.models, 24)
    except cv.ConvertError as e:
        print('Conversion failed:')
        for p in e.problems:
            print('  -', p)
        return 1
    for r in results:
        rep = r['report']
        mdir = os.path.join(args.out, 'templates', 'lm', 'models')
        os.makedirs(mdir, exist_ok=True)
        with open(os.path.join(mdir, rep['model_name'] + '.yaml'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(cv.dump_yaml(r['model']))
        if r['condition']:
            cdir = os.path.join(args.out, 'templates', 'conditions')
            os.makedirs(cdir, exist_ok=True)
            with open(os.path.join(cdir, rep['condition'] + '.yaml'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(cv.dump_yaml(r['condition']))
        print(f'{rep["condition"]}: {rep["model_name"]}  {rep["counts"]}  drives {rep["drives"]}')
        for w in rep['warnings']:
            print('  warning:', w)
    if args.zip:
        with open(os.path.join(args.out, 'careforyou-disease-pack.zip'), 'wb') as f:
            f.write(make_pack(results))
        print('wrote', os.path.join(args.out, 'careforyou-disease-pack.zip'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
