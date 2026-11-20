"""Week-1 spike (AT-P3): OCR quality on the Tamil section of an official TNPSC paper.

Usage: python3 ocr_eval.py <pdf> <first_page> <last_page>
Writes page_NNN.txt (cleaned OCR) and prints word-confidence stats for Tamil words.
"""
import csv
import io
import re
import subprocess
import sys
from pathlib import Path

ZW = dict.fromkeys(map(ord, "‌‍﻿"), None)  # zero-width chars Tesseract inserts
TAMIL = re.compile(r"[஀-௿]")


def ocr_page(pdf: str, page: int, out: Path) -> list[tuple[str, float]]:
    png = out / f"page_{page:03d}"
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "300", "-png",
                    "-singlefile", pdf, str(png)], check=True)
    tsv = subprocess.run(["tesseract", f"{png}.png", "stdout", "-l", "tam+eng", "--psm", "4", "tsv"],
                         check=True, capture_output=True, text=True).stdout
    words, lines, cur = [], [], None
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE):
        text = (row.get("text") or "").translate(ZW).strip()
        if not text or row["conf"] in ("-1", ""):
            continue
        key = (row["block_num"], row["par_num"], row["line_num"])
        if key != cur:
            lines.append([])
            cur = key
        lines[-1].append(text)
        words.append((text, float(row["conf"])))
    (out / f"page_{page:03d}.txt").write_text("\n".join(" ".join(l) for l in lines), encoding="utf-8")
    return words


def main() -> None:
    pdf, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    out = Path("ocr_out")
    out.mkdir(exist_ok=True)
    all_words = []
    for p in range(first, last + 1):
        w = ocr_page(pdf, p, out)
        all_words += w
        tam = [c for t, c in w if TAMIL.search(t)]
        print(f"page {p}: {len(tam)} Tamil words, mean conf {sum(tam)/max(len(tam),1):.1f}")
    tam = [c for t, c in all_words if TAMIL.search(t)]
    hi = sum(c >= 80 for c in tam)
    lo = sum(c < 60 for c in tam)
    print(f"\nTOTAL Tamil words: {len(tam)}")
    print(f"conf >= 80: {hi} ({hi/len(tam):.1%})   conf < 60: {lo} ({lo/len(tam):.1%})")


if __name__ == "__main__":
    main()
