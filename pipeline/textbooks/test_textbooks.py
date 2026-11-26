"""python -m pytest pipeline/textbooks/test_textbooks.py (or run directly)."""
from units import opener_title, slug_key, slug_of
from tag_units_ccse4 import RULES, clean_title


def test_opener_title_reads_the_heading_between_unit_and_objectives():
    page = "Unit\n2\nGreat Thinkers and\nNew Faiths\nLearning Objectives\n• To know ..."
    assert opener_title(page) == "Great Thinkers and New Faiths"
    assert opener_title("Some body text\nwith Learning Objectives mentioned later") is None


def test_slug_is_read_from_the_indesign_footer():
    assert slug_of("text\nVI_Science_Unit_1.indd 12\n") is not None
    assert slug_of("no footer here") is None


def test_ocr_slugs_compare_by_what_they_name():
    assert slug_key("6th Std-Tamil_2025_Term_Il_Unit_1", "tamil") == slug_key("6th Std-Tamil_2025_Term_II_Unit_1", "tamil")
    assert slug_key("6th Science_TM_Unit-l", "tamil") == slug_key("6th Science_TM_Unit-1", "tamil")
    assert slug_key("6th Std-Tamil_2025_Term_Il_Unit_1", "tamil") != slug_key("6th Std-Tamil_2025_Term_Il_Unit_2", "tamil")
    assert slug_key("VI_History_TM_Unit_1", "tamil") != slug_key("VI_Geography_TM_Unit_1", "tamil")
    assert slug_key("6th_2nd_Term_English_Unit_l", "tamil").startswith("english")
    assert slug_key("X_Unit-01", "english") == "X_Unit-01"


def test_tamil_openers():
    assert opener_title("இயல் உயிருக்கு வேர்\nஇயற்கை, சுற்றுச்சூழல்\nகற்றல் நோக்கங்கள்\n> ...") == "உயிருக்கு வேர் இயற்கை, சுற்றுச்சூழல்"
    assert opener_title("eeu மொழி\nபவ நோக்கங்கள்\nமொழியின் தேவை") == "eeu மொழி"  # garbled heading, objectives still near the top
    assert opener_title("கற்றல் நோக்கங்கள்\n> மொழிபெயர்ப்பு") == ""
    assert opener_title("முன்னுரை\n" + "உரை\n" * 12 + "கற்றல் நோக்கங்கள்") is None


def test_clean_title():
    assert clean_title("Unit - 4 People’s Revolt") == "People’s Revolt"
    assert clean_title("CIVICS Unit - 1 How the State Government Works") == "How the State Government Works"
    assert clean_title("ACIDS AND BASES") == "Acids and Bases"


def first_rule(part, title):
    import re
    return next(t for rx, t in RULES[part] if re.search(rx, title, re.I))


def test_rules_order():
    assert first_rule("science", "Chemistry in Daily Life") == ["gs.u1.t2"]
    assert first_rule("science", "Animals in Daily Life") == ["gs.u1.t3"]
    assert first_rule("history", "The Middle Ages") == []
    assert first_rule("maths", "Information Processing") == ["apt.u2.t1"]


if __name__ == "__main__":
    for name, f in list(globals().items()):
        if name.startswith("test_"):
            f()
    print("ok")
