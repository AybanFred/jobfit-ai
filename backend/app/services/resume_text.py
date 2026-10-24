"""Read an uploaded resume (PDF or DOCX) and turn it into plain text.

Privacy: the file is handled in memory only. Nothing is written to disk or
Storage, and neither the file name nor the text is ever logged.
"""
import re
import zipfile
from io import BytesIO

from fastapi import HTTPException, UploadFile, status

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_TEXT_CHARS = 30_000  # what we send to the model at most
MIN_TEXT_CHARS = 50  # below this we treat the file as "no readable text"
MAX_PDF_PAGES = 30
MAX_DOCX_XML_BYTES = 30 * 1024 * 1024  # guard against zip bombs

_NO_TEXT = (
    "We could not find readable text in this file. If it is a scanned image, "
    "please upload a text-based PDF or DOCX."
)
_WRONG_TYPE = "Please upload a PDF or DOCX file."


def read_upload(file: UploadFile | None) -> bytes:
    """Read the upload into memory, refusing missing, empty or oversized files."""
    if file is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No file was uploaded")
    data = file.file.read(MAX_FILE_BYTES + 1)  # never read more than needed
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(
            413, "The file is too large (maximum 5 MB)"
        )
    return data


def detect_file_type(filename: str | None, data: bytes) -> str:
    """Return "pdf" or "docx". Checks the extension AND the content signature."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        if not data.startswith(b"%PDF"):
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, _WRONG_TYPE)
        return "pdf"
    if name.endswith(".docx"):
        try:
            with zipfile.ZipFile(BytesIO(data)) as zf:
                if "word/document.xml" not in zf.namelist():
                    raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, _WRONG_TYPE)
        except zipfile.BadZipFile as exc:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, _WRONG_TYPE) from exc
        return "docx"
    raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, _WRONG_TYPE)


def _tidy(text: str) -> str:
    text = text.replace("\x00", " ").replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader  # imported here so a missing library fails cleanly

    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted and not reader.decrypt(""):
        raise HTTPException(
            422,
            "This PDF is password protected. Please remove the password and try again.",
        )
    parts: list[str] = []
    total = 0
    for page in reader.pages[:MAX_PDF_PAGES]:
        chunk = page.extract_text() or ""
        parts.append(chunk)
        total += len(chunk)
        if total >= MAX_TEXT_CHARS:
            break
    return "\n".join(parts)


def _docx_text(data: bytes) -> str:
    from docx import Document

    with zipfile.ZipFile(BytesIO(data)) as zf:
        if zf.getinfo("word/document.xml").file_size > MAX_DOCX_XML_BYTES:
            raise HTTPException(422, _NO_TEXT)

    doc = Document(BytesIO(data))
    parts: list[str] = []

    # Contact details are often in the page header.
    for section in doc.sections:
        if not section.header.is_linked_to_previous:
            parts.extend(p.text for p in section.header.paragraphs)

    # Paragraphs and tables, in the order they appear in the document.
    for block in doc.iter_inner_content():
        if hasattr(block, "rows"):  # a table
            for row in block.rows:
                seen: set[int] = set()
                cells: list[str] = []
                for cell in row.cells:
                    if id(cell._tc) in seen:  # merged cells repeat
                        continue
                    seen.add(id(cell._tc))
                    cells.append(cell.text.strip())
                parts.append(" | ".join(c for c in cells if c))
        else:
            parts.append(block.text)
    return "\n".join(parts)


def extract_text(data: bytes, file_type: str) -> str:
    """Return cleaned text (capped at MAX_TEXT_CHARS). Raises 422 if unreadable."""
    try:
        raw = _pdf_text(data) if file_type == "pdf" else _docx_text(data)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - corrupt files raise many error types
        print(f"[resume_text] could not read file: {type(exc).__name__}")
        raise HTTPException(
            422,
            "We could not read this file. It may be damaged.",
        ) from exc

    text = _tidy(raw)[:MAX_TEXT_CHARS]
    if len(text) < MIN_TEXT_CHARS:
        raise HTTPException(422, _NO_TEXT)
    return text
