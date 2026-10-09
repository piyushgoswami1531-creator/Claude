from __future__ import annotations

from ...config import get_settings
from . import mock
from .client import generate_json, search_sources, web_search_tool
from .schemas import QUIZ_JSON_SCHEMA, QuizOut

SYSTEM = """You write exam-style multiple-choice quizzes for university students.

Use web search to check facts, definitions and current conventions for the topic before writing (prefer textbooks, university course pages, official documentation). Then write exactly 10 questions:
- 4 "easy" (definitions, recognition), 4 "medium" (application, comparing concepts), 2 "hard" (multi-step reasoning, edge cases, tricky exam-style).
- Each has exactly 4 options, exactly one correct. Distractors must be plausible mistakes a student would actually make, not jokes. Don't use "all of the above" / "none of the above".
- Vary the position of the correct answer.
- "explanation": 1-3 sentences saying why the answer is right AND why the most tempting wrong option is wrong.
- Questions must be self-contained (no "according to the article").

Your final message must be ONLY this JSON object, with no prose before or after:
{"questions": [{"difficulty": "easy|medium|hard", "question": "...", "options": ["...","...","...","..."], "correct_index": 0, "explanation": "..."}]}"""


def generate(subject: str, unit: str, topic: str, attempt: int = 0) -> tuple[QuizOut, list[dict]]:
    if not get_settings().ai_live:
        return mock.generate_quiz(subject, unit, topic, attempt), []
    prompt = (
        f"Subject: {subject}\nUnit: {unit}\nTopic: {topic}\n"
        + (f"This is retake #{attempt}: write different questions from a typical first quiz.\n" if attempt else "")
        + "Research the topic, then return the quiz JSON."
    )
    quiz, resp = generate_json(
        system=SYSTEM,
        user_content=[{"type": "text", "text": prompt}],
        model=QuizOut,
        json_schema=QUIZ_JSON_SCHEMA,
        tools=[web_search_tool(max_uses=4)],
        effort="medium",
    )
    return quiz, search_sources(resp)
