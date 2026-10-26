"""Harvard-style PDF (reportlab, pure Python). Pure functions: content dict -> .pdf bytes.

Uses the built-in PDF Times fonts (serif, no font files, real selectable text for
ATS parsers). They cover Western European characters (Windows-1252); other Latin
letters are written without their accents (e.g. "Ł" -> "L", "ć" -> "c") so no
black boxes appear. The DOCX export keeps every character exactly as written.
"""
import unicodedata
from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib.colors import black
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

from app.services.export.layout import (
    BODY_PT, BULLET, HEADING_PT, MARGIN_IN, NAME_PT, PAGE_HEIGHT_IN, PAGE_WIDTH_IN,
    TEXT_WIDTH_IN, Block, cover_letter_blocks, letter_name, resume_blocks, resume_name,
)

REGULAR, BOLD, ITALIC = "Times-Roman", "Times-Bold", "Times-Italic"
LEADING = round(BODY_PT * 1.2, 1)
_WIDTH = TEXT_WIDTH_IN * inch
_LEFT_SHARE = 0.68  # left column of the "organisation ... location" rows


def _style(name: str, **kw) -> ParagraphStyle:
    base = {"fontName": REGULAR, "fontSize": BODY_PT, "leading": LEADING,
            "spaceBefore": 0, "spaceAfter": 0}
    return ParagraphStyle(name, **{**base, **kw})


_S = {
    "name": _style("name", fontName=BOLD, fontSize=NAME_PT, leading=NAME_PT * 1.2,
                   alignment=TA_CENTER, spaceAfter=2),
    "contact": _style("contact", alignment=TA_CENTER, spaceAfter=4),
    "summary": _style("summary", spaceBefore=2, spaceAfter=2),
    "heading": _style("heading", fontName=BOLD, fontSize=HEADING_PT,
                      leading=HEADING_PT * 1.2, spaceBefore=8, keepWithNext=1),
    "entry": _style("entry", fontName=BOLD, spaceBefore=3, keepWithNext=1),
    "subentry": _style("subentry", fontName=ITALIC, keepWithNext=1),
    "cell_bold": _style("cell_bold", fontName=BOLD),
    "cell_italic": _style("cell_italic", fontName=ITALIC),
    "cell_right": _style("cell_right", alignment=TA_RIGHT),
    "bullet": _style("bullet", leftIndent=14, bulletIndent=4, bulletFontName=REGULAR,
                     bulletFontSize=BODY_PT),
    "body": _style("body"),
    "paragraph": _style("paragraph", spaceAfter=BODY_PT),
}

_NO_PADDING = TableStyle([
    ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
])

# Latin letters with no Unicode decomposition (NFKD cannot strip them).
_NO_DECOMPOSITION = str.maketrans({
    "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H",
    "ħ": "h", "ı": "i", "Ŀ": "L", "ŀ": "l", "Ŧ": "T",
    "ŧ": "t", "‐": "-", "‑": "-", "−": "-",
})


def pdf_text(value: str) -> str:
    """Make text safe for the built-in fonts, then escape it for Paragraph markup."""
    out: list[str] = []
    for ch in value.translate(_NO_DECOMPOSITION):
        try:
            ch.encode("cp1252")
            out.append(ch)
            continue
        except UnicodeEncodeError:
            pass
        base = "".join(c for c in unicodedata.normalize("NFKD", ch)
                       if not unicodedata.combining(c))
        try:
            base.encode("cp1252")
            out.append(base)
        except UnicodeEncodeError:
            out.append(ch)  # no Western form (e.g. CJK); left as written
    return escape("".join(out))


def resume_pdf(content: dict) -> bytes:
    return _render(resume_blocks(content), title="Resume", author=resume_name(content))


def cover_letter_pdf(content: dict, sender: dict | None = None,
                     today: date | None = None) -> bytes:
    return _render(cover_letter_blocks(content, sender, today), title="Cover Letter",
                   author=letter_name(content, sender))


# ---------------------------------------------------------------------------

def _two_sided(b: Block, *, left_style: str, cell_style: str, space_before: float):
    if not b.right:
        return Paragraph(pdf_text(b.text), _S[left_style])
    table = Table(
        [[Paragraph(pdf_text(b.text), _S[cell_style]),
          Paragraph(pdf_text(b.right), _S["cell_right"])]],
        colWidths=[_WIDTH * _LEFT_SHARE, _WIDTH * (1 - _LEFT_SHARE)],
        spaceBefore=space_before,
    )
    table.setStyle(_NO_PADDING)
    table.keepWithNext = 1
    return table


def _flowables(b: Block) -> list:
    kind = b.kind
    if kind in ("name", "contact", "summary", "paragraph"):
        return [Paragraph(pdf_text(b.text), _S[kind])]
    if kind == "heading":
        rule = HRFlowable(width="100%", thickness=0.6, color=black, spaceBefore=1,
                          spaceAfter=3)
        rule.keepWithNext = 1
        return [Paragraph(pdf_text(b.text.upper()), _S["heading"]), rule]
    if kind == "entry":
        return [_two_sided(b, left_style="entry", cell_style="cell_bold", space_before=3)]
    if kind == "subentry":
        return [_two_sided(b, left_style="subentry", cell_style="cell_italic", space_before=0)]
    if kind == "bullet":
        return [Paragraph(pdf_text(b.text), _S["bullet"], bulletText=BULLET)]
    if kind == "skill":
        label = f"<b>{pdf_text(b.label)}:</b> " if b.label else ""
        return [Paragraph(label + pdf_text(b.text), _S["body"])]
    if kind == "line":
        return [Paragraph(pdf_text(b.text), _S["body"])]
    if kind == "gap":
        return [Spacer(1, LEADING)]
    return []


def _render(blocks: list[Block], *, title: str, author: str) -> bytes:
    buffer = BytesIO()
    margin = MARGIN_IN * inch
    doc = BaseDocTemplate(
        buffer, pagesize=(PAGE_WIDTH_IN * inch, PAGE_HEIGHT_IN * inch),
        leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=margin,
        title=title, author=author or "", creator="JobFit AI", subject="", keywords="",
    )
    # No frame padding, so the text area is exactly the page minus the 0.75 in margins.
    frame = Frame(margin, margin, doc.width, doc.height, id="body",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])
    story = [f for b in blocks for f in _flowables(b)]
    doc.build(story or [Spacer(1, LEADING)])  # an empty document is still a valid PDF
    return buffer.getvalue()
