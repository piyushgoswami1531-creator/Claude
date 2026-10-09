from datetime import timedelta

from .conftest import SYLLABUS


def make_plan(client, clock, days=30, hours=2):
    parsed = client.post("/api/syllabus/parse", json={"text": SYLLABUS}).json()
    assert parsed["source"] == "demo"
    for s in parsed["subjects"]:
        s["strength"] = "weak" if s["name"] == "DBMS" else "neutral"
    r = client.post("/api/plans", json={
        "exam_date": (clock.today + timedelta(days=days)).isoformat(), "daily_hours": hours,
        "subjects": parsed["subjects"],
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_health(client):
    assert client.get("/api/health").json()["ai_mode"] == "demo"


def test_no_plan_is_404(client):
    assert client.get("/api/schedule/today").status_code == 404


def test_exam_date_must_be_future(client, clock):
    r = client.post("/api/plans", json={"exam_date": clock.today.isoformat(), "daily_hours": 2,
                                        "subjects": [{"name": "X", "units": [{"name": "U", "topics": [{"name": "T"}]}]}]})
    assert r.status_code == 422


def test_create_plan_and_today(client, clock):
    plan = make_plan(client, clock)
    assert plan["version"] == 1
    today = client.get("/api/schedule/today").json()
    assert today["items"], "today should have sessions"
    assert sum(i["minutes"] for i in today["items"]) <= 120
    # weak subject (DBMS) leads
    assert today["items"][0]["subject"] == "DBMS"


def test_missed_day_triggers_replan(client, clock):
    make_plan(client, clock)
    day1 = client.get("/api/schedule/today").json()["items"]
    clock.today += timedelta(days=1)  # student never opened the app yesterday
    r = client.get("/api/schedule/today").json()
    assert r["replanned"]["missed"] == len(day1)
    assert r["replanned"]["version"] == 2
    # the missed topics come back onto the calendar
    missed_topics = {i["topic_id"] for i in day1 if i["kind"] == "learn"}
    future = client.get("/api/schedule", params={"from": clock.today.isoformat(),
                                                  "to": (clock.today + timedelta(days=28)).isoformat()}).json()
    replanned = {i["topic_id"] for i in future["items"] if i["kind"] == "learn"}
    assert missed_topics <= replanned
    # idempotent: a second load does not re-plan again
    assert client.get("/api/schedule/today").json()["replanned"] is None


def test_completing_last_chunk_finishes_topic_and_quiz_flow(client, clock):
    make_plan(client, clock)
    items = client.get("/api/schedule/today").json()["items"]
    learn = next(i for i in items if i["kind"] == "learn")
    r = client.patch(f"/api/schedule/{learn['id']}", json={"status": "done"}).json()
    assert r["item"]["status"] == "done"
    if not r["topic_completed"]:
        client.post(f"/api/topics/{learn['topic_id']}/complete")

    quiz = client.post("/api/quizzes", json={"topic_id": learn["topic_id"]}).json()
    assert len(quiz["questions"]) == 10
    assert "correct_index" not in quiz["questions"][0]  # answers hidden before submit
    # refresh returns the same open quiz instead of generating a new one
    assert client.post("/api/quizzes", json={"topic_id": learn["topic_id"]}).json()["id"] == quiz["id"]

    result = client.post(f"/api/quizzes/{quiz['id']}/submit", json={"answers": [0] * 10}).json()
    assert result["submitted"] and 0 <= result["score"] <= 10
    assert "explanation" in result["questions"][0]
    assert client.post(f"/api/quizzes/{quiz['id']}/submit", json={"answers": [0] * 10}).status_code == 409


def test_cannot_complete_future_session(client, clock):
    make_plan(client, clock)
    future = client.get("/api/schedule", params={"from": (clock.today + timedelta(days=2)).isoformat(),
                                                  "to": (clock.today + timedelta(days=2)).isoformat()}).json()
    item = future["items"][0]
    assert client.patch(f"/api/schedule/{item['id']}", json={"status": "done"}).status_code == 422


def test_finish_topic_early_replans(client, clock):
    plan = make_plan(client, clock)
    topic = plan["subjects"][1]["units"][1]["topics"][0]  # something not scheduled today
    r = client.post(f"/api/topics/{topic['id']}/complete").json()
    assert r["version"] == 2
    future = client.get("/api/schedule", params={"from": clock.today.isoformat(),
                                                  "to": (clock.today + timedelta(days=29)).isoformat()}).json()
    kinds = {i["kind"] for i in future["items"] if i["topic_id"] == topic["id"]}
    assert "learn" not in kinds and "revise" in kinds


def test_stats_and_review(client, clock):
    make_plan(client, clock)
    items = client.get("/api/schedule/today").json()["items"]
    client.patch(f"/api/schedule/{items[0]['id']}", json={"status": "done"})
    clock.today += timedelta(days=2)
    s = client.get("/api/stats").json()
    assert s["overall"]["sessions_missed_total"] > 0
    assert len(s["planned_vs_actual"]) == 14
    assert s["overall"]["streak"] == 0
    assert {x["name"] for x in s["subjects"]} == {"DBMS", "Operating Systems"}

    review = client.post("/api/reviews").json()
    assert len(review["actions"]) == 3
    assert review["verdict"]
    assert client.get("/api/reviews").json()[0]["id"] == review["id"]


def test_pdf_upload_rejects_garbage(client):
    r = client.post("/api/syllabus/parse-pdf", files={"file": ("s.pdf", b"not a pdf", "application/pdf")})
    assert r.status_code == 422
