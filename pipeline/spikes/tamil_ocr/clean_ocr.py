"""Spike: remove blue handwritten ticks, then OCR. Also report which option rows carried a tick.

Usage: python3 clean_ocr.py <pdf> <page> [psm]
"""
import subprocess
import sys

import numpy as np
from PIL import Image

ZW = dict.fromkeys(map(ord, "‌‍﻿"), None)


def render(pdf: str, page: int, stem: str) -> str:
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "300", "-png",
                    "-singlefile", pdf, stem], check=True)
    return f"{stem}.png"


def remove_blue(path: str, out: str) -> np.ndarray:
    img = np.asarray(Image.open(path).convert("RGB")).astype(int)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    blue = (b - r > 40) & (b - g > 20)            # blue ink: blue clearly above red and green
    clean = img.copy()
    clean[blue] = 255
    gray = clean.mean(axis=2)
    Image.fromarray(np.where(gray < 150, 0, 255).astype("uint8")).save(out)  # binarise
    return blue


def main() -> None:
    pdf, page = sys.argv[1], int(sys.argv[2])
    psm = sys.argv[3] if len(sys.argv) > 3 else "6"
    raw = render(pdf, page, f"raw_{page}")
    blue = remove_blue(raw, f"clean_{page}.png")
    rows = np.where(blue.sum(axis=1) > 8)[0]
    print(f"blue-ink pixel rows: {len(rows)} (tick marks found: {'yes' if len(rows) else 'no'})")
    text = subprocess.run(["tesseract", f"clean_{page}.png", "stdout", "-l", "tam+eng", "--psm", psm],
                          check=True, capture_output=True, text=True).stdout.translate(ZW)
    print(text)


if __name__ == "__main__":
    main()
