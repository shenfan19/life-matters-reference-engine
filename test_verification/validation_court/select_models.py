"""Resolve a selector to a list of model files, for batch validation.

The batch skill turns a spoken request such as "validate the renal models" into
selector arguments, this script does the deterministic part.

Usage:
    python select_models.py <models_root> [selectors] [--court-root DIR] [--limit N] [--paths-only]
    python select_models.py <models_root> --list-tags
    python select_models.py <models_root> --list-domains

Selectors, all combined with AND, repeated options combine with OR:
    --path GLOB        fnmatch on the path relative to the models root, for example "references/medical/*"
    --category NAME    top folder, references, papers, scenarios, sensitive
    --tag TAG          metadata.tags contains TAG, case insensitive
    --name TEXT        model name or file stem contains TEXT
    --text TEXT        TEXT appears in name, tags, path or description, case insensitive
    --tier T1..T5      budget tier, see below
    --status STATE     none, fresh, stale, any, judged against verdicts under --court-root
    --grade G          verdict grade, A B C1 C2 D E U H

The test_validation case models are left out unless --include-test-cases is given.

Tiers, draft rules for the batch skill:
    T1  files under papers
    T2  imported by two or more other models
    T3  the remaining references, scenarios and sensitive models
    T4  files under plans, only listed with --include-plans
    T5  models tagged as fictional or game settings
"""

import argparse
import fnmatch
import hashlib
import sys
from collections import Counter
from pathlib import Path

import yaml

from lm_lint import iter_yaml

FICTIONAL_TAGS = {"fictional", "fantasy", "scifi", "sci-fi", "cyberpunk", "game", "vampire", "fiction"}


def load_all(root, include_plans, include_test_cases):
    files = [p for p in iter_yaml(root, include_plans, False)
             if include_test_cases or p.relative_to(root).parts[0] != "test_validation"]
    info = {}
    by_key = {}
    for p in files:
        rel = p.relative_to(root)
        by_key[rel.with_suffix("").as_posix()] = rel.as_posix()
    by_name = {}
    for rel in by_key.values():
        by_name.setdefault(Path(rel).stem, []).append(rel)
    for p in files:
        rel = p.relative_to(root).as_posix()
        try:
            doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            doc = {}
        meta = doc.get("metadata") or {} if isinstance(doc, dict) else {}
        desc = meta.get("description")
        desc_text = " ".join(str(v) for v in desc.values()) if isinstance(desc, dict) else str(desc or "")
        info[rel] = {
            "rel": rel,
            "category": rel.split("/")[0],
            "name": str(meta.get("name", Path(rel).stem)),
            "tags": [str(t).lower() for t in (meta.get("tags") or [])],
            "desc": desc_text.lower(),
            "imports": doc.get("imports") or [] if isinstance(doc, dict) else [],
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        }
    imported = Counter()
    for rel, m in info.items():
        for imp in m["imports"]:
            key = str(imp).removesuffix(".yaml")
            target = by_key.get(key) or by_key.get(f"{key}/{Path(key).name}")
            if target is None:
                cands = by_name.get(Path(key).name, [])
                target = cands[0] if len(cands) == 1 else None
            if target and target != rel:
                imported[target] += 1
    for rel, m in info.items():
        m["imported_by"] = imported[rel]
        m["tier"] = tier_of(m)
    return info


def tier_of(m):
    if FICTIONAL_TAGS & set(m["tags"]):
        return "T5"
    if m["category"] == "papers":
        return "T1"
    if m["imported_by"] >= 2:
        return "T2"
    if m["category"] == "plans":
        return "T4"
    return "T3"


def load_verdicts(court_root):
    out = {}
    if not court_root:
        return out
    for f in Path(court_root).rglob("*.verdict.yaml"):
        try:
            v = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            continue
        out[f.name.removesuffix(".verdict.yaml")] = v
    return out


def status_of(m, verdicts):
    v = verdicts.get(Path(m["rel"]).stem)
    if not v:
        return "none", ""
    stale = v.get("model_sha256") != m["sha256"]
    return ("stale" if stale else "fresh"), str(v.get("grade", ""))


def matches(m, args, verdicts):
    status, grade = status_of(m, verdicts)
    m["status"], m["grade"] = status, grade
    if args.path and not any(fnmatch.fnmatch(m["rel"], g) for g in args.path):
        return False
    if args.category and m["category"] not in args.category:
        return False
    if args.tag and not any(t.lower() in m["tags"] for t in args.tag):
        return False
    if args.name and not any(n.lower() in (m["name"] + " " + Path(m["rel"]).stem).lower() for n in args.name):
        return False
    if args.text:
        hay = " ".join([m["name"].lower(), " ".join(m["tags"]), m["rel"].lower(), m["desc"]])
        if not any(t.lower() in hay for t in args.text):
            return False
    if args.tier and m["tier"] not in args.tier:
        return False
    if args.status and args.status != "any" and status != args.status:
        return False
    if args.grade and grade not in args.grade:
        return False
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root")
    ap.add_argument("--path", action="append")
    ap.add_argument("--category", action="append")
    ap.add_argument("--tag", action="append")
    ap.add_argument("--name", action="append")
    ap.add_argument("--text", action="append")
    ap.add_argument("--tier", action="append")
    ap.add_argument("--status", choices=["none", "fresh", "stale", "any"])
    ap.add_argument("--grade", action="append")
    ap.add_argument("--court-root")
    ap.add_argument("--include-plans", action="store_true")
    ap.add_argument("--include-test-cases", action="store_true", help="also list the test_validation case models")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--paths-only", action="store_true")
    ap.add_argument("--list-tags", action="store_true")
    ap.add_argument("--list-domains", action="store_true")
    args = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    root = Path(args.root).resolve()
    info = load_all(root, args.include_plans, args.include_test_cases)

    if args.list_tags:
        for tag, n in Counter(t for m in info.values() for t in m["tags"]).most_common():
            print(f"{n:4d}  {tag}")
        return
    if args.list_domains:
        dom = Counter("/".join(m["rel"].split("/")[:3]) for m in info.values())
        for d, n in sorted(dom.items()):
            print(f"{n:4d}  {d}")
        return

    verdicts = load_verdicts(args.court_root)
    picked = [m for m in info.values() if matches(m, args, verdicts)]
    picked.sort(key=lambda m: (m["tier"], -m["imported_by"], m["rel"]))
    total = len(picked)
    if args.limit:
        picked = picked[: args.limit]
    if args.paths_only:
        for m in picked:
            print(m["rel"])
        return
    print(f"matched {total}, showing {len(picked)}")
    for m in picked:
        print(f"{m['tier']}  imported_by={m['imported_by']}  status={m['status']}  grade={m['grade'] or '-'}  {m['rel']}")


if __name__ == "__main__":
    main()
