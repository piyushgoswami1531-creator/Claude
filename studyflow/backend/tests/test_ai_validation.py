import pytest
from pydantic import ValidationError

from app.services.ai.client import extract_json
from app.services.ai.mock import generate_quiz, generate_review, parse_syllabus
from app.services.ai.schemas import ParsedSyllabus, QuizOut, ReviewOut

from .conftest import SYLLABUS


def q(difficulty, i, options=None, correct=0):
    return {"difficulty": difficulty, "question": f"Question number {i} about joins?",
            "options": options or [f"a{i}", f"b{i}", f"c{i}", f"d{i}"], "correct_index": correct,
            "explanation": "Because that is how it works."}


def good_quiz():
    return {"questions": [q("easy", i) for i in range(4)] + [q("medium", i) for i in range(4, 8)]
            + [q("hard", i) for i in range(8, 10)]}


def test_valid_quiz_passes():
    assert len(QuizOut.model_validate(good_quiz()).questions) == 10


def test_quiz_rejects_wrong_mix():
    data = good_quiz()
    data["questions"][9]["difficulty"] = "easy"
    with pytest.raises(ValidationError, match="4 easy / 4 medium / 2 hard"):
        QuizOut.model_validate(data)


@pytest.mark.parametrize("patch", [
    {"options": ["a", "b", "c"]},
    {"options": ["a", "a", "b", "c"]},
    {"correct_index": 4},
    {"explanation": ""},
])
def test_quiz_rejects_bad_question(patch):
    data = good_quiz()
    data["questions"][0].update(patch)
    with pytest.raises(ValidationError):
        QuizOut.model_validate(data)


def test_quiz_rejects_nine_questions():
    data = good_quiz()
    data["questions"].pop()
    with pytest.raises(ValidationError):
        QuizOut.model_validate(data)


def test_syllabus_clamps_numbers_and_drops_empty_units():
    s = ParsedSyllabus.model_validate({"subjects": [{"name": " DBMS ", "units": [
        {"name": "U1", "topics": [{"name": "Joins", "difficulty": 9, "est_minutes": 5000}]},
        {"name": "Empty", "topics": []},
    ]}]})
    t = s.subjects[0].units[0].topics[0]
    assert (t.difficulty, t.est_minutes) == (5, 300)
    assert len(s.subjects[0].units) == 1 and s.subjects[0].name == "DBMS"


def test_review_needs_exactly_three_actions():
    with pytest.raises(ValidationError):
        ReviewOut.model_validate({"verdict": "Bad week overall.", "findings": ["one finding", "two finding"],
                                  "actions": ["do this thing", "do that thing"]})


def test_extract_json_handles_fences_and_prose():
    assert extract_json('Here you go:\n```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Sure! {"a": {"b": 2}} hope that helps') == {"a": {"b": 2}}
    with pytest.raises(ValueError):
        extract_json("no json here")


def test_mock_parser_reads_units_and_topics():
    s = parse_syllabus(SYLLABUS)
    assert [x.name for x in s.subjects] == ["DBMS", "Operating Systems"]
    dbms = s.subjects[0]
    assert len(dbms.units) == 3
    assert [t.name for t in dbms.units[1].topics] == ["1NF", "2NF", "3NF", "BCNF"]


def test_mock_parser_does_not_treat_words_as_units():
    s = parse_syllabus("Calculus\n- Partial derivatives\n- Limits")
    assert [t.name for t in s.subjects[0].units[0].topics] == ["Partial derivatives", "Limits"]


def test_mock_quiz_is_valid():
    assert len(generate_quiz("DBMS", "Unit 3", "Joins").questions) == 10


def test_mock_review_has_three_actions():
    stats = {"week": {"sessions_planned": 5, "sessions_done": 2}, "subjects": [
        {"name": "DBMS", "planned": 5, "done": 2, "missed": 3}],
        "weak_topics": [{"subject": "DBMS", "topic": "Joins", "accuracy": 40}],
        "overall": {"streak": 0, "required_daily_minutes": None, "daily_minutes": 120, "completion_pct": 20,
                    "days_left": 20}}
    r = generate_review(stats)
    assert len(r.actions) == 3
    assert "3 of 5 DBMS" in " ".join(r.findings)
    assert "40% on Joins" in " ".join(r.findings)


def test_mock_review_calls_out_attendance_without_learning():
    stats = {"week": {"sessions_planned": 4, "sessions_done": 4}, "subjects": [
        {"name": "DBMS", "planned": 4, "done": 4, "missed": 0}],
        "weak_topics": [{"subject": "DBMS", "topic": "Joins", "accuracy": 30}],
        "overall": {"streak": 3, "required_daily_minutes": None, "daily_minutes": 120, "completion_pct": 40,
                    "days_left": 10}}
    r = generate_review(stats)
    assert "showed up" in r.verdict and "Average" not in r.verdict
