"""Layout text for one PDF page from OCR word boxes (for books whose Tamil text layer is garbled)."""
import csv, io, subprocess, sys, tempfile
from pathlib import Path

def ocr_layout(pdf: str, page: int, cols: int = 160) -> str:
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["pdftoppm", "-r", "300", "-f", str(page), "-l", str(page), "-png", pdf, f"{d}/pg"], check=True)
        png = next(Path(d).glob("pg*.png"))
        tsv = subprocess.run(["tesseract", str(png), "-", "-l", "tam+eng", "--psm", "4", "tsv"],
                             capture_output=True, text=True, check=True).stdout
    rows = list(csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE))
    width = max(int(r["left"]) + int(r["width"]) for r in rows)
    lines = {}
    for r in rows:
        if r["level"] != "5" or not r["text"].strip():
            continue
        key = (int(r["block_num"]), int(r["par_num"]), int(r["line_num"]))
        lines.setdefault(key, []).append((int(r["left"]), int(r["top"]), r["text"], int(r["left"]) + int(r["width"])))
    # merge tesseract lines that sit at the same height into one printed row
    rowsout = []
    for words in sorted(lines.values(), key=lambda ws: min(w[1] for w in ws)):
        top = min(w[1] for w in words)
        if rowsout and abs(rowsout[-1][0] - top) < 25:
            rowsout[-1][1].extend(words)
        else:
            rowsout.append([top, list(words)])
    out = []
    for _, words in rowsout:
        s, right = "", None
        brk = False
        for left, _, text, r_ in sorted(words):
            if text.strip("_|[]!") == "":  # a drawn column rule read as | or _|
                brk = True
                continue
            c = round(left / width * cols)
            if right is not None and left - right < 45 and not brk:
                s += " " + text
            else:
                s += (" " * max(c - len(s), 2) if s else " " * c) + text
            right, brk = r_, False
        out.append(s)
    return "\n".join(out)

if __name__ == "__main__":
    print(ocr_layout(sys.argv[1], int(sys.argv[2])))
