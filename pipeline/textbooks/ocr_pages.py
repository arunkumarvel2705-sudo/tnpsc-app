"""Resumable OCR of Tamil-medium textbooks for extract_pages.py: one text file per PDF page, skipped if present.

Each page is rendered at 300 dpi greyscale and read by tesseract (tam+eng, page segmentation 3, one thread), and
written to <ocr-dir>/<first 10 hex of the PDF's SHA-256>/pNNN.txt via a .part file, so a killed run loses at most
the page in hand. Pages are split across workers by number (page % workers == worker), so two or more copies
can run side by side; about 1.4 s a page per core.

Usage: python ocr_pages.py <ocr-dir> <worker-index> <workers> <pdf> [<pdf> ...]
This script holds no content.
"""
import hashlib
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def ocr_book(out_dir: Path, pdf: str, wi: int, wn: int) -> None:
    sha = hashlib.sha256(Path(pdf).read_bytes()).hexdigest()[:10]
    d = out_dir / sha
    d.mkdir(parents=True, exist_ok=True)
    (d / "source.txt").write_text(pdf)
    info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, check=True).stdout
    n = int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))
    for p in range(1, n + 1):
        out = d / f"p{p:03d}.txt"
        if p % wn != wi or out.exists():
            continue
        with tempfile.TemporaryDirectory() as t:
            subprocess.run(["pdftoppm", "-r", "300", "-gray", "-f", str(p), "-l", str(p), "-png", pdf, f"{t}/pg"], check=True)
            img = next(Path(t).glob("pg*.png"))
            r = subprocess.run(["tesseract", str(img), "-", "-l", "tam+eng", "--psm", "3"], capture_output=True, text=True,
                               env={**os.environ, "OMP_THREAD_LIMIT": "1"}, check=True)
        tmp = out.with_suffix(".part")
        tmp.write_text(r.stdout)
        tmp.rename(out)
    print("done", pdf, flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    for pdf in sys.argv[4:]:
        ocr_book(Path(sys.argv[1]), pdf, int(sys.argv[2]), int(sys.argv[3]))
