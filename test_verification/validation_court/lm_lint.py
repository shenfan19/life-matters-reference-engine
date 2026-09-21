"""Static lint over an LM model library, the depth D1 baseline of the validation court.

Deterministic, no engine run, no AI. Reads every LM yaml under a models root and
writes one CSV row per file plus a summary on stdout.

Usage:
    python lm_lint.py <models_root> [--out lint.csv] [--include-plans] [--include-fixtures]

Skipped by default: history folders, temp_* folders, test_fixtures, plans.
"""

import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

SKIP_DIR_PREFIXES = ("temp_",)
SKIP_DIR_NAMES = {"history", "__pycache__"}
RATING_KEYS = ["importance", "variable", "equation", "simulation", "optimization", "innovation", "confidence"]
DIST_RE = re.compile(r"^\s*(normal|lognormal|uniform|triangular|beta)\s*\(([^)]*)\)\s*$", re.I)

COLUMNS = [
    "path", "category", "domain", "name", "parse_error", "noref_filename",
    "lm_format_version", "reviewed", "confidence", "ratings_missing",
    "todo_count", "todo_types", "todo_source_marks",
    "n_variables", "n_state", "n_input", "n_parameter",
    "params_missing_reference", "variables_missing_unit", "values_out_of_bounds",
    "n_equations", "has_simulation", "has_optimization",
    "has_references_block", "n_references", "legacy_metadata_references",
    "n_imports", "imports_unresolved", "description_empty", "flags",
]


def iter_yaml(root, include_plans, include_fixtures):
    for p in sorted(root.rglob("*.yaml")):
        rel_parts = p.relative_to(root).parts
        dirs = rel_parts[:-1]
        if any(d in SKIP_DIR_NAMES or d.startswith(SKIP_DIR_PREFIXES) for d in dirs):
            continue
        if not include_plans and dirs[:1] == ("plans",):
            continue
        if not include_fixtures and dirs[:1] == ("test_fixtures",):
            continue
        yield p


def build_import_index(root):
    index = set()
    for p in root.rglob("*.yaml"):
        rel = p.relative_to(root).with_suffix("")
        index.add(rel.as_posix())
        index.add(rel.name)
    return index


def numeric(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = DIST_RE.match(v)
        if m and m.group(1).lower() in ("normal", "lognormal"):
            try:
                return float(m.group(2).split(",")[0])
            except ValueError:
                return None
    return None


def reviewed_token(meta):
    r = meta.get("reviewed")
    if r is None:
        return ""
    if isinstance(r, bool):
        return str(r).lower()
    return str(r).strip().split(" ")[0].lower()


def lint_file(path, root, import_index):
    rel = path.relative_to(root)
    parts = rel.parts
    row = {c: "" for c in COLUMNS}
    row["path"] = rel.as_posix()
    row["category"] = parts[0] if len(parts) > 1 else ""
    row["domain"] = "/".join(parts[1:3]) if len(parts) > 3 else "/".join(parts[1:-1])
    row["noref_filename"] = int("_noref" in path.stem)
    text = path.read_text(encoding="utf-8", errors="replace")
    row["todo_source_marks"] = text.count("TODO:SOURCE")
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        row["parse_error"] = str(exc).splitlines()[0][:120]
        row["flags"] = "PARSE_ERROR"
        return row
    if not isinstance(doc, dict):
        row["parse_error"] = "not a mapping"
        row["flags"] = "PARSE_ERROR"
        return row

    meta = doc.get("metadata") or {}
    row["name"] = meta.get("name", "")
    row["lm_format_version"] = meta.get("lm_format_version", "")
    row["reviewed"] = reviewed_token(meta)

    ratings = meta.get("ratings") or {}
    row["ratings_missing"] = ";".join(k for k in RATING_KEYS if k not in ratings and k != "innovation")
    conf = ratings.get("confidence")
    if conf is not None:
        m = re.match(r"\s*([0-9.]+)", str(conf))
        row["confidence"] = m.group(1) if m else ""

    todo = meta.get("todo") or []
    row["todo_count"] = len(todo)
    row["todo_types"] = ";".join(sorted({str(t.get("type", "")) for t in todo if isinstance(t, dict)}))

    variables = doc.get("variables") or {}
    counts = Counter()
    missing_ref = missing_unit = out_of_bounds = 0
    for vname, v in variables.items():
        if not isinstance(v, dict):
            continue
        vt = v.get("type", "")
        counts[vt] += 1
        if vt in ("parameter", "input") and not v.get("reference") and not v.get("evidence_type"):
            if v.get("value") is not None:
                missing_ref += 1
        if "unit" not in v:
            missing_unit += 1
        val = numeric(v.get("value"))
        bounds = v.get("bounds")
        if val is not None and isinstance(bounds, list) and len(bounds) == 2:
            lo, hi = numeric(bounds[0]), numeric(bounds[1])
            if lo is not None and hi is not None and not (lo <= val <= hi):
                out_of_bounds += 1
    row["n_variables"] = len(variables)
    row["n_state"], row["n_input"], row["n_parameter"] = counts["state"], counts["input"], counts["parameter"]
    row["params_missing_reference"] = missing_ref
    row["variables_missing_unit"] = missing_unit
    row["values_out_of_bounds"] = out_of_bounds

    row["n_equations"] = len(doc.get("equations") or {})
    row["has_simulation"] = int("simulation" in doc)
    row["has_optimization"] = int("optimization" in doc)

    refs = doc.get("references")
    row["has_references_block"] = int(refs is not None)
    row["n_references"] = len(refs) if isinstance(refs, (list, dict)) else 0
    row["legacy_metadata_references"] = int("references" in meta)

    imports = doc.get("imports") or []
    row["n_imports"] = len(imports)
    unresolved = []
    for imp in imports:
        key = str(imp).removesuffix(".yaml")
        if key not in import_index and Path(key).name not in import_index:
            unresolved.append(key)
    row["imports_unresolved"] = ";".join(unresolved)

    desc = meta.get("description")
    row["description_empty"] = int(not desc or (isinstance(desc, dict) and not any(desc.values())))

    flags = []
    if row["noref_filename"]:
        flags.append("NOREF_FILENAME")
    if row["todo_source_marks"]:
        flags.append("TODO_SOURCE")
    if missing_ref and not (row["has_references_block"] or row["n_references"]):
        flags.append("NO_REFERENCES_BLOCK")
    if missing_ref:
        flags.append("PARAMS_WITHOUT_REFERENCE")
    if missing_unit:
        flags.append("MISSING_UNIT")
    if out_of_bounds:
        flags.append("VALUE_OUT_OF_BOUNDS")
    if unresolved:
        flags.append("IMPORT_UNRESOLVED")
    if row["legacy_metadata_references"]:
        flags.append("LEGACY_METADATA_REFERENCES")
    if row["description_empty"]:
        flags.append("NO_DESCRIPTION")
    if row["reviewed"] in ("", "false"):
        flags.append("NOT_HUMAN_REVIEWED")
    row["flags"] = ";".join(flags)
    return row


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="models root directory")
    ap.add_argument("--out", help="write per-file CSV here")
    ap.add_argument("--include-plans", action="store_true")
    ap.add_argument("--include-fixtures", action="store_true")
    ap.add_argument("--only", help="lint only files whose relative path contains this text and print each row")
    args = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    root = Path(args.root).resolve()
    index = build_import_index(root)
    rows = [lint_file(p, root, index) for p in iter_yaml(root, args.include_plans, args.include_fixtures)
            if not args.only or args.only in p.relative_to(root).as_posix()]
    if args.only:
        for r in rows:
            print(yaml.safe_dump({k: v for k, v in r.items() if v != ""}, allow_unicode=True, sort_keys=False))
        return

    if args.out:
        with open(args.out, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=COLUMNS)
            w.writeheader()
            w.writerows(rows)

    by_cat = Counter(r["category"] for r in rows)
    flag_counts = Counter()
    for r in rows:
        for f in filter(None, r["flags"].split(";")):
            flag_counts[f] += 1
    print(f"files scanned: {len(rows)}")
    print("by category: " + ", ".join(f"{k}={v}" for k, v in sorted(by_cat.items())))
    print("flags:")
    for flag, n in flag_counts.most_common():
        print(f"  {flag}: {n}")
    for cat in sorted(by_cat):
        sub = [r for r in rows if r["category"] == cat]
        srcs = sum(int(r["todo_source_marks"] or 0) for r in sub)
        oob = sum(int(r["values_out_of_bounds"] or 0) for r in sub)
        pm = sum(int(r["params_missing_reference"] or 0) for r in sub)
        print(f"{cat}: files={len(sub)} TODO:SOURCE marks={srcs} params without reference={pm} values out of bounds={oob}")


if __name__ == "__main__":
    main()
