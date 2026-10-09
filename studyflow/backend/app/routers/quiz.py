from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_today, require_plan
from ..models import Plan, Question, Quiz, Topic, User
from ..schemas import QuizCreate, QuizSubmit
from ..serializers import quiz_out
from ..services import usage
from ..services.ai import quiz as ai_quiz

router = APIRouter(prefix="/api/quizzes", tags=["quiz"])


def _owned_topic(db: Session, plan: Plan, topic_id: int) -> Topic:
    topic = db.get(Topic, topic_id)
    if topic is None or topic.unit.subject.plan_id != plan.id:
        raise HTTPException(404, "Topic not found.")
    return topic


@router.post("")
def create_quiz(body: QuizCreate, plan: Plan = Depends(require_plan), user: User = Depends(current_user),
                db: Session = Depends(get_db), today: date = Depends(get_today)):
    topic = _owned_topic(db, plan, body.topic_id)
    # Reuse an unfinished quiz instead of paying for a new one (e.g. page refresh).
    open_quiz = db.scalar(
        select(Quiz).where(Quiz.topic_id == topic.id, Quiz.submitted_at.is_(None)).order_by(Quiz.id.desc())
    )
    if open_quiz:
        return quiz_out(open_quiz, reveal=False)

    usage.charge(db, user, today)
    attempt = db.scalar(select(func.count(Quiz.id)).where(Quiz.topic_id == topic.id)) or 0
    generated, sources = ai_quiz.generate(topic.unit.subject.name, topic.unit.name, topic.name, attempt)
    quiz = Quiz(topic_id=topic.id, total=len(generated.questions), sources=sources)
    for i, q in enumerate(generated.questions):
        quiz.questions.append(Question(
            position=i, difficulty=q.difficulty, stem=q.question, options=q.options,
            correct_index=q.correct_index, explanation=q.explanation,
        ))
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz_out(quiz, reveal=False)


@router.get("/{quiz_id}")
def get_quiz(quiz_id: int, plan: Plan = Depends(require_plan), db: Session = Depends(get_db)):
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(404, "Quiz not found.")
    _owned_topic(db, plan, quiz.topic_id)
    return quiz_out(quiz, reveal=quiz.submitted_at is not None)


@router.post("/{quiz_id}/submit")
def submit_quiz(quiz_id: int, body: QuizSubmit, plan: Plan = Depends(require_plan), db: Session = Depends(get_db)):
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(404, "Quiz not found.")
    _owned_topic(db, plan, quiz.topic_id)
    if quiz.submitted_at is not None:
        raise HTTPException(409, "This quiz was already submitted.")
    if len(body.answers) != len(quiz.questions):
        raise HTTPException(422, f"Expected {len(quiz.questions)} answers.")
    score = 0
    for q, a in zip(quiz.questions, body.answers):
        if a is not None and not 0 <= a < len(q.options):
            raise HTTPException(422, "Answer index out of range.")
        q.chosen_index = a
        score += int(a == q.correct_index)
    quiz.score, quiz.submitted_at = score, datetime.now()
    db.commit()
    return quiz_out(quiz, reveal=True)


@router.get("")
def list_quizzes(topic_id: int | None = None, plan: Plan = Depends(require_plan), db: Session = Depends(get_db)):
    stmt = select(Quiz).where(Quiz.submitted_at.is_not(None)).order_by(Quiz.submitted_at.desc()).limit(50)
    if topic_id is not None:
        stmt = stmt.where(Quiz.topic_id == topic_id)
    out = []
    for q in db.scalars(stmt):
        if q.topic.unit.subject.plan_id != plan.id:
            continue
        out.append({"id": q.id, "topic_id": q.topic_id, "topic": q.topic.name, "subject": q.topic.unit.subject.name,
                    "score": q.score, "total": q.total, "submitted_at": q.submitted_at.isoformat()})
    return out
