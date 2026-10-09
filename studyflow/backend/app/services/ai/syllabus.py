from __future__ import annotations

import base64

from ...config import get_settings
from . import mock
from .client import AIError, generate_json
from .schemas import SYLLABUS_JSON_SCHEMA, ParsedSyllabus

MAX_CHARS = 120_000

SYSTEM = """You turn a student's raw syllabus into a clean study structure.

Output a JSON object: {"subjects": [{"name", "units": [{"name", "topics": [{"name", "difficulty", "est_minutes"}]}]}]}

Rules:
- Subjects are courses/papers. Units are the syllabus's own units/modules/chapters (keep their numbering in the name, e.g. "Unit 2: Normalization"). Topics are the individual teachable items inside a unit.
- Split comma- or semicolon-separated lists into separate topics. Keep topic names short (2-8 words) and specific; drop filler like "introduction to the unit" unless it's real content.
- difficulty: integer 1 (trivial) to 5 (hardest in the course), judged for a typical undergraduate.
- est_minutes: realistic first-pass study time for that topic for an undergraduate, 15-240.
- Don't invent topics that aren't in the syllabus. Ignore admin text (credits, marks, textbooks, outcomes) unless it names syllabus content.
- If the text has no subject headings, make one subject named after the course or "General"."""


def parse_text(text: str) -> ParsedSyllabus:
    text = text.strip()
    if len(text) < 10:
        raise AIError("The syllabus is empty. Paste some text or upload a PDF.", 422)
    if len(text) > MAX_CHARS:
        raise AIError(
            f"The syllabus is too long ({len(text):,} characters, max {MAX_CHARS:,}). Paste one subject at a time.", 422
        )
    if not get_settings().ai_live:
        result = mock.parse_syllabus(text)
        if not result.subjects:
            raise AIError("Couldn't find any topics in that text.", 422)
        return result
    parsed, _ = generate_json(
        system=SYSTEM,
        user_content=[{"type": "text", "text": f"<syllabus>\n{text}\n</syllabus>\n\nReturn the JSON structure."}],
        model=ParsedSyllabus,
        json_schema=SYLLABUS_JSON_SCHEMA,
        effort="low",
    )
    return parsed


def parse_scanned_pdf(pdf_bytes: bytes) -> ParsedSyllabus:
    """PDF without a text layer: let Claude read the pages directly."""
    if not get_settings().ai_live:
        raise AIError("This PDF has no selectable text (it's probably a scan). Add an API key, or paste the text instead.", 422)
    parsed, _ = generate_json(
        system=SYSTEM,
        user_content=[
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf",
                                            "data": base64.b64encode(pdf_bytes).decode()}},
            {"type": "text", "text": "This PDF is the syllabus. Return the JSON structure."},
        ],
        model=ParsedSyllabus,
        json_schema=SYLLABUS_JSON_SCHEMA,
        effort="low",
    )
    return parsed
