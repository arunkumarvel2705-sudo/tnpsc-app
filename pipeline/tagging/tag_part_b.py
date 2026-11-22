"""Tag CCSE-IV 2025 Part B (General Studies + Aptitude) to the Group 4 Syllabus Graph (D-12).

Tags were assigned by Claude from each question's text. Confidence < 0.8 = judgement call -> review queue.
Writes gold/tags/ccse4_2025_part_b.json, applies topicId/unitId to the bundle's Part B questions, and
prints the distribution against the official unit weights.
Usage: python tag_part_b.py <content-repo> <new-bundle-version>
"""
import json
import sys
from collections import Counter
from pathlib import Path

CONTENT = Path(sys.argv[1])
VERSION = sys.argv[2]
graph = {n["id"]: n for n in json.loads((CONTENT / "gold/syllabus/ccse4.json").read_text())["nodes"]}

# question -> (unit, topic, confidence). Units: gs.u1..u6, apt.u1 (aptitude), apt.u2 (reasoning).
T = {
    101: ("gs.u5", "t8", .85), 102: ("gs.u5", "t3", .7), 103: ("gs.u5", "t6", .9), 104: ("gs.u6", "t4", .65),
    105: ("gs.u4", "t6", .6), 106: ("gs.u5", "t8", .8), 107: ("gs.u5", "t3", .7), 108: ("gs.u5", "t2", .95),
    109: ("gs.u5", "t2", .65), 110: ("gs.u5", "t1", .95), 111: ("gs.u6", "t2", .95), 112: ("gs.u6", "t2", .95),
    113: ("gs.u6", "t2", .9), 114: ("gs.u6", "t2", .9), 115: ("gs.u6", "t3", .8), 116: ("gs.u3", "t2", .8),
    117: ("gs.u6", "t4", .9), 118: ("gs.u6", "t3", .9), 119: ("gs.u6", "t3", .8), 120: ("gs.u6", "t1", .75),
    121: ("gs.u6", "t1", .95), 122: ("gs.u1", "t3", .9), 123: ("gs.u1", "t3", .95), 124: ("gs.u1", "t2", .95),
    125: ("gs.u1", "t5", .85), 126: ("gs.u2", "t2", .95), 127: ("gs.u4", "t1", .8), 128: ("gs.u3", "t1", .8),
    129: ("gs.u3", "t4", .75), 130: ("gs.u3", "t2", .9), 131: ("gs.u3", "t2", .9), 132: ("gs.u3", "t1", .95),
    133: ("gs.u4", "t5", .85), 134: ("gs.u4", "t6", .7), 135: ("gs.u4", "t5", .95), 136: ("gs.u4", "t4", .9),
    137: ("gs.u4", "t3", .6), 138: ("gs.u4", "t8", .5), 139: ("gs.u4", "t1", .85), 140: ("apt.u1", "t1", .95),
    141: ("apt.u1", "t1", .95), 142: ("apt.u1", "t1", .95), 143: ("apt.u1", "t1", .95), 144: ("apt.u1", "t1", .95),
    145: ("apt.u1", "t1", .95), 146: ("apt.u1", "t1", .95), 147: ("apt.u1", "t1", .95), 148: ("apt.u1", "t1", .8),
    149: ("apt.u2", "t1", .9), 150: ("apt.u2", "t1", .9), 151: ("apt.u2", "t1", .95), 152: ("apt.u2", "t1", .9),
    153: ("gs.u1", "t5", .8), 154: ("gs.u5", "t3", .7), 155: ("gs.u5", "t9", .65), 156: ("gs.u5", "t6", .9),
    157: ("gs.u5", "t5", .9), 158: ("gs.u5", "t3", .8), 159: ("gs.u5", "t4", .85), 160: ("gs.u5", "t4", .85),
    161: ("gs.u5", "t4", .6), 162: ("gs.u5", "t1", .9), 163: ("gs.u6", "t2", .95), 164: ("gs.u6", "t2", .95),
    165: ("gs.u6", "t4", .75), 166: ("gs.u6", "t4", .85), 167: ("gs.u6", "t4", .9), 168: ("gs.u6", "t4", .9),
    169: ("gs.u6", "t3", .9), 170: ("gs.u6", "t1", .7), 171: ("gs.u6", "t1", .95), 172: ("gs.u1", "t3", .9),
    173: ("gs.u1", "t1", .8), 174: ("gs.u5", "t8", .9), 175: ("gs.u2", "t3", .9), 176: ("gs.u2", "t1", .7),
    177: ("gs.u3", "t1", .85), 178: ("gs.u6", "t3", .9), 179: ("gs.u3", "t2", .95), 180: ("gs.u6", "t3", .7),
    181: ("gs.u3", "t2", .9), 182: ("gs.u4", "t8", .6), 183: ("gs.u4", "t6", .9), 184: ("gs.u4", "t5", .9),
    185: ("gs.u4", "t3", .8), 186: ("gs.u4", "t2", .95), 187: ("gs.u4", "t4", .75), 188: ("gs.u4", "t1", .9),
    189: ("apt.u1", "t1", .85), 190: ("apt.u1", "t1", .95), 191: ("apt.u1", "t1", .95), 192: ("apt.u1", "t1", .95),
    193: ("apt.u1", "t1", .9), 194: ("apt.u1", "t1", .95), 195: ("apt.u1", "t1", .95), 196: ("apt.u2", "t1", .95),
    197: ("apt.u2", "t1", .95), 198: ("apt.u2", "t1", .8), 199: ("apt.u2", "t1", .95), 200: ("apt.u1", "t1", .7),
}
assert sorted(T) == list(range(101, 201))

bundle_path = CONTENT / "gold/bundles/ccse4_2025.json"
bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
by_n = {q["n"]: q for q in bundle["questions"] if q["section"] == "gs_apt"}
assert sorted(by_n) == list(range(101, 201)), "bundle Part B numbering changed"

tags = []
for n, (u, t, c) in T.items():
    unit, topic = f"ccse4.{u}", f"ccse4.{u}.{t}"
    assert topic in graph and graph[topic]["parentId"] == unit, topic
    q = by_n[n]
    q["unitId"], q["topicId"] = unit, topic
    tags.append({"questionId": q["id"], "n": n, "topicId": topic, "unitId": unit, "tagConfidence": c,
                 "review": c < 0.8, "taggedBy": "claude", "taggedAt": "2026-11-22"})

(CONTENT / "gold/tags/ccse4_2025_part_b.json").write_text(json.dumps(tags, ensure_ascii=False, indent=1), encoding="utf-8")
bundle["version"] = VERSION
bundle_path.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")

got = Counter(t["unitId"] for t in tags)
print(f"{'unit':14s} {'official':>8s} {'2025':>5s}  name")
for uid in sorted(k for k, v in graph.items() if v["level"] == "unit" and (k.startswith("ccse4.gs") or k.startswith("ccse4.apt"))):
    print(f"{uid:14s} {graph[uid]['questions']:>8d} {got[uid]:>5d}  {graph[uid]['nameEn']}")
print("review queue (confidence < 0.8):", [t["n"] for t in tags if t["review"]])
print("bundle version", VERSION)
