import os
import re

from src.model_structure.utils import extract_vars_from_expr

OUTPUT_FOLDER = 'temp_merged_ai'

HB = 'references/medical/physiology/human_body/'

# Ready-made combinations for demonstrations. Each one is checked against the library when the
# list is requested, and is offered only if it still behaves as described. `expect` is
# 'coupling' for models that feed each other without a conflict, 'conflict' for models that
# write the same variables, and 'none' for models that share nothing.
SAMPLES = [
    {
        'id': 'metabolic_core', 'expect': 'coupling', 'min': 3,
        'models': [HB + 'lifestyle_inputs_2026', HB + 'glucose_insulin_2026', HB + 'hepatic_metabolism_2026'],
        'title': {'en': 'Insulin and the liver', 'zh': '胰岛素与肝脏'},
        'note': {'en': 'Lifestyle inputs drive glucose and the liver, and each system feeds the other.',
                 'zh': '生活方式输入驱动血糖与肝脏，两个系统互相喂数据。'},
    },
    {
        'id': 'stress_axis', 'expect': 'coupling', 'min': 6,
        'models': [HB + 'nervous_sleep_stress_2026', HB + 'neuroendocrine_axes_2026', HB + 'immune_inflammation_2026'],
        'title': {'en': 'Stress, hormones and inflammation', 'zh': '压力、激素与炎症'},
        'note': {'en': 'Sleep and stress, the hormone axes and the immune system form a closed loop.',
                 'zh': '睡眠压力、激素轴和免疫系统构成闭环。'},
    },
    {
        'id': 'cardio_renal', 'expect': 'coupling', 'min': 4,
        'models': [HB + 'cardiovascular_2026', HB + 'renal_fluid_2026', HB + 'aging_health_summary_2026'],
        'title': {'en': 'Heart, kidney and ageing', 'zh': '心血管、肾脏与衰老'},
        'note': {'en': 'Blood pressure and fluid balance exchange values, and the ageing summary reads them.',
                 'zh': '血压与体液互相交换变量，衰老汇总读取它们。'},
    },
    {
        'id': 'whole_body_five', 'expect': 'coupling', 'min': 15,
        'models': [HB + 'body_composition_energy_2026', HB + 'neuroendocrine_axes_2026', HB + 'musculoskeletal_2026',
                   HB + 'immune_inflammation_2026', HB + 'nervous_sleep_stress_2026'],
        'title': {'en': 'Five body systems', 'zh': '五个人体系统'},
        'note': {'en': 'A dense web, the kind of model a scenario builds by importing components.',
                 'zh': '稠密的耦合网络，场景模型靠导入组件搭出的就是这种结构。'},
    },
    {
        'id': 'diet_overlap', 'expect': 'conflict', 'min': 3,
        'models': ['references/medical/nutrition/diet/simple_nutrition_2026_ag', 'references/medical/physiology/nutrition_intake_2026'],
        'title': {'en': 'Two diet models that overlap', 'zh': '两个重叠的饮食模型'},
        'note': {'en': 'Both models update the same intake variables, so merging them would apply both.',
                 'zh': '两个模型更新同一批摄入变量，直接合并会两边都生效。'},
    },
    {
        'id': 'sports_overlap', 'expect': 'conflict', 'min': 3,
        'models': ['references/medical/fitness/individual/running_2026', 'references/medical/fitness/individual/cycling_2026'],
        'title': {'en': 'Running and cycling', 'zh': '跑步与骑行'},
        'note': {'en': 'Two sports models that write the same fitness variables.', 'zh': '两个运动模型写入同一批体能变量。'},
    },
    {
        'id': 'unrelated', 'expect': 'none', 'min': 0,
        'models': ['references/medical/physiology/banister_fitness_fatigue_2026', 'references/medical/psychology/adherence_decay_2026'],
        'title': {'en': 'Models with nothing in common', 'zh': '毫无关联的模型'},
        'note': {'en': 'No shared variable, so the models drift apart.', 'zh': '没有共用变量，模型各自漂浮。'},
    },
]


def _norm_path(path: str) -> str:
    """A model path without a models/ prefix and without the .yaml suffix."""
    n = str(path).replace('\\', '/')
    if n.startswith('models/'):
        n = n[len('models/'):]
    return n[:-5] if n.endswith('.yaml') else n


class ModelCompose:
    """Compares the variables of several models and reports how they could be combined."""

    MAX_MODELS = 12

    def __init__(self, context):
        self.ctx = context

    # analysis

    def endpoint_compose(self, inputs: dict) -> dict:
        paths = inputs.get('paths') or []
        if not isinstance(paths, list) or not paths:
            return {'success': False, 'error': 'No model paths given'}
        paths = [str(p) for p in paths][:self.MAX_MODELS]

        models, errors = [], {}
        for path in paths:
            try:
                # A component often reads variables that another component defines, so it
                # cannot pass validation alone. The analysis needs exactly that dependency.
                data = self.ctx.load_model(path, validate=False)
            except (ValueError, RuntimeError) as e:
                errors[path] = str(e)
                continue
            variables = data['variables']
            reads, writes = set(), set()
            for eq in data['equations'].values():
                dynamics = eq.get('dynamics') or {}
                writes |= set(dynamics)
                for expr in dynamics.values():
                    reads |= extract_vars_from_expr(str(expr))
                if eq.get('condition'):
                    reads |= extract_vars_from_expr(str(eq['condition']))
            models.append({
                'path': path,
                'name': data['metadata']['name'],
                'variables': variables,
                'reads': reads - writes,
                'writes': writes,
                'equations': set(data['equations']),
                'imports': [_norm_path(i) for i in data.get('imports', [])],
            })

        # A model touches a variable when it declares it, reads it or updates it. Reads and
        # updates of names it does not declare count too, because that is how a component
        # asks another component for a variable.
        declared_anywhere = {v for m in models for v in m['variables']}
        touches = {}
        for m in models:
            for v in set(m['variables']) | m['reads'] | m['writes']:
                if v in declared_anywhere:
                    touches.setdefault(v, []).append(m)

        shared = []
        for v, owners in sorted(touches.items()):
            if len(owners) < 2:
                continue
            roles, declares = {}, {}
            for m in owners:
                roles[m['path']] = 'writer' if v in m['writes'] else ('reader' if v in m['reads'] else 'none')
                declares[m['path']] = v in m['variables']
            writers = [p for p, r in roles.items() if r == 'writer']
            has_reader = any(r == 'reader' for r in roles.values())
            if len(writers) >= 2:
                status = 'conflict'
            elif writers and has_reader:
                status = 'coupling'
            else:
                status = 'common'
            infos = [m['variables'][v] for m in owners if v in m['variables']]
            notes = []
            units = sorted({str(i.get('unit') or '') for i in infos} - {''})
            if len(units) > 1:
                notes.append({'kind': 'unit', 'values': units})
            types = sorted({str(i.get('type')) for i in infos})
            if len(types) > 1:
                notes.append({'kind': 'type', 'values': types})
            values = {repr(i.get('value')) for i in infos if i.get('value') is not None}
            if len(values) > 1 and not writers:
                notes.append({'kind': 'value', 'values': sorted(values)})
            first = infos[0]
            shared.append({
                'name': v,
                'vtype': first.get('type'),
                'unit': first.get('unit') or '',
                'description': first.get('description') or '',
                'roles': roles,
                'declares': declares,
                'status': status,
                'notes': notes,
            })

        eq_owner = {}
        for m in models:
            for e in m['equations']:
                eq_owner.setdefault(e, []).append(m['path'])
        collisions = [{'equation': e, 'paths': p} for e, p in sorted(eq_owner.items()) if len(p) >= 2]

        by_norm = {_norm_path(m['path']): m for m in models}
        includes = []
        for m in models:
            for imp in m['imports']:
                other = by_norm.get(imp)
                if other is not None and other is not m:
                    includes.append({'model': m['path'], 'includes': other['path']})

        return {
            'success': True,
            'models': [{
                'path': m['path'], 'name': m['name'],
                'n_variables': len(m['variables']), 'n_equations': len(m['equations']),
            } for m in models],
            'shared': shared,
            'collisions': collisions,
            'includes': includes,
            'errors': errors,
        }

    # ready-made demonstrations

    def endpoint_samples(self, inputs: dict) -> dict:
        """The ready-made combinations that still behave as described, with their numbers."""
        out = []
        for sample in SAMPLES:
            r = self.endpoint_compose({'paths': sample['models']})
            if not r.get('success') or r['errors'] or len(r['models']) != len(sample['models']):
                continue
            conflicts = sum(1 for x in r['shared'] if x['status'] == 'conflict')
            couplings = sum(1 for x in r['shared'] if x['status'] == 'coupling')
            ok = {
                'coupling': couplings >= sample['min'] and conflicts == 0,
                'conflict': conflicts >= sample['min'],
                'none': not r['shared'],
            }[sample['expect']]
            if not ok:
                continue
            out.append({
                'id': sample['id'], 'title': sample['title'], 'note': sample['note'], 'paths': sample['models'],
                'n_models': len(sample['models']), 'n_shared': len(r['shared']), 'n_coupling': couplings, 'n_conflict': conflicts,
            })
        return {'success': True, 'samples': out}

    # output path for a merge

    def endpoint_suggest_output(self, inputs: dict) -> dict:
        """Proposes an unused file name under the merge output folder."""
        names = [re.sub(r'[^a-z0-9]+', '_', str(n).lower()).strip('_') for n in (inputs.get('names') or [])]
        base = 'merged_' + '_'.join(n for n in names[:3] if n)
        if len(names) > 3:
            base += f'_plus{len(names) - 3}'
        base = base[:60].rstrip('_') or 'merged_model'
        root = self.ctx.models_directory
        candidate, i = base, 2
        while os.path.exists(os.path.join(root, OUTPUT_FOLDER, candidate + '.yaml')):
            candidate = f'{base}_{i}'
            i += 1
        return {'success': True, 'folder': OUTPUT_FOLDER, 'filename': candidate + '.yaml',
                'output_path': f'{OUTPUT_FOLDER}/{candidate}.yaml'}

    def endpoint_check_output(self, inputs: dict) -> dict:
        """Accepts only a plain file name under the merge output folder that does not exist yet."""
        filename = str(inputs.get('filename') or '').strip()
        if not re.fullmatch(r'[A-Za-z0-9_\-]{1,80}\.yaml', filename):
            return {'success': False, 'error': 'invalid_name'}
        path = f'{OUTPUT_FOLDER}/{filename}'
        if os.path.exists(os.path.join(self.ctx.models_directory, OUTPUT_FOLDER, filename)):
            return {'success': False, 'exists': True, 'error': 'exists', 'output_path': path}
        return {'success': True, 'output_path': path}
