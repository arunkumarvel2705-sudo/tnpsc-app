"""Spike AT-P3: OCR the Tamil section (Q1-100) of a TNPSC paper and measure structural completeness.

Pipeline per page: render 300 dpi -> remove blue ink (answer ticks) -> grayscale -> Tesseract tam+eng psm 4
-> strip zero-width chars. Then split into questions by number and count option lines per question.

Usage: python3 tamil_section.py <pdf> <first_page> <last_page>
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ZW = dict.fromkeys(map(ord, "‌‍﻿"), None)
QNUM = re.compile(r"^\W{0,2}(\d{1,3})\s*[.,]\s*(.*)$")
E_LINE = re.compile(r"விடை\s*தெரி")                 # option E: "விடை தெரியவில்லை"
LABEL = re.compile(r"^\W{0,3}\(?\s*[\w஀-௿]{1,2}\s*[\).]\.?\s+|^\W{0,3}[஀-௿]{1,2}[.)]?\s+")


def ocr(pdf: str, page: int, work: Path) -> str:
    stem = work / f"p{page:03d}"
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "300", "-png", "-singlefile",
                    pdf, str(stem)], check=True)
    img = np.asarray(Image.open(f"{stem}.png").convert("RGB")).astype(int)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    img[(b - r > 40) & (b - g > 20)] = 255
    Image.fromarray(img.mean(axis=2).astype("uint8")).save(f"{stem}_clean.png")
    out = subprocess.run(["tesseract", f"{stem}_clean.png", "stdout", "-l", "tam+eng", "--psm", "4"],
                         check=True, capture_output=True, text=True).stdout
    return out.translate(ZW)


def split_questions(lines: list[str]) -> dict[int, list[str]]:
    qs, cur, expected = {}, None, 1
    for line in lines:
        m = QNUM.match(line)
        if m and int(m.group(1)) in (expected, expected + 1):   # accept only the next number (or skip one)
            cur = int(m.group(1))
            expected = cur + 1
            qs[cur] = [m.group(2)]
        elif cur is not None:
            qs[cur].append(line)
    return qs


def main() -> None:
    pdf, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    work = Path("section_work")
    work.mkdir(exist_ok=True)
    lines = []
    for p in range(first, last + 1):
        txt = ocr(pdf, p, work)
        (work / f"p{p:03d}.txt").write_text(txt, encoding="utf-8")
        lines += [l.strip() for l in txt.splitlines() if l.strip()]
    qs = {n: b for n, b in split_questions(lines).items() if n <= 100}
    report = {}
    for n in range(1, 101):
        block = qs.get(n)
        if block is None:
            report[n] = "missing"
            continue
        e_idx = next((i for i, l in enumerate(block) if E_LINE.search(l)), None)
        if e_idx is None:
            report[n] = "no_E_option"
            continue
        opts = [l for l in block[1:e_idx + 1] if LABEL.match(l)]
        report[n] = "ok" if len(opts) >= 5 else f"options_{len(opts)}"
    counts = {}
    for v in report.values():
        counts[v] = counts.get(v, 0) + 1
    print(json.dumps(counts, ensure_ascii=False))
    print("not ok:", {n: v for n, v in report.items() if v != "ok"})
    (work / "questions.json").write_text(json.dumps(qs, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
