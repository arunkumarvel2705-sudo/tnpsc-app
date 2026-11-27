"""python3 test_glossary.py (or pytest). Synthetic layouts in the shapes the textbooks use."""
from glossary_parse import page_pairs
from tamil_text import clean_ta, bad_word

THREE_COL = """
                   GLOSSARY

                   monopoly               exclusive possession or control           முற்றுரிமை

                                          blind patriotism, especially in the       கண்மூடித்்தனமான
                   jingoism
                                          pursuit of aggressive foreign policy      நாட்டுப்்பற்று
                   torpedo                attack or sink (a ship)                   மூழ்்கடி
                       Evaluation
                   ignored                not part of the glossary                  புறக்கணி
"""

TWO_PAIRS = """
                                     MATHEMATICAL TERMS
                Abscissa                  X-அச்சின் தொலைவு               Commutative property     பரிமாற்றுப் பண்பு
                Circumcentre of a         முக்கோணத்தின்                  Interior opposite
                triangle                  சுற்றுவட்டமையம்                                         உள்ளெதிர் கோணம்
                                                                         angle
"""

TAMIL_FIRST = """
                 GLOSSARY
               அமிலம்                  - Acid                           காடு அழிப்பு         - Deforestation
               உயிர்உரம்               - Bio fertilizer                 உறைநிலை              - Freezing point
"""

ONE_LINE = """
                     GLOSSARY
                     Kinship            -     blood relationship (இரத்த உறவு)
"""


def pairs(layout):
    return {p["en"]: p["ta"] for p in page_pairs(layout)}


def test_three_columns_with_wrapped_rows():
    got = pairs(THREE_COL)
    assert got == {"monopoly": "முற்றுரிமை", "jingoism": "கண்மூடித்தனமான நாட்டுப்பற்று", "torpedo": "மூழ்கடி"}


def test_two_pairs_per_row_and_wrapped_headwords():
    got = pairs(TWO_PAIRS)
    assert got["Abscissa"] == "X-அச்சின் தொலைவு"
    assert got["Commutative property"] == "பரிமாற்றுப் பண்பு"
    assert got["Circumcentre of a triangle"] == "முக்கோணத்தின் சுற்றுவட்டமையம்"
    assert got["Interior opposite angle"] == "உள்ளெதிர் கோணம்"


def test_tamil_first_lists():
    assert pairs(TAMIL_FIRST) == {"Acid": "அமிலம்", "Deforestation": "காடு அழிப்பு", "Bio fertilizer": "உயிர்உரம்", "Freezing point": "உறைநிலை"}


def test_word_dash_meaning_tamil_in_brackets():
    assert pairs(ONE_LINE) == {"Kinship": "இரத்த உறவு"}


def test_tamil_repairs():
    assert clean_ta("கலாச்்சசாரத்்ததை") == "கலாச்சாரத்தை"
    assert clean_ta("கொ�ொள்்ளளையடி") == "கொள்ளையடி"
    assert clean_ta("ெகாள்கை") == "கொள்கை"
    assert clean_ta("சமநிைலப்") == "சமநிலைப்"
    assert clean_ta("தந்‌ைத") == "தந்தை"
    assert clean_ta("X-அச்சின் (கிடைஅச்சுத் தொலைவு") == "X-அச்சின் (கிடைஅச்சுத் தொலைவு)"
    assert bad_word("ெமூகைம்") and not bad_word("நிலையான")


if __name__ == "__main__":
    for name, f in list(globals().items()):
        if name.startswith("test_"):
            f()
    print("ok")
