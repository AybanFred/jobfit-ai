"""Export tailored documents as files (Harvard template, DOCX and PDF).

`render(doc_type, fmt, content, sender=None, today=None)` is the single entry point.
Every builder is a pure function: saved JSON content in, file bytes out.
"""
from datetime import date

from app.services.export import harvard_docx, harvard_pdf

FORMATS = ("docx", "pdf")
DOC_TYPES = ("resume", "cover_letter")

_BUILDERS = {
    ("resume", "docx"): harvard_docx.resume_docx,
    ("resume", "pdf"): harvard_pdf.resume_pdf,
    ("cover_letter", "docx"): harvard_docx.cover_letter_docx,
    ("cover_letter", "pdf"): harvard_pdf.cover_letter_pdf,
}


def render(doc_type: str, fmt: str, content: dict, sender: dict | None = None,
           today: date | None = None) -> bytes:
    """Build the file. `sender` (a resume header) and `today` are used by cover letters."""
    builder = _BUILDERS[(doc_type, fmt)]
    if doc_type == "cover_letter":
        return builder(content, sender=sender, today=today)
    return builder(content)
