"""Build the Group 4 (CCSE-IV, code 496) Syllabus Graph from the official syllabus PDF.

General Studies and Aptitude are parsed from the PDF's English text (topics split on ';', concepts on ' - ').
The Tamil test units are entered by hand from the page images, because the PDF's Tamil text layer uses a
legacy encoding that extracts as garbage. Output: gold/syllabus/ccse4.json in tnpsc-content.
"""
import json
import re
import subprocess
from pathlib import Path

CONTENT = Path("/home/claude/tnpsc-content")
PDF = CONTENT / "bronze/tnpsc/syllabus/496_group4_syllabus.pdf"
OUT = CONTENT / "gold/syllabus/ccse4.json"

nodes = []


def add(id_, parent, level, en, ta=None, weight=None, **extra):
    nodes.append({"id": id_, "parentId": parent, "level": level, "nameEn": en, "nameTa": ta,
                  "examIds": ["ccse4"], "questions": weight, **extra})


def english_units() -> dict[str, str]:
    """Return {unit heading: body text} for Part A (GS) and Part B (Aptitude) from page 1-2 text."""
    txt = subprocess.run(["pdftotext", "-f", "1", "-l", "2", str(PDF), "-"], capture_output=True, text=True).stdout
    txt = txt.split("Part C:")[0]
    txt = re.sub(r"Page \d of \d", " ", txt)
    parts = re.split(r"(Unit [IVX]+: [^\n]*?\(\d+ Questions\))", txt.replace("\n(20 Questions)", " (20 Questions)"))
    return {parts[i].strip(): " ".join(parts[i + 1].split()) for i in range(1, len(parts) - 1, 2)}


add("ccse4", None, "exam", "Combined Civil Services Examination IV (Group 4)", "ஒருங்கிணைந்த குடிமைப் பணிகள் தேர்வு IV (தொகுதி IV)",
    200, code="496", source={"pdf": str(PDF.relative_to(CONTENT)), "url": "https://tnpsc.gov.in/static_pdf/syllabus/496_Group%20IV%20Syllabus.pdf"})
add("ccse4.gs", "ccse4", "part", "General Studies (SSLC)", "பொது அறிவு", 75)
add("ccse4.apt", "ccse4", "part", "Aptitude and Mental Ability (SSLC)", "திறனறிவும் மனக்கணக்கு நுண்ணறிவும்", 25)
add("ccse4.ta", "ccse4", "part", "Tamil Eligibility-cum-Scoring Test (SSLC)", "தமிழ் தகுதி மற்றும் மதிப்பீட்டுத் தேர்வு", 100,
    note="A score below 40% (60 of 150 marks) in this part stops the rest of the paper being evaluated.")

units = english_units()
gs_n = apt_n = 0
for head, body in units.items():
    m = re.match(r"Unit ([IVX]+): (.*?) \((\d+) Questions\)", head)
    roman, name, q = m.group(1), m.group(2).strip(), int(m.group(3))
    is_apt = name in ("Aptitude", "Reasoning")
    if is_apt:
        apt_n += 1; uid = f"ccse4.apt.u{apt_n}"; parent = "ccse4.apt"
    else:
        gs_n += 1; uid = f"ccse4.gs.u{gs_n}"; parent = "ccse4.gs"
    add(uid, parent, "unit", name, None, q)
    body = body.replace("Centre - State", "Centre–State").replace("Election Judiciary", "Election - Judiciary")
    topics = [t.strip(" .") for t in body.split(";") if t.strip(" .")]
    for ti, t in enumerate(topics, 1):
        # concepts: split on dashes, and on commas in lists ("acids, bases, salts, and ...")
        concepts = [c.strip(" .") for c in re.split(r"\s[-–]\s|,\s(?:and\s)?", t) if c.strip(" .")]
        tid = f"{uid}.t{ti}"
        add(tid, uid, "topic", concepts[0] if len(concepts) == 1 else "; ".join(concepts[:2]) + (" …" if len(concepts) > 2 else ""))
        for ci, c in enumerate(concepts, 1):
            add(f"{tid}.c{ci}", tid, "concept", c)

# Tamil test: entered from the page images (pages 2-3). key -> (Tamil name, short English gloss)
TAMIL = [
    ("u1", "இலக்கணம்", "Grammar", 25, [
        ("e_split", "பிரித்து எழுதுதல்", "splitting words"), ("e_join", "சேர்த்து எழுதுதல்", "joining words"),
        ("e_sandhi", "சந்திப்பிழை", "sandhi errors"), ("e_kuril", "குறில், நெடில் வேறுபாடு", "short/long vowels"),
        ("e_la", "லகர, ளகர, ழகர வேறுபாடு", "la/La/zha"), ("e_na", "னகர, ணகர வேறுபாடு", "na/Na"),
        ("e_ra", "ரகர, றகர வேறுபாடு", "ra/Ra"), ("e_ina", "இனவெழுத்துகள் அறிதல்", "kindred letters"),
        ("e_suttu", "சுட்டு எழுத்துகள்", "demonstrative letters"), ("e_vina", "வினா எழுத்துகள்", "interrogative letters"),
        ("e_orumai", "ஒருமைப் பன்மை அறிதல்", "singular/plural"), ("s_root", "வேர்ச்சொல் அறிதல்", "root words"),
        ("s_forms", "வேர்ச்சொல்லில் இருந்து வினைமுற்று, வினையெச்சம், வினையாலணையும் பெயர், பெயரெச்சம் வகை அறிதல்", "verb forms from roots"),
        ("s_ayal", "அயற்சொல்", "loan words"), ("s_tamil", "தமிழ்ச்சொல்", "pure Tamil words"),
        ("s_ethir", "எதிர்ச்சொல்", "antonyms"), ("s_vinai", "வினைச்சொல்", "verbs"),
        ("s_pizhai", "எழுத்துப் பிழை, ஒற்றுப்பிழை அறிதல்", "spelling and doubling errors"),
        ("s_diff", "இரண்டு வினைச் சொற்களின் வேறுபாடு அறிதல்", "difference between two verbs")]),
    ("u2", "சொல்லகராதி", "Vocabulary", 15, [
        ("v_ethir", "எதிர்ச்சொல்லை எடுத்தெழுதுதல்", "picking the antonym"), ("v_oreluthu", "ஓரெழுத்து ஒரு மொழி", "one-letter words"),
        ("v_uriya", "உரிய பொருளைக் கண்டறிதல்", "correct meaning"), ("v_palasol", "ஒருபொருள் தரும் பல சொற்கள்", "synonyms"),
        ("v_porunthaa", "பொருந்தா சொல்லைக் கண்டறிதல்", "odd word out"), ("v_akara", "அகர வரிசைப்படி சொற்களைச் சீர்செய்தல்", "alphabetical order"),
        ("v_orupporul", "ஒருபொருள் பன்மொழி", "pleonastic phrases"), ("v_iruporul", "இருபொருள் குறிக்கும் சொற்கள்", "words with two meanings"),
        ("v_pechu", "பேச்சு வழக்கு, எழுத்து வழக்கு", "spoken vs written"), ("v_solporul", "சொல்லும் பொருளும் அறிதல்", "word meanings"),
        ("v_inai", "ஒரு சொல்லிற்கு இணையான வேறு சொல் அறிதல்", "equivalent word"),
        ("v_kodi", "கோடிட்ட இடத்தில் சரியான சொல்லைத் தேர்ந்தெடுத்து எழுதுதல்", "fill in the blank"),
        ("v_porutham", "பொருத்தமான பொருளைத் தெரிவு செய்தல்", "matching meaning"), ("v_maroo", "ஊர்ப் பெயர்களின் மரூஉ", "place-name contractions"),
        ("v_pizhai", "பிழை திருத்துக", "error correction"), ("v_thooya", "பேச்சு வழக்குச் சொற்களுக்கு இணையான தூய தமிழ்ச் சொற்கள்", "pure Tamil for colloquial"),
        ("v_pechu_pizhai", "பேச்சு வழக்குத் தொடர்களிலுள்ள பிழை திருத்தம்", "correcting colloquial sentences"),
        ("v_puthiya", "சொற்களை இணைத்துப் புதிய சொல் உருவாக்குதல்", "connectives"),
        ("v_adaippu", "அடைப்புக்குள் உள்ள சொல்லைத் தகுந்த இடத்தில் சேர்த்தல்", "placing the bracketed word"),
        ("v_oreluthu_porul", "பொருள் தரும் ஓர் எழுத்து", "meaningful single letter"), ("v_palaporul", "பல பொருள் தரும் ஒரு சொல்", "one word, many meanings")]),
    ("u3", "எழுதும் திறன்", "Writing skills", 15, [
        ("w_order", "சொற்களை ஒழுங்குபடுத்திச் சொற்றொடர் அமைத்தல்", "word order"), ("w_types", "தொடர் வகைகள்", "sentence types"),
        ("w_seyvinai", "செய்வினை, செயப்பாட்டு வினை", "active/passive"), ("w_thanvinai", "தன்வினை, பிறவினை", "direct/causative"),
        ("w_orumai", "ஒருமைப் பன்மை பிழையறிந்து சரியான தொடரறிதல்", "number agreement"),
        ("m_thinai", "திணை மரபு", "class convention"), ("m_paal", "பால் மரபு", "gender convention"), ("m_kaalam", "காலம்", "tense"),
        ("m_ilamai", "இளமைப் பெயர்", "names of the young"), ("m_oli", "ஒலிமரபு", "sound conventions"),
        ("m_vinai", "வினைமரபு", "verb conventions"), ("m_thogai", "தொகை மரபு", "collective nouns"),
        ("m_other", "மரபுத் தமிழ் (பிற)", "other conventions"), ("w_punct", "நிறுத்தல் குறியீடுகள்", "punctuation")]),
    ("u4", "கலைச் சொற்கள்", "Technical terms", 10, [
        ("k_terms", "பல்துறை சார்ந்த கலைச் சொற்கள் (அறிவியல், கல்வி, மருத்துவம், மேலாண்மை, சட்டம், புவியியல், தொழில்நுட்பம், ஊடகம், தகவல் தொழில்நுட்பம்)", "technical terms across fields")]),
    ("u5", "வாசித்தல் - புரிந்து கொள்ளும் திறன்", "Reading comprehension", 15, [
        ("r_passage", "கொடுக்கப்பட்ட பத்தியிலிருந்து வினாக்கள்", "passage questions"),
        ("r_news", "செய்தித்தாள், தலையங்கம், அரசு சார்ந்த செய்திகள், கட்டுரைகள்", "news and editorials"),
        ("r_uvamai", "உவமைத் தொடரின் பொருளறிதல்", "similes"), ("r_marabu", "மரபுத் தொடரின் பொருளறிதல்", "idioms"),
        ("r_pazhamozhi", "பழமொழிகள் பொருளறிதல்", "proverbs"), ("r_document", "ஆவண உள்ளடக்கங்களைப் புரிந்து கொள்ளுதல்", "official documents")]),
    ("u6", "எளிய மொழி பெயர்ப்பு", "Simple translation", 5, [
        ("t_words", "ஆங்கிலம் மற்றும் பிறமொழிச் சொற்களுக்கு இணையான தமிழ்ச் சொற்கள்", "Tamil equivalents"),
        ("t_usage", "பயன்பாட்டில் உள்ள ஆங்கிலச் சொற்களை மொழிபெயர்த்தல்", "everyday English words"),
        ("t_docs", "ஆவணங்களின் தலைப்பு, கோப்புகள், கடிதங்கள், மனுக்கள் மொழிபெயர்ப்பு", "office documents")]),
    ("u7", "இலக்கியம், தமிழ் அறிஞர்களும், தமிழ்த்தொண்டும்", "Literature, Tamil scholars and service", 15, [
        ("l_kural", "திருக்குறள் (இருபது அதிகாரங்கள் மட்டும்)", "Thirukkural, 20 chapters"),
        ("l_arani", "அறநூல்கள் (நாலடியார், நான்மணிக்கடிகை, பழமொழி நானூறு, முதுமொழிக்காஞ்சி, திரிகடுகம், இன்னாநாற்பது, சிறுபஞ்சமூலம், ஏலாதி, அவ்வையார் பாடல்கள்)", "ethical works"),
        ("l_tholmai", "தமிழின் தொன்மை, சிறப்பு, திராவிட மொழிகள்", "antiquity of Tamil, Dravidian languages"),
        ("l_tamilpani", "தமிழ்ப்பணி: உ.வே.சாமிநாத ஐயர், தெ.பொ.மீனாட்சி சுந்தரம், சி.இலக்குவனார்", "service to Tamil"),
        ("l_thondu", "தமிழ்த் தொண்டு: தேவநேய பாவாணர், அகரமுதலி, பாவலரேறு பெருஞ்சித்திரனார், ஜி.யு.போப், வீரமாமுனிவர்", "Tamil scholarship"),
        ("l_sanror", "தமிழ்ச் சான்றோர் (பாவேந்தர், டி.கே.சிதம்பரநாதர், குன்றக்குடி அடிகளார், கண்ணதாசன், காயிதே மில்லத், தாரா பாரதி, வேலுநாச்சியார், பட்டுக்கோட்டைக் கல்யாணசுந்தரம், முடியரசன், தமிழ் ஒளி, உருத்திரங்கண்ணனார், கி.வா.ஜகந்நாதர், நாமக்கல் கவிஞர்)", "Tamil luminaries")]),
]
KURAL = ["ஒழுக்கமுடைமை", "பொறையுடைமை", "ஊக்கமுடைமை", "விருந்தோம்பல்", "அறன் வலியுறுத்தல்", "ஈகை", "பெரியாரைத் துணைக்கோடல்",
         "வினை செயல்வகை", "அவையஞ்சாமை", "கண்ணோட்டம்", "அன்புடைமை", "கல்வி", "நடுநிலைமை", "கூடா ஒழுக்கம்", "கல்லாமை",
         "செங்கோன்மை", "பண்புடைமை", "நட்பாராய்தல்", "புறங்கூறாமை", "அருளுடைமை"]
assert len(KURAL) == 20

for key, ta, en, q, topics in TAMIL:
    uid = f"ccse4.ta.{key}"
    add(uid, "ccse4.ta", "unit", en, ta, q)
    for tkey, tta, ten in topics:
        add(f"{uid}.{tkey}", uid, "topic", ten, tta)
for i, ch in enumerate(KURAL, 1):
    add(f"ccse4.ta.u7.l_kural.c{i}", "ccse4.ta.u7.l_kural", "concept", f"Thirukkural chapter: {ch}", ch)

ids = [n["id"] for n in nodes]
assert len(ids) == len(set(ids)), "duplicate ids"
byid = {n["id"]: n for n in nodes}
for part in ("ccse4.gs", "ccse4.apt", "ccse4.ta"):
    s = sum(n["questions"] for n in nodes if n["parentId"] == part and n["level"] == "unit")
    assert s == byid[part]["questions"], (part, s)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"version": "2026-11-22", "exam": "ccse4", "nodes": nodes}, ensure_ascii=False, indent=1), encoding="utf-8")
lv = {}
for n in nodes:
    lv[n["level"]] = lv.get(n["level"], 0) + 1
print("nodes by level:", lv)
for n in nodes:
    if n["level"] == "unit":
        print(f"  {n['id']:18s} {n['questions']:>3}  {n['nameEn']}")
