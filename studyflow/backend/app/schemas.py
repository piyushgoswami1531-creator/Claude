"""Request/response models for the HTTP API."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .services.ai.schemas import ParsedSyllabus

Strength = Literal["weak", "neutral", "strong"]


class TopicIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    difficulty: int = Field(3, ge=1, le=5)
    est_minutes: int = Field(60, ge=10, le=600)


class UnitIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    topics: list[TopicIn] = Field(min_length=1)


class SubjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    strength: Strength = "neutral"
    units: list[UnitIn] = Field(min_length=1)


class PlanCreate(BaseModel):
    exam_date: date
    daily_hours: float = Field(gt=0, le=16)
    subjects: list[SubjectIn] = Field(min_length=1, max_length=20)

    @field_validator("daily_hours")
    @classmethod
    def _round(cls, v: float) -> float:
        return round(v * 4) / 4  # quarter-hour steps


class SyllabusText(BaseModel):
    text: str = Field(min_length=1)


class SyllabusParsed(ParsedSyllabus):
    source: Literal["ai", "demo"]


class ItemPatch(BaseModel):
    status: Literal["pending", "done"]


class QuizCreate(BaseModel):
    topic_id: int


class QuizSubmit(BaseModel):
    answers: list[int | None] = Field(min_length=1, max_length=10)
