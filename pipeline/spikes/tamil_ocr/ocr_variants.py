"""Try OCR settings on a few pages; score each by how many Claude-read fields it reproduces (partial ratio >= 95)."""
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from rapidfuzz import fuzz

from compare import norm, ZW

PDF = "/home/claude/tnpsc-content/bronze/tnpsc/ccse4_2025/general_tamil_gs_tentative_key.pdf"
PAGES = [11, 22, 30, 35, 41]
reads = [json.loads(l) for f in sorted(Path("reads").glob("*.jsonl")) for l in f.read_text().splitlines() if l.strip()]

VARIANTS = {
    "gray300_tameng_psm4": dict(dpi=300, mode="gray", lang="tam+eng", psm="4"),
    "rgb300_tameng_psm4": dict(dpi=300, mode="rgb", lang="tam+eng", psm="4"),
    "gray400_tameng_psm4": dict(dpi=400, mode="gray", lang="tam+eng", psm="4"),
    "gray300_tam_psm4": dict(dpi=300, mode="gray", lang="tam", psm="4"),
    "gray300_tameng_psm6": dict(dpi=300, mode="gray", lang="tam+eng", psm="6"),
    "gray300_tameng_psm4_oem0": dict(dpi=300, mode="gray", lang="tam+eng", psm="4", oem="0"),
}


def ocr(page: int, v: dict) -> str:
    stem = f"/tmp/v_{page}_{v['dpi']}"
    if not Path(stem + ".png").exists():
        subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(v["dpi"]), "-png", "-singlefile", PDF, stem], check=True)
    img = np.asarray(Image.open(stem + ".png").convert("RGB")).astype(int)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    img[(b - r > 40) & (b - g > 20)] = 255
    out = f"/tmp/v_{page}_{v['dpi']}_{v['mode']}.png"
    (Image.fromarray(img.mean(axis=2).astype("uint8")) if v["mode"] == "gray" else Image.fromarray(img.astype("uint8"))).save(out)
    cmd = ["tesseract", out, "stdout", "-l", v["lang"], "--psm", v["psm"]] + (["--oem", v["oem"]] if "oem" in v else [])
    return subprocess.run(cmd, capture_output=True, text=True).stdout.translate(ZW)


for name, v in VARIANTS.items():
    hit = tot = 0
    for p in PAGES:
        try:
            pn = norm(ocr(p, v))
        except Exception as e:  # e.g. legacy engine model missing
            print(name, "failed:", e)
            break
        for q in (r for r in reads if r["page"] == p and r.get("type") != "match"):
            for f in ("stem", "A", "B", "C", "D"):
                t = norm(q[f])
                tot += 1
                hit += (t in pn) if len(t) <= 3 else (fuzz.partial_ratio(t, pn) >= 95)
    if tot:
        print(f"{name:28s} fields reproduced: {hit}/{tot} ({hit/tot:.0%})")
