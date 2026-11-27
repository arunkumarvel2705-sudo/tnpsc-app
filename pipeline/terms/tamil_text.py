"""Repair Tamil text pulled from textbook PDFs and OCR.

Three faults come up: doubled virama and doubled vowel signs from the PDF fonts (ச்்சசா, கோோ), stray
replacement characters and zero-width joiners, and vowel signs stored in drawing order (ெகா for கொ). The
2024 Ghostscript editions are worse: letters are mapped to the wrong code points, which can't be repaired, so
bad_word() spots them and those books are read by OCR instead.
"""
import re
C = "[க-ஹ]"
def tnorm(s: str) -> str:
    s = s.replace("\ufffd", "").replace("\u200c", "").replace("\u200d", "")
    s = re.sub(r"்்(" + C + r")\1(?=[ா-ௌ])", r"்\1", s)   # ச்்சசா -> ச்சா
    s = re.sub(r"்+", "்", s)
    s = re.sub(r"([ா-ௌ])\1+", r"\1", s)                     # கோோ -> கோ
    return re.sub(r"[ \t]+", " ", s).strip()
DEP = '[ா-்ௗ]'
def bad_word(w):
    return bool(re.match(DEP, w) or re.search(r'ெ[க-ஹ]ை|்[ா-ௌ]|[ா-ௌ][ா-ௌ]', w))

_PRE = "ெேை"  # ெ ே ை drawn before the consonant
def reorder(s: str) -> str:
    """Fix vowel signs stored in visual order (sign before its consonant): ெகா -> கொ, ிைல -> ிலை."""
    out, i = [], 0
    while i < len(s):
        ch = s[i]
        prev = out[-1] if out else ""
        if ch in _PRE and i + 1 < len(s) and re.match(C, s[i + 1]) and not re.match(C, prev or " "):
            cons = s[i + 1]; j = i + 2
            if ch in "ெே" and j < len(s) and s[j] == "ா":
                out.append(cons + ("ொ" if ch == "ெ" else "ோ")); i = j + 1; continue
            out.append(cons + ch); i = j; continue
        out.append(ch); i += 1
    return "".join(out)

def clean_ta(s: str) -> str:
    s = reorder(tnorm(s)).strip(" []|.,;\"'”“")
    if s.startswith("(") and s.endswith(")") and s.count("(") == 1:
        s = s[1:-1]
    s = s.lstrip(")").rstrip("(").strip()
    return s + ")" if s.count("(") > s.count(")") else s
