"""Link textbook units to the Group 4 Syllabus Graph (spec: textbook page map), so a syllabus topic can say
"read: Class 9 Science, Unit 2 Motion, pages 18-29".

Claude assigned topics from each unit's title and subject, by keyword rules plus per-unit overrides where the
rules misread a unit. A unit can serve several topics, or none: world history, road safety and foreign policy
are in the books but not in the Group 4 syllabus, and are kept for reading with an empty topic list.
Tamil-medium books: a Science or Social Science unit takes the title, part and topics of the English-medium unit
it mirrors: the same position in the English book of the same class, term and subjects. OCR'd slugs split some
books wrongly, so TAMIL_FIX adds or drops unit start pages (Claude checked each against the English book), and
the build stops if a book's unit count still differs from its twin. Class 10 English-medium Science is not on
the official site yet, so its Tamil-medium book takes the unit titles in TAMIL_ONLY_TITLES (checked against the
OCR text) and topics by the English rules. A Tamil reader
chapter is titled "இயல் N" (OCR can't be trusted for its title) and linked to the Part A literature topics whose
names come up often enough in its pages (TAMIL_KW); the Thirukkural sections of the term books go to the
Thirukkural topic.
Reads silver/textbooks/units.json (+ books.json, + Tamil pages); writes gold/textbooks/ccse4_units.json.
Usage: python tag_units_ccse4.py <content-repo>
This script holds no content beyond unit titles, which are headings.
"""
import json
import re
import sys
from pathlib import Path

RULES = {  # part -> [(title regex, topics)], first match wins
    "maths": [(r"information processing", ["apt.u2.t1"]), (r".", ["apt.u1.t1"])],
    "science": [
        (r"chemi|polymer|periodic", ["gs.u1.t2"]),  # before the biology rule: "Chemistry in Daily Life", "Periodic Classification"
        (r"computer|libre|digital|visual comm|hardware|software|impress|calc", ["gs.u1.t5"]),
        (r"environment|conservation", ["gs.u1.t4"]),
        (r"crop|economic biology", ["gs.u1.t3", "gs.u5.t3"]),
        (r"plant|animal|cell|organ|tissue|health|nutrition|microb|reproduction|classification|adolescence|movement|life|biolog|world of|hered|breed|nervous|hormone|evolution", ["gs.u1.t3"]),
        (r"matter|atomic|atoms|periodic|bond|acid|carbon|chemi|polymer|water|air|changes|element|solution", ["gs.u1.t2"]),
        (r"measure|motion|force|pressure|fluid|electric|magnet|light|heat|sound|universe|space|energy|temperature|optic|thermal|acoustic|nuclear", ["gs.u1.t1"]),
    ],
    "history": [
        (r"freedom struggle in tamil|revolts against british rule in tamil", ["gs.u6.t3"]),
        (r"social transformation in tamil", ["gs.u6.t4"]),
        (r"reform movements", ["gs.u3.t2", "gs.u6.t4"]),
        (r"sangam|tamil|tamizh", ["gs.u6.t1"]),
        (r"european|trade to territory|people.s revolt|nationalis|gandhi|education in india|industries in india|urban changes|rural life", ["gs.u3.t2"]),
        (r"women", ["gs.u4.t6"]),
        (r"faith|religious|culture in north", ["gs.u3.t4"]),
        (r"indus|vedic|maurya|gupta|sultan|mughal|maratha|vijayanagar|bahmani|kingdom|empire|chiefdom|medieval|cholas|what is history|human evolution|evolution of humans|ancient civil", ["gs.u3.t1"]),
        (r".", []),  # world history: not in the Group 4 syllabus
    ],
    "geography": [
        (r"tamil nadu", ["gs.u5.t7", "gs.u2.t1"]),
        (r"hazard|disaster", ["gs.u2.t4"]),
        (r"population|migration|settlement|urbanisation", ["gs.u2.t3"]),
        (r"transport|tourism", ["gs.u2.t2"]),
        (r"map|globe", ["gs.u2.t5"]),
        (r"environment|biosphere", ["gs.u2.t4"]),
        (r"industr", ["gs.u5.t4"]),
        (r".", ["gs.u2.t1"]),
    ],
    "civics": [
        (r"constitution|national symbols", ["gs.u4.t1"]),
        (r"citizen|equality|human rights|rights", ["gs.u4.t2"]),
        (r"secular", ["gs.u3.t5"]),
        (r"diversity", ["gs.u3.t4"]),
        (r"election|political part", ["gs.u4.t5", "gs.u4.t7"]),
        (r"judiciary", ["gs.u4.t5"]),
        (r"consumer|women", ["gs.u4.t6"]),
        (r"government|local bodies|local self|democracy|media", ["gs.u4.t3"]),
        (r".", []),  # road safety, defence, foreign policy, UNO
    ],
    "economics": [
        (r"tamil nadu", ["gs.u5.t7"]),
        (r"money|saving|credit|tax|invest", ["gs.u5.t2"]),
        (r"employment|agricultur", ["gs.u5.t3"]),
        (r"food security|industr", ["gs.u5.t4"]),
        (r"migration", ["gs.u2.t3"]),
        (r".", ["gs.u5.t1"]),
    ],
}

# Units the automatic split or rules got wrong: "book:seq" -> {title?, part?, topics?, kind?}
OVERRIDES = {
    "en_std06_sci-ss_t1_2025:1": {"kind": "matter"}, "en_std06_sci-ss_t3_2024:1": {"kind": "matter"},
    "en_std09_ss_2025:1": {"kind": "matter"}, "en_std06_sci-ss_t1_2025:9": {"kind": "matter"},
    "en_std06_sci-ss_t1_2025:2": {"title": "Measurements"}, "en_std06_sci-ss_t1_2025:14": {"title": "The Universe and Solar System", "topics": ["gs.u1.t1", "gs.u2.t1"]},
    "en_std06_sci-ss_t1_2025:16": {"title": "Understanding Diversity"},
    "en_std06_sci-ss_t2_2024:12": {"part": "geography", "title": "Resources"},
    "en_std06_sci-ss_t2_2024:13": {"part": "civics", "title": "National Symbols"},
    "en_std06_sci-ss_t2_2024:14": {"part": "civics", "title": "The Constitution of India"},
    "en_std06_sci-ss_t2_2024:15": {"title": "Economics – an Introduction", "topics": ["gs.u5.t1"]},
    "en_std06_sci-ss_t3_2024:11": {"title": "South Indian Kingdoms", "topics": ["gs.u3.t1"]},
    "en_std06_sci-ss_t3_2024:15": {"title": "Democracy"},
    "en_std07_sci-ss_t1_2025:2": {"title": "Measurement"}, "en_std07_sci-ss_t1_2025:4": {"title": "Matter Around Us"},
    "en_std07_sci-ss_t1_2025:6": {"title": "Reproduction and Modification in Plants"}, "en_std07_sci-ss_t1_2025:7": {"title": "Health and Hygiene"},
    "en_std07_sci-ss_t1_2025:18": {"topics": ["gs.u5.t1"]},
    "en_std07_sci-ss_t2_2024:8": {"part": "history"}, "en_std07_sci-ss_t2_2024:9": {"part": "history", "title": "The Mughal Empire"},
    "en_std07_sci-ss_t2_2024:10": {"part": "history"},
    "en_std07_sci-ss_t2_2024:11": {"topics": ["gs.u2.t1"]},
    "en_std07_sci-ss_t3_2024:8": {"part": "history", "topics": ["gs.u3.t4"]},
    "en_std07_sci-ss_t3_2024:9": {"part": "history", "topics": ["gs.u6.t1"]},
    "en_std07_sci-ss_t3_2024:10": {"topics": ["gs.u6.t1", "gs.u3.t4"]},
    "en_std07_sci-ss_t3_2024:11": {"title": "Exploring Continents – North America and South America", "topics": []},
    "en_std07_sci-ss_t3_2024:13": {"title": "Natural Hazards – Disaster Management"},
    "en_std07_maths_t1_2025:2": {"title": "Number System"}, "en_std07_maths_t1_2025:4": {"title": "Algebra"},
    "en_std07_maths_t1_2025:5": {"title": "Direct and Inverse Proportion"},
    "en_std08_maths_2025:2": {"title": "Numbers"}, "en_std08_maths_2025:3": {"title": "Measurements"},
    "en_std08_maths_2025:4": {"title": "Algebra"}, "en_std08_maths_2025:5": {"title": "Life Mathematics"},
    "en_std08_maths_2025:6": {"title": "Geometry"}, "en_std08_maths_2025:7": {"title": "Statistics"},
    "en_std08_maths_2025:8": {"title": "Information Processing"},
    "en_std08_ss_2025:14": {"title": "Hazards"}, "en_std08_ss_2025:16": {"title": "Exploring Continents – Africa, Australia and Antarctica", "topics": []},
    "en_std08_ss_2025:20": {"topics": ["gs.u3.t5"]}, "en_std08_ss_2025:23": {"topics": []},
    "en_std08_ss_2025:25": {"title": "Money, Savings and Investments"}, "en_std08_ss_2025:26": {"topics": ["gs.u5.t1", "gs.u5.t4"]},
    "en_std08_ss_2025:9": {"topics": ["gs.u4.t6", "gs.u6.t4"]},
    "en_std09_maths_2025:3": {"title": "Real Numbers"}, "en_std09_maths_2025:5": {"title": "Geometry"},
    "en_std09_maths_2025:6": {"title": "Coordinate Geometry"},
    "en_std09_sci_2024:24": {"title": "Economic Biology"},
    "en_std09_ss_2025:4": {"topics": ["gs.u6.t1"]},
    "en_std09_ss_2025:5": {"title": "Intellectual Awakening and Socio-Political Changes", "topics": ["gs.u3.t1", "gs.u3.t4"]},
    "en_std09_ss_2025:6": {"topics": []}, "en_std09_ss_2025:7": {"topics": []},
    "en_std09_ss_2025:8": {"topics": ["gs.u3.t1"]}, "en_std09_ss_2025:11": {"topics": []},
    "en_std09_ss_2025:18": {"topics": ["gs.u2.t4", "gs.u1.t4"]},
    "en_std09_ss_2025:24": {"title": "Forms of Government", "topics": ["gs.u4.t3"]},
    "en_std09_ss_2025:26": {"title": "Road Safety", "topics": []},
    "en_std09_ss_2025:27": {"topics": ["gs.u5.t1", "gs.u5.t9"]},
    "en_std09_ss_2025:28": {"topics": ["gs.u5.t3", "gs.u5.t7"]}, "en_std09_ss_2025:30": {"topics": ["gs.u5.t3", "gs.u5.t7"]},
    "en_std10_maths_2025:2": {"title": "Relations and Functions"}, "en_std10_maths_2025:9": {"title": "Statistics and Probability"},
    "en_std10_ss_2025:8": {"title": "Anti-Colonial Movements and the Birth of Nationalism"},
    "en_std10_ss_2025:7": {"title": "Early Revolts against British Rule in Tamil Nadu"},
    "en_std10_ss_2025:12": {"topics": ["gs.u2.t1", "gs.u2.t5"]},
    "en_std10_ss_2025:14": {"topics": ["gs.u2.t1", "gs.u5.t3"]},
    "en_std10_ss_2025:15": {"topics": ["gs.u2.t1", "gs.u5.t4"]},
    "en_std10_ss_2025:16": {"topics": ["gs.u2.t3", "gs.u2.t2"]},
    "en_std10_ss_2025:20": {"topics": ["gs.u4.t3", "gs.u4.t4"]}, "en_std10_ss_2025:21": {"topics": ["gs.u4.t3", "gs.u4.t4"]},
    "en_std10_ss_2025:22": {"topics": []}, "en_std10_ss_2025:23": {"topics": []},
    "en_std10_ss_2025:24": {"topics": ["gs.u5.t1"]}, "en_std10_ss_2025:25": {"topics": ["gs.u5.t1"]},
    "en_std10_ss_2025:27": {"topics": ["gs.u5.t2"]}, "en_std10_ss_2025:28": {"topics": ["gs.u5.t4", "gs.u5.t7"]},
}


TAMIL_KW = {  # topic -> (names that mark it, mentions needed in a chapter)
    "ta.u7.l_kural": (["திருக்குறள்", "திருவள்ளுவர்"], 5),
    "ta.u7.l_arani": (["நாலடியார்", "நான்மணிக்கடிகை", "பழமொழி நானூறு", "முதுமொழிக்காஞ்சி", "திரிகடுகம்", "இன்னா நாற்பது",
                       "இன்னாநாற்பது", "சிறுபஞ்சமூலம்", "ஏலாதி", "ஆத்திசூடி", "கொன்றை வேந்தன்", "மூதுரை", "நல்வழி"], 3),
    "ta.u7.l_tholmai": (["திராவிட மொழி", "தமிழின் தொன்மை", "மொழிக்குடும்ப"], 3),
    "ta.u7.l_tamilpani": (["சாமிநாத", "மீனாட்சி சுந்தர", "இலக்குவனார்"], 2),
    "ta.u7.l_thondu": (["பாவாணர்", "அகரமுதலி", "பெருஞ்சித்திரனார்", "போப்", "வீரமாமுனிவர்"], 2),
    "ta.u7.l_sanror": (["பாவேந்தர்", "பாரதிதாசன்", "சிதம்பரநாத", "குன்றக்குடி", "கண்ணதாசன்", "காயிதே மில்லத்", "தாரா பாரதி",
                        "வேலுநாச்சியார்", "வேலு நாச்சியார்", "பட்டுக்கோட்டை", "முடியரசன்", "தமிழ் ஒளி", "தமிழ்ஒளி",
                        "உருத்திரங்கண்ணனார்", "ஜகந்நாத", "நாமக்கல் கவிஞர்"], 4),
}


def tamil_reader(u: dict, pages: list, n: int):
    """Title and topics of a Tamil reader chapter (n = its number in the book)."""
    if re.search(r"kural", u["slug"], re.I):
        return "திருக்குறள்", ["ta.u7.l_kural"]
    m = re.search(r"unit[\s_\-]*([0-9ilt|]{1,2})\b", u["slug"], re.I)
    num = m.group(1).translate(str.maketrans("ilt|", "1111")).lstrip("0") if m else str(n)
    text = "\n".join(pages[u["pageStart"] - 1:u["pageEnd"]])
    topics = [t for t, (names, need) in TAMIL_KW.items() if sum(text.count(w) for w in names) >= need]
    return f"இயல் {num}", topics


TAMIL_FIX = {  # book -> unit start pages to add / drop, or the full list ("starts")
    "ta_std06_sci-ss_t1_2025": {"add": [195]},  # civics opener page OCR'd without its objectives line
    "ta_std06_sci-ss_t2_2024": {"drop": [135]},  # a box in "Great Thinkers" read as an opener
    "ta_std06_sci-ss_t3_2024": {"drop": [96]},
    "ta_std07_sci-ss_t2_2024": {"drop": [108]},
    "ta_std08_sci_2024": {"drop": [152]},  # Unit-13 OCR'd as 138 on some pages
    "ta_std08_ss_2025": {"drop": [153]},
    "ta_std09_ss_2025": {"drop": [295, 298]},
    "ta_std09_sci_2024": {"starts": [5, 18, 30, 43, 56, 70, 84, 96, 107, 118, 130, 143, 153, 167, 177, 191, 206, 217,
                                     234, 241, 256, 268, 286, 303, 317]},  # slugs OCR'd as 13/18, O6, BlO
}
TAMIL_ONLY_TITLES = {
    "ta_std10_sci_2024": ("science", ["Laws of Motion", "Optics", "Thermal Physics", "Electricity", "Acoustics",
        "Nuclear Physics", "Atoms and Molecules", "Periodic Classification of Elements", "Solutions",
        "Types of Chemical Reactions", "Carbon and its Compounds", "Plant Anatomy and Plant Physiology",
        "Structural Organisation of Animals", "Transportation in Plants and Circulation in Animals", "Nervous System",
        "Plant and Animal Hormones", "Reproduction in Plants and Animals", "Heredity", "Origin and Evolution of Life",
        "Breeding and Biotechnology", "Health and Diseases", "Environmental Management", "Visual Communication"]),
}


def tamil_units(units: list, book_id: str) -> list:
    """A Tamil Sci/SS book's units after TAMIL_FIX: [(start, end)]."""
    mine = [u for u in units if u["bookId"] == book_id and u["kind"] == "unit"]
    if not mine:
        return []
    fix = TAMIL_FIX.get(book_id, {})
    starts = fix.get("starts") or sorted(set(u["pageStart"] for u in mine) - set(fix.get("drop", [])) | set(fix.get("add", [])))
    last = max(u["pageEnd"] for u in mine)
    return [(a, (starts[i + 1] - 1) if i + 1 < len(starts) else last) for i, a in enumerate(starts)]


def clean_title(t: str) -> str:
    t = re.sub(r"^(CIVICS\s+)?unit\s*[-–]\s*[\divx]+\s*", "", t.strip(), flags=re.I)
    t = re.sub(r"^\d+\s+", "", t)
    t = re.sub(r"[\"“].*$", "", t).strip()
    return t if not t.isupper() else t.title().replace(" And ", " and ").replace(" Of ", " of ").replace(" In ", " in ")


def main(content: Path) -> None:
    graph = {n["id"] for n in json.loads((content / "gold/syllabus/ccse4.json").read_text())["nodes"]}
    books = {b["id"]: b for b in json.loads((content / "silver/textbooks/books.json").read_text(encoding="utf-8"))}
    units = json.loads((content / "silver/textbooks/units.json").read_text(encoding="utf-8"))
    out, unused = [], set(OVERRIDES)
    # English-medium units in order, per (class, term, part), for the Tamil-medium units to mirror
    tamil_n, page_cache = {}, {}
    for u in sorted(units, key=lambda u: books[u["bookId"]]["medium"] != "english"):
        key = f"{u['bookId']}:{u['seq']}"
        o = OVERRIDES.get(key, {})
        unused.discard(key)
        kind = o.get("kind", u["kind"])
        if kind != "unit":
            continue
        b = books[u["bookId"]]
        part = o.get("part") or u["part"] or {"maths": "maths", "science": "science", "tamil": "tamil"}.get(u["subject"])
        if b["medium"] == "tamil" and part == "tamil":
            if u["bookId"] not in page_cache:
                page_cache[u["bookId"]] = [json.loads(l)["text"] for l in (content / "silver/textbooks" / u["bookId"] / "pages.jsonl").open(encoding="utf-8")]
            tamil_n[u["bookId"]] = tamil_n.get(u["bookId"], 0) + 1
            title, topics = tamil_reader(u, page_cache[u["bookId"]], tamil_n[u["bookId"]])
            title, topics = o.get("title", title), o.get("topics", topics)
        elif b["medium"] == "tamil":
            continue  # Science / Social Science: mirrored book by book below
        else:
            title = o.get("title") or clean_title(u["titleGuess"])
            if not part or not title:
                sys.exit(f"{key}: no part or title ({u})")
            topics = o["topics"] if "topics" in o else next(t for rx, t in RULES[part] if re.search(rx, title, re.I))
        topics = [f"ccse4.{t}" for t in topics]
        bad = [t for t in topics if t not in graph]
        if bad:
            sys.exit(f"{key}: unknown topics {bad}")
        out.append({"id": key.replace(":", "_u"), "bookId": u["bookId"], "class": b["class"], "medium": b["medium"], "part": part,
                    "title": title, "pageStart": u["pageStart"], "pageEnd": u["pageEnd"], "topicIds": topics})
    if unused:
        sys.exit(f"overrides for units that don't exist: {sorted(unused)}")
    unused_fix = set(TAMIL_FIX) | set(TAMIL_ONLY_TITLES)
    for bid, b in books.items():
        if b["medium"] != "tamil" or b["subjects"] == ["tamil"]:
            continue
        spans = tamil_units(units, bid)
        unused_fix.discard(bid)
        if bid in TAMIL_ONLY_TITLES:
            part, titles = TAMIL_ONLY_TITLES[bid]
            twins = [{"part": part, "title": t, "topicIds": [f"ccse4.{x}" for x in next(tp for rx, tp in RULES[part] if re.search(rx, t, re.I))]}
                     for t in titles]
        else:
            twin = next((e for e in books.values() if e["medium"] == "english" and (e["class"], e["term"], e["subjects"]) ==
                         (b["class"], b["term"], b["subjects"])), None)
            if twin is None:
                sys.exit(f"{bid}: no English-medium twin and no TAMIL_ONLY_TITLES")
            twins = [x for x in out if x["bookId"] == twin["id"]]
        if len(twins) != len(spans):
            sys.exit(f"{bid}: {len(spans)} units after TAMIL_FIX, its English twin has {len(twins)}")
        for i, ((a, z), t) in enumerate(zip(spans, twins), 1):
            out.append({"id": f"{bid}_m{i}", "bookId": bid, "class": b["class"], "medium": "tamil", "part": t["part"],
                        "title": t["title"], "pageStart": a, "pageEnd": z, "topicIds": t["topicIds"]})
    if unused_fix:
        sys.exit(f"TAMIL_FIX / TAMIL_ONLY_TITLES for books that don't exist: {sorted(unused_fix)}")
    out.sort(key=lambda u: (u["bookId"], u["pageStart"]))
    dest = content / "gold/textbooks/ccse4_units.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(out)} units, {sum(not u['topicIds'] for u in out)} outside the Group 4 syllabus -> {dest}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
