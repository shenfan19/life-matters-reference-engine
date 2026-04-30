"""
update_yaml_steps.py

Batch-updates all YAML files under models/ to implement the new step_size design:
  1. Add step_size to metadata block (using existing step_unit, default 'minute')
  2. Remove step and step_unit from simulation/simulator block
  3. Replace `step_size` symbol with `step` in formula dynamics/formula expression strings

Skips files that already have metadata.step_size, or have no metadata block.
"""

import re
import sys
from pathlib import Path

try:
    from ruamel.yaml import YAML
    from ruamel.yaml.comments import CommentedMap
    USE_RUAMEL = True
except ImportError:
    USE_RUAMEL = False
    print("WARNING: ruamel.yaml not available, falling back to regex-based approach")

MODELS_DIR = Path("C:/green/b_matter_code/models")

# ── regex for formula expression replacement ────────────────────────────────
# Matches `step_size` as a whole word within YAML string values (not as a key).
# We operate on the raw text after confirming context.
STEP_SIZE_IN_EXPR = re.compile(r'\bstep_size\b')

# Matches `step:` or `step_unit:` as a YAML key at the start of a line
# (with optional leading spaces), used for removal in simulation block.
STEP_KEY_LINE = re.compile(r'^(\s+)(step|step_unit)\s*:.*\n?', re.MULTILINE)

# Matches `interpolation: step` (do NOT touch)
# (used only for awareness; we won't accidentally replace it because we
#  only replace within formula dynamics strings, not key lines)


def process_file_ruamel(path: Path) -> tuple[bool, str]:
    """
    Process a YAML file using ruamel.yaml (preserves comments/formatting).
    Returns (was_changed, reason_if_skipped).
    """
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096  # prevent line wrapping

    text = path.read_text(encoding="utf-8")
    data = yaml.load(text)

    if not isinstance(data, dict):
        return False, "not a mapping"

    # ── Skip check ──────────────────────────────────────────────────────────
    metadata = data.get("metadata")
    if metadata is None:
        return False, "no metadata block"

    if "step_size" in metadata:
        return False, "already has metadata.step_size"

    # ── Rule 1: determine step_unit and add step_size to metadata ────────────
    sim_block = data.get("simulation") or data.get("simulator")
    step_unit = "minute"
    if isinstance(sim_block, dict):
        step_unit = sim_block.get("step_unit", "minute")

    # Insert step_size into metadata
    metadata["step_size"] = CommentedMap()
    metadata["step_size"]["value"] = 1
    metadata["step_size"]["unit"] = step_unit

    # ── Rule 2: remove step and step_unit from simulation/simulator block ────
    if isinstance(sim_block, dict):
        sim_block.pop("step", None)
        sim_block.pop("step_unit", None)

    # ── Rule 3: replace step_size -> step in formula dynamics/formula values ─
    # We walk formulas and patch any string values under dynamics or formula keys.
    formulas = data.get("formulas")
    changed_expressions = []
    if isinstance(formulas, dict):
        for fname, fblock in formulas.items():
            if not isinstance(fblock, dict):
                continue
            # Replace in `dynamics` sub-keys
            dyn = fblock.get("dynamics")
            if isinstance(dyn, dict):
                for var_name, expr in dyn.items():
                    if isinstance(expr, str) and STEP_SIZE_IN_EXPR.search(expr):
                        dyn[var_name] = STEP_SIZE_IN_EXPR.sub("step", expr)
                        changed_expressions.append(f"  formulas.{fname}.dynamics.{var_name}")
            # Replace in `formula` key (some models use this instead of dynamics)
            formula_expr = fblock.get("formula")
            if isinstance(formula_expr, str) and STEP_SIZE_IN_EXPR.search(formula_expr):
                fblock["formula"] = STEP_SIZE_IN_EXPR.sub("step", formula_expr)
                changed_expressions.append(f"  formulas.{fname}.formula")

    # ── Write back ───────────────────────────────────────────────────────────
    import io
    buf = io.StringIO()
    yaml.dump(data, buf)
    new_text = buf.getvalue()
    path.write_text(new_text, encoding="utf-8")

    detail = f"added step_size (unit={step_unit})"
    if changed_expressions:
        detail += f"; replaced step_size->step in {len(changed_expressions)} expression(s)"
    return True, detail


def process_file_regex(path: Path) -> tuple[bool, str]:
    """
    Fallback: process using raw text + regex.
    Less precise but works without ruamel.yaml.
    """
    text = path.read_text(encoding="utf-8")

    # ── Skip check ──────────────────────────────────────────────────────────
    if not re.search(r'^metadata\s*:', text, re.MULTILINE):
        return False, "no metadata block"

    if re.search(r'^\s+step_size\s*:', text, re.MULTILINE):
        # Check if it's under metadata specifically — rough heuristic:
        # if step_size appears before the first non-metadata top-level key
        return False, "already has step_size (detected via regex)"

    # ── Determine step_unit ─────────────────────────────────────────────────
    m = re.search(r'^\s+step_unit\s*:\s*(\S+)', text, re.MULTILINE)
    step_unit = m.group(1).strip('"\'') if m else "minute"

    # ── Rule 1: inject step_size after last metadata field ──────────────────
    # Find the metadata block end by locating the first top-level key after metadata
    # Strategy: insert after the metadata block's last line before the next top-level key
    def inject_step_size(t, unit):
        # Find position just before first top-level non-metadata key
        # Top-level key = line starting with a non-space, non-comment char + ':'
        meta_match = re.search(r'^metadata\s*:', t, re.MULTILINE)
        if not meta_match:
            return t, False
        # Find next top-level key after metadata
        rest_start = meta_match.end()
        next_top = re.search(r'\n([a-zA-Z_][a-zA-Z0-9_]*\s*:)', t[rest_start:])
        if next_top:
            insert_pos = rest_start + next_top.start() + 1  # after the \n
        else:
            insert_pos = len(t)
        step_size_yaml = f"  step_size:\n    value: 1\n    unit: {unit}\n"
        return t[:insert_pos] + step_size_yaml + t[insert_pos:], True

    text, injected = inject_step_size(text, step_unit)
    if not injected:
        return False, "could not inject step_size"

    # ── Rule 2: remove step: and step_unit: lines from simulation block ──────
    # We only remove these inside the simulation/simulator block.
    # Heuristic: remove lines matching `  step: N` and `  step_unit: X`
    # that are NOT `  step_size:` and not `interpolation: step`
    def remove_sim_step_lines(t):
        # Remove `  step: <number>` lines (but not step_size)
        t = re.sub(r'^\s{1,4}step\s*:\s*\d+.*\n', '', t, flags=re.MULTILINE)
        # Remove `  step_unit: <word>` lines
        t = re.sub(r'^\s{1,4}step_unit\s*:\s*\S+.*\n', '', t, flags=re.MULTILINE)
        return t

    text = remove_sim_step_lines(text)

    # ── Rule 3: replace step_size -> step in formula expression strings ──────
    # Only within lines that are under dynamics: or formula: (value lines, not keys)
    # Approach: replace `step_size` that appears in YAML string values
    # We avoid replacing `step_size:` (key occurrences) by using word-boundary
    # and ensuring it's not followed by a colon.
    def replace_in_expressions(t):
        # Replace `step_size` when NOT immediately followed by `:` (key)
        return re.sub(r'\bstep_size\b(?!\s*:)', 'step', t)

    text_after = replace_in_expressions(text)
    expr_changed = text_after != text
    text = text_after

    path.write_text(text, encoding="utf-8")
    detail = f"added step_size (unit={step_unit})"
    if expr_changed:
        detail += "; replaced step_size->step in expression(s)"
    return True, detail


def main():
    yaml_files = sorted(MODELS_DIR.rglob("*.yaml"))
    print(f"Found {len(yaml_files)} YAML files under {MODELS_DIR}\n")

    updated = []
    skipped = []
    errors = []

    for path in yaml_files:
        try:
            if USE_RUAMEL:
                changed, detail = process_file_ruamel(path)
            else:
                changed, detail = process_file_regex(path)

            rel = path.relative_to(MODELS_DIR.parent)
            if changed:
                updated.append((rel, detail))
                print(f"  UPDATED  {rel}")
                print(f"           {detail}")
            else:
                skipped.append((rel, detail))
        except Exception as e:
            rel = path.relative_to(MODELS_DIR.parent)
            errors.append((rel, str(e)))
            print(f"  ERROR    {rel}: {e}", file=sys.stderr)

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Updated : {len(updated)}")
    print(f"Skipped : {len(skipped)}")
    print(f"Errors  : {len(errors)}")

    if skipped:
        print(f"\nSkipped files:")
        for rel, reason in skipped:
            print(f"  {rel}  ({reason})")

    if errors:
        print(f"\nErrors:")
        for rel, err in errors:
            print(f"  {rel}  ERROR: {err}")


if __name__ == "__main__":
    main()
