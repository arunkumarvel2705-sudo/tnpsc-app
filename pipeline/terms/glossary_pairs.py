"""English-Tamil term pairs from the GLOSSARY boxes of the English-medium textbooks (spec: Term Bridge).

Most units of the Social Science books, and the Maths and Class 8 Science books, end with a glossary that gives an
English word, often a meaning, and the Tamil word. This reads every page with a GLOSSARY heading and Tamil text,
from the PDF text layer; for a book whose Tamil text layer is garbled (more than 5% of its glossary Tamil words
fail tamil_text.bad_word), it reads those pages by OCR instead and marks the pairs "via": "ocr".
Reads silver/textbooks/books.json + pages, gold/textbooks/ccse4_units.json; writes silver/terms/ccse4_glossary.json.
Usage: python glossary_pairs.py <content-repo>
This script holds no content.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from glossary_parse import page_pairs, layout_of  # noqa: E402
from ocr_layout import ocr_layout  # noqa: E402

def slug_of(text: str):
    m = re.findall(r"([\w\-\.() ]+?)\.indd", text)
    return m[-1].strip() if m else None


GLOSS = re.compile(r"^\s*(GLOSSARY|Glossary|Glosary|MATHEMATICAL TERMS)\s*(\d+\s*)?$", re.M)
TA = re.compile(r"[஀-௿]")


def main(content: Path) -> None:
    books = json.loads((content / "silver/textbooks/books.json").read_text(encoding="utf-8"))
    units = json.loads((content / "gold/textbooks/ccse4_units.json").read_text(encoding="utf-8"))
    out = []
    for b in books:
        if b["medium"] != "english":
            continue
        all_pages = [json.loads(l) for l in (content / "silver/textbooks" / b["id"] / "pages.jsonl").open(encoding="utf-8")]
        heads = {p["p"] for p in all_pages if GLOSS.search(p["text"]) and TA.search(p["text"])}
        # pages that carry on a back-of-book glossary (same footer slug as the page before, no heading)
        cont, slug = set(), {p["p"]: slug_of(p["text"]) for p in all_pages}
        for p in all_pages:
            q = p["p"] - 1
            if p["p"] not in heads and (q in heads or q in cont) and slug[p["p"]] and slug[p["p"]] == slug[q] and TA.search(p["text"]):
                cont.add(p["p"])
        pages = sorted(heads | cont)
        if not pages:
            continue
        pdf = str(content / b["pdfRef"])
        text = {p: page_pairs(layout_of(pdf, p), p in cont) for p in pages}
        found = [x for v in text.values() for x in v]
        via = "ocr" if found and sum(x["suspect"] for x in found) > 0.05 * len(found) else "text"
        got = {p: page_pairs(ocr_layout(pdf, p), p in cont) for p in pages} if via == "ocr" else text
        for p, pairs in got.items():
            unit = next((u["id"] for u in units if u["bookId"] == b["id"] and u["pageStart"] <= p <= u["pageEnd"]), None)
            for x in pairs:
                out.append({"en": x["en"], "ta": x["ta"], "meaning": x["meaning"], "bookId": b["id"], "page": p,
                            "textbookUnit": unit, "via": via})
        print(f"{b['id']}: {sum(len(v) for v in got.values())} pairs from {len(pages)} pages ({via})", flush=True)
    dest = content / "silver/terms/ccse4_glossary.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(out)} pairs -> {dest}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
