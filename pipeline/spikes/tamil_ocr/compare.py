"""Double reading (D-16): compare Claude's reading of each question with Tesseract OCR of the same page.

Inputs:
  reads/*.jsonl         Claude's readings: n, page, stem, A-D, tick, optional type="match"
  ocr/pNNN.txt          OCR of each page (blue ticks removed, tam+eng, psm 4)
  key_496.json          final answer key read from the official PDF
Output: silver_questions.json + a printed summary of agreement and flags.
"""
import json
import re
import sys
from pathlib import Path

from rapidfuzz import fuzz

ZW = dict.fromkeys(map(ord, "‌‍﻿"), None)
AGREE = 95  # partial-ratio threshold for a field to count as agreeing
NEAR = 85   # 85-94: differs by a few characters; usually OCR noise, verified by a zoomed re-read
# Fixed-wording options (closed vocabulary): OCR mangles their labels/digits, so a looser match is enough.
TEMPLATES = [re.compile(p) for p in (
    r"^\(\d\) ?(மட்டும்|- சரி)$",
    r"^கூற்று.*காரணம்.*(சரி|தவறு|சரியன்று)$",
    r"^\[A\].*(சரி|தவறு|விளக்கவில்லை|விளக்கியுள்ளது)$",
)]
TEMPLATE_OK = 80


def norm(s: str) -> str:
    """Keep Tamil letters/signs, Latin letters and digits; drop spaces and punctuation (OCR splits/merges them)."""
    s = s.translate(ZW)
    s = s.replace("ௌ", "ெள")       # ௌ: one code point vs ெ + ள, identical on screen
    s = re.sub(r"(?<!\w)[xX×](?!\w)", " ", s)   # the "×" sign: OCR reads it as Latin x/X
    return "".join(ch for ch in s if ("஀" <= ch <= "௿") or ch.isalnum())


def field_level(text: str, page_norm: str, page_lines: list[str], is_table_option: bool) -> tuple[str, int, str]:
    """Return (level, score, method); level is agree | near | disagree."""
    if is_table_option:                       # e.g. "3 1 4 2": look for an OCR line ending in those digits
        seq = re.sub(r"\D", "", text)
        hit = any(re.sub(r"\D", "", l).endswith(seq) for l in page_lines)
        return ("agree" if hit else "disagree"), (100 if hit else 0), "table-digits"
    t = norm(text)
    if len(t) <= 3:                           # very short strings: exact presence only (weak evidence)
        return ("agree" if t in page_norm else "disagree"), (100 if t in page_norm else 0), "short"
    score = int(fuzz.partial_ratio(t, page_norm))
    if any(p.match(text.strip()) for p in TEMPLATES):
        return ("agree" if score >= TEMPLATE_OK else "disagree"), score, "template"
    return ("agree" if score >= AGREE else "near" if score >= NEAR else "disagree"), score, "fuzzy"


def main() -> None:
    work = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    key = json.loads((work / "key_496.json").read_text())["accepted"]
    reads = [json.loads(l) for f in sorted((work / "reads").glob("*.jsonl")) for l in f.read_text().splitlines() if l.strip()]
    pages: dict[int, tuple[str, list[str]]] = {}
    out, flagged, key_notes = [], [], []
    for q in sorted(reads, key=lambda r: r["n"]):
        p = q["page"]
        if p not in pages:
            # every OCR pass available for the page (e.g. 300 and 400 dpi); a field may match any of them
            raw = "\n#####\n".join(d.joinpath(f"p{p:03d}.txt").read_text() for d in sorted(work.glob("ocr*"))
                                   if d.joinpath(f"p{p:03d}.txt").exists()).translate(ZW)
            pages[p] = (norm(raw), [l for l in raw.splitlines() if l.strip()])
        pn, pl = pages[p]
        fields = {}
        for f in [x for x in ("passage", "stem", "A", "B", "C", "D") if x in q]:
            level, score, how = field_level(q[f], pn, pl, q.get("type") == "match" and f != "stem")
            fields[f] = {"level": level, "score": score, "how": how}
        levels = {v["level"] for v in fields.values()}
        status = "accepted" if levels == {"agree"} else "near" if "disagree" not in levels else "flagged"
        k = key[str(q["n"])]
        tick_ok = (k == "ALL") or (q["tick"] in k)
        if status != "accepted":
            flagged.append((q["n"], status, {f: v["score"] for f, v in fields.items() if v["level"] != "agree"}))
        if not (k != "ALL" and k == [q["tick"]]):
            key_notes.append((q["n"], q["tick"], k))
        out.append({**q, "accepted": k, "keyStatus": "final", "doubleRead": status, "fieldChecks": fields,
                    "tickMatchesFinalKey": tick_ok})
    (work / "silver_questions.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    n = len(out)
    c = {s: sum(o["doubleRead"] == s for o in out) for s in ("accepted", "near", "flagged")}
    print(f"questions read: {n}   accepted: {c['accepted']}   near (few-character OCR differences): {c['near']}"
          f"   flagged (real disagreement or table): {c['flagged']}")
    print("not accepted (n, level, field: OCR score):", flagged)
    print("final key differs from a single tentative tick:", key_notes)


if __name__ == "__main__":
    main()
