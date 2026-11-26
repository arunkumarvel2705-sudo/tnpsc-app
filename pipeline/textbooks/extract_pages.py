"""Silver for textbooks: the text of every page of every distinct textbook PDF in Bronze.

Bronze can list one PDF under several subjects (the class 6-7 term books hold Science and Social Science
together), so books are keyed by file content (SHA-256 in bronze/manifest.tsv), not by path.

- English-medium PDFs have a clean text layer: pdftotext, split at form feeds (one entry per PDF page).
- Tamil-medium PDFs don't (their fonts scramble copied Tamil), so their text comes from OCR of the page
  images (tesseract tam+eng, 300 dpi), read from <ocr-dir>/<sha10>/pNNN.txt (see ocr_pages.py)
  Add --tamil-only to leave the English books as they are.

Writes silver/textbooks/books.json and silver/textbooks/<book id>/pages.jsonl ({"p": pdf page, "text": ...}).
Usage: python extract_pages.py <content-repo> [<ocr-dir>]
Pages are PDF pages (1-based), the numbering "Open scan" uses; printed page numbers are mapped in units.py.
This script holds no content itself.
"""
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

SUBJECT = {"science": "science", "social_science": "social_science", "mathematics": "maths", "tamil": "tamil"}
SHORT = {"science": "sci", "social_science": "ss", "maths": "maths", "tamil": "tamil"}


def books_from_manifest(content: Path) -> list:
    latest = {}
    for line in (content / "bronze/manifest.tsv").read_text(encoding="utf-8").splitlines():
        c = line.split("\t")
        if len(c) >= 5 and c[0].startswith("bronze/textbooks/"):
            latest[c[0]] = c  # later lines are newer editions of the same path
    by_sha = defaultdict(list)
    for path, c in latest.items():
        by_sha[c[3]].append(path)
    books = []
    for sha, paths in by_sha.items():
        paths.sort()
        m = re.match(r"bronze/textbooks/(\w+)/std(\d\d)/(\w+?)__.*?(term_(\d)_)?(\d{4})_edition", paths[0])
        medium, cls, term, year = m.group(1), int(m.group(2)), m.group(5), m.group(6)
        subjects = sorted({SUBJECT[re.match(r"bronze/textbooks/\w+/std\d\d/(\w+?)__", p).group(1)] for p in paths})
        bid = f"{medium[:2]}_std{cls:02d}_{'-'.join(SHORT[s] for s in subjects)}{f'_t{term}' if term else ''}_{year}"
        books.append({"id": bid, "medium": medium, "class": cls, "subjects": subjects, "term": int(term) if term else None,
                      "edition": int(year), "pdfRef": paths[0], "alsoListedAs": paths[1:], "sha256": sha})
    return sorted(books, key=lambda b: (b["medium"], b["class"], b["subjects"], b["term"] or 0))


def english_pages(pdf: Path) -> list:
    text = subprocess.run(["pdftotext", "-enc", "UTF-8", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    pages = text.split("\f")
    return pages[:-1] if pages and not pages[-1].strip() else pages


def ocr_pages(ocr_dir: Path, sha: str, count: int) -> list:
    d = ocr_dir / sha[:10]
    missing = [p for p in range(1, count + 1) if not (d / f"p{p:03d}.txt").exists()]
    if missing:
        raise FileNotFoundError(f"{d}: OCR missing for {len(missing)} pages (first {missing[0]})")
    return [(d / f"p{p:03d}.txt").read_text(encoding="utf-8") for p in range(1, count + 1)]


def page_count(pdf: Path) -> int:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", out, re.M).group(1))


def clean(t: str) -> str:
    t = t.replace("­", "").replace("�", "").replace("\u200c", "").replace("\u200d", "")  # OCR puts ZWNJ after virama
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def main(content: Path, ocr_dir: Path | None, only: str | None = None) -> None:
    out = content / "silver/textbooks"
    books, skipped = [], []
    for b in books_from_manifest(content):
        if only and b["medium"] != only:
            continue
        pdf = content / b["pdfRef"]
        n = page_count(pdf)
        try:
            pages = english_pages(pdf) if b["medium"] == "english" else ocr_pages(ocr_dir, b["sha256"], n) if ocr_dir else None
        except FileNotFoundError as e:
            skipped.append(f"{b['id']}: {e}")
            continue
        if pages is None:
            skipped.append(f"{b['id']}: Tamil medium, no OCR dir given")
            continue
        if len(pages) != n:
            sys.exit(f"{b['id']}: {len(pages)} pages of text for {n} PDF pages")
        b["pages"] = n
        b["textSource"] = "text layer" if b["medium"] == "english" else "OCR tesseract tam+eng 300dpi"
        d = out / b["id"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "pages.jsonl").write_text("".join(json.dumps({"p": i + 1, "text": clean(t)}, ensure_ascii=False) + "\n"
                                               for i, t in enumerate(pages)), encoding="utf-8")
        books.append(b)
        print(f"{b['id']}: {n} pages")
    old = {}
    if (out / "books.json").exists():  # keep books extracted earlier (e.g. Tamil once OCR finishes)
        old = {b["id"]: b for b in json.loads((out / "books.json").read_text(encoding="utf-8"))}
    old.update({b["id"]: b for b in books})
    (out / "books.json").write_text(json.dumps(sorted(old.values(), key=lambda b: b["id"]), ensure_ascii=False, indent=1) + "\n",
                                    encoding="utf-8")
    for s in skipped:
        print("skipped", s)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = "tamil" if "--tamil-only" in sys.argv else None
    main(Path(args[0]), Path(args[1]) if len(args) > 1 else None, only)
