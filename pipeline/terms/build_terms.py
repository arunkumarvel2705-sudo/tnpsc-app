"""Build the Term Bridge for an exam path: English-Tamil technical term pairs with the questions they come from.

Source (spec: Term Bridge): bilingual question papers. Part B options are printed in English and Tamil side by
side, so option A in English and option A in Tamil name the same thing. Claude read every aligned option pair of
the bilingual papers and kept the ones that are subject terms (translations such as "acute angle - குறுங்கோணம்"),
not names of people and places or transliterations; a few were trimmed to the term itself. That curated list is
silver/terms/<path>_curated.json: [{"en", "ta", "from": {"en", "ta"}}], "from" being the option pair as printed.

This script finds, for each curated pair, every question whose aligned options are that pair, and writes
gold/terms/<path>.json: [{"en", "ta", "unitId", "questionIds", "meaning"?, "seenIn"?}], sorted by unit then
English. A pair whose source can't be found stops the build, so a changed paper can't silently drop a term.

Second source: textbook glossaries (silver/terms/<path>_glossary.json, from glossary_pairs.py). Pairs read
from a clean text layer ("via": "text") are used, and OCR-read pairs only once confirmed by the Tamil-medium
books (see glossary_pairs.py). A glossary word already in the
list adds its meaning and where it is taught; a new word joins with no questions, under the syllabus unit of
the textbook unit it comes from (gold/textbooks/<path>_units.json), or the subject's unit when that textbook
unit is outside the syllabus. When books give one word different Tamil, the most frequent wins.

Usage: python build_terms.py <content-repo> <path-id>
This script holds no content itself.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

norm = lambda s: re.sub(r"\s+", " ", s).strip()


def build(content: Path, path_id: str) -> list:
    curated = json.loads((content / "silver/terms" / f"{path_id}_curated.json").read_text(encoding="utf-8"))
    sources = {}  # (en lower, ta) -> [(questionId, unitId)]
    for f in sorted((content / "gold/papers").glob(f"{path_id}_*.json")):
        for q in json.loads(f.read_text(encoding="utf-8"))["questions"]:
            if q["section"] != "gs_apt" or "en" not in q or "ta" not in q:
                continue
            for o in "ABCD":
                key = (norm(q["en"]["options"][o]).lower(), norm(q["ta"]["options"][o]))
                sources.setdefault(key, []).append((q["id"], q["unitId"]))
    terms, missing = [], []
    for c in curated:
        found = sources.get((norm(c["from"]["en"]).lower(), norm(c["from"]["ta"])))
        if not found:
            missing.append(f"{c['from']['en']} / {c['from']['ta']}")
            continue
        unit = Counter(u for _, u in found).most_common(1)[0][0]
        terms.append({"en": c["en"], "ta": c["ta"], "unitId": unit, "questionIds": sorted({q for q, _ in found})})
    if missing:
        sys.exit("Term Bridge not written, sources not found:\n  " + "\n  ".join(missing))
    terms += glossary_terms(content, path_id, terms)
    return sorted(terms, key=lambda t: (t["unitId"], t["en"].lower(), t["ta"]))


PART_UNIT = {"science": "gs.u1", "geography": "gs.u2", "history": "gs.u3", "civics": "gs.u4", "economics": "gs.u5", "maths": "apt.u1"}
PART_NAME = {"science": "Science", "geography": "Geography", "history": "History", "civics": "Civics", "economics": "Economics", "maths": "Maths"}


def glossary_terms(content: Path, path_id: str, terms: list) -> list:
    """Glossary pairs folded into `terms` (in place) and returned as new terms."""
    src = content / "silver/terms" / f"{path_id}_glossary.json"
    if not src.exists():
        return []
    pairs = [p for p in json.loads(src.read_text(encoding="utf-8")) if p["via"] == "text" or p.get("confirmed")]
    nodes = {n["id"]: n for n in json.loads((content / "gold/syllabus" / f"{path_id}.json").read_text(encoding="utf-8"))["nodes"]}
    tb = {u["id"]: u for u in json.loads((content / "gold/textbooks" / f"{path_id}_units.json").read_text(encoding="utf-8"))}
    books = {b["id"]: b for b in json.loads((content / "silver/textbooks/books.json").read_text(encoding="utf-8"))}
    by_en = {}
    for p in pairs:
        en = norm(p["en"])
        u = tb.get(p["textbookUnit"]) if p["textbookUnit"] else None
        if u is None:  # a glossary at the back of the book (Maths, Class 8 Science): whole-book subject
            b = books[p["bookId"]]
            part = {"maths": "maths", "science": "science"}.get(b["subjects"][0]) if len(b["subjects"]) == 1 else None
            if part is None:
                continue
            u = {"class": b["class"], "part": part, "title": "glossary", "topicIds": []}
        unit = nodes[u["topicIds"][0]]["parentId"] if u["topicIds"] else f"{path_id}.{PART_UNIT[u['part']]}"
        g = by_en.setdefault(en.lower(), {"en": en, "ta": Counter(), "meaning": "", "unitId": Counter(), "seenIn": []})
        g["ta"][norm(p["ta"])] += 1
        g["unitId"][unit] += 1
        g["meaning"] = g["meaning"] or norm(p["meaning"])
        label = f"Class {u['class']} {PART_NAME[u['part']]}: {u['title']}"
        if label not in g["seenIn"]:
            g["seenIn"].append(label)
    known = {t["en"].lower(): t for t in terms}
    new = []
    for key, g in by_en.items():
        t = known.get(key)
        if t is None:
            t = {"en": g["en"], "ta": g["ta"].most_common(1)[0][0], "unitId": g["unitId"].most_common(1)[0][0], "questionIds": []}
            new.append(t)
        if g["meaning"]:
            t.setdefault("meaning", g["meaning"])
        t["seenIn"] = t.get("seenIn", []) + g["seenIn"]
    return new


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    content, path_id = Path(sys.argv[1]), sys.argv[2]
    terms = build(content, path_id)
    out = content / "gold/terms" / f"{path_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(terms, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{path_id}: {len(terms)} term pairs from {len({q for t in terms for q in t['questionIds']})} questions -> {out}")
