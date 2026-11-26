"""python -m pytest pipeline/tagging/test_fold_reviews.py (or run directly)."""
import json
from fold_reviews import latest_reviews


def ev(eid, q, verdict, topic, at):
    return json.dumps({"type": "tagReview", "eventId": eid, "deviceId": "phone", "at": at, "schemaVersion": 1,
                       "sessionId": "tags", "questionId": q, "verdict": verdict, "topicId": topic})


def test_latest_review_wins_and_junk_is_skipped():
    lines = [
        ev("a", "q1", "change", "t.x", "2026-11-27T10:00:00.000Z"),
        ev("b", "q1", "confirm", "t.y", "2026-11-27T11:00:00.000Z"),
        ev("c", "q2", "nofit", "t.z", "2026-11-27T10:00:00.000Z"),
        ev("d", "q3", "maybe", "t.z", "2026-11-27T10:00:00.000Z"),
        json.dumps({"type": "answer", "eventId": "e", "questionId": "q4"}),
        "not json", "",
    ]
    got = latest_reviews(lines)
    assert sorted(got) == ["q1", "q2"]
    assert got["q1"]["verdict"] == "confirm" and got["q1"]["topicId"] == "t.y"
    assert got["q2"]["verdict"] == "nofit"


if __name__ == "__main__":
    test_latest_review_wins_and_junk_is_skipped()
    print("ok")
