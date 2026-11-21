"""Tag CCSE-IV 2025 Part A (Tamil) questions to the Group 4 Syllabus Graph (D-12: AI tagging with confidence).

Tags were assigned by Claude from each question's text. Confidence < 0.8 = judgement call -> review queue.
Writes gold/tags/ccse4_2025_part_a.json and prints the distribution against the official unit weights.
"""
import json
from collections import Counter
from pathlib import Path

CONTENT = Path("/home/claude/tnpsc-content")
graph = {n["id"]: n for n in json.loads((CONTENT / "gold/syllabus/ccse4.json").read_text())["nodes"]}

# question -> (unit, topic key, confidence)
T = {
    1: ("u1", "e_la", .85), 2: ("u1", "s_forms", .9), 3: ("u2", "v_ethir", .7), 4: ("u1", "s_forms", .95),
    5: ("u1", "s_forms", .95), 6: ("u1", "s_forms", .95), 7: ("u1", "e_suttu", .95), 8: ("u1", "e_suttu", .9),
    9: ("u1", "e_ina", .85), 10: ("u1", "e_kuril", .95), 11: ("u1", "e_sandhi", .7), 12: ("u1", "e_sandhi", .95),
    13: ("u2", "v_akara", .95), 14: ("u2", "v_pizhai", .9), 15: ("u2", "v_maroo", .95), 16: ("u2", "v_iruporul", .95),
    17: ("u2", "v_orupporul", .95), 18: ("u2", "v_porunthaa", .95), 19: ("u2", "v_oreluthu", .95), 20: ("u2", "v_ethir", .9),
    21: ("u3", "w_punct", .95), 22: ("u3", "m_vinai", .8), 23: ("u3", "m_oli", .95), 24: ("u3", "m_kaalam", .9),
    25: ("u3", "m_paal", .9), 26: ("u3", "w_thanvinai", .95), 27: ("u3", "w_seyvinai", .95), 28: ("u4", "k_terms", .9),
    29: ("u4", "k_terms", .95), 30: ("u4", "k_terms", .95), 31: ("u4", "k_terms", .9), 32: ("u4", "k_terms", .95),
    33: ("u4", "k_terms", .95), 34: ("u5", "r_pazhamozhi", .95), 35: ("u5", "r_pazhamozhi", .85), 36: ("u5", "r_marabu", .95),
    37: ("u3", "m_oli", .7), 38: ("u5", "r_uvamai", .95), 39: ("u5", "r_uvamai", .85), 40: ("u6", "t_docs", .9),
    41: ("u6", "t_words", .85), 42: ("u1", "s_ayal", .7), 43: ("u7", "l_sanror", .85), 44: ("u2", "v_solporul", .9),
    45: ("u7", "l_thondu", .85), 46: ("u7", "l_tholmai", .8), 47: ("u7", "l_arani", .95), 48: ("u7", "l_arani", .95),
    49: ("u7", "l_kural", .9), 50: ("u7", "l_kural", .9), 51: ("u7", "l_kural", .9), 52: ("u1", "s_diff", .85),
    53: ("u1", "e_sandhi", .8), 54: ("u1", "s_tamil", .95), 55: ("u1", "s_ayal", .85), 56: ("u1", "s_forms", .95),
    57: ("u1", "s_root", .95), 58: ("u1", "e_na", .8), 59: ("u1", "e_vina", .95), 60: ("u1", "e_ina", .95),
    61: ("u2", "v_solporul", .85), 62: ("u1", "e_na", .85), 63: ("u1", "e_join", .95), 64: ("u1", "e_split", .95),
    65: ("u2", "v_inai", .7), 66: ("u2", "v_oreluthu_porul", .9), 67: ("u2", "v_solporul", .8), 68: ("u2", "v_inai", .9),
    69: ("u1", "e_la", .85), 70: ("u2", "v_palasol", .9), 71: ("u1", "e_la", .8), 72: ("u3", "w_punct", .95),
    73: ("u3", "w_punct", .95), 74: ("u3", "m_ilamai", .95), 75: ("u3", "m_other", .6), 76: ("u3", "m_thinai", .9),
    77: ("u3", "w_orumai", .95), 78: ("u3", "w_types", .75), 79: ("u3", "w_order", .95), 80: ("u4", "k_terms", .9),
    81: ("u4", "k_terms", .95), 82: ("u4", "k_terms", .95), 83: ("u4", "k_terms", .95), 84: ("u5", "r_news", .85),
    85: ("u5", "r_document", .8), 86: ("u5", "r_pazhamozhi", .95), 87: ("u5", "r_marabu", .95), 88: ("u5", "r_marabu", .95),
    89: ("u5", "r_uvamai", .95), 90: ("u5", "r_passage", .95), 91: ("u5", "r_passage", .95), 92: ("u5", "r_passage", .95),
    93: ("u6", "t_docs", .7), 94: ("u4", "k_terms", .85), 95: ("u7", "l_sanror", .85), 96: ("u7", "l_sanror", .9),
    97: ("u7", "l_tamilpani", .95), 98: ("u7", "l_tholmai", .9), 99: ("u7", "l_arani", .95), 100: ("u7", "l_kural", .9),
}
assert sorted(T) == list(range(1, 101))
tags = []
for n, (u, t, c) in T.items():
    tid = f"ccse4.ta.{u}.{t}"
    assert tid in graph, tid
    tags.append({"questionId": f"ccse4_2025_a{n:03d}", "n": n, "topicId": tid, "unitId": f"ccse4.ta.{u}",
                 "tagConfidence": c, "review": c < 0.8, "taggedBy": "claude", "taggedAt": "2026-11-22"})
out = CONTENT / "gold/tags/ccse4_2025_part_a.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(tags, ensure_ascii=False, indent=1), encoding="utf-8")

got = Counter(t["unitId"] for t in tags)
print(f"{'unit':16s} {'official':>8s} {'2025 paper':>10s}  name")
for uid in sorted(k for k, v in graph.items() if v["parentId"] == "ccse4.ta"):
    print(f"{uid:16s} {graph[uid]['questions']:>8d} {got[uid]:>10d}  {graph[uid]['nameEn']}")
print("review queue (confidence < 0.8):", [t["n"] for t in tags if t["review"]])
top = Counter(t["topicId"].split(".")[-1] for t in tags).most_common(6)
print("most-asked topics:", top)
