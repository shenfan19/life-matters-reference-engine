"""Prepare the inputs of one validation court run from a model file.

Writes three files into the run directory:

    ledger.yaml          mechanical baseline of the claim ledger, with values and references
    blind_sheet.yaml     the same claims with values, references and numeric literals removed
    model_stripped.yaml  the model with self assessment removed, safe to show the independent lines

The ledger produced here holds parameter claims and equation claims only. The
orchestrator adds simulation, optimization and description claims, the domain
class of each claim and the key parameter flag.

Usage:
    python court_prep.py <model.yaml> <run_dir>
"""

import copy
import hashlib
import re
import sys
from pathlib import Path

import yaml

NUM_RE = re.compile(r"(?<![A-Za-z_])[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")
STRIP_META = ("ratings", "todo", "log", "reviewed")
STRIP_DESCRIPTION = ("result", "limitations")


def redact(text):
    return NUM_RE.sub("#", str(text)) if text is not None else ""


def first_sentence(text, limit=240):
    """Keep only the opening sentence, since later sentences tend to carry the derivation."""
    flat = " ".join(str(text or "").split())
    end = re.search(r"[.。;；]\s", flat)
    return flat[: end.start() + 1] if end and end.start() < limit else flat[:limit]


def sha256_of(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def stripped_model(doc):
    out = copy.deepcopy(doc)
    meta = out.get("metadata") or {}
    for key in STRIP_META:
        meta.pop(key, None)
    desc = meta.get("description")
    if isinstance(desc, dict):
        for key in STRIP_DESCRIPTION:
            desc.pop(key, None)
    return out


def build_ledger(doc, model_path):
    meta = doc.get("metadata") or {}
    claims = []
    n = 0
    for name, v in (doc.get("variables") or {}).items():
        if not isinstance(v, dict) or v.get("type") not in ("parameter", "input"):
            continue
        if v.get("value") is None:
            continue
        n += 1
        claims.append({
            "id": f"C{n:03d}",
            "kind": "parameter",
            "layer": "V",
            "class": "",
            "locus": f"variables.{name}",
            "text": f"{name} takes the declared value with unit {v.get('unit', '')}",
            "value": v.get("value"),
            "unit": v.get("unit", ""),
            "bounds": v.get("bounds"),
            "evidence_type": v.get("evidence_type"),
            "reference": v.get("reference"),
            "description": v.get("description"),
            "key": None,
        })
    for name, e in (doc.get("equations") or {}).items():
        if not isinstance(e, dict):
            continue
        n += 1
        claims.append({
            "id": f"C{n:03d}",
            "kind": "mechanism",
            "layer": "E",
            "class": "",
            "locus": f"equations.{name}",
            "text": f"equation {name} encodes the stated mechanism with its direction, form and unit coupling",
            "expression": e.get("dynamics") or e.get("formula") or e.get("expression"),
            "step_unit": e.get("step_unit"),
            "reference": e.get("reference"),
            "description": e.get("description"),
            "key": None,
        })
    return {
        "model": model_path.as_posix(),
        "model_name": meta.get("name", model_path.stem),
        "model_sha256": sha256_of(model_path),
        "imports": doc.get("imports") or [],
        "claims": claims,
    }


def build_blind(ledger):
    blind = []
    for c in ledger["claims"]:
        item = {
            "id": c["id"],
            "kind": c["kind"],
            "layer": c["layer"],
            "locus": c["locus"],
            "text": c["text"],
            "description_redacted": redact(first_sentence(c.get("description"))),
        }
        if c["kind"] == "parameter":
            item["unit"] = c.get("unit", "")
        else:
            item["expression_redacted"] = redact(c.get("expression"))
            item["step_unit"] = c.get("step_unit")
        blind.append(item)
    return {"model_name": ledger["model_name"], "claims": blind}


def dump(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(obj, fh, allow_unicode=True, sort_keys=False, width=100000)


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    model_path, run_dir = Path(argv[1]), Path(argv[2])
    run_dir.mkdir(parents=True, exist_ok=True)
    doc = yaml.safe_load(model_path.read_text(encoding="utf-8"))
    ledger = build_ledger(doc, model_path)
    dump(ledger, run_dir / "ledger.yaml")
    dump(build_blind(ledger), run_dir / "blind_sheet.yaml")
    dump(stripped_model(doc), run_dir / "model_stripped.yaml")
    print(f"claims: {len(ledger['claims'])}, sha256: {ledger['model_sha256'][:12]}")
    print(f"written to {run_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
