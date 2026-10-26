"""The shared Harvard layout for exported resumes and cover letters.

The DOCX and PDF writers never read the stored JSON themselves. They both render
the same list of `Block`s built here, so the two formats always have the same
content in the same order. Everything is defensive: missing keys, wrong types and
empty sections are skipped, never an error.

Harvard (Office of Career Services) style:
  - one column, serif font, ~0.75 in margins, 10.5 pt body;
  - name centred and bold (16 pt), contact line centred under it;
  - optional short summary under the header;
  - bold UPPERCASE section headings with a thin rule, in the order
    EDUCATION, EXPERIENCE, PROJECTS, SKILLS;
  - each entry: organisation / school bold on the left, location on the right;
    title / degree italic on the left, dates on the right; tight bullets;
  - skills as "Category: a, b, c" lines.
"""
import re
import unicodedata
from dataclasses import dataclass
from datetime import date

# ---- page and type -----------------------------------------------------------

PAGE_WIDTH_IN = 8.5  # US Letter, like the Harvard samples
PAGE_HEIGHT_IN = 11.0
MARGIN_IN = 0.75
TEXT_WIDTH_IN = PAGE_WIDTH_IN - 2 * MARGIN_IN

BODY_PT = 10.5
NAME_PT = 16
HEADING_PT = 11

CONTACT_SEP = " · "  # " · "
BULLET = "•"  # "•"

SECTION_TITLES = ("EDUCATION", "EXPERIENCE", "PROJECTS", "SKILLS")
DEFAULT_GREETING = "Dear Hiring Manager,"
DEFAULT_CLOSING = "Sincerely,"

_TEXT_MAX = 2000
_SHORT_MAX = 200
_MONTHS = ("January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December")


@dataclass(frozen=True)
class Block:
    """One line or paragraph of the document.

    kind:
      name       centred, bold, large              (text)
      contact    centred                            (text)
      summary    plain paragraph under the header   (text)
      heading    bold uppercase with a rule         (text)
      entry      bold left, regular right           (text, right)
      subentry   italic left, regular right         (text, right)
      bullet     bullet item                        (text)
      skill      "Label: items", label bold         (label, text)
      line       plain single line                  (text)
      paragraph  letter paragraph, blank line after (text)
      gap        one empty line
    """
    kind: str
    text: str = ""
    right: str = ""
    label: str = ""


# ---- safe readers --------------------------------------------------------------

def clean(value, limit: int = _TEXT_MAX) -> str:
    """A trimmed one-line string, or "" for anything that is not text."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _dicts(value) -> list[dict]:
    return [v for v in value if isinstance(v, dict)] if isinstance(value, list) else []


def _strings(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [s for s in (clean(v) for v in value) if s]


def contact_line(header) -> str:
    """location · email · phone · links (empty parts are skipped)."""
    h = _dict(header)
    links = h.get("links") if isinstance(h.get("links"), list) else []
    parts = [clean(h.get(k), _SHORT_MAX) for k in ("location", "email", "phone")]
    parts += [clean(link, _SHORT_MAX) for link in links]
    return CONTACT_SEP.join(p for p in parts if p)


def long_date(value: date) -> str:
    """'October 26, 2026' (English month names, independent of the server locale)."""
    return f"{_MONTHS[value.month - 1]} {value.day}, {value.year}"


# ---- resume --------------------------------------------------------------------

def _entry(primary: str, primary_right: str, secondary: str, secondary_right: str,
           bullets: list[str]) -> list[Block]:
    """Two Harvard lines (bold + location, italic + dates), then the bullets.

    With no italic line and no location, the dates move up to the bold line.
    """
    if not primary:  # e.g. an organisation that was removed: show the title in bold
        primary, secondary = secondary, ""
    out: list[Block] = []
    if primary or primary_right or secondary or secondary_right:
        if not secondary and not primary_right:
            out.append(Block("entry", primary, secondary_right))
        else:
            out.append(Block("entry", primary, primary_right))
            if secondary or secondary_right:
                out.append(Block("subentry", secondary, secondary_right))
    out += [Block("bullet", b) for b in bullets]
    return out


def _section(blocks: list[Block], title: str, items: list[Block]) -> None:
    if items:
        blocks.append(Block("heading", title))
        blocks.extend(items)


def resume_name(content) -> str:
    return clean(_dict(_dict(content).get("header")).get("name"), _SHORT_MAX)


def resume_blocks(content) -> list[Block]:
    """Blocks for a TailoredResume dict (see app/api/tailor.py)."""
    c = _dict(content)
    header = _dict(c.get("header"))
    blocks: list[Block] = []

    name = resume_name(c)
    if name:
        blocks.append(Block("name", name))
    contact = contact_line(header)
    if contact:
        blocks.append(Block("contact", contact))
    summary = clean(c.get("summary"))
    if summary:
        blocks.append(Block("summary", summary))

    education: list[Block] = []
    for e in _dicts(c.get("education")):
        education += _entry(clean(e.get("school"), _SHORT_MAX), clean(e.get("location"), _SHORT_MAX),
                            clean(e.get("degree"), _SHORT_MAX), clean(e.get("dates"), _SHORT_MAX),
                            _strings(e.get("details")))
    _section(blocks, "EDUCATION", education)

    experience: list[Block] = []
    for e in _dicts(c.get("experience")):
        experience += _entry(clean(e.get("organization"), _SHORT_MAX),
                             clean(e.get("location"), _SHORT_MAX),
                             clean(e.get("title"), _SHORT_MAX), clean(e.get("dates"), _SHORT_MAX),
                             _strings(e.get("bullets")))
    _section(blocks, "EXPERIENCE", experience)

    projects: list[Block] = []
    for p in _dicts(c.get("projects")):
        projects += _entry(clean(p.get("name"), _SHORT_MAX), "", clean(p.get("role"), _SHORT_MAX),
                           clean(p.get("dates"), _SHORT_MAX), _strings(p.get("bullets")))
    _section(blocks, "PROJECTS", projects)

    skills: list[Block] = []
    for g in _dicts(c.get("skills")):
        items = _strings(g.get("items"))
        if items:
            skills.append(Block("skill", ", ".join(items), label=clean(g.get("category"), 60)))
    _section(blocks, "SKILLS", skills)
    return blocks


# ---- cover letter ----------------------------------------------------------------

def letter_name(content, sender=None) -> str:
    """The sender's name: the resume header name, else the letter's signature."""
    return (clean(_dict(sender).get("name"), _SHORT_MAX)
            or clean(_dict(content).get("signature"), _SHORT_MAX))


def cover_letter_blocks(content, sender=None, today: date | None = None) -> list[Block]:
    """Blocks for a CoverLetter dict. `sender` is the same job's resume header."""
    c = _dict(content)
    blocks: list[Block] = []

    name = letter_name(c, sender)
    if name:
        blocks.append(Block("name", name))
    contact = contact_line(sender)
    if contact:
        blocks.append(Block("contact", contact))
    if blocks:
        blocks.append(Block("gap"))

    blocks += [Block("line", long_date(today or date.today())), Block("gap")]

    recipient_lines = [v for v in (clean(c.get("recipient"), _SHORT_MAX),
                                   clean(c.get("company"), _SHORT_MAX)) if v]
    if recipient_lines:
        blocks += [Block("line", v) for v in recipient_lines] + [Block("gap")]

    blocks += [Block("line", clean(c.get("greeting"), _SHORT_MAX) or DEFAULT_GREETING),
               Block("gap")]
    blocks += [Block("paragraph", p) for p in _strings(c.get("paragraphs"))]
    blocks.append(Block("line", clean(c.get("closing"), _SHORT_MAX) or DEFAULT_CLOSING))
    signature = clean(c.get("signature"), _SHORT_MAX) or name
    if signature:
        blocks += [Block("gap"), Block("line", signature)]
    return blocks


# ---- file names ----------------------------------------------------------------

def safe_part(value, limit: int = 40) -> str:
    """ASCII letters/digits joined by "_" ("Zoë O'Neil" -> "Zoe_O_Neil")."""
    text = unicodedata.normalize("NFKD", value if isinstance(value, str) else "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")
    return text[:limit].strip("_")


def export_file_name(doc_type: str, name: str | None, company: str | None, fmt: str) -> str:
    """'Jane_Doe_Resume_Acme.pdf' / 'Cover_Letter.docx'. No path characters."""
    label = "Resume" if doc_type == "resume" else "Cover_Letter"
    parts = [safe_part(name), label, safe_part(company)]
    return "_".join(p for p in parts if p) + f".{fmt}"
