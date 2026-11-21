"""Copy topic names from the Syllabus Graph into a content bundle (bundle.topics).

Usage: python add_topics.py <syllabus.json> <bundle.json> <new-version>
Deterministic: same inputs give a byte-identical bundle (AT-P1). Runs on the private content repo;
this script holds no content itself.
"""
import json
import sys


def main(syllabus_path: str, bundle_path: str, version: str) -> None:
    syllabus = json.load(open(syllabus_path, encoding="utf-8"))
    bundle = json.load(open(bundle_path, encoding="utf-8"))
    used = {q["topicId"] for q in bundle["questions"] if q.get("topicId")}
    topics = [
        {"id": n["id"], "unitId": n["parentId"], "nameEn": n["nameEn"], "nameTa": n.get("nameTa")}
        for n in syllabus["nodes"]
        if n["level"] == "topic"
    ]
    missing = sorted(used - {t["id"] for t in topics})
    if missing:
        sys.exit(f"Questions tagged with topics not in the syllabus graph: {missing}")
    bundle["topics"] = sorted(topics, key=lambda t: t["id"])
    bundle["version"] = version
    with open(bundle_path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False)  # same compact form as the bundle builder
    print(f"{len(topics)} topics written; {len(used)} used by questions; version {version}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
