from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import get_settings
from ..schemas import SyllabusParsed, SyllabusText
from ..services import pdf
from ..services.ai import syllabus as ai_syllabus

router = APIRouter(prefix="/api/syllabus", tags=["syllabus"])


def _wrap(parsed) -> SyllabusParsed:
    return SyllabusParsed(subjects=parsed.subjects, source="ai" if get_settings().ai_live else "demo")


@router.post("/parse", response_model=SyllabusParsed)
def parse_text(body: SyllabusText):
    return _wrap(ai_syllabus.parse_text(body.text))


@router.post("/parse-pdf", response_model=SyllabusParsed)
def parse_pdf(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/x-pdf", "application/octet-stream") and not (
        file.filename or ""
    ).lower().endswith(".pdf"):
        raise HTTPException(415, "Upload a PDF file.")
    data = file.file.read(pdf.MAX_PDF_BYTES + 1)
    try:
        text = pdf.extract_text(data)
    except pdf.PdfError as e:
        raise HTTPException(422, str(e)) from e
    if len(text) < 30:
        return _wrap(ai_syllabus.parse_scanned_pdf(data))
    return _wrap(ai_syllabus.parse_text(text))
