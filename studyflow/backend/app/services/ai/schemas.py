"""The contract every AI response must satisfy before it touches the database.

Structural problems (wrong counts, missing fields, bad indexes) are rejected so the
caller can retry. Harmless numeric drift (difficulty 7, est_minutes 2000) is clamped.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


def _clean(s: str) -> str:
    return " ".join(str(s).split()).strip()


def _field(obj, name):
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


# ---------------------------------------------------------------- syllabus ---
class ParsedTopic(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    difficulty: int = 3
    est_minutes: int = 60

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return _clean(v)

    @field_validator("difficulty", mode="before")
    @classmethod
    def _difficulty(cls, v):
        try:
            return min(5, max(1, int(round(float(v)))))
        except (TypeError, ValueError):
            return 3

    @field_validator("est_minutes", mode="before")
    @classmethod
    def _minutes(cls, v):
        try:
            return min(300, max(15, int(round(float(v)))))
        except (TypeError, ValueError):
            return 60


class ParsedUnit(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    topics: list[ParsedTopic] = Field(min_length=1)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return _clean(v)


class ParsedSubject(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    units: list[ParsedUnit] = Field(min_length=1)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return _clean(v)

    @field_validator("units", mode="before")
    @classmethod
    def _drop_empty_units(cls, v):
        return [u for u in v if _field(u, "topics")] if isinstance(v, list) else v


class ParsedSyllabus(BaseModel):
    subjects: list[ParsedSubject] = Field(min_length=1, max_length=20)

    @field_validator("subjects", mode="before")
    @classmethod
    def _drop_empty_subjects(cls, v):
        return [s for s in v if _field(s, "units")] if isinstance(v, list) else v


SYLLABUS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "units": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "topics": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": {"type": "string"},
                                            "difficulty": {"type": "integer"},
                                            "est_minutes": {"type": "integer"},
                                        },
                                        "required": ["name", "difficulty", "est_minutes"],
                                        "additionalProperties": False,
                                    },
                                },
                            },
                            "required": ["name", "topics"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["name", "units"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["subjects"],
    "additionalProperties": False,
}


# -------------------------------------------------------------------- quiz ---
Difficulty = Literal["easy", "medium", "hard"]
QUIZ_MIX = {"easy": 4, "medium": 4, "hard": 2}


class MCQ(BaseModel):
    difficulty: Difficulty
    question: str = Field(min_length=8)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=10)

    @field_validator("difficulty", mode="before")
    @classmethod
    def _lower(cls, v):
        return str(v).strip().lower()

    @field_validator("options")
    @classmethod
    def _distinct(cls, v: list[str]):
        cleaned = [_clean(o) for o in v]
        if any(not o for o in cleaned):
            raise ValueError("options must be non-empty")
        if len({o.lower() for o in cleaned}) != 4:
            raise ValueError("options must be 4 distinct answers")
        return cleaned


class QuizOut(BaseModel):
    questions: list[MCQ] = Field(min_length=10, max_length=10)

    @model_validator(mode="after")
    def _mix(self):
        counts = {k: 0 for k in QUIZ_MIX}
        for q in self.questions:
            counts[q.difficulty] += 1
        if counts != QUIZ_MIX:
            raise ValueError(f"difficulty mix must be 4 easy / 4 medium / 2 hard, got {counts}")
        if len({q.question.lower() for q in self.questions}) != 10:
            raise ValueError("questions must not repeat")
        # Present in a stable easy -> hard order.
        order = {"easy": 0, "medium": 1, "hard": 2}
        self.questions.sort(key=lambda q: order[q.difficulty])
        return self


QUIZ_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correct_index": {"type": "integer"},
                    "explanation": {"type": "string"},
                },
                "required": ["difficulty", "question", "options", "correct_index", "explanation"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}


# ------------------------------------------------------------------ review ---
class ReviewOut(BaseModel):
    verdict: str = Field(min_length=10, max_length=400)
    findings: list[str] = Field(min_length=2, max_length=6)
    actions: list[str] = Field(min_length=3, max_length=3)

    @field_validator("findings", "actions")
    @classmethod
    def _non_empty(cls, v: list[str]):
        v = [_clean(x) for x in v]
        if any(len(x) < 8 for x in v):
            raise ValueError("each finding/action must be a real sentence")
        return v


REVIEW_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string"},
        "findings": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["verdict", "findings", "actions"],
    "additionalProperties": False,
}
