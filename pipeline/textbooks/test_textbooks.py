"""python -m pytest pipeline/textbooks/test_textbooks.py (or run directly)."""
from units import opener_title, slug_of
from tag_units_ccse4 import RULES, clean_title


def test_opener_title_reads_the_heading_between_unit_and_objectives():
    page = "Unit\n2\nGreat Thinkers and\nNew Faiths\nLearning Objectives\n• To know ..."
    assert opener_title(page) == "Great Thinkers and New Faiths"
    assert opener_title("Some body text\nwith Learning Objectives mentioned later") is None


def test_slug_is_read_from_the_indesign_footer():
    assert slug_of("text\nVI_Science_Unit_1.indd 12\n") is not None
    assert slug_of("no footer here") is None


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
