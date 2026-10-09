from collections import defaultdict
from datetime import date, timedelta

from app.services.scheduler import (
    SeedRevision,
    TopicIn,
    build_schedule,
    interleave,
    split_days,
    weighted_minutes,
)

START = date(2026, 10, 1)


def topics(n_per_subject=4, subjects=(("A", "weak"), ("B", "neutral"), ("C", "strong")), minutes=60):
    out, order, tid = [], 0, 1
    for si, (_, strength) in enumerate(subjects):
        for _ in range(n_per_subject):
            out.append(TopicIn(id=tid, subject_id=si + 1, strength=strength, minutes=minutes, order=order))
            tid += 1
            order += 1
    return out


def per_day(items):
    d = defaultdict(int)
    for i in items:
        if i.kind != "buffer":
            d[i.date] += i.minutes
    return d


def test_weighting_by_difficulty_and_strength():
    assert weighted_minutes(60, 3, "neutral") == 60
    assert weighted_minutes(60, 5, "weak") > weighted_minutes(60, 3, "neutral") > weighted_minutes(60, 1, "strong")


def test_split_days_has_final_and_buffer_days():
    study, buffers, final = split_days(START, START + timedelta(days=30))
    assert len(study) + len(buffers) + len(final) == 30
    assert len(final) == 3  # 10% of 30
    assert len(buffers) == 3  # every 7th of the remaining 27
    assert max(study + buffers) < min(final)


def test_short_runway_has_no_buffers():
    study, buffers, final = split_days(START, START + timedelta(days=2))
    assert buffers == [] and final == [] and len(study) == 2


def test_interleave_puts_weak_subject_first_and_alternates():
    order = [t.subject_id for t in interleave(topics(2))]
    assert order == [1, 2, 3, 1, 2, 3]


def test_all_topics_learned_and_capacity_respected():
    ts = topics()
    r = build_schedule(ts, START, START + timedelta(days=30), 120)
    assert not r.overloaded
    learned = defaultdict(int)
    for i in r.items:
        if i.kind == "learn":
            learned[i.topic_id] += i.minutes
    assert learned == {t.id: 60 for t in ts}
    assert all(m <= 120 for m in per_day(r.items).values())
    assert all(i.date < START + timedelta(days=30) for i in r.items)


def test_spaced_revisions_follow_learning():
    ts = topics(1, subjects=(("A", "neutral"),))
    r = build_schedule(ts, START, START + timedelta(days=20), 120)
    learn_day = next(i.date for i in r.items if i.kind == "learn")
    revs = sorted((i.date - learn_day).days for i in r.items if i.kind == "revise")
    assert [i.rev_interval for i in r.items if i.kind == "revise"] == [1, 3, 7]
    assert revs[0] >= 1 and revs[1] >= 3 and revs[2] >= 7


def test_no_learning_on_buffer_or_final_days():
    r = build_schedule(topics(), START, START + timedelta(days=30), 90)
    study, buffers, final = split_days(START, START + timedelta(days=30))
    learn_days = {i.date for i in r.items if i.kind == "learn"}
    assert not learn_days & set(buffers) and not learn_days & set(final)
    assert {i.date for i in r.items if i.kind == "final_revision"} == set(final)


def test_overload_is_detected_and_squeezed():
    r = build_schedule(topics(10, minutes=120), START, START + timedelta(days=10), 60)
    assert r.overloaded
    assert r.required_daily_minutes and r.required_daily_minutes > 60
    learned_topics = {i.topic_id for i in r.items if i.kind == "learn"}
    assert len(learned_topics) == 30  # every topic still gets scheduled


def test_used_today_reduces_first_day_capacity():
    r = build_schedule(topics(), START, START + timedelta(days=30), 120, used_today=100)
    assert per_day(r.items)[START] <= 20


def test_seed_revisions_are_placed():
    seeds = [SeedRevision(due=START - timedelta(days=2), topic_id=99, minutes=15, interval=3)]
    r = build_schedule([], START, START + timedelta(days=10), 60, seed_revisions=seeds)
    revs = [i for i in r.items if i.kind == "revise"]
    assert len(revs) == 1 and revs[0].date == START and revs[0].topic_id == 99


def test_exam_today_or_past_returns_nothing():
    r = build_schedule(topics(), START, START, 60)
    assert r.items == [] and r.overloaded
