"""Tag CCSE-IV 2024 (Parts A and B) to the Group 4 Syllabus Graph (D-12: AI tagging with confidence).

Tags were assigned by Claude from each question's text. Confidence < 0.8 = judgement call -> review queue.
Writes gold/tags/ccse4_2024.json; build_bundle.py applies it. Prints the distribution against the
official unit weights.

Note on Part A: the 2024 paper was set on the older Tamil syllabus (literary works, poets, prosody and
grammar analysis such as இலக்கணக் குறிப்பு). The Syllabus Graph follows the current syllabus, which has no
topic for prosody (எதுகை/மோனை/ஓசை) or for works such as epics and devotional poetry. Those questions go to
the nearest topic with low confidence (0.4-0.5) so they show up for review rather than pass silently.
Usage: python tag_ccse4_2024.py <content-repo>
"""
import json
import sys
from collections import Counter
from pathlib import Path

CONTENT = Path(sys.argv[1])
PAPER = "ccse4_2024"
TAGGED_AT = "2026-11-22"
graph = {n["id"]: n for n in json.loads((CONTENT / "gold/syllabus/ccse4.json").read_text())["nodes"]}

# question -> (unit, topic, confidence). Part A units are ta.u1..u7; Part B gs.u1..u6, apt.u1, apt.u2.
T = {
    1: ("ta.u1", "s_forms", .95), 2: ("ta.u3", "w_types", .7), 3: ("ta.u3", "m_other", .4), 4: ("ta.u2", "v_solporul", .9),
    5: ("ta.u5", "r_pazhamozhi", .95), 6: ("ta.u3", "m_other", .4), 7: ("ta.u5", "r_uvamai", .85), 8: ("ta.u3", "w_types", .7),
    9: ("ta.u3", "m_other", .5), 10: ("ta.u7", "l_tholmai", .4), 11: ("ta.u3", "w_order", .95), 12: ("ta.u3", "m_vinai", .85),
    13: ("ta.u2", "v_porunthaa", .9), 14: ("ta.u2", "v_ethir", .95), 15: ("ta.u1", "e_split", .95), 16: ("ta.u3", "m_other", .4),
    17: ("ta.u3", "w_types", .95), 18: ("ta.u3", "m_other", .5), 19: ("ta.u3", "m_other", .5), 20: ("ta.u7", "l_kural", .8),
    21: ("ta.u7", "l_kural", .85), 22: ("ta.u5", "r_uvamai", .7), 23: ("ta.u7", "l_arani", .9), 24: ("ta.u3", "m_other", .5),
    25: ("ta.u7", "l_thondu", .85), 26: ("ta.u7", "l_tholmai", .5), 27: ("ta.u7", "l_thondu", .8), 28: ("ta.u7", "l_tholmai", .4),
    29: ("ta.u7", "l_tholmai", .4), 30: ("ta.u7", "l_tholmai", .4), 31: ("ta.u7", "l_tholmai", .4), 32: ("ta.u7", "l_tholmai", .4),
    33: ("ta.u7", "l_tholmai", .5), 34: ("ta.u7", "l_sanror", .5), 35: ("ta.u7", "l_sanror", .5), 36: ("ta.u7", "l_sanror", .9),
    37: ("ta.u7", "l_sanror", .85), 38: ("ta.u7", "l_tholmai", .9), 39: ("ta.u7", "l_tamilpani", .4), 40: ("ta.u7", "l_sanror", .8),
    41: ("ta.u7", "l_tamilpani", .7), 42: ("ta.u1", "s_pizhai", .6), 43: ("ta.u7", "l_sanror", .6), 44: ("ta.u7", "l_sanror", .7),
    45: ("ta.u7", "l_sanror", .8), 46: ("ta.u4", "k_terms", .7), 47: ("ta.u7", "l_sanror", .8), 48: ("ta.u7", "l_sanror", .8),
    49: ("ta.u7", "l_sanror", .5), 50: ("ta.u4", "k_terms", .7), 51: ("ta.u7", "l_tamilpani", .9), 52: ("ta.u7", "l_sanror", .6),
    53: ("ta.u7", "l_tamilpani", .8), 54: ("ta.u7", "l_tholmai", .4), 55: ("ta.u5", "r_pazhamozhi", .95), 56: ("ta.u2", "v_akara", .95),
    57: ("ta.u3", "m_other", .5), 58: ("ta.u2", "v_porunthaa", .95), 59: ("ta.u3", "m_oli", .9), 60: ("ta.u2", "v_pizhai", .85),
    61: ("ta.u3", "w_thanvinai", .95), 62: ("ta.u3", "w_seyvinai", .9), 63: ("ta.u3", "w_types", .7), 64: ("ta.u2", "v_akara", .95),
    65: ("ta.u1", "s_forms", .95), 66: ("ta.u1", "s_root", .95), 67: ("ta.u1", "e_la", .85), 68: ("ta.u3", "w_orumai", .9),
    69: ("ta.u3", "m_other", .6), 70: ("ta.u3", "m_other", .4), 71: ("ta.u7", "l_tholmai", .4), 72: ("ta.u2", "v_oreluthu_porul", .95),
    73: ("ta.u6", "t_words", .95), 74: ("ta.u3", "m_other", .6), 75: ("ta.u7", "l_arani", .9), 76: ("ta.u2", "v_solporul", .8),
    77: ("ta.u7", "l_arani", .9), 78: ("ta.u2", "v_solporul", .7), 79: ("ta.u7", "l_tholmai", .4), 80: ("ta.u2", "v_solporul", .6),
    81: ("ta.u7", "l_tholmai", .4), 82: ("ta.u7", "l_tholmai", .4), 83: ("ta.u2", "v_solporul", .6), 84: ("ta.u7", "l_sanror", .8),
    85: ("ta.u7", "l_sanror", .5), 86: ("ta.u7", "l_tholmai", .4), 87: ("ta.u7", "l_tholmai", .4), 88: ("ta.u7", "l_tholmai", .4),
    89: ("ta.u7", "l_tholmai", .4), 90: ("ta.u7", "l_sanror", .9), 91: ("ta.u7", "l_kural", .7), 92: ("ta.u7", "l_sanror", .8),
    93: ("ta.u7", "l_sanror", .85), 94: ("ta.u7", "l_sanror", .85), 95: ("ta.u7", "l_tholmai", .4), 96: ("ta.u4", "k_terms", .6),
    97: ("ta.u7", "l_sanror", .85), 98: ("ta.u4", "k_terms", .5), 99: ("ta.u7", "l_sanror", .9), 100: ("ta.u7", "l_tamilpani", .7),
    101: ("gs.u1", "t2", .9), 102: ("gs.u1", "t3", .9), 103: ("gs.u1", "t1", .85), 104: ("gs.u4", "t3", .8),
    105: ("gs.u3", "t4", .3), 106: ("gs.u5", "t6", .85), 107: ("gs.u3", "t2", .6), 108: ("gs.u3", "t4", .8),
    109: ("gs.u5", "t4", .7), 110: ("gs.u2", "t1", .9), 111: ("gs.u3", "t1", .9), 112: ("gs.u3", "t1", .85),
    113: ("gs.u4", "t5", .9), 114: ("gs.u6", "t1", .6), 115: ("gs.u4", "t6", .8), 116: ("gs.u4", "t3", .8),
    117: ("gs.u4", "t3", .7), 118: ("gs.u5", "t4", .8), 119: ("gs.u5", "t3", .6), 120: ("gs.u5", "t6", .6),
    121: ("gs.u6", "t3", .9), 122: ("gs.u3", "t3", .85), 123: ("gs.u3", "t3", .7), 124: ("gs.u6", "t4", .9),
    125: ("gs.u6", "t2", .95), 126: ("apt.u1", "t1", .95), 127: ("gs.u6", "t1", .8), 128: ("gs.u6", "t4", .9),
    129: ("gs.u6", "t2", .95), 130: ("gs.u6", "t2", .95), 131: ("gs.u5", "t6", .85), 132: ("gs.u5", "t6", .8),
    133: ("gs.u5", "t3", .8), 134: ("gs.u5", "t6", .85), 135: ("gs.u5", "t5", .75), 136: ("apt.u1", "t1", .95),
    137: ("apt.u2", "t1", .9), 138: ("apt.u1", "t1", .95), 139: ("apt.u1", "t1", .95), 140: ("apt.u1", "t1", .9),
    141: ("apt.u1", "t1", .95), 142: ("apt.u1", "t1", .9), 143: ("apt.u1", "t1", .95), 144: ("apt.u1", "t1", .95),
    145: ("apt.u1", "t1", .95), 146: ("apt.u2", "t1", .9), 147: ("apt.u1", "t1", .95), 148: ("gs.u1", "t3", .95),
    149: ("gs.u1", "t3", .9), 150: ("gs.u1", "t1", .9), 151: ("gs.u1", "t3", .85), 152: ("gs.u1", "t2", .95),
    153: ("gs.u1", "t5", .7), 154: ("gs.u2", "t1", .7), 155: ("gs.u4", "t8", .6), 156: ("gs.u1", "t4", .8),
    157: ("gs.u1", "t5", .7), 158: ("gs.u3", "t1", .9), 159: ("gs.u3", "t2", .85), 160: ("gs.u3", "t1", .9),
    161: ("gs.u3", "t1", .9), 162: ("gs.u4", "t2", .95), 163: ("gs.u4", "t3", .9), 164: ("gs.u4", "t4", .95),
    165: ("gs.u4", "t8", .5), 166: ("gs.u4", "t1", .9), 167: ("gs.u5", "t4", .7), 168: ("gs.u5", "t9", .6),
    169: ("gs.u4", "t4", .8), 170: ("gs.u5", "t1", .95), 171: ("gs.u6", "t4", .95), 172: ("gs.u3", "t2", .85),
    173: ("gs.u3", "t2", .9), 174: ("gs.u6", "t3", .95), 175: ("gs.u6", "t4", .85), 176: ("apt.u1", "t1", .95),
    177: ("gs.u3", "t1", .9), 178: ("gs.u6", "t3", .9), 179: ("gs.u6", "t1", .9), 180: ("gs.u6", "t2", .95),
    181: ("gs.u6", "t2", .95), 182: ("gs.u2", "t5", .6), 183: ("gs.u5", "t4", .8), 184: ("gs.u5", "t6", .9),
    185: ("gs.u5", "t10", .7), 186: ("gs.u5", "t8", .9), 187: ("gs.u6", "t3", .8), 188: ("apt.u1", "t1", .95),
    189: ("apt.u1", "t1", .95), 190: ("apt.u1", "t1", .95), 191: ("apt.u2", "t1", .9), 192: ("apt.u2", "t1", .9),
    193: ("apt.u2", "t1", .95), 194: ("apt.u1", "t1", .95), 195: ("apt.u1", "t1", .95), 196: ("apt.u1", "t1", .95),
    197: ("apt.u1", "t1", .95), 198: ("apt.u1", "t1", .95), 199: ("apt.u1", "t1", .95), 200: ("apt.u2", "t1", .9),
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
print(f"{'unit':14s} {'official':>8s} {'2024':>5s}  name")
for uid in sorted(k for k, v in graph.items() if v["level"] == "unit"):
    print(f"{uid:14s} {graph[uid]['questions'] or 0:>8d} {got[uid]:>5d}  {graph[uid]['nameEn']}")
review = [t["n"] for t in tags if t["review"]]
print(f"review queue (confidence < 0.8): {len(review)} -> {review}")
