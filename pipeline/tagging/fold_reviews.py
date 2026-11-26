"""Fold AK's in-app tag reviews into the content repo, so they survive a rebuilt bundle.

The app records each review as a TagReviewed event ("tagReview": confirm / change / nofit, with the
question's topic after the review) and syncs it to tnpsc-data/events/*.jsonl like answers. This script
reads those files, keeps the latest review per question (by time, then eventId, as the app orders its
log), and writes gold/tags/reviews.json. build_bundle.py merge applies that file: a changed topic moves
the question, and every reviewed question carries tagReviewed so the app stops asking.

Usage: python fold_reviews.py <content-repo> <tnpsc-data checkout>
Reads events only; writes one file. This script holds no content itself.
"""
import json
import sys
from pathlib import Path

VERDICTS = {"confirm", "change", "nofit"}


def latest_reviews(lines):
    """tagReview events from JSONL lines -> {questionId: review}, latest (at, eventId) wins; bad lines skipped."""
    best = {}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(e, dict) or e.get("type") != "tagReview" or e.get("verdict") not in VERDICTS:
            continue
        if not all(isinstance(e.get(k), str) and e[k] for k in ("questionId", "topicId", "at", "eventId")):
            continue
        key = (e["at"], e["eventId"])
        cur = best.get(e["questionId"])
        if cur is None or key > (cur["at"], cur["eventId"]):
            best[e["questionId"]] = e
    return {q: {"questionId": q, "verdict": e["verdict"], "topicId": e["topicId"], "at": e["at"], "eventId": e["eventId"]}
            for q, e in best.items()}


def main(content: Path, data: Path) -> None:
    lines = []
    for f in sorted((data / "events").glob("*.jsonl")):
        lines += f.read_text(encoding="utf-8").splitlines()
    reviews = latest_reviews(lines)
    out = content / "gold/tags/reviews.json"
    out.write_text(json.dumps(sorted(reviews.values(), key=lambda r: r["questionId"]), ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8")
    counts = {v: sum(r["verdict"] == v for r in reviews.values()) for v in sorted(VERDICTS)}
    print(f"{len(reviews)} reviewed tags {counts} -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
