"""Build the app's content bundle for an exam path from per-paper Gold files.

Two steps, both deterministic (same inputs give byte-identical output, AT-P1):

  paper <content-repo> <paper-id>
      silver/tnpsc/<paper-id>/questions.json  (from pipeline/extract/build_silver.py)
    + gold/tags/<paper-id>.json               (from the paper's tagging script)
    -> gold/papers/<paper-id>.json            one paper, ready to merge

  merge <content-repo> <path-id> <version>
      every gold/papers/<path-id>_*.json + gold/syllabus/<path-id>.json
    + config/paths/<path-id>.json (optional: rankingExcludedSections per paper)
    + gold/tags/reviews.json        (optional: AK's in-app tag reviews, from tagging/fold_reviews.py)
    + gold/terms/<path-id>.json     (optional: Term Bridge pairs, from terms/build_terms.py)
    -> gold/bundles/<path-id>.json            what the app downloads (papers newest first)

The merge refuses to write a bundle with duplicate question ids, untagged questions, or topics that are not
in the Syllabus Graph. Runs on the private content repo; this script holds no content itself.
Usage: python build_bundle.py paper ~/tnpsc-content ccse4_2024
       python build_bundle.py merge ~/tnpsc-content ccse4 2026-11-22.4
"""
import json
import sys
from pathlib import Path

SECTIONS = {"tamil": "Part A · Tamil", "gs_apt": "Part B · General Studies & Aptitude"}


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, data, pretty: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=1 if pretty else None)
    path.write_text(text + ("\n" if pretty else ""), encoding="utf-8")


def build_paper(content: Path, paper_id: str) -> None:
    silver = read(content / "silver/tnpsc" / paper_id / "questions.json")
    tags = {t["n"]: t for t in read(content / "gold/tags" / f"{paper_id}.json")}
    questions = []
    for s in silver["questions"]:
        n = s["n"]
        if n not in tags:
            sys.exit(f"{paper_id} Q{n}: no tag")
        q = {"id": f"{paper_id}_q{n:03d}", "paperId": paper_id, "n": n, "section": s["section"]}
        for lang in ("ta", "en"):
            if lang in s:
                q[lang] = s[lang]
        q.update({"accepted": s["accepted"], "keyStatus": s["keyStatus"], "status": "active"})
        for field in ("format", "figure"):  # figure: the stem describes a diagram the app can't show yet
            if field in s:
                q[field] = s[field]
        q["source"] = {"exam": silver["exam"], "year": silver["year"], "paper": silver["qbCode"], "qNo": n,
                       "pdfRef": s.get("pdfRef", silver["qpRef"]), "page": s["page"]}
        q["topicId"], q["unitId"] = tags[n]["topicId"], tags[n]["unitId"]
        questions.append(q)
    counts = {sec: sum(q["section"] == sec for q in questions) for sec in SECTIONS}
    paper = {"id": paper_id, "title": silver["title"], "date": silver["date"],
             "sections": [{"id": sec, "title": SECTIONS[sec], "questions": c} for sec, c in counts.items() if c]}
    write(content / "gold/papers" / f"{paper_id}.json", {"paper": paper, "questions": questions}, pretty=True)
    print(f"{paper_id}: {len(questions)} questions -> gold/papers/{paper_id}.json")


def merge(content: Path, path_id: str, version: str) -> None:
    syllabus = read(content / "gold/syllabus" / f"{path_id}.json")
    nodes = {n["id"]: n for n in syllabus["nodes"]}
    files = sorted((content / "gold/papers").glob(f"{path_id}_*.json"))
    if not files:
        sys.exit(f"no gold/papers/{path_id}_*.json")
    parts = sorted((read(f) for f in files), key=lambda p: p["paper"]["date"], reverse=True)  # newest first
    # Per-path decisions AK made about papers (config/paths/<path>.json), e.g. which sections don't count
    # for topic ranking because they were set on an older syllabus. Unknown paper ids are an error.
    cfg_path = content / "config/paths" / f"{path_id}.json"
    cfg = read(cfg_path) if cfg_path.exists() else {}
    excluded = cfg.get("rankingExcludedSections", {})
    unknown = set(excluded) - {p["paper"]["id"] for p in parts}
    if unknown:
        sys.exit(f"{cfg_path.name}: unknown papers {sorted(unknown)}")
    for part in parts:
        secs = excluded.get(part["paper"]["id"])
        if secs:
            part["paper"] = {**part["paper"], "rankingExcludedSections": sorted(secs)}

    # Tag confidence from the tagging scripts (gold/tags/<path>_*.json): the app's tag review screen asks AK
    # about tags below 0.8. A tag counts only if it still names the question's topic.
    confidence = {}
    for f in sorted((content / "gold/tags").glob(f"{path_id}_*.json")):
        for t in read(f):
            confidence[(t["questionId"].rsplit("_", 1)[0], t["n"])] = (t["topicId"], t["tagConfidence"])

    # AK's in-app tag reviews, folded by tagging/fold_reviews.py (optional): the latest verdict per question.
    rev_path = content / "gold/tags/reviews.json"
    reviews = {r["questionId"]: r for r in read(rev_path)} if rev_path.exists() else {}

    questions, seen, problems = [], set(), []
    for part in parts:
        pid = part["paper"]["id"]
        for q in part["questions"]:
            q = {**q, "paperId": pid}
            tag = confidence.get((pid, q["n"]))
            if tag and tag[0] == q.get("topicId"):
                q["tagConfidence"] = tag[1]
            r = reviews.pop(q["id"], None)
            if r:
                node = nodes.get(r["topicId"])
                if node is None or node["level"] != "topic":
                    problems.append(f"{q['id']}: reviewed topic {r['topicId']} not in the syllabus graph")
                else:
                    q["topicId"], q["unitId"], q["tagReviewed"] = r["topicId"], node["parentId"], r["verdict"]
            if q["id"] in seen:
                problems.append(f"duplicate id {q['id']}")
            seen.add(q["id"])
            topic = nodes.get(q.get("topicId", ""))
            if topic is None or topic["level"] != "topic" or topic["parentId"] != q.get("unitId"):
                problems.append(f"{q['id']}: topic {q.get('topicId')} / unit {q.get('unitId')} not in the syllabus graph")
            questions.append(q)
    problems += [f"review for unknown question {qid}" for qid in sorted(reviews)]
    if problems:
        sys.exit("Bundle not written:\n  " + "\n  ".join(problems))

    units = [{"id": n["id"], "nameEn": n["nameEn"], "nameTa": n.get("nameTa"), "questions": n.get("questions")}
             for n in syllabus["nodes"] if n["level"] == "unit"]
    topics = [{"id": n["id"], "unitId": n["parentId"], "nameEn": n["nameEn"], "nameTa": n.get("nameTa")}
              for n in syllabus["nodes"] if n["level"] == "topic"]
    bundle = {"version": version, "builtAt": version.split(".")[0], "papers": [p["paper"] for p in parts],
              "units": units, "questions": questions,  # units in syllabus order, as the official document lists them
              "topics": sorted(topics, key=lambda t: t["id"])}
    terms_path = content / "gold/terms" / f"{path_id}.json"
    if terms_path.exists():
        terms = read(terms_path)
        known = {q["id"] for q in questions}
        bad = [t["en"] for t in terms if t["unitId"] not in nodes or not set(t["questionIds"]) <= known]
        if bad:
            sys.exit(f"Bundle not written: terms with unknown units or questions: {bad}")
        bundle["terms"] = terms
    expected = sum(len(p["questions"]) for p in parts)
    if len(bundle["questions"]) != expected or [p["id"] for p in bundle["papers"]] != [p["paper"]["id"] for p in parts]:
        sys.exit(f"Bundle not written: {len(bundle['questions'])} questions assembled, {expected} expected")
    write(content / "gold/bundles" / f"{path_id}.json", bundle, pretty=False)
    print(f"{path_id}: {len(parts)} papers ({', '.join(p['paper']['id'] for p in parts)}), "
          f"{len(questions)} questions, version {version} -> gold/bundles/{path_id}.json")


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "paper":
        build_paper(Path(args[0]), args[1])
    elif cmd == "merge":
        merge(Path(args[0]), args[1], args[2])
    else:
        sys.exit(__doc__)
