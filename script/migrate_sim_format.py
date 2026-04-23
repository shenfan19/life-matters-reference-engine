#!/usr/bin/env python3
"""
Migrate all YAML simulation blocks from old format
  (step_size / time_unit / total_time)
to new format
  (start_date / end_date / step / step_unit)

Also normalises 'simulator:' → 'simulation:'
"""

import os, re, sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')

# ── per-file target config ────────────────────────────────────────────────────
# key = basename of yaml file (must be unique across the tree – all are)
CONFIG = {
    # ── scenarios / social ──────────────────────────────────────────────────
    "ad0228_cn_zhuge_liang.yaml":  dict(start="0228-03-01", end="0228-09-01", step=1,  unit="day"),
    "ad1300_ro_dracula.yaml":      dict(start="1462-06-01", end="1462-06-02", step=10, unit="minute"),
    "ad1666_uk_issac_newton.yaml": dict(start="1666-09-01", end="1666-09-02", step=1,  unit="minute"),
    "ad1847_hu_semmelweis.yaml":   dict(start="1847-01-01", end="1865-01-01", step=1,  unit="month"),
    "ad1910_po_marie_curie.yaml":  dict(start="1910-01-01", end="1918-01-01", step=1,  unit="month"),
    "ad1945_jp_hiroshima_nurse.yaml": dict(start="1945-08-06", end="1945-08-21", step=1, unit="hour"),

    # ── test scenarios ──────────────────────────────────────────────────────
    "test_daily_life.yaml":  dict(start="2026-01-01", end="2026-01-02", step=10, unit="minute"),
    "test_schedule.yaml":    dict(start="2026-01-01", end="2026-01-02", step=10, unit="minute"),
    "test_valid.yaml":       dict(start="2026-01-01", end="2026-01-02", step=1,  unit="minute"),
    "test_banana.yaml":      dict(start="2026-01-01", end="2026-01-02", step=1,  unit="minute"),
    "test_nutrition.yaml":   dict(start="2026-01-01", end="2026-01-02", step=1,  unit="minute"),

    # ── disease / acute ─────────────────────────────────────────────────────
    "flu.yaml":                    dict(start="2026-01-01", end="2026-01-25", step=1, unit="day"),

    # ── disease / chronic ───────────────────────────────────────────────────
    "alcohol_liver.yaml":          dict(start="2026-01-01", end="2026-04-01", step=1, unit="day"),
    "ckd_protein_muscle.yaml":     dict(start="2026-01-01", end="2026-12-31", step=1, unit="day"),
    "hypertension_gout.yaml":      dict(start="2026-01-01", end="2026-04-01", step=1, unit="day"),
    "stress_health.yaml":          dict(start="2026-01-01", end="2026-04-11", step=1, unit="day"),

    # ── disease / metabolic ─────────────────────────────────────────────────
    "complications.yaml":  dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "diabetes.yaml":       dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "diabetes_core.yaml":  dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "inflammation.yaml":   dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "obesity.yaml":        dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),

    # ── physiology ──────────────────────────────────────────────────────────
    "banister_fitness_fatigue.yaml": dict(start="2026-01-01", end="2026-07-01", step=1, unit="day"),
    "digestive_system.yaml":         dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "endocrine_system.yaml":         dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "energy_balance.yaml":           dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "glucose_regulation.yaml":       dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "insulin_system.yaml":           dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "newton_study.yaml":             dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "nutrition_intake.yaml":         dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "physiology.yaml":               dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),

    # ── fitness ─────────────────────────────────────────────────────────────
    "running.yaml":     dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "swimming.yaml":    dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "tabletennis.yaml": dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "tennis.yaml":      dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "basketball.yaml":  dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "football.yaml":    dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),

    # ── nutrition / diet ────────────────────────────────────────────────────
    "banana_intervention.yaml": dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "england_1665_diet.yaml":   dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "simple_nutrition.yaml":    dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),

    # ── nutrition / food ────────────────────────────────────────────────────
    "banana_physiology.yaml": dict(start="2026-01-01", end="2026-01-15", step=1, unit="day"),
    "cooked_meat.yaml":       dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "noodle.yaml":            dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),
    "raw_berry.yaml":         dict(start="2026-01-01", end="2026-01-02", step=1, unit="minute"),

    # ── social components ───────────────────────────────────────────────────
    "disaster.yaml":       dict(start="2026-01-01", end="2026-01-03", step=1, unit="hour"),
    "war.yaml":            dict(start="2026-01-01", end="2026-12-31", step=1, unit="month"),
    "labor_daily.yaml":    dict(start="2026-01-01", end="2026-01-02", step=1, unit="hour"),
    "labor_economic.yaml": dict(start="2026-01-01", end="2026-12-31", step=1, unit="week"),
}

# Keys to remove from the simulation block
REMOVE_KEYS = {
    "step_size", "time_unit", "total_time", "output_format",
    "dt", "t_end", "method", "duration", "time_step",
    "step", "total", "step_unit",   # old 'new' format
    "pause_every", "hooks",          # runtime-only fields not needed in sim block
}


def migrate_file(path: str, cfg: dict) -> bool:
    """
    Rewrite the simulation/simulator block of a YAML file in-place.
    Returns True if the file was changed.
    """
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    out = []
    in_sim = False
    sim_indent = "  "          # default 2-space indent
    output_vars_lines = []     # collect the output_variables value lines
    injected = False
    i = 0

    while i < len(lines):
        raw = lines[i]
        stripped = raw.rstrip()

        # ── detect simulation/simulator section header ───────────────────
        if re.match(r'^(simulation|simulator)\s*:', stripped):
            in_sim = True
            injected = False
            output_vars_lines = []
            out.append("simulation:\n")
            i += 1
            continue

        if in_sim:
            # blank line: keep (could separate sub-blocks)
            if stripped == "":
                # if we hit blank line after sim block started, keep going
                # but only if we haven't seen any non-indented lines yet
                out.append(raw)
                i += 1
                continue

            # non-indented line = new top-level key → end of sim block
            if raw[0] not in (" ", "\t"):
                if not injected:
                    out.extend(_build_sim(cfg, sim_indent, output_vars_lines))
                    injected = True
                in_sim = False
                out.append(raw)
                i += 1
                continue

            # indented line inside sim block
            indent = len(raw) - len(raw.lstrip())
            sim_indent = " " * indent  # learn indent from first real line

            key_m = re.match(r'^(\s+)(\w+)\s*:', raw)
            if key_m:
                key = key_m.group(2)
                if key in REMOVE_KEYS:
                    # skip this key and its continuation lines
                    i += 1
                    # skip continuation lines that are MORE indented
                    while i < len(lines):
                        nxt = lines[i]
                        if nxt.rstrip() == "":
                            break
                        ni = len(nxt) - len(nxt.lstrip())
                        if ni > indent or nxt.lstrip().startswith("-"):
                            i += 1
                        else:
                            break
                    continue

                elif key == "output_variables":
                    # collect this key and any following list items
                    output_vars_lines = [raw]
                    i += 1
                    while i < len(lines):
                        nxt = lines[i]
                        ni = len(nxt) - len(nxt.lstrip()) if nxt.rstrip() else 0
                        is_list_item = nxt.lstrip().startswith("-")
                        if nxt.rstrip() == "":
                            break
                        if ni > indent or is_list_item:
                            output_vars_lines.append(nxt)
                            i += 1
                        else:
                            break
                    continue

                else:
                    # Some other sim key we don't know – keep as-is
                    out.append(raw)
                    i += 1
                    continue
            else:
                # continuation / list item without known key prefix – keep
                out.append(raw)
                i += 1
                continue
        else:
            out.append(raw)
            i += 1

    # end of file while still in sim block
    if in_sim and not injected:
        out.extend(_build_sim(cfg, sim_indent, output_vars_lines))

    new_content = "".join(out)
    old_content = "".join(lines)
    if new_content == old_content:
        return False

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return True


def _build_sim(cfg: dict, indent: str, output_vars_lines: list) -> list:
    """Build the new simulation block lines."""
    lines = []
    lines.append(f'{indent}start_date: "{cfg["start"]}"\n')
    lines.append(f'{indent}end_date: "{cfg["end"]}"\n')
    lines.append(f'{indent}step: {cfg["step"]}\n')
    lines.append(f'{indent}step_unit: {cfg["unit"]}\n')
    if output_vars_lines:
        lines.extend(output_vars_lines)
    return lines


def main():
    changed = []
    skipped = []

    for root, dirs, files in os.walk(MODELS_DIR):
        # skip story card directories (they just reference variables, not define sim)
        dirs[:] = [d for d in dirs if d not in ("__pycache__",)]
        for fname in files:
            if not fname.endswith((".yaml", ".yml")):
                continue
            if fname not in CONFIG:
                continue
            path = os.path.join(root, fname)
            cfg = CONFIG[fname]
            if migrate_file(path, cfg):
                changed.append(path)
                print(f"  ✓  {os.path.relpath(path, MODELS_DIR)}")
            else:
                skipped.append(fname)

    print(f"\nDone.  Changed: {len(changed)}  |  No-op: {len(skipped)}")
    if skipped:
        print("  No-op files:", skipped)


if __name__ == "__main__":
    main()
