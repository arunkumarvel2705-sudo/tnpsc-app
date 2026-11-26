"""Draw AK's AT-P3 spot check for a paper: 20 questions to compare against the scanned question paper.

Stratified so every reading gets checked: 8 Part A (Tamil), 6 Part B English, 6 Part B Tamil (different
questions; when a paper has no Tamil Part B, its 6 go to Part B English). The seed is the paper id, so the
same paper always gives the same sample.
Writes silver/tnpsc/<paper-id>/review_sample_AT-P3.md. Usage: python review_sample.py <content-repo> <paper-id>
"""
import json
import random
import sys
from pathlib import Path


def block(q: dict, lang: str) -> list[str]:
    t = q[lang]
    key = "ALL (everyone scores)" if q["accepted"] == "ALL" else " / ".join(q["accepted"])
    lines = [f"## Q{q['n']} · page {q['page']} · {'Tamil' if lang == 'ta' else 'English'}", "", "- [ ] matches the scan", ""]
    lines += [t["stem"].replace("\n", "  \n"), ""]
    lines += [f"- ({k}) {v}" for k, v in t["options"].items()]
    lines += ["", f"Final key: {key}", ""]
    return lines


def main(content: Path, paper_id: str) -> None:
    silver = json.loads((content / "silver/tnpsc" / paper_id / "questions.json").read_text(encoding="utf-8"))
    qs = {q["n"]: q for q in silver["questions"]}
    rng = random.Random(paper_id)
    part_a = sorted(rng.sample(range(1, 101), 8))
    has_ta_b = "ta" in qs[101]
    b = rng.sample(range(101, 201), 12)
    b_en, b_ta = (sorted(b[:6]), sorted(b[6:])) if has_ta_b else (sorted(b), [])

    out = [f"# AT-P3 review sample: {paper_id}, 20 questions", "",
           f"Open `{silver['qpRef']}` at the page shown and tick each question whose text and options match the "
           "scan exactly. Note any difference under the question.", "",
           f"Part A: {part_a} · Part B English: {b_en}" + (f" · Part B Tamil: {b_ta}" if b_ta else ""), ""]
    for n in part_a:
        out += block(qs[n], "ta")
    for n in b_en:
        out += block(qs[n], "en")
    for n in b_ta:
        out += block(qs[n], "ta")
    target = content / "silver/tnpsc" / paper_id / "review_sample_AT-P3.md"
    target.write_text("\n".join(out), encoding="utf-8")
    print(f"{target}: Part A {part_a}, Part B en {b_en}, Part B ta {b_ta}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2])
