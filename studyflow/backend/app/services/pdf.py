from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_PDF_BYTES = 20 * 1024 * 1024


class PdfError(ValueError):
    pass


def extract_text(data: bytes) -> str:
    """Text layer of a PDF. Returns '' for scanned/image-only PDFs."""
    if len(data) > MAX_PDF_BYTES:
        raise PdfError("PDF is larger than 20 MB.")
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as e:  # noqa: BLE001 - pypdf raises several types here
                raise PdfError("This PDF is password-protected.") from e
        pages = [p.extract_text() or "" for p in reader.pages]
    except PdfReadError as e:
        raise PdfError("That file isn't a readable PDF.") from e
    return "\n".join(pages).strip()
