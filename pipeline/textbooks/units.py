"""Split each textbook into its units (chapters) using the InDesign slug printed on every page.

Samacheer PDFs carry the typesetter's file name on each page ("IX_SCI_EM_Unit-02_PHY.indd 14"). A run of
pages with the same file name is one unit; pages without a slug join the run before them. Front matter,
answers, glossaries and author pages are kept but marked kind "matter". The subject of a unit in a combined
book (class 6-7 term books) comes from its file name.

Some files hold several units (VI History Lesson 1 and 2 in one file), so a page that opens a unit ("Unit 2 ...
Learning Objectives" at the top) also starts one; starts within 3 pages of each other are merged, keeping the
first (a chapter cover page comes just before its objectives page).

Tamil-medium books are read by OCR, so their slugs carry OCR slips ("Term_Il_Unit_l" for "Term_II_Unit_1"); they
are compared by a key (subject, unit number, or section name) instead, and a run of 1-2 pages between two runs with
the same key is folded into them. Their unit openers are the Tamil "கற்றல் நோக்கங்கள்" (learning objectives)
pages. A book with no slugs at all (the Class 9-10 Tamil readers) is split by openers alone. The English sections
bound into the Class 6-7 Tamil term books are kind "other".

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


OPENER = re.compile(r"Learning (Objectives|Outcomes)|கற்றல(்|ின்)\s*(நோக்கங்கள்|விளைவுகள்)", re.I)
TA_OPENER = re.compile(r"கற்றல(்|ின்)\s*நோக்க")
TA_UNIT = re.compile(r"^(இயல்|அலகு|பாடம்)")


def slug_key(slug, medium: str):
    """Compare slugs of OCR'd pages by what they name, not their exact spelling."""
    if medium == "english" or slug is None:
        return slug
    t = slug.lower()
    sec = "english " if "english" in t else ""
    subj = next((name for name, rx in SUBJ if name != "maths" and rx.search(t)), "")
    m = re.search(r"unit[\s_\-]*([0-9ilt|]{1,2})\b", t)
    if m:
        return f"{sec}{subj} unit {m.group(1).translate(str.maketrans('ilt|', '1111')).lstrip('0')}"
    for w in ("fm", "thirukural", "contents", "preface", "author", "glossary", "index"):
        if re.search(rf"(^|[\s_\-]){w}([\s_\-.]|$)", t):
            return f"{sec}{w}"
    return sec + re.sub(r"[^a-z0-9]", "", re.sub(r"term[\s_]*[ivxl|1]+", "", t))


def opener_title(text: str):
    """If the page opens a unit, its title: the lines between "Unit/Lesson/Chapter N" and the objectives."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    head = lines[:12]
    if not any(OPENER.search(l) for l in head):
        # OCR can garble "கற்றல்" on a Tamil opener; the objectives line is then still near the top
        if not any(re.search(r"நோக்கங்கள்", l) for l in head[:3]):
            return None
    elif not any(re.match(r"^(unit|lesson|chapter)\b", l, re.I) or TA_UNIT.match(l) for l in head[:4]) \
            and not any(TA_OPENER.search(l) for l in head[:6]):
        return None
    out = []
    for l in head:
        if OPENER.search(l) or re.search(r"நோக்கங்கள்", l):
            break
        if re.match(r"^(unit|lesson|chapter|இயல்|அலகு|பாடம்)?\s*[\d௧-௯]*$", l, re.I):
            continue
        out.append(re.sub(r"^(இயல்|அலகு|பாடம்)\s*", "", re.sub(r"^\d+\s+", "", l)))
    return " ".join(out)[:90].strip()


def guess_title(text: str, medium: str = "english") -> str:
    letters = r"[A-Za-z]{3}" if medium == "english" else r"[\u0B80-\u0BFF]{3}"
    for line in text.splitlines()[:25]:
        s = line.strip(" .:-–")
        if 4 <= len(s) <= 70 and not SKIP.match(s) and not TA_UNIT.match(s) and not re.search(r"\.indd|\d{1,2}/\d{1,2}/\d{4}|^\d+$", s) and re.search(letters, s):
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
        runs, med = [], book["medium"]
        for pg in pages:
            s = slug_of(pg["text"])
            if s and (not runs or slug_key(runs[-1]["slug"], med) != slug_key(s, med)):
                runs.append({"slug": s, "start": pg["p"], "end": pg["p"]})
            elif runs:
                runs[-1]["end"] = pg["p"]
            else:
                runs.append({"slug": "(start)", "start": pg["p"], "end": pg["p"]})
        if med != "english":  # fold OCR-slip runs of 1-2 pages back into their neighbours
            i = 1
            while i + 1 < len(runs):
                a, b, c = runs[i - 1], runs[i], runs[i + 1]
                if b["end"] - b["start"] < 2 and slug_key(a["slug"], med) == slug_key(c["slug"], med):
                    a["end"] = c["end"]
                    del runs[i:i + 2]
                else:
                    i += 1
            # a run whose slug OCR cut to a stub ("1", "itt"), or a one-page run with a garbled slug, belongs to the run before it
            i = 1
            while i < len(runs):
                r = runs[i]
                stub = len(re.sub(r"\W", "", r["slug"])) <= 4  # "1", "itt": the rest of the slug lost to OCR
                junk = r["end"] == r["start"] and not re.search(r"\bun|unit|fm|index|front|author|content", r["slug"], re.I)
                if stub or junk:
                    runs[i - 1]["end"] = r["end"]
                    del runs[i]
                else:
                    i += 1
        if len(runs) == 1 and runs[0]["slug"] == "(start)":
            runs[0]["slug"] = "(no slug)"
        # split runs at unit-opening pages
        split = []
        for r in runs:
            cuts = [r["start"]] + [p for p in range(r["start"] + 1, r["end"] + 1) if opener_title(pages[p - 1]["text"]) is not None]
            kept = []
            for c in cuts:
                if not kept or c - kept[-1] > 3:
                    kept.append(c)
            for i, c in enumerate(kept):
                split.append({"slug": r["slug"], "start": c, "end": (kept[i + 1] - 1) if i + 1 < len(kept) else r["end"]})
        runs = split
        n = 0
        for r in runs:
            kind = "matter" if MATTER.search(r["slug"]) or r["slug"] == "(start)" or (med != "english" and re.search(r"\bfm\b|_fm", r["slug"], re.I)) else "unit"
            if med != "english" and "english" in r["slug"].lower():
                kind = "other"  # the English-subject part of a Tamil term book
            if r["slug"] == "(no slug)" and r["start"] == 1 and not any(opener_title(pages[p - 1]["text"]) is not None for p in range(1, min(5, r["end"] + 1))):
                kind = "matter"
            n += kind == "unit"
            units.append({"bookId": book["id"], "seq": len([u for u in units if u["bookId"] == book["id"]]) + 1, "kind": kind,
                          "slug": r["slug"], "subject": subject_of(r["slug"], book), "part": part_of(r["slug"]),
                          "pageStart": r["start"], "pageEnd": r["end"],
                          "titleGuess": (next((t for t in (opener_title(pages[p - 1]["text"]) for p in range(r["start"], min(r["start"] + 4, r["end"] + 1))) if t), None)
                                         or guess_title(pages[r["start"] - 1]["text"], med)) if kind == "unit" else ""})
        print(f"{book['id']}: {n} units, {len(runs) - n} other sections")
    (root / "units.json").write_text(json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
