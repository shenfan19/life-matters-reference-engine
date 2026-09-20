"""Builds the figures and data tables of the virtual human reports.

The reports live in <models>/scenarios/medical/virtual_human_reports. Their prose is written by hand.
Every block between `<!-- BEGIN:name -->` and `<!-- END:name -->` markers is generated here and replaced
in place, so numbers never have to be copied by hand.

Inputs
    --sim-dir      output root of `cli/main.py <scenario> --sim-only --output-dir <dir>` for the four scenarios
    --ladder       directory of per subset JSON written by human_body_stability_ladder.py run
    --envelope     JSON written by human_body_envelope.py run

Usage (from repo root, LM_MODELS_PATH pointing at the model library):
    python reference_engine/scripts/human_body_report.py all --sim-dir <dir> --ladder <dir> --envelope <json>
"""

import argparse
import csv
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

import matplotlib
import yaml

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Noto Sans CJK SC', 'PingFang SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

sys.path.insert(0, str(Path(__file__).resolve().parent))
import human_body_stability_ladder as L  # noqa: E402

SCEN_REL = Path('scenarios/medical')
REPORT_DIR = 'virtual_human_reports'

SYSTEM_CN = {
    'digestive': '消化与肠道', 'body': '体成分与能量', 'neuroendo': '神经内分泌', 'glucose': '糖与胰岛素',
    'hepatic': '肝脏', 'lipid': '血脂', 'cardio': '心血管', 'resp': '呼吸', 'renal': '肾脏与体液',
    'msk': '肌肉骨骼', 'immune': '免疫与炎症', 'nervous': '神经睡眠与压力', 'heme': '血液与铁',
    'aging': '衰老与健康汇总', 'appetite': '食欲与摄入调节',
}
INPUT_CN = {
    'energy_intake': '能量摄入', 'carb_pct': '碳水占比', 'protein_pct': '蛋白占比', 'fiber_g': '膳食纤维',
    'sodium_g': '钠摄入', 'alcohol_g': '酒精', 'water_l': '饮水', 'diet_quality': '饮食质量',
    'aerobic_min': '有氧运动', 'resistance_min': '抗阻运动', 'sleep_hours': '睡眠时长', 'stress_load': '压力负荷',
    'smoking_cigs': '吸烟', 'pathogen_challenge': '病原暴露', 'hypothyroid_severity': '甲状腺功能低下程度',
    'malabsorption_severity': '吸收不良程度', 'iron_loss_extra_mg': '额外铁损失',
    'appetite_feedback_gain': '食欲反馈增益', 'dietary_restraint': '饮食克制程度',
}
MARKER_CN = {
    'bmi': '体质指数', 'fasting_glucose': '空腹血糖', 'hba1c': '糖化血红蛋白', 'systolic_bp': '收缩压',
    'ldl_c': '低密度胆固醇', 'triglycerides': '三酰甘油', 'liver_fat': '肝脂肪', 'hemoglobin': '血红蛋白',
    'ferritin': '铁蛋白', 'gfr_effective': '有效肾小球滤过率', 'fev1_pct': '一秒用力呼气量',
    'crp': 'C 反应蛋白', 'depressive_symptoms': '抑郁症状评分', 'uric_acid': '尿酸', 'alt': '丙氨酸转氨酶',
}

# categorical palette from the dataviz reference instance, light surface, fixed slot order
SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#e34948', '#eda100', '#008300', '#e87ba4']
SURFACE, INK, MUTED, GRID = '#fcfcfb', '#1f1f1e', '#6b6b68', '#e6e5e1'

UNIT = {
    'body_weight': 'kg', 'body_fat_pct': '%', 'lean_mass': 'kg', 'fat_mass': 'kg', 'resting_metabolic_rate': 'kcal/day',
    'fasting_glucose': 'mg/dL', 'hba1c': '%', 'liver_fat': '%', 'systolic_bp': 'mmHg', 'crp': 'mg/L', 'fever_c': 'C',
    'ferritin': 'ug/L', 'hemoglobin': 'g/dL', 'ketone_bodies': 'mmol/L', 't3_level': 'ratio', 'fev1_pct': '%',
    'health_score': 'score', 'biological_age_delta': 'year', 'depressive_symptoms': 'score', 'ldl_c': 'mg/dL',
    'hdl_c': 'mg/dL', 'homeostatic_hunger': 'ratio', 'energy_intake_eff': 'kcal', 'hedonic_eating_drive': 'ratio',
    'insulin_sensitivity': 'ratio', 'uric_acid': 'mg/dL', 'alt': 'U/L', 'muscle_strength': 'ratio', 'bone_density': 'g/cm2',
    'vo2max_rel': 'mL/kg/min', 'resting_hr': 'bpm', 'fat_mass_setpoint': 'kg', 'unrestrained_intake': 'kcal',
}
VAR_CN = {
    'body_weight': '体重', 'body_fat_pct': '体脂率', 'lean_mass': '瘦体重', 'fat_mass': '脂肪量',
    'resting_metabolic_rate': '静息代谢率', 'fasting_glucose': '空腹血糖', 'hba1c': '糖化血红蛋白',
    'liver_fat': '肝脂肪', 'systolic_bp': '收缩压', 'crp': 'C 反应蛋白', 'fever_c': '体温升高',
    'ferritin': '铁蛋白', 'hemoglobin': '血红蛋白', 'ketone_bodies': '血酮体', 't3_level': '三碘甲状腺原氨酸',
    'fev1_pct': '一秒用力呼气量', 'health_score': '健康评分', 'biological_age_delta': '生物学年龄偏差',
    'depressive_symptoms': '抑郁症状评分', 'ldl_c': '低密度胆固醇', 'hdl_c': '高密度胆固醇',
    'homeostatic_hunger': '稳态饥饿', 'energy_intake_eff': '有效摄入', 'hedonic_eating_drive': '享乐性进食驱动',
    'insulin_sensitivity': '胰岛素敏感性', 'uric_acid': '尿酸', 'alt': '转氨酶', 'muscle_strength': '肌力',
    'bone_density': '骨密度', 'vo2max_rel': '最大摄氧量', 'resting_hr': '静息心率',
    'fat_mass_setpoint': '脂肪量设定点', 'unrestrained_intake': '不设限摄入', 'plaque_burden': '斑块负荷',
    'gfr_effective': '有效肾小球滤过率', 'triglycerides': '三酰甘油', 'bmi': '体质指数', 'fatigue_index': '疲劳指数',
}
# reference lines drawn on a panel, (value, label)
REFLINES = {
    'fasting_glucose': (126, '126'), 'hba1c': (6.5, '6.5'), 'systolic_bp': (140, '140'),
    'liver_fat': (5.5, '5.5'), 'hemoglobin': (13, '13'),
}

FIGURES = {
    'virtual_human_daily_2026': [
        ('daily_body_composition', '体重与体成分，两年日步长',
         ['body_weight', 'body_fat_pct', 'lean_mass', 'resting_metabolic_rate'],
         ['baseline_maintenance', 'overeating_sedentary', 'severe_starvation_refeeding', 'crash_diet_rebound', 'resistance_high_protein']),
        ('daily_metabolic', '代谢与血压，肥胖、干预与短睡眠',
         ['fasting_glucose', 'hba1c', 'liver_fat', 'systolic_bp'],
         ['baseline_maintenance', 'overeating_sedentary', 'obesity_then_lifestyle_reversal', 'endurance_training', 'sleep_deprivation']),
        ('daily_acute_and_deficiency', '感染、缺铁与断食的响应',
         ['crp', 'fever_c', 'ferritin', 'hemoglobin', 'ketone_bodies', 't3_level'],
         {'crp': ['infection_episodes_healthy', 'infection_in_malnutrition'],
          'fever_c': ['infection_episodes_healthy', 'infection_in_malnutrition'],
          'ferritin': ['baseline_maintenance', 'iron_deficiency_blood_loss'],
          'hemoglobin': ['baseline_maintenance', 'iron_deficiency_blood_loss'],
          'ketone_bodies': ['baseline_maintenance', 'total_fasting_21d', 'ketogenic_low_carb'],
          't3_level': ['baseline_maintenance', 'total_fasting_21d', 'hypothyroidism_then_treatment']}),
    ],
    'virtual_human_decade_weekly_2026': [
        ('decade_obesity', '十年尺度，肥胖进程与晚期干预',
         ['body_weight', 'fasting_glucose', 'liver_fat', 'systolic_bp'],
         ['healthy_aging_baseline', 'obesity_progression', 'obesity_then_intervention_year5', 'optimal_lifestyle_decade']),
        ('decade_exposures', '十年尺度，长期暴露与综合终点',
         ['health_score', 'biological_age_delta', 'fev1_pct', 'depressive_symptoms'],
         ['healthy_aging_baseline', 'smoker_decade', 'heavy_alcohol_decade', 'chronic_stress_short_sleep_decade', 'optimal_lifestyle_decade']),
    ],
    'virtual_human_appetite_daily_2026': [
        ('appetite_diet', '24 周限食 1500 kcal，克制程度的影响',
         ['body_weight', 'energy_intake_eff', 'homeostatic_hunger', 'fat_mass'],
         ['baseline_feedback', 'diet1500_strict', 'diet1500_half', 'diet1500_adlib', 'diet1500_then_relapse']),
        ('appetite_sleep_stress', '睡眠与压力，反馈关闭与开启',
         ['body_weight', 'energy_intake_eff', 'hedonic_eating_drive', 'fat_mass'],
         ['baseline_feedback', 'sleep5h_open', 'sleep5h_feedback', 'stress_sleep_sedentary_open', 'stress_sleep_sedentary_feedback']),
        ('appetite_overfeed', '计划摄入 3200 kcal，克制程度的影响',
         ['body_weight', 'energy_intake_eff', 'fat_mass', 'unrestrained_intake'],
         ['baseline_feedback', 'overfeed_open', 'overfeed_half', 'overfeed_strict']),
    ],
    'appetite_energy_regulation_subset_2026': [
        ('subset_sleep_dose', '睡眠时长剂量反应',
         ['body_weight', 'energy_intake_eff', 'homeostatic_hunger', 'hedonic_eating_drive'],
         ['sleep_7_5h_control', 'sleep_6_5h', 'sleep_5_5h', 'sleep_4_5h', 'sleep_5_5h_open']),
        ('subset_stress_dose', '压力负荷剂量反应',
         ['body_weight', 'energy_intake_eff', 'hedonic_eating_drive', 'fat_mass'],
         ['sleep_7_5h_control', 'stress_0_5', 'stress_0_7', 'stress_0_9', 'stress_0_9_open']),
    ],
}

# markers whose first crossing day is tabulated: (variable, threshold, direction)
CROSSINGS = [('fasting_glucose', 126, 'up'), ('hba1c', 6.5, 'up'), ('systolic_bp', 140, 'up'),
             ('liver_fat', 5.5, 'up'), ('bmi', 30, 'up'), ('bmi', 18.5, 'down'), ('hemoglobin', 13, 'down'),
             ('crp', 3, 'up')]
END_COLS = ['body_weight', 'body_fat_pct', 'fasting_glucose', 'hba1c', 'systolic_bp', 'ldl_c', 'liver_fat',
            'hemoglobin', 'health_score']


# --------------------------------------------------------------------------------------
# markdown block injection
# --------------------------------------------------------------------------------------

def inject(path, name, text):
    s = path.read_text(encoding='utf-8')
    pat = re.compile(rf'(<!-- BEGIN:{name} -->)\n?.*?\n?(<!-- END:{name} -->)', re.S)
    if not pat.search(s):
        raise SystemExit(f'marker {name} missing in {path}')
    body = text.rstrip(chr(10))
    path.write_text(pat.sub(lambda m: m.group(1) + chr(10) + body + chr(10) + m.group(2), s), encoding='utf-8')


def md_table(header, rows):
    out = ['| ' + ' | '.join(header) + ' |', '|' + '|'.join('---' for _ in header) + '|']
    out += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in rows]
    return '\n'.join(out)


def fmt(x):
    if x is None:
        return '无'
    return f'{x:.4g}'


# --------------------------------------------------------------------------------------
# scenario data
# --------------------------------------------------------------------------------------

def load_plans(sim_dir, stem):
    d = Path(sim_dir) / stem
    out = {}
    for p in sorted(d.glob(f'{stem}_*_sim__*.csv')):
        pid = p.stem.split('_sim__', 1)[1]
        with open(p, encoding='utf-8') as f:
            rd = csv.DictReader(f)
            cols = {k: [] for k in rd.fieldnames}
            for row in rd:
                for k, v in row.items():
                    cols[k].append(float(v))
        out[pid] = cols
    return out


def scenario_meta(stem):
    d = yaml.safe_load((L.models_dir() / SCEN_REL / f'{stem}.yaml').read_text(encoding='utf-8'))
    labels = {p['id']: p['label'] for p in d['simulation']['plans']}
    return d, labels


def crossing_day(cols, var, thr, direction, step_days):
    vals = cols.get(var)
    if vals is None:
        return None
    for i, v in enumerate(vals):
        if (direction == 'up' and v > thr) or (direction == 'down' and v < thr):
            return int(cols['step'][i] * step_days) if 'step' in cols else i * step_days
    return None


def plan_tables(stem, plans, labels, step_days):
    """End values and first crossing days for every plan of one scenario."""
    order = [pid for pid in labels if pid in plans]
    rows = []
    for pid in order:
        c = plans[pid]
        rows.append([f'`{pid}`', labels[pid]] + [fmt(c[v][-1]) if v in c else '无' for v in END_COLS])
    end_tab = md_table(['方案', '说明'] + [VAR_CN.get(v, v) + '' for v in END_COLS], rows)
    have = [(v, t, d) for v, t, d in CROSSINGS if all(v in plans[p] for p in order)]
    hdr = ['方案'] + [f'{VAR_CN.get(v, v)}{"高于" if d == "up" else "低于"} {t}' for v, t, d in have]
    rows2 = []
    for pid in order:
        c = plans[pid]
        cells = []
        for v, t, d in have:
            day = crossing_day(c, v, t, d, step_days)
            cells.append('未越线' if day is None else f'第 {day} 天')
        rows2.append([f'`{pid}`'] + cells)
    cross_tab = md_table(hdr, rows2)
    return end_tab, cross_tab


# --------------------------------------------------------------------------------------
# figures
# --------------------------------------------------------------------------------------

def style_axes(ax):
    ax.set_facecolor(SURFACE)
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    for s in ('left', 'bottom'):
        ax.spines[s].set_color(GRID)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.tick_params(colors=MUTED, labelsize=8)


def draw_figure(out_path, title, panels, plans, labels, step_days):
    n = len(panels)
    cols = 2 if n > 1 else 1
    rows = (n + 1) // 2
    fig, axes = plt.subplots(rows, cols, figsize=(11, 3.3 * rows), facecolor=SURFACE, squeeze=False)
    color_of = {}
    for ax in axes.flat[n:]:
        ax.axis('off')
    for ax, (var, pids) in zip(axes.flat, panels):
        style_axes(ax)
        for pid in pids:
            if pid not in plans or var not in plans[pid]:
                raise SystemExit(f'figure {out_path.name}: plan {pid} or variable {var} missing')
            color = color_of.setdefault(pid, SERIES[len(color_of) % len(SERIES)])
            c = plans[pid]
            x = [s * step_days / 365.25 for s in c['step']]
            ax.plot(x, c[var], color=color, linewidth=1.6, linestyle='--' if SERIES.index(color) >= 4 else '-', label=labels.get(pid, pid))
        if var in REFLINES:
            ax.axhline(REFLINES[var][0], color=MUTED, linewidth=0.9, linestyle=(0, (4, 3)))
        ax.set_title(f'{VAR_CN.get(var, var)}，{UNIT.get(var, "")}', fontsize=10, color=INK, loc='left')
        ax.set_xlabel('年', fontsize=8, color=MUTED)
    handles, names = [], []
    for ax in axes.flat[:n]:
        for h, nm in zip(*ax.get_legend_handles_labels()):
            if nm not in names:
                handles.append(h)
                names.append(nm)
    fig.suptitle(title, fontsize=12, color=INK, x=0.01, ha='left')
    fig.legend(handles, names, loc='lower center', ncol=min(len(names), 3), frameon=False, fontsize=8,
               labelcolor=INK)
    fig.tight_layout(rect=(0, 0.06 + 0.025 * ((len(names) - 1) // 3), 1, 0.96))
    fig.savefig(out_path, dpi=130, facecolor=SURFACE)
    plt.close(fig)


def scenario_figures(sim_dir, fig_dir):
    made = []
    for stem, specs in FIGURES.items():
        plans = load_plans(sim_dir, stem)
        d, labels = scenario_meta(stem)
        step_days = float(d['simulation']['step_size']['value'])
        for fname, title, vars_, plan_ids in specs:
            panels = [(v, plan_ids[v] if isinstance(plan_ids, dict) else plan_ids) for v in vars_]
            draw_figure(fig_dir / f'{fname}.png', title, panels, plans, labels, step_days)
            made.append(fname)
    return made


def pair_stats(pr, hz):
    """Cells clear jointly, compensation cells and synergy cells of one input pair at one horizon."""
    clear = comp = syn = 0
    for c in pr['cells']:
        ok = c[hz]['finite'] and not c[hz]['flags']
        oa = not pr['axes']['a'][c['i']][hz]['flags']
        ob = not pr['axes']['b'][c['j']][hz]['flags']
        clear += ok
        comp += ok and not (oa and ob)
        syn += (oa and ob) and not ok
    return clear, comp, syn


def pairs_figure(pairs, out_path):
    n = pairs['levels']
    fig, axes = plt.subplots(2, 3, figsize=(11, 7.2), facecolor=SURFACE)
    shades = ['#f1f5fb', '#d3e2f6', '#a8c6ee', '#6f9fe0', '#2a78d6', '#1c4f95']
    for ax, pr in zip(axes.flat, pairs['pairs']):
        style_axes(ax)
        ax.grid(False)
        grid = [[0] * n for _ in range(n)]
        for c in pr['cells']:
            grid[c['j']][c['i']] = len(c['y8']['flags']) if c['y8']['finite'] else 9
        for j in range(n):
            for i in range(n):
                k = min(grid[j][i], len(shades) - 1)
                ax.add_patch(plt.Rectangle((i - 0.5, j - 0.5), 1, 1, facecolor=shades[k], edgecolor=SURFACE, linewidth=1.5))
                if grid[j][i]:
                    ax.text(i, j, str(grid[j][i]), ha='center', va='center', fontsize=7, color=INK if k < 4 else SURFACE)
        fa = (pr['ref_a'] - pr['a_values'][0]) / (pr['a_values'][-1] - pr['a_values'][0]) * (n - 1)
        fb = (pr['ref_b'] - pr['b_values'][0]) / (pr['b_values'][-1] - pr['b_values'][0]) * (n - 1)
        ax.plot([fa], [fb], marker='o', markersize=8, color=INK, markeredgecolor=SURFACE, markeredgewidth=1.5)
        ax.set_xlim(-0.5, n - 0.5)
        ax.set_ylim(-0.5, n - 0.5)
        ax.set_xticks([0, n - 1])
        ax.set_xticklabels([f'{pr["a_values"][0]:g}', f'{pr["a_values"][-1]:g}'])
        ax.set_yticks([0, n - 1])
        ax.set_yticklabels([f'{pr["b_values"][0]:g}', f'{pr["b_values"][-1]:g}'])
        ax.set_xlabel(f'{INPUT_CN[pr["a"]]} {pr["a"]}', fontsize=8, color=INK)
        ax.set_ylabel(f'{INPUT_CN[pr["b"]]} {pr["b"]}', fontsize=8, color=INK)
    fig.suptitle('两个输入同时变化，第 8 年末越线的指标个数，空白为全部不越线，黑点为参考值', fontsize=11, color=INK, x=0.01, ha='left')
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(out_path, dpi=130, facecolor=SURFACE)
    plt.close(fig)


def pairs_table(pairs):
    n2 = pairs['levels'] ** 2
    rows = []
    for pr in pairs['pairs']:
        cells = [f'{INPUT_CN[pr["a"]]} 与 {INPUT_CN[pr["b"]]}']
        for hz in ('y2', 'y8'):
            clear, comp, syn = pair_stats(pr, hz)
            cells += [f'{clear} / {n2}', comp, syn]
        rows.append(cells)
    return md_table(['输入组合', '2 年不越线格数', '2 年补偿格数', '2 年协同格数', '8 年不越线格数', '8 年补偿格数', '8 年协同格数'], rows)


def envelope_figure(env, out_path):
    summ = env['summary']
    names = sorted(summ, key=lambda v: (summ[v]['y8']['clinical'] or {'hi': 0, 'lo': 0})['hi'] - (summ[v]['y8']['clinical'] or {'lo': 0})['lo'])
    fig, ax = plt.subplots(figsize=(10, 0.42 * len(names) + 1.4), facecolor=SURFACE)
    style_axes(ax)
    ax.grid(False)
    ax.grid(True, axis='x', color=GRID, linewidth=0.8)
    for i, v in enumerate(names):
        s = summ[v]
        span = s['hi'] - s['lo']
        f = lambda x: (x - s['lo']) / span  # noqa: E731
        ax.barh(i, 1.0, height=0.5, color=GRID, zorder=1)
        for hz, color, h in (('y2', SERIES[0], 0.26), ('y8', SERIES[1], 0.14)):
            r = s[hz]['clinical']
            if r is not None:
                ax.barh(i, f(r['hi']) - f(r['lo']), left=f(r['lo']), height=h, color=color, zorder=2)
        ax.plot([f(s['ref'])], [i], marker='o', markersize=6, color=INK, markeredgecolor=SURFACE, markeredgewidth=1.5, zorder=3)
        ax.text(-0.01, i, f'{s["lo"]:g}', ha='right', va='center', fontsize=7, color=MUTED)
        ax.text(1.01, i, f'{s["hi"]:g}', ha='left', va='center', fontsize=7, color=MUTED)
    ax.set_yticks(range(len(names)))
    ax.set_yticklabels([f'{INPUT_CN[v]}  {v}' for v in names], fontsize=8, color=INK)
    ax.set_xlim(-0.08, 1.08)
    ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0])
    ax.set_xticklabels(['试验下限', '', '', '', '试验上限'])
    ax.set_title('各输入单独变化时，主要指标不越线的范围', fontsize=11, color=INK, loc='left')
    from matplotlib.lines import Line2D
    ax.legend([Line2D([0], [0], color=SERIES[0], lw=5), Line2D([0], [0], color=SERIES[1], lw=3),
               Line2D([0], [0], marker='o', color=INK, lw=0)],
              ['2 年终点不越线', '8 年终点不越线', '参考值'], loc='upper right', bbox_to_anchor=(1.0, 1.04), ncol=3, frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(out_path, dpi=130, facecolor=SURFACE)
    plt.close(fig)


# --------------------------------------------------------------------------------------
# tables: components, dependencies, ladder, envelope
# --------------------------------------------------------------------------------------

def load_ladder(ladder_dir):
    res = {}
    for p in Path(ladder_dir).glob('*.json'):
        d = json.load(open(p, encoding='utf-8'))
        res[tuple(d['systems'])] = d
    return res


def sort_key(S):
    return tuple(sorted(S, key=L.ORDER.index))


def ladder_by_size(res):
    rows = []
    by_k = {}
    for S, r in res.items():
        by_k.setdefault(len(S), []).append(r)
    for k in sorted(by_k):
        rs = by_k[k]
        nf = sum(1 for r in rs if any(i['sev'] == 'fail' for i in r['issues']))
        nw = sum(1 for r in rs if r['issues'] and not any(i['sev'] == 'fail' for i in r['issues']))
        full = 'all' if len(rs) == math.comb(len(L.ORDER), k) else 'sample'
        rows.append([k, f'{len(rs)} {"全部" if full == "all" else "抽样"}', len(rs) - nf - nw, nw, nf])
    total = [sum(r[i] if isinstance(r[i], int) else int(str(r[i]).split()[0]) for r in rows) for i in (1, 2, 3, 4)]
    rows.append(['合计', total[0], total[1], total[2], total[3]])
    return md_table(['系统数', '组合数', '无问题', '仅警告', '含失败'], rows)


def dependency_matrix(info, owner):
    keys = L.ORDER
    header = ['读取方 \\ 提供方'] + [SYSTEM_CN[k] for k in keys]
    rows = []
    for a in keys:
        cnt = Counter()
        for v in info[a]['reads']:
            o = owner.get(v)
            if o and o != a and o != 'inputs':
                cnt[o] += 1
        rows.append([SYSTEM_CN[a]] + [str(cnt[b]) if cnt[b] else '' for b in keys])
    return md_table(header, rows)


def pair_matrix(res):
    keys = L.ORDER
    header = [''] + [SYSTEM_CN[k] for k in keys]
    rows = []
    for i, a in enumerate(keys):
        cells = []
        for j, b in enumerate(keys):
            if j <= i:
                cells.append('' if j < i else '单独')
                continue
            r = res.get(sort_key((a, b)))
            if r is None:
                cells.append('未测')
            elif any(x['sev'] == 'fail' for x in r['issues']):
                cells.append('失败')
            elif r['issues']:
                cells.append('警告')
            else:
                cells.append('通过')
        rows.append([SYSTEM_CN[a]] + cells)
    return md_table(header, rows)


def pair_warning_table(res):
    rows = []
    for S, r in sorted(res.items(), key=lambda kv: [L.ORDER.index(s) for s in kv[0]]):
        if len(S) != 2 or not r['issues']:
            continue
        c = Counter((i['var'], i['code']) for i in r['issues'])
        items = '，'.join(f'`{v}` {code}' for (v, code), _ in sorted(c.items()))
        rows.append([' + '.join(SYSTEM_CN[s] for s in S), items])
    return md_table(['两两组合', '警告的变量与判定'], rows) if rows else '两两组合无警告。'


def component_cards(docs, owner, info, res, env):
    base = L.models_dir() / L.COMP_REL
    readers = {k: set() for k in L.ORDER}
    for a in L.ORDER:
        for v in info[a]['reads']:
            o = owner.get(v)
            if o in readers and o != a:
                readers[o].add(a)
    out = []
    for key in L.ORDER:
        d = docs[key]
        m = d['metadata']
        stem = L.SYSTEMS[key]
        r1 = res.get((key,))
        ins = L.active_inputs(info, owner, (key,))
        states = [(k, v) for k, v in d['variables'].items() if v.get('type') == 'state']
        providers = sorted({owner[v] for v in info[key]['reads'] if owner.get(v) not in (key, 'inputs', None)}, key=L.ORDER.index)
        pair_warn = []
        pair_fail = []
        for other in L.ORDER:
            if other == key:
                continue
            r = res.get(sort_key((key, other)))
            if r is None:
                continue
            if any(x['sev'] == 'fail' for x in r['issues']):
                pair_fail.append(other)
            elif r['issues']:
                pair_warn.append(other)
        problem = m['description']['problem'].strip().lstrip('- ').split('\n')[0]
        lines = [f'### {SYSTEM_CN[key]}', '',
                 f'组件文件 [`{stem}.yaml`](../../../references/medical/physiology/human_body/{stem}.yaml)，独立验证 sim [`{key}_stability_2026.yaml`](../../../test_validation/human_body_stability/{key}_stability_2026.yaml)。', '',
                 problem, '',
                 f'- 状态变量 {len(states)} 个，方程 {len(d.get("equations") or {})} 条，评分中的置信度 {m["ratings"]["confidence"].split(" - ")[0]}。',
                 '- 状态变量：' + '、'.join(f'`{k}`' for k, _ in states),
                 '- 直接使用的输入：' + ('、'.join(f'`{v}`' for v in ins) if ins else '无'),
                 '- 直接读取的其他系统：' + ('、'.join(SYSTEM_CN[p] for p in providers) if providers else '无'),
                 '- 被读取于：' + ('、'.join(SYSTEM_CN[p] for p in sorted(readers[key], key=L.ORDER.index)) if readers[key] else '无'), '']
        if r1:
            nw = sum(1 for i in r1['issues'] if i['sev'] == 'warn')
            nf = sum(1 for i in r1['issues'] if i['sev'] == 'fail')
            lines.append(f'单独运行的可行性：读取的其他系统变量固定为参考值，{r1["n_plans"]} 个方案覆盖每个输入的上下界常量、脉冲、随机组合与初态扰动，失败判定 {nf} 项，警告 {nw} 项。')
            pins = r1.get('pins') or {}
            if pins:
                lines += ['', '单独运行时触及自身边界的情形：']
                for var, plans in sorted(pins.items()):
                    txt = '、'.join(_plan_phrase(p) for p in plans)
                    lines.append(f'- `{var}` 在{txt}时触及边界。')
            else:
                lines += ['', '单独运行时没有变量触及自身边界。']
            lines.append('')
        lines.append('与其他系统的两两组合：' + (f'14 个搭档全部无失败判定，其中 {len(pair_warn)} 个组合含警告，搭档为 ' + '、'.join(SYSTEM_CN[o] for o in pair_warn) + '。' if pair_warn else '14 个搭档全部无失败判定，也无警告。') if not pair_fail else f'与 {"、".join(SYSTEM_CN[o] for o in pair_fail)} 的组合出现失败判定。')
        lines.append('')
        lines.append('局限：' + m['description']['limitations'].strip().replace('\n- ', '').lstrip('- ').replace('\n', ''))
        lines.append('')
        out.append('\n'.join(lines))
    return '\n'.join(out)


def component_overview(docs, owner, info, res):
    rows = []
    for key in L.ORDER:
        d = docs[key]
        r1 = res.get((key,))
        n_states = sum(1 for v in d['variables'].values() if v.get('type') == 'state')
        ins = L.active_inputs(info, owner, (key,))
        nw = sum(1 for i in r1['issues'] if i['sev'] == 'warn') if r1 else 0
        nf = sum(1 for i in r1['issues'] if i['sev'] == 'fail') if r1 else 0
        pair_warn = sum(1 for o in L.ORDER if o != key and (res.get(sort_key((key, o))) or {}).get('issues'))
        rows.append([f'[{SYSTEM_CN[key]}](#{SYSTEM_CN[key]})', n_states, len(d.get('equations') or {}), len(ins),
                     f'{r1["n_plans"]} 方案，失败 {nf}，警告 {nw}' if r1 else '未测',
                     f'14 个搭档无失败，{pair_warn} 个含警告'])
    return md_table(['系统', '状态变量', '方程', '直接使用的输入数', '单独运行', '两两组合'], rows)


def _plan_phrase(plan):
    for suf, word in (('_lo', '下限'), ('_hi', '上限'), ('_pulse', '脉冲')):
        if plan.endswith(suf):
            v = plan[:-len(suf)]
            return f'`{v}` 取{word}' if suf != '_pulse' else f'`{v}` 出现脉冲'
    return f'方案 `{plan}`'


def envelope_tables(env):
    summ = env['summary']
    rows = []
    for v in sorted(summ, key=lambda k: list(INPUT_CN).index(k)):
        s = summ[v]
        cells = [f'{INPUT_CN[v]} `{v}`', fmt(s['ref']), f'{fmt(s["lo"])} 至 {fmt(s["hi"])}']
        for hz in ('y2', 'y8'):
            r = s[hz]['clinical']
            if r is None:
                cells += ['参考值处已越线', '']
                continue
            full = (r['lo'] == s['lo'] and r['hi'] == s['hi'])
            rng = '全范围' if full else f'{fmt(r["lo"])} 至 {fmt(r["hi"])}'
            lim = []
            if r['lo_limit']:
                lim.append('下侧 ' + '、'.join(MARKER_CN.get(m, m) for m in r['lo_limit']))
            if r['hi_limit']:
                lim.append('上侧 ' + '、'.join(MARKER_CN.get(m, m) for m in r['hi_limit']))
            cells += [rng, '，'.join(lim) if lim else '无']
        rows.append(cells)
    clinical = md_table(['输入', '参考值', '试验范围', '2 年不越线区间', '2 年限制指标', '8 年不越线区间', '8 年限制指标'], rows)
    rows2 = []
    for v in sorted(summ, key=lambda k: list(INPUT_CN).index(k)):
        s = summ[v]
        cells = [f'{INPUT_CN[v]} `{v}`']
        for hz in ('y2', 'y8'):
            r = s[hz]['valid']
            if r is None:
                cells += ['参考值处触边', '']
                continue
            full = (r['lo'] == s['lo'] and r['hi'] == s['hi'])
            rng = '全范围' if full else f'{fmt(r["lo"])} 至 {fmt(r["hi"])}'
            lim = []
            if r['lo_limit']:
                lim.append('下侧 ' + '、'.join(f'`{x}`' for x in r['lo_limit']))
            if r['hi_limit']:
                lim.append('上侧 ' + '、'.join(f'`{x}`' for x in r['hi_limit']))
            cells += [rng, '，'.join(lim) if lim else '无']
        rows2.append(cells)
    bounds = md_table(['输入', '2 年无变量触边区间', '2 年最先触边的变量', '8 年无变量触边区间', '8 年最先触边的变量'], rows2)
    marks = md_table(['指标', '越线判据'], [
        [f'{MARKER_CN[m]} `{m}`', ('低于 ' + fmt(lo)) if hi is None else (('高于 ' + fmt(hi)) if lo is None else f'低于 {fmt(lo)} 或高于 {fmt(hi)}')]
        for m, (lo, hi) in env['markers'].items()])
    return clinical, bounds, marks


# --------------------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------------------

def cmd_all(args):
    root = L.models_dir() / SCEN_REL / REPORT_DIR
    fig_dir = root / 'figures'
    fig_dir.mkdir(parents=True, exist_ok=True)
    docs, owner, info = L.load_registry()
    res = load_ladder(args.ladder)
    env = json.load(open(args.envelope, encoding='utf-8'))

    made = scenario_figures(args.sim_dir, fig_dir)
    envelope_figure(env, fig_dir / 'operating_range.png')
    print('figures:', ', '.join(made + ['operating_range']))

    inject(root / 'virtual_human_report_components.md', 'overview', component_overview(docs, owner, info, res))
    inject(root / 'virtual_human_report_components.md', 'cards', component_cards(docs, owner, info, res, env))
    inject(root / 'virtual_human_report_combinations.md', 'ladder_levels', ladder_by_size(res))
    inject(root / 'virtual_human_report_combinations.md', 'dependency', dependency_matrix(info, owner))
    inject(root / 'virtual_human_report_combinations.md', 'pairs', pair_matrix(res))
    inject(root / 'virtual_human_report_combinations.md', 'pair_warnings', pair_warning_table(res))
    clinical, bounds, marks = envelope_tables(env)
    inject(root / 'virtual_human_report_operating_range.md', 'clinical', clinical)
    inject(root / 'virtual_human_report_operating_range.md', 'bounds', bounds)
    inject(root / 'virtual_human_report_operating_range.md', 'markers', marks)
    if args.envelope_pairs:
        pairs = json.load(open(args.envelope_pairs, encoding='utf-8'))
        pairs_figure(pairs, fig_dir / 'operating_range_pairs.png')
        inject(root / 'virtual_human_report_operating_range.md', 'pairs_table', pairs_table(pairs))

    files = {
        'virtual_human_daily_2026': 'virtual_human_report_scenario_daily.md',
        'virtual_human_decade_weekly_2026': 'virtual_human_report_scenario_decade.md',
        'virtual_human_appetite_daily_2026': 'virtual_human_report_scenario_appetite.md',
        'appetite_energy_regulation_subset_2026': 'virtual_human_report_scenario_appetite_subset.md',
    }
    for stem, fname in files.items():
        plans = load_plans(args.sim_dir, stem)
        d, labels = scenario_meta(stem)
        step_days = float(d['simulation']['step_size']['value'])
        if 'fasting_glucose' in next(iter(plans.values())):
            end_tab, cross_tab = plan_tables(stem, plans, labels, step_days)
            inject(root / fname, 'crossings', cross_tab)
        else:
            end_tab = _short_end_table(plans, labels)
        inject(root / fname, 'end_values', end_tab)
    inject(root / 'virtual_human_report_scenario_appetite_subset.md', 'consistency', subset_consistency(args.sim_dir))
    print('tables injected')


def subset_consistency(sim_dir):
    """Same plans in the six file subset and in the full system, compared on the last day both cover."""
    full = load_plans(sim_dir, 'virtual_human_appetite_daily_2026')
    sub = load_plans(sim_dir, 'appetite_energy_regulation_subset_2026')
    _, labels = scenario_meta('appetite_energy_regulation_subset_2026')
    rows = []
    for pid in labels:
        if pid not in sub or pid not in full:
            continue
        n = min(len(sub[pid]['step']), len(full[pid]['step'])) - 1
        cells = [f'`{pid}`', labels[pid], int(sub[pid]['step'][n])]
        for v in ('body_weight', 'fat_mass', 'energy_intake_eff'):
            a, b = full[pid][v][n], sub[pid][v][n]
            cells += [fmt(a), fmt(b), f'{b - a:+.2f}']
        rows.append(cells)
    return md_table(['方案', '说明', '比较日'] + [f'{VAR_CN[v]}{k}' for v in ('body_weight', 'fat_mass', 'energy_intake_eff') for k in ('全系统', '子集', '差')], rows)


def _short_end_table(plans, labels):
    cols = [v for v in ['body_weight', 'body_fat_pct', 'fat_mass', 'lean_mass', 'energy_intake_eff', 'homeostatic_hunger',
                        'hedonic_eating_drive', 'depressive_symptoms', 'fatigue_index'] if v in next(iter(plans.values()))]
    rows = []
    for pid in labels:
        if pid in plans:
            rows.append([f'`{pid}`', labels[pid]] + [fmt(plans[pid][v][-1]) for v in cols])
    return md_table(['方案', '说明'] + [VAR_CN.get(v, v) if v in VAR_CN else v for v in cols], rows)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('all')
    a.add_argument('--sim-dir', required=True)
    a.add_argument('--ladder', required=True)
    a.add_argument('--envelope', required=True)
    a.add_argument('--envelope-pairs', default='')
    args = ap.parse_args()
    {'all': cmd_all}[args.cmd](args)


if __name__ == '__main__':
    main()
