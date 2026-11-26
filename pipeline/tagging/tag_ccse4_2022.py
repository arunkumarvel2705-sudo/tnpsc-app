"""Tag CCSE-IV 2022 (Parts A and B) to the Group 4 Syllabus Graph (D-12: AI tagging with confidence).

Tags were assigned by Claude from each question's text. Confidence < 0.8 = judgement call -> review queue.
Writes gold/tags/ccse4_2022.json; build_bundle.py applies it. Prints the distribution against the
official unit weights.

Note on Part A: the 2022 paper, like 2024, was set on the older Tamil syllabus (literary works, poets, prosody and
grammar analysis such as இலக்கணக் குறிப்பு). The Syllabus Graph follows the current syllabus, which has no
topic for prosody (எதுகை/மோனை/ஓசை) or for works such as epics and devotional poetry. Those questions go to
the nearest topic with low confidence (0.4-0.5) so they show up for review rather than pass silently.
Usage: python tag_ccse4_2022.py <content-repo>
"""
import json
import sys
from collections import Counter
from pathlib import Path

CONTENT = Path(sys.argv[1])
PAPER = "ccse4_2022"
TAGGED_AT = "2026-11-26"
graph = {n["id"]: n for n in json.loads((CONTENT / "gold/syllabus/ccse4.json").read_text())["nodes"]}

# question -> (unit, topic, confidence). Part A units are ta.u1..u7; Part B gs.u1..u6, apt.u1, apt.u2.
T = {
    1: ("ta.u5", "r_uvamai", .9), 2: ("ta.u5", "r_pazhamozhi", .9), 3: ("ta.u3", "w_seyvinai", .95), 4: ("ta.u3", "w_seyvinai", .9),
    5: ("ta.u3", "m_other", .5), 6: ("ta.u3", "m_other", .5), 7: ("ta.u3", "m_other", .5), 8: ("ta.u1", "s_forms", .95),
    9: ("ta.u1", "s_root", .95), 10: ("ta.u1", "s_root", .95), 11: ("ta.u2", "v_oreluthu_porul", .95), 12: ("ta.u2", "v_oreluthu_porul", .95),
    13: ("ta.u2", "v_solporul", .9), 14: ("ta.u3", "m_oli", .9), 15: ("ta.u1", "e_sandhi", .95), 16: ("ta.u2", "v_porunthaa", .6),
    17: ("ta.u2", "v_porunthaa", .7), 18: ("ta.u3", "m_vinai", .85), 19: ("ta.u2", "v_porutham", .4), 20: ("ta.u7", "l_sanror", .5),
    21: ("ta.u7", "l_tholmai", .4), 22: ("ta.u7", "l_sanror", .6), 23: ("ta.u7", "l_sanror", .6), 24: ("ta.u7", "l_sanror", .4),
    25: ("ta.u7", "l_sanror", .5), 26: ("ta.u7", "l_sanror", .6), 27: ("ta.u7", "l_tholmai", .5), 28: ("ta.u7", "l_kural", .9),
    29: ("ta.u7", "l_arani", .5), 30: ("ta.u7", "l_sanror", .7), 31: ("ta.u7", "l_arani", .9), 32: ("ta.u7", "l_arani", .6),
    33: ("ta.u7", "l_thondu", .5), 34: ("ta.u7", "l_sanror", .8), 35: ("ta.u7", "l_sanror", .6), 36: ("ta.u7", "l_tholmai", .8),
    37: ("ta.u7", "l_tholmai", .7), 38: ("ta.u2", "v_maroo", .95), 39: ("ta.u7", "l_sanror", .7), 40: ("ta.u7", "l_tamilpani", .85),
    41: ("ta.u7", "l_tamilpani", .8), 42: ("ta.u7", "l_tamilpani", .9), 43: ("ta.u7", "l_tholmai", .5), 44: ("ta.u7", "l_tholmai", .6),
    45: ("ta.u7", "l_sanror", .7), 46: ("ta.u7", "l_sanror", .8), 47: ("ta.u7", "l_sanror", .8), 48: ("ta.u7", "l_sanror", .8),
    49: ("ta.u7", "l_sanror", .8), 50: ("ta.u5", "r_pazhamozhi", .85), 51: ("ta.u3", "m_other", .4), 52: ("ta.u3", "m_other", .4),
    53: ("ta.u3", "w_types", .95), 54: ("ta.u3", "w_types", .9), 55: ("ta.u3", "w_types", .7), 56: ("ta.u3", "w_types", .7),
    57: ("ta.u3", "w_order", .95), 58: ("ta.u3", "w_order", .9), 59: ("ta.u2", "v_akara", .95), 60: ("ta.u2", "v_akara", .95),
    61: ("ta.u1", "s_forms", .9), 62: ("ta.u3", "m_other", .4), 63: ("ta.u6", "t_words", .9), 64: ("ta.u6", "t_words", .9),
    65: ("ta.u2", "v_ethir", .9), 66: ("ta.u2", "v_ethir", .95), 67: ("ta.u1", "e_split", .95), 68: ("ta.u1", "e_split", .95),
    69: ("ta.u7", "l_tholmai", .5), 70: ("ta.u7", "l_tholmai", .5), 71: ("ta.u7", "l_sanror", .5), 72: ("ta.u7", "l_sanror", .5),
    73: ("ta.u7", "l_sanror", .5), 74: ("ta.u7", "l_tholmai", .5), 75: ("ta.u7", "l_tholmai", .4), 76: ("ta.u7", "l_tholmai", .4),
    77: ("ta.u7", "l_tholmai", .4), 78: ("ta.u7", "l_sanror", .7), 79: ("ta.u7", "l_sanror", .4), 80: ("ta.u4", "k_terms", .4),
    81: ("ta.u7", "l_tamilpani", .9), 82: ("ta.u7", "l_tholmai", .5), 83: ("ta.u2", "v_solporul", .85), 84: ("ta.u7", "l_tholmai", .5),
    85: ("ta.u7", "l_kural", .7), 86: ("ta.u7", "l_kural", .7), 87: ("ta.u7", "l_kural", .7), 88: ("ta.u7", "l_sanror", .7),
    89: ("ta.u7", "l_sanror", .7), 90: ("ta.u7", "l_tholmai", .7), 91: ("ta.u7", "l_tholmai", .7), 92: ("ta.u7", "l_sanror", .5),
    93: ("ta.u7", "l_tamilpani", .9), 94: ("ta.u7", "l_tamilpani", .8), 95: ("ta.u7", "l_tamilpani", .8), 96: ("ta.u7", "l_tholmai", .7),
    97: ("ta.u7", "l_sanror", .8), 98: ("ta.u7", "l_sanror", .8), 99: ("ta.u7", "l_sanror", .7), 100: ("ta.u7", "l_sanror", .8),
    101: ("gs.u6", "t4", .7), 102: ("gs.u4", "t3", .8), 103: ("gs.u4", "t4", .9), 104: ("gs.u1", "t3", .9),
    105: ("gs.u2", "t5", .7), 106: ("gs.u1", "t2", .9), 107: ("gs.u1", "t5", .85), 108: ("gs.u6", "t1", .9),
    109: ("gs.u6", "t1", .85), 110: ("gs.u6", "t3", .95), 111: ("gs.u6", "t4", .9), 112: ("gs.u6", "t4", .9),
    113: ("gs.u3", "t1", .95), 114: ("gs.u3", "t2", .95), 115: ("gs.u6", "t4", .9), 116: ("gs.u3", "t4", .9),
    117: ("gs.u5", "t1", .95), 118: ("gs.u5", "t1", .9), 119: ("gs.u5", "t2", .9), 120: ("gs.u2", "t3", .85),
    121: ("apt.u1", "t1", .95), 122: ("apt.u1", "t1", .95), 123: ("apt.u1", "t1", .9), 124: ("apt.u1", "t1", .6),
    125: ("apt.u2", "t1", .95), 126: ("apt.u1", "t1", .95), 127: ("apt.u1", "t1", .95), 128: ("apt.u2", "t1", .95),
    129: ("apt.u1", "t1", .95), 130: ("apt.u1", "t1", .8), 131: ("apt.u1", "t1", .8), 132: ("apt.u1", "t1", .95),
    133: ("apt.u1", "t1", .95), 134: ("gs.u4", "t2", .95), 135: ("gs.u4", "t7", .9), 136: ("gs.u4", "t5", .95),
    137: ("gs.u4", "t5", .85), 138: ("gs.u6", "t2", .95), 139: ("gs.u3", "t1", .6), 140: ("gs.u1", "t3", .95),
    141: ("gs.u3", "t1", .8), 142: ("gs.u3", "t5", .7), 143: ("gs.u2", "t1", .95), 144: ("gs.u2", "t1", .85),
    145: ("gs.u5", "t6", .9), 146: ("gs.u5", "t7", .5), 147: ("gs.u3", "t4", .8), 148: ("gs.u4", "t3", .6),
    149: ("gs.u6", "t2", .95), 150: ("gs.u6", "t3", .95), 151: ("gs.u6", "t2", .95), 152: ("gs.u5", "t4", .6),
    153: ("gs.u1", "t6", .4), 154: ("gs.u4", "t1", .7), 155: ("gs.u1", "t5", .8), 156: ("gs.u2", "t1", .95),
    157: ("gs.u1", "t3", .9), 158: ("gs.u2", "t1", .5), 159: ("gs.u1", "t2", .95), 160: ("gs.u1", "t1", .95),
    161: ("gs.u1", "t1", .95), 162: ("gs.u1", "t2", .7), 163: ("gs.u6", "t3", .95), 164: ("gs.u3", "t1", .7),
    165: ("gs.u6", "t3", .9), 166: ("gs.u6", "t3", .95), 167: ("gs.u6", "t3", .9), 168: ("gs.u3", "t1", .95),
    169: ("gs.u5", "t1", .85), 170: ("gs.u5", "t2", .95), 171: ("gs.u5", "t7", .6), 172: ("apt.u2", "t1", .95),
    173: ("apt.u2", "t1", .95), 174: ("apt.u2", "t1", .9), 175: ("apt.u1", "t1", .95), 176: ("apt.u1", "t1", .9),
    177: ("apt.u1", "t1", .95), 178: ("apt.u1", "t1", .95), 179: ("apt.u2", "t1", .95), 180: ("apt.u2", "t1", .9),
    181: ("apt.u1", "t1", .95), 182: ("apt.u1", "t1", .95), 183: ("apt.u1", "t1", .95), 184: ("gs.u4", "t2", .95),
    185: ("gs.u4", "t2", .8), 186: ("gs.u4", "t4", .95), 187: ("gs.u4", "t6", .7), 188: ("gs.u3", "t1", .9),
    189: ("gs.u3", "t4", .7), 190: ("gs.u3", "t4", .6), 191: ("gs.u2", "t1", .9), 192: ("gs.u6", "t1", .95),
    193: ("gs.u2", "t5", .6), 194: ("gs.u1", "t1", .95), 195: ("gs.u5", "t6", .7), 196: ("gs.u5", "t6", .9),
    197: ("gs.u5", "t7", .8), 198: ("gs.u4", "t2", .7), 199: ("gs.u6", "t2", .95), 200: ("gs.u6", "t2", .95),
}
assert sorted(T) == list(range(1, 201))

tags = []
for n, (u, t, c) in sorted(T.items()):
    unit, topic = f"ccse4.{u}", f"ccse4.{u}.{t}"
    assert topic in graph and graph[topic]["parentId"] == unit, topic
    assert (n <= 100) == u.startswith("ta."), f"Q{n}: Part A must be tagged to Tamil units, Part B to GS/aptitude"
    tags.append({"questionId": f"{PAPER}_q{n:03d}", "n": n, "topicId": topic, "unitId": unit, "tagConfidence": c,
                 "review": c < 0.8, "taggedBy": "claude", "taggedAt": TAGGED_AT})

(CONTENT / f"gold/tags/{PAPER}.json").write_text(json.dumps(tags, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

got = Counter(t["unitId"] for t in tags)
print(f"{'unit':14s} {'official':>8s} {PAPER[-4:]:>5s}  name")
for uid in sorted(k for k, v in graph.items() if v["level"] == "unit"):
    print(f"{uid:14s} {graph[uid]['questions'] or 0:>8d} {got[uid]:>5d}  {graph[uid]['nameEn']}")
review = [t["n"] for t in tags if t["review"]]
print(f"review queue (confidence < 0.8): {len(review)} -> {review}")
