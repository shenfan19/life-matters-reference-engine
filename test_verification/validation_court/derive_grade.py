"""Derive a validation grade from a findings file.

The grade is computed by fixed rules, never assigned by the judge. Rules and
scales are defined in the validation architecture design, section 3.

Usage:
    python derive_grade.py <findings.yaml>      print the derived verdict as YAML
    python derive_grade.py selftest             check every rule against synthetic inputs

Input file layout:

    depth: 3                         # highest depth reached, 0 to 4
    independent_evidence_available: true
    independent_lines_passed: 2      # number of independent lines that passed
    limitations:                     # declared applicability limits
      - "single historical sample"
    findings:
      - id: F001
        layer: V                     # V, E, S, O
        severity: major              # blocker, major, minor, note
        cls: error3                  # bug_candidate, limit, error1, error2, error3
        key_param: true              # finding concerns a key parameter
        core_mechanism_conflict: false
        evidence_grade: S2           # best grade of the contradicting evidence, S1 to S5
        status: open                 # open, disputed, resolved
        disputed_impacts_grade: false
"""

import sys

import yaml

OPEN_SEVERITIES = {"blocker", "major"}

# confidence conversion, section 3.5 of the design
CONFIDENCE = {
    ("A", 4): 1.0,
    ("A", 3): 0.75,
    ("B", 3): 0.5,
    ("C1", None): 0.5,
    ("C2", None): 0.25,
    ("D", None): 0.25,
    ("E", None): 0.25,
}


def _active(findings):
    """Findings that still count: not resolved, not merely a note."""
    return [
        f for f in findings
        if f.get("status", "open") != "resolved" and f.get("severity", "note") != "note"
    ]


def _is_structural(f):
    if f.get("layer") in ("E", "O"):
        return True
    return f.get("layer") == "S" and f.get("cls") in ("error2", "limit", "bug_candidate")


def _is_data(f):
    if f.get("layer") == "V":
        return True
    return f.get("layer") == "S" and f.get("cls") == "error1"


def confidence_for(grade, depth):
    if grade == "B":
        return 0.5 if depth >= 3 else 0.25
    if grade == "A":
        return CONFIDENCE.get(("A", depth), 0.75)
    return CONFIDENCE.get((grade, None))


def derive(doc):
    depth = int(doc.get("depth", 0))
    findings = doc.get("findings") or []
    active = _active(findings)
    limitations = doc.get("limitations") or []
    lines_passed = int(doc.get("independent_lines_passed", 0))
    evidence_available = doc.get("independent_evidence_available", True)

    if depth == 0:
        return _result("-", 0, 0, "depth is D0, nothing was validated", doc)

    # rule 1: unresolved conflict that changes the grade, or an open engine bug candidate
    for f in active:
        if f.get("status") == "disputed" and f.get("disputed_impacts_grade", False):
            return _result("H", 1, depth, f"{f.get('id')} is disputed and the outcome changes the grade", doc)
        if f.get("cls") == "bug_candidate":
            return _result("H", 1, depth, f"{f.get('id')} is an open engine bug candidate, dependent claims are blocked", doc)

    # rule 2: core mechanism contradicts S1 or S2 evidence
    for f in active:
        if (
            f.get("core_mechanism_conflict", False)
            and f.get("evidence_grade") in ("S1", "S2")
            and f.get("severity") in OPEN_SEVERITIES
        ):
            return _result("E", 2, depth, f"{f.get('id')} contradicts S1 or S2 evidence at the core mechanism", doc)

    # rule 3: structural defect
    for f in active:
        if _is_structural(f) and f.get("severity") in OPEN_SEVERITIES:
            return _result("D", 3, depth, f"{f.get('id')} is a structural defect at layer {f.get('layer')}", doc)

    data = [f for f in active if _is_data(f)]

    # rule 4: serious data finding on a key parameter
    for f in data:
        if f.get("key_param", False) and f.get("severity") in OPEN_SEVERITIES:
            return _result("C2", 4, depth, f"{f.get('id')} is a serious data finding on a key parameter", doc)

    # rule 5: any other open data finding
    if data:
        return _result("C1", 5, depth, f"{len(data)} open data finding(s) outside the serious key parameter case", doc)

    # remaining findings of other kinds still block a clean pass
    if active:
        return _result("C1", 5, depth, f"{len(active)} open finding(s) not covered by the structural or data rules", doc)

    # rule 6: nothing independent to compare against
    if not evidence_available:
        return _result("U", 6, depth, "no independent evidence is available", doc)

    # rule 7 and 8: no findings
    if limitations:
        return _result("B", 7, depth, "no findings, applicability limits declared", doc)
    if depth < 3:
        return _result("B", 7, depth, "no findings, depth is below D3", doc)
    if lines_passed < 2:
        return _result("B", 7, depth, "no findings, fewer than two independent lines passed", doc)
    return _result("A", 8, depth, "no findings, depth at least D3, two or more independent lines passed", doc)


def _result(grade, rule, depth, reason, doc):
    return {
        "grade": grade,
        "rule": rule,
        "depth": depth,
        "reason": reason,
        "confidence_ceiling": confidence_for(grade, depth) if grade not in ("-", "U", "H") else None,
        "open_findings": len(_active(doc.get("findings") or [])),
    }


def _f(**kw):
    base = {"id": "F", "layer": "V", "severity": "major", "cls": "error3",
            "key_param": False, "core_mechanism_conflict": False,
            "evidence_grade": "S3", "status": "open"}
    base.update(kw)
    return base


def selftest():
    cases = [
        ("depth zero", {"depth": 0}, "-"),
        ("disputed impacting grade", {"depth": 3, "findings": [_f(status="disputed", disputed_impacts_grade=True)]}, "H"),
        ("bug candidate blocks", {"depth": 3, "findings": [_f(layer="S", cls="bug_candidate")]}, "H"),
        ("core mechanism conflict", {"depth": 3, "findings": [_f(layer="E", cls="error3", core_mechanism_conflict=True, evidence_grade="S1")]}, "E"),
        ("conflict with weak evidence is structural", {"depth": 3, "findings": [_f(layer="E", core_mechanism_conflict=True, evidence_grade="S4")]}, "D"),
        ("equation major", {"depth": 3, "findings": [_f(layer="E", cls="error2")]}, "D"),
        ("optimization blocker", {"depth": 3, "findings": [_f(layer="O", severity="blocker", cls="error2")]}, "D"),
        ("simulation error2", {"depth": 3, "findings": [_f(layer="S", cls="error2")]}, "D"),
        ("key parameter major", {"depth": 3, "findings": [_f(layer="V", key_param=True)]}, "C2"),
        ("non key parameter major", {"depth": 3, "findings": [_f(layer="V", key_param=False)]}, "C1"),
        ("key parameter minor", {"depth": 3, "findings": [_f(layer="V", key_param=True, severity="minor")]}, "C1"),
        ("simulation input error", {"depth": 2, "findings": [_f(layer="S", cls="error1", severity="minor")]}, "C1"),
        ("resolved is ignored", {"depth": 3, "independent_lines_passed": 2, "findings": [_f(status="resolved")]}, "A"),
        ("note is ignored", {"depth": 3, "independent_lines_passed": 2, "findings": [_f(severity="note")]}, "A"),
        ("no independent evidence", {"depth": 2, "independent_evidence_available": False}, "U"),
        ("limitations cap at B", {"depth": 4, "independent_lines_passed": 3, "limitations": ["single case"]}, "B"),
        ("shallow depth caps at B", {"depth": 2, "independent_lines_passed": 3}, "B"),
        ("one line only caps at B", {"depth": 3, "independent_lines_passed": 1}, "B"),
        ("clean deep pass", {"depth": 3, "independent_lines_passed": 2}, "A"),
        ("clean independent prediction", {"depth": 4, "independent_lines_passed": 3}, "A"),
    ]
    failed = 0
    for name, doc, expected in cases:
        got = derive(doc)["grade"]
        ok = got == expected
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name}: expected {expected}, got {got}")
    # priority checks: an earlier rule must win over a later one
    both = {"depth": 3, "findings": [_f(layer="V", key_param=True), _f(id="G", layer="E")]}
    assert derive(both)["grade"] == "D", "structural must win over data"
    both_e = {"depth": 3, "findings": [_f(layer="E"), _f(id="G", layer="E", core_mechanism_conflict=True, evidence_grade="S2")]}
    assert derive(both_e)["grade"] == "E", "core conflict must win over structural"
    print("priority checks passed")
    print(f"{len(cases) - failed}/{len(cases)} cases passed")
    return 1 if failed else 0


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    if argv[1] == "selftest":
        return selftest()
    with open(argv[1], encoding="utf-8") as fh:
        doc = yaml.safe_load(fh) or {}
    print(yaml.safe_dump(derive(doc), allow_unicode=True, sort_keys=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
