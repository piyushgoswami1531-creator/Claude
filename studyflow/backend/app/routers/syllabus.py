from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import current_user, get_today
from ..models import User
from ..schemas import SyllabusParsed, SyllabusText
from ..services import pdf, usage
from ..services.ai import syllabus as ai_syllabus

router = APIRouter(prefix="/api/syllabus", tags=["syllabus"])


def _wrap(parsed) -> SyllabusParsed:
    return SyllabusParsed(subjects=parsed.subjects, source="ai" if get_settings().ai_live else "demo")


@router.post("/parse", response_model=SyllabusParsed)
def parse_text(body: SyllabusText, user: User = Depends(current_user), db: Session = Depends(get_db),
               today: date = Depends(get_today)):
    usage.charge(db, user, today)
    return _wrap(ai_syllabus.parse_text(body.text))


@router.post("/parse-pdf", response_model=SyllabusParsed)
def parse_pdf(file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db),
              today: date = Depends(get_today)):
    if file.content_type not in ("application/pdf", "application/x-pdf", "application/octet-stream") and not (
        file.filename or ""
    ).lower().endswith(".pdf"):
        raise HTTPException(415, "Upload a PDF file.")
    data = file.file.read(pdf.MAX_PDF_BYTES + 1)
    try:
        text = pdf.extract_text(data)
    except pdf.PdfError as e:
        raise HTTPException(422, str(e)) from e
    usage.charge(db, user, today)
    if len(text) < 30:
        return _wrap(ai_syllabus.parse_scanned_pdf(data))
    return _wrap(ai_syllabus.parse_text(text))
