"""Pull English-Tamil glossary pairs out of English-medium textbook pages.

Each unit of the Social Science books (and the Maths term books) ends with a GLOSSARY box: an English word, often
its English meaning, and the Tamil word. Layout text (pdftotext -layout, or OCR word boxes laid out the same way
for books whose Tamil text layer is garbled) is split into columns; each headword collects the meaning and Tamil
segments of the lines around it.
"""
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from tamil_text import clean_ta, bad_word  # noqa: E402

TA = re.compile(r"[஀-௿]")
HEAD = re.compile(r"^\s*(GLOSSARY|Glossary|Glosary|MATHEMATICAL TERMS)\s*(\d+\s*)?$")
STOP = re.compile(r"evaluation|choose the correct|^\s*activit|references|\.indd|ict corner|summary|exercise", re.I)


def segments(line: str):
    out = []
    for m in re.finditer(r"\S+(?: \S+)*", line):
        # split where English text runs straight into Tamil ("civilization ஜெர்மானிய")
        parts = re.split(r"(?<=[A-Za-z,.)]) (?=\(?[\u0B80-\u0BFF])", m.group())
        c = m.start()
        for part in parts:
            t = re.sub(r"^\d+\s*[.,]\s*", "", part.strip()).strip(" |_@\\")
            junk = not t or re.fullmatch(r"[\d.,|_@\\]+", t) or (TA.search(t) and len(t) <= 2)
            if not junk:
                out.append((c + (len(part) - len(part.lstrip())), t))
            c += len(part) + 1
    return out


def glossary_lines(layout: str, whole: bool = False):
    lines = layout.splitlines()
    if whole:  # a continuation page: no heading, the glossary fills it
        return [l.replace("\t", "    ") for l in lines if not STOP.search(l)]
    for i, l in enumerate(lines):
        if HEAD.match(l):
            out = []
            for l2 in lines[i + 1:]:
                if STOP.search(l2):
                    break
                out.append(l2.replace("\t", "    "))
            return out
    return None


def zones(lines):
    """Column zones: a new zone starts at a frequent English column that comes right after a Tamil column."""
    cols = Counter()
    for l in lines:
        for c, s in segments(l):
            cols[(round(c / 3), bool(TA.search(s)))] += 1
    freq = sorted((c * 3, ta) for (c, ta), n in cols.items() if n >= 3)
    starts, seen_ta = [], False
    for c, ta in freq:
        if not ta and (not starts or seen_ta):
            if not starts or c - starts[-1] > 15:
                starts.append(c)
                seen_ta = False
        elif ta:
            seen_ta = True
    return starts or [0]


def parse_zone(rows):
    """rows: [(line no, [(col, text)])] within one zone. Returns [(en, meaning, ta)]."""
    cols = [c for _, segs in rows for c, _ in segs]
    if not cols:
        return []
    left = min(cols)
    heads = [(i, segs) for i, segs in rows if segs and segs[0][0] <= left + 3 and not TA.search(segs[0][1])]
    entries = {i: {"en": segs[0][1], "mean": [], "ta": []} for i, segs in heads}
    for i, segs in rows:
        rest = segs[1:] if i in entries else segs
        if not rest:
            continue
        if i in entries:
            target = i
        else:
            near = sorted(entries, key=lambda h: (abs(h - i), 0))
            if not near:
                continue
            target = near[0]
            if len(near) > 1 and abs(near[1] - i) == abs(near[0] - i):
                kinds = {bool(TA.search(t)) for _, t in rest}
                lacks = [h for h in near[:2] if not any(bool(TA.search(t)) in kinds for _, t in rows_dict(rows)[h][1:])]
                if lacks:
                    target = lacks[0]
            if abs(target - i) > 2:
                continue
        for _, t in rest:
            (entries[target]["ta"] if TA.search(t) else entries[target]["mean"]).append(t)
    # a wrapped headword in a Capitalised word | Tamil list with no meanings (Maths: "Circumcentre of a" /
    # "triangle", each line with part of the Tamil); lists with meanings mix cases, so they are left alone
    for i in sorted(entries) if not any(e["mean"] for e in entries.values()) else []:
        e, prev = entries.get(i), entries.get(i - 1) or entries.get(i - 2)
        if e and prev and e["en"][:1].islower() and prev["en"][:1].isupper():
            prev["en"] += " " + e["en"]
            prev["ta"] += e["ta"]
            prev["mean"] += e["mean"]
            del entries[i]
    # a wrapped headword ("Interior opposite" / "angle") shows up as a bare headword: join it to its neighbour
    for i in sorted(entries):
        e = entries[i]
        if e["ta"] or e["mean"]:
            continue
        up = [h for h in (i - 1, i - 2) if h in entries and h is not i]
        down = [h for h in (i + 1, i + 2) if h in entries]
        if up:
            entries[up[0]]["en"] += " " + e["en"]
        elif down:
            entries[down[0]]["en"] = e["en"] + " " + entries[down[0]]["en"]
    out = []
    for i in sorted(entries):
        e = entries[i]
        en, mean = e["en"], " ".join(e["mean"])
        m = re.match(r"^(.+?)\s+[-–:]\s+(.*)$", en)  # "Word - meaning (Tamil)" on one segment
        if m:
            en, mean = m.group(1), (m.group(2) + " " + mean).strip()
        ta = " ".join(e["ta"])
        pm = re.search(r"\(([^()]*[஀-௿][^()]*)\)\s*$", mean)
        if pm and not ta:
            ta, mean = pm.group(1), mean[: pm.start()].strip()
        if ta and len(en.split()) <= 5:
            out.append((en.strip(" -–:"), mean.strip(" -–:"), ta))
    return out


def rows_dict(rows):
    return {i: segs for i, segs in rows}


def page_pairs(layout: str, whole: bool = False):
    lines = glossary_lines(layout, whole)
    if not lines:
        return []
    pairs = []
    nonblank = [l for l in lines if l.strip()]
    if nonblank and sum(bool(TA.match(l.strip())) and " - " in l for l in nonblank) > len(nonblank) / 2:
        # "Tamil - English" lists (Science), one or two per line
        for l in nonblank:
            for ta, en in re.findall(r"([\u0B80-\u0BFF\ufffd][^-]*?)\s+-\s+([A-Za-z][^\u0B80-\u0BFF]*?)(?=\s{2,}|$)", l.strip()):
                pairs.append((en.strip(), "", ta.strip()))
        zs = []
    else:
        zs = zones(lines)
    for zi, z0 in enumerate(zs):
        z1 = zs[zi + 1] - 2 if zi + 1 < len(zs) else 10 ** 6
        rows = []
        for n, l in enumerate(lines):
            segs = [(c, t) for c, t in segments(l) if z0 - 2 <= c < z1]
            rows.append((n, segs))
        pairs += parse_zone(rows)
    out = []
    for en, mean, ta in pairs:
        ta = clean_ta(ta)
        words = TA.findall(ta)
        if not words:
            continue
        en = re.sub(r"\s+", " ", en).strip(" \"'”“’|.,;")
        if not re.match(r"^[A-Za-z][A-Za-z \-'’()/&]*$", en):
            continue
        out.append({"en": en, "meaning": mean, "ta": ta,
                    "suspect": any(bad_word(w) for w in re.findall(r"[஀-௿]+", ta))})
    return out


def layout_of(pdf: str, page: int) -> str:
    return subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), pdf, "-"],
                          capture_output=True, text=True, check=True).stdout


if __name__ == "__main__":
    print(json.dumps(page_pairs(layout_of(sys.argv[1], int(sys.argv[2]))), ensure_ascii=False, indent=1))
