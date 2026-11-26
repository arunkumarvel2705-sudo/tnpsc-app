"""Build the Term Bridge for an exam path: English-Tamil technical term pairs with the questions they come from.

Source (spec: Term Bridge): bilingual question papers. Part B options are printed in English and Tamil side by
side, so option A in English and option A in Tamil name the same thing. Claude read every aligned option pair of
the bilingual papers and kept the ones that are subject terms (translations such as "acute angle - குறுங்கோணம்"),
not names of people and places or transliterations; a few were trimmed to the term itself. That curated list is
silver/terms/<path>_curated.json: [{"en", "ta", "from": {"en", "ta"}}], "from" being the option pair as printed.

This script finds, for each curated pair, every question whose aligned options are that pair, and writes
gold/terms/<path>.json: [{"en", "ta", "unitId", "questionIds"}], sorted by unit then English. A pair whose
source can't be found stops the build, so a changed paper can't silently drop a term.

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
    return sorted(terms, key=lambda t: (t["unitId"], t["en"].lower(), t["ta"]))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    content, path_id = Path(sys.argv[1]), sys.argv[2]
    terms = build(content, path_id)
    out = content / "gold/terms" / f"{path_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(terms, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{path_id}: {len(terms)} term pairs from {len({q for t in terms for q in t['questionIds']})} questions -> {out}")
