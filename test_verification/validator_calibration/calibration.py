"""Calibration of the validation court, node V1c.

The court is an instrument, so it is calibrated before it is trusted. Two kinds
of material are used.

    positive controls   models with a known good outcome, the court should not downgrade them
    injected faults     copies of positive controls with one known defect planted, the court should catch them

Subcommands:

    make-faults <models_root> <out_dir> [--seed N]
        writes fault injected copies plus manifest.yaml into out_dir, one copy per fault type and control
    score <manifest.yaml> <verdicts_dir>
        reads the verdict cards the court produced for the copies and the controls, prints detection rate,
        attribution hit rate and false positive rate, exit code 1 when a threshold is missed
    selftest
        checks the scoring logic on synthetic verdicts

Verdict cards are read from <verdicts_dir>/<model file stem>.verdict.yaml, searched recursively.
"""

import copy
import random
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent
GRADE_RANK = {"A": 0, "B": 1, "C1": 2, "C2": 3, "D": 4, "E": 5}

# section 4 of the design, thresholds are drafts to be confirmed
THRESHOLDS = {"detection": 0.8, "attribution": 0.7, "false_positive": 0.2}

# fault type -> grades the court is expected to return, expected layer of the finding
FAULTS = {
    "unit_24x": {"expect_grades": ["C1", "C2", "D"], "layer": "V"},
    "value_typo_x10": {"expect_grades": ["C1", "C2"], "layer": "V"},
    "sign_param": {"expect_grades": ["C2", "D", "E"], "layer": "V"},
    "default_out_of_bounds": {"expect_grades": ["C1", "C2"], "layer": "V"},
    "fake_citation": {"expect_grades": ["C1", "C2"], "layer": "V"},
    "eq_sign_flip": {"expect_grades": ["D", "E"], "layer": "E"},
}


def load_controls():
    return yaml.safe_load((HERE / "positive_controls.yaml").read_text(encoding="utf-8"))["controls"]


def numeric_params(doc):
    """Parameter variables with a plain numeric value, largest magnitude first."""
    out = []
    for name, v in (doc.get("variables") or {}).items():
        if isinstance(v, dict) and v.get("type") == "parameter":
            val = v.get("value")
            if isinstance(val, (int, float)) and not isinstance(val, bool) and val != 0:
                out.append(name)
    return out


def inject(doc, fault, rng):
    """Return (mutated doc, locus) or (None, reason) when the fault does not apply."""
    doc = copy.deepcopy(doc)
    variables = doc.get("variables") or {}
    if fault in ("unit_24x", "value_typo_x10", "sign_param", "default_out_of_bounds"):
        params = numeric_params(doc)
        if not params:
            return None, "no numeric parameter"
        if fault == "default_out_of_bounds":
            params = [p for p in params if isinstance(variables[p].get("bounds"), list)]
            if not params:
                return None, "no parameter with bounds"
        name = rng.choice(params)
        v = variables[name]
        if fault == "unit_24x":
            v["value"] = v["value"] * 24
        elif fault == "value_typo_x10":
            v["value"] = v["value"] * 10
        elif fault == "sign_param":
            v["value"] = -v["value"]
        else:
            hi = v["bounds"][1]
            v["value"] = (hi * 1.5) if hi > 0 else (hi - 1)
        return doc, f"variables.{name}"
    if fault == "fake_citation":
        refs = doc.get("references")
        if isinstance(refs, list) and refs:
            i = rng.randrange(len(refs))
            entry = refs[i]
            if isinstance(entry, str):
                refs[i] = re.sub(r"\b(19|20)\d{2}\b", "1987", entry, count=1) + " Fabrication study"
            elif isinstance(entry, dict):
                key = next(iter(entry))
                refs[i] = {key + " fabricated entry 1987": entry[key]}
            return doc, f"references[{i}]"
        return None, "no references list"
    if fault == "eq_sign_flip":
        eqs = doc.get("equations") or {}
        cands = []
        for n, e in eqs.items():
            dyn = e.get("dynamics") if isinstance(e, dict) else None
            if isinstance(dyn, dict):
                cands.extend((n, target) for target, expr in dyn.items() if isinstance(expr, str) and " - " in expr)
        if not cands:
            return None, "no equation with a subtraction"
        name, target = rng.choice(cands)
        eqs[name]["dynamics"][target] = eqs[name]["dynamics"][target].replace(" - ", " + ", 1)
        return doc, f"equations.{name}.dynamics.{target}"
    return None, "unknown fault"


def make_faults(models_root, out_dir, seed):
    rng = random.Random(seed)
    root, out = Path(models_root), Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"seed": seed, "faults": [], "controls": []}
    for ctrl in load_controls():
        src = root / ctrl["path"]
        doc = yaml.safe_load(src.read_text(encoding="utf-8"))
        manifest["controls"].append({"path": ctrl["path"], "stem": src.stem, "expect_grades": ctrl["expect_grades"]})
        for fault, spec in FAULTS.items():
            mutated, locus = inject(doc, fault, rng)
            if mutated is None:
                manifest["faults"].append({"source": ctrl["path"], "fault": fault, "skipped": locus})
                continue
            stem = f"{src.stem}__{fault}"
            (out / f"{stem}.yaml").write_text(
                yaml.safe_dump(mutated, allow_unicode=True, sort_keys=False, width=100000), encoding="utf-8")
            manifest["faults"].append({
                "source": ctrl["path"], "fault": fault, "stem": stem, "locus": locus,
                "expect_grades": spec["expect_grades"], "expect_layer": spec["layer"],
            })
    (out / "manifest.yaml").write_text(yaml.safe_dump(manifest, allow_unicode=True, sort_keys=False), encoding="utf-8")
    made = sum(1 for f in manifest["faults"] if "stem" in f)
    print(f"{made} fault copies and {len(manifest['controls'])} controls listed in {out / 'manifest.yaml'}")


def find_verdict(verdicts_dir, stem):
    hits = list(Path(verdicts_dir).rglob(f"{stem}.verdict.yaml"))
    return yaml.safe_load(hits[0].read_text(encoding="utf-8")) if hits else None


def score_manifest(manifest, get_verdict):
    detected = attributed = injected = 0
    false_pos = controls = 0
    missing = []
    rows = []
    for f in manifest["faults"]:
        if "stem" not in f:
            continue
        v = get_verdict(f["stem"])
        if v is None:
            missing.append(f["stem"])
            continue
        injected += 1
        hit = v.get("grade") in f["expect_grades"]
        detected += hit
        layers = v.get("finding_layers") or []
        attr = hit and (not layers or f["expect_layer"] in layers)
        attributed += attr
        rows.append((f["stem"], f["fault"], v.get("grade"), "detected" if hit else "MISSED"))
    for c in manifest["controls"]:
        v = get_verdict(c["stem"])
        if v is None:
            missing.append(c["stem"])
            continue
        controls += 1
        bad = v.get("grade") not in c["expect_grades"] and v.get("grade") not in ("U", "H", "-")
        false_pos += bad
        rows.append((c["stem"], "control", v.get("grade"), "FALSE POSITIVE" if bad else "ok"))
    res = {
        "detection": detected / injected if injected else None,
        "attribution": attributed / injected if injected else None,
        "false_positive": false_pos / controls if controls else None,
        "n_faults": injected, "n_controls": controls, "missing": missing, "rows": rows,
    }
    res["pass"] = (
        bool(injected and controls) and not missing
        and res["detection"] >= THRESHOLDS["detection"]
        and res["attribution"] >= THRESHOLDS["attribution"]
        and res["false_positive"] <= THRESHOLDS["false_positive"]
    )
    return res


def score(manifest_path, verdicts_dir):
    manifest = yaml.safe_load(Path(manifest_path).read_text(encoding="utf-8"))
    res = score_manifest(manifest, lambda stem: find_verdict(verdicts_dir, stem))
    for row in res["rows"]:
        print("  ".join(str(x) for x in row))
    print(f"detection rate: {res['detection']}  attribution hit rate: {res['attribution']}  false positive rate: {res['false_positive']}")
    print(f"thresholds: {THRESHOLDS}")
    if res["missing"]:
        print("missing verdicts: " + ", ".join(res["missing"]))
    print("CALIBRATED" if res["pass"] else "NOT CALIBRATED")
    return 0 if res["pass"] else 1


def selftest():
    manifest = {
        "faults": [
            {"stem": "m__unit_24x", "fault": "unit_24x", "expect_grades": ["C1", "C2", "D"], "expect_layer": "V"},
            {"stem": "m__eq_sign_flip", "fault": "eq_sign_flip", "expect_grades": ["D", "E"], "expect_layer": "E"},
            {"stem": "m__fake_citation", "fault": "fake_citation", "expect_grades": ["C1", "C2"], "expect_layer": "V"},
            {"stem": "m__value_typo_x10", "fault": "value_typo_x10", "expect_grades": ["C1", "C2"], "expect_layer": "V"},
            {"stem": "m__sign_param", "fault": "sign_param", "expect_grades": ["C2", "D", "E"], "expect_layer": "V"},
        ],
        "controls": [{"stem": "m", "expect_grades": ["A", "B"]}, {"stem": "n", "expect_grades": ["A", "B"]}],
    }
    good = {
        "m__unit_24x": {"grade": "C2", "finding_layers": ["V"]},
        "m__eq_sign_flip": {"grade": "D", "finding_layers": ["E"]},
        "m__fake_citation": {"grade": "C1", "finding_layers": ["V"]},
        "m__value_typo_x10": {"grade": "C2"},
        "m__sign_param": {"grade": "D"},
        "m": {"grade": "B"}, "n": {"grade": "A"},
    }
    r = score_manifest(manifest, good.get)
    assert r["detection"] == 1.0 and r["false_positive"] == 0.0 and r["pass"], r
    missed = dict(good, **{"m__eq_sign_flip": {"grade": "B"}, "m__sign_param": {"grade": "B"}})
    r = score_manifest(manifest, missed.get)
    assert r["detection"] == 0.6 and not r["pass"], r
    harsh = dict(good, **{"m": {"grade": "D"}, "n": {"grade": "C2"}})
    r = score_manifest(manifest, harsh.get)
    assert r["false_positive"] == 1.0 and not r["pass"], r
    unresolved = dict(good, **{"m": {"grade": "H"}})
    r = score_manifest(manifest, unresolved.get)
    assert r["false_positive"] == 0.0, "H on a control is not counted as a downgrade"
    absent = {k: v for k, v in good.items() if k != "n"}
    r = score_manifest(manifest, absent.get)
    assert r["missing"] == ["n"] and not r["pass"], "missing verdicts must not count as calibrated"
    print("selftest passed")
    return 0


def main(argv):
    if len(argv) >= 2 and argv[1] == "selftest":
        return selftest()
    if len(argv) >= 4 and argv[1] == "make-faults":
        seed = int(argv[argv.index("--seed") + 1]) if "--seed" in argv else 20260921
        make_faults(argv[2], argv[3], seed)
        return 0
    if len(argv) == 4 and argv[1] == "score":
        return score(argv[2], argv[3])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
