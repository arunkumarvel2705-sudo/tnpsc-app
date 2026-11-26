"""Split each textbook into its units (chapters) using the InDesign slug printed on every page.

Samacheer PDFs carry the typesetter's file name on each page ("IX_SCI_EM_Unit-02_PHY.indd 14"). A run of
pages with the same file name is one unit; pages without a slug join the run before them. Front matter,
answers, glossaries and author pages are kept but marked kind "matter". The subject of a unit in a combined
book (class 6-7 term books) comes from its file name.

Some files hold several units (VI History Lesson 1 and 2 in one file), so a page that opens a unit ("Unit 2 ...
Learning Objectives" at the top) also starts one; starts within 3 pages of each other are merged, keeping the
first (a chapter cover page comes just before its objectives page).

The title is a first guess from the unit's opening page; curated titles and syllabus topics are added in
gold (see the unit tagging file), not here.
Writes silver/textbooks/units.json. Usage: python units.py <content-repo>
This script holds no content itself.
"""
import json
import re
import sys
from pathlib import Path

MATTER = re.compile(r"front|index|prelim|introduction|author|answer|glossar|glosary|practical|page_term|^page|contents|preface", re.I)
SUBJ = [("history", re.compile(r"histor", re.I)), ("geography", re.compile(r"geograph|\bgeo\b", re.I)),
        ("civics", re.compile(r"civic|govt", re.I)), ("economics", re.compile(r"econom", re.I)),
        ("science", re.compile(r"scien|\bsci\b|phy|che|bio|\bzoo|bot", re.I)), ("maths", re.compile(r"math|chap|chp|\bch\d|numbers|algebra|geometry", re.I))]
SKIP = re.compile(r"^(unit|chapter|lesson|learning objectives?|introduction|\d+|[ivx]+|term ?\w*|history|geography|civics|economics|science|mathematics)$", re.I)


def slug_of(text: str):
    m = re.findall(r"([\w\-\.() ]+?)\.indd", text)
    return m[-1].strip() if m else None


OPENER = re.compile(r"Learning (Objectives|Outcomes)", re.I)


def opener_title(text: str):
    """If the page opens a unit, its title: the lines between "Unit/Lesson/Chapter N" and the objectives."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    head = lines[:12]
    if not any(OPENER.search(l) for l in head) or not any(re.match(r"^(unit|lesson|chapter)\b", l, re.I) for l in head[:3]):
        return None
    out = []
    for l in head:
        if OPENER.search(l):
            break
        if re.match(r"^(unit|lesson|chapter)?\s*\d*$", l, re.I):
            continue
        out.append(re.sub(r"^\d+\s+", "", l))
    return " ".join(out)[:90].strip()


def guess_title(text: str) -> str:
    for line in text.splitlines()[:25]:
        s = line.strip(" .:-–")
        if 4 <= len(s) <= 70 and not SKIP.match(s) and not re.search(r"\.indd|\d{1,2}/\d{1,2}/\d{4}|^\d+$", s) and re.search(r"[A-Za-z]{3}", s):
            return s
    return ""


def subject_of(slug: str, book: dict) -> str:
    if len(book["subjects"]) == 1:
        return book["subjects"][0]
    for name, rx in SUBJ:
        if rx.search(slug):
            return "social_science" if name in ("history", "geography", "civics", "economics") else name
    return "unknown"


def part_of(slug: str) -> str | None:
    for name, rx in SUBJ[:4]:
        if rx.search(slug):
            return name
    return None


def main(content: Path) -> None:
    root = content / "silver/textbooks"
    units = []
    for book in json.loads((root / "books.json").read_text(encoding="utf-8")):
        pages = [json.loads(l) for l in (root / book["id"] / "pages.jsonl").read_text(encoding="utf-8").splitlines()]
        runs = []
        for pg in pages:
            s = slug_of(pg["text"]) if book["medium"] == "english" else None
            if s and (not runs or runs[-1]["slug"] != s):
                runs.append({"slug": s, "start": pg["p"], "end": pg["p"]})
            elif runs:
                runs[-1]["end"] = pg["p"]
            else:
                runs.append({"slug": "(start)", "start": pg["p"], "end": pg["p"]})
        # split runs at unit-opening pages
        split = []
        for r in runs:
            cuts = [r["start"]] + [p for p in range(r["start"] + 1, r["end"] + 1) if opener_title(pages[p - 1]["text"])]
            kept = []
            for c in cuts:
                if not kept or c - kept[-1] > 3:
                    kept.append(c)
            for i, c in enumerate(kept):
                split.append({"slug": r["slug"], "start": c, "end": (kept[i + 1] - 1) if i + 1 < len(kept) else r["end"]})
        runs = split
        n = 0
        for r in runs:
            kind = "matter" if MATTER.search(r["slug"]) or r["slug"] == "(start)" else "unit"
            n += kind == "unit"
            units.append({"bookId": book["id"], "seq": len([u for u in units if u["bookId"] == book["id"]]) + 1, "kind": kind,
                          "slug": r["slug"], "subject": subject_of(r["slug"], book), "part": part_of(r["slug"]),
                          "pageStart": r["start"], "pageEnd": r["end"],
                          "titleGuess": (next((t for t in (opener_title(pages[p - 1]["text"]) for p in range(r["start"], min(r["start"] + 4, r["end"] + 1))) if t), None)
                                         or guess_title(pages[r["start"] - 1]["text"])) if kind == "unit" else ""})
        print(f"{book['id']}: {n} units, {len(runs) - n} other sections")
    (root / "units.json").write_text(json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
