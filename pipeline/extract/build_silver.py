"""Build a paper's Silver file from the double reading (D-16) and the official final key.

Inputs (a reading directory, kept outside both repos while a paper is being read):
  reads/a.jsonl      Part A, one question per line: {"n", "lang": "ta", "stem", "options": {A..E}, "tick", ...}
  reads/b_en.jsonl   Part B English text, same shape
  reads/b_ta.jsonl   Part B Tamil text, same shape (optional: older papers may be English-only)
  key.json           final key: {"1": "A", "28": "A/B", "63": "ALL", ...}
  pages.json         question number -> page of the question-paper PDF
  paper.json         paper metadata: id, exam, year, qbCode, date, title, qpRef, keyRef, keySource
  key_revisions.json optional: {"119": "why"} for questions where the answer marked on the question paper
                     differs from the final key (TNPSC revised it). Each one is checked, kept as keyRevised.

Checks (the script stops on any failure, so a bad reading can't reach Gold):
  - every question 1..200 is present exactly once per part and language
  - the tick read on the question paper is one of the final key's accepted answers (ALL accepts anything),
    unless key_revisions.json lists the question; a listed question whose tick does match is also an error
  - English and Tamil readings of a Part B question carry the same tick and format
  - every question has options A-E

Output: <content>/silver/tnpsc/<paper id>/questions.json (deterministic: same inputs, same bytes).
Usage: python build_silver.py <reading-dir> <content-repo>
This script holds no content itself.
"""
import json
import sys
from pathlib import Path

EXTRA = ("format", "note", "figure")  # optional fields a reader may add to a question
# figure: the question needs a diagram from the PDF; the stem only describes it


def load_jsonl(path: Path) -> dict[int, dict]:
    rows: dict[int, dict] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if r["n"] in rows:
            sys.exit(f"{path.name}: question {r['n']} appears twice")
        rows[r["n"]] = r
    return rows


def accepted_of(key_value: str) -> list[str] | str:
    return "ALL" if key_value == "ALL" else sorted(key_value.split("/"))


def text_of(r: dict) -> dict:
    opts = r["options"]
    if sorted(opts) != ["A", "B", "C", "D", "E"]:
        sys.exit(f"question {r['n']} ({r['lang']}): options {sorted(opts)}, expected A-E")
    return {"stem": r["stem"], "options": {k: opts[k] for k in "ABCDE"}}


def main(reading: Path, content: Path) -> None:
    paper = json.loads((reading / "paper.json").read_text(encoding="utf-8"))
    key = json.loads((reading / "key.json").read_text(encoding="utf-8"))
    pages = {int(k): v for k, v in json.loads((reading / "pages.json").read_text()).items()}
    part_a = load_jsonl(reading / "reads/a.jsonl")
    b_en = load_jsonl(reading / "reads/b_en.jsonl")
    b_ta_path = reading / "reads/b_ta.jsonl"
    b_ta = load_jsonl(b_ta_path) if b_ta_path.exists() else {}
    rev_path = reading / "key_revisions.json"
    revisions = {int(k): v for k, v in json.loads(rev_path.read_text(encoding="utf-8")).items()} if rev_path.exists() else {}

    expect = {"Part A": (part_a, range(1, 101)), "Part B (en)": (b_en, range(101, 201))}
    if b_ta:
        expect["Part B (ta)"] = (b_ta, range(101, 201))
    for name, (rows, want) in expect.items():
        if sorted(rows) != list(want):
            sys.exit(f"{name}: questions {sorted(set(want) - set(rows))} missing, {sorted(set(rows) - set(want))} extra")
    if sorted(key) != sorted(str(n) for n in range(1, 201)) or sorted(pages) != list(range(1, 201)):
        sys.exit("key.json and pages.json must cover questions 1-200")

    questions, problems = [], []
    for n in range(1, 201):
        k = key[str(n)]
        accepted = accepted_of(k)
        q: dict = {"n": n, "section": "tamil" if n <= 100 else "gs_apt", "page": pages[n]}
        readings = [part_a[n]] if n <= 100 else [b_en[n]] + ([b_ta[n]] if b_ta else [])
        for r in readings:
            matches = accepted == "ALL" or r["tick"] in accepted
            if not matches and n not in revisions:
                problems.append(f"Q{n} ({r['lang']}): tick {r['tick']} not in final key {k}")
            if matches and n in revisions:
                problems.append(f"Q{n}: listed in key_revisions.json but the tick matches the final key")
            q[r["lang"]] = text_of(r)
        if len({r["tick"] for r in readings}) > 1 or len({r.get("format") for r in readings}) > 1:
            problems.append(f"Q{n}: English and Tamil readings disagree on tick or format")
        for field in EXTRA:
            vals = [r[field] for r in readings if field in r]
            if vals:
                q[field] = True if field == "figure" else vals[0] if field == "format" else "; ".join(vals)
        q["tick"] = readings[0]["tick"]
        q["accepted"] = accepted
        q["keyStatus"] = "final"
        if n in revisions:
            q["keyRevised"] = revisions[n]
        questions.append(q)
    if problems:
        sys.exit("Reading does not match the final key:\n  " + "\n  ".join(problems))

    out = {**paper, "method": "D-16 double reading: Claude reading of page images, compared with OCR; ticks checked against the final key",
           "questions": questions}
    target = content / "silver/tnpsc" / paper["id"] / "questions.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    langs = "Part A ta, Part B en" + ("+ta" if b_ta else "")
    print(f"{paper['id']}: 200 questions ({langs}); {sum(q['accepted'] == 'ALL' for q in questions)} ALL, "
          f"{sum(isinstance(q['accepted'], list) and len(q['accepted']) > 1 for q in questions)} multi-answer -> {target}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
