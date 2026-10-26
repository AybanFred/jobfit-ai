"""The anti-invention guard for tailored resumes and cover letters.

Core product rule: the AI must NEVER invent skills, employers, titles, schools,
degrees, dates, metrics or experience. It may only rephrase, reorder and highlight
what is in the ORIGINAL resume (the "source" text).

After the model answers, `validate` checks every part against the source:
  - DROPPED (with a warning): skills, employers, job titles, schools, degrees,
    projects, locations, names and contact details not found in the source,
    dates whose years are not in the source, and bullets that mention a job
    requirement the source does not have (a "gap" skill).
  - WARNED (kept, the user must check it): bullets with a number or percentage
    that is not in the source, and a cover letter that mentions a gap skill.

`validate_email_draft` checks the short application email ({subject, body}):
markdown is stripped and lengths capped; a greeting naming a person who is not
in the job text becomes "Dear Hiring Manager,"; gap skills, numbers and email
addresses that are not in the source (or job text) are WARNED. An empty email is
a warning, not an error. Every email warning starts with "The email".

Matching is the same word-boundary matcher as resume import and job parsing
(`_Source.has_text`), so "Go" never matches inside "Google".

Privacy: nothing here logs text. Warnings go to the user only.
"""
import re

from app.services.resume_parser import (
    SKILL_MAX, SKILL_MIN, _CURRENT_RE, _collapse, _email, _norm_url, _object_list, _phone,
    _scalar, _Source, _str_list, _text, _url,
)

# Size limits applied to whatever the model returns.
SHORT_MAX = 200
DATES_MAX = 60
SUMMARY_MAX = 800
BULLET_MAX = 350
PARAGRAPH_MAX = 1200
GREETING_MAX = 100
CLOSING_MAX = 60
CATEGORY_MAX = 60
MAX_LINKS = 5
MAX_EDUCATION = 6
MAX_DETAILS = 6
MAX_EXPERIENCE = 10
MAX_BULLETS = 8
MAX_PROJECTS = 8
MAX_PROJECT_BULLETS = 6
MAX_SKILL_GROUPS = 8
MAX_SKILLS_PER_GROUP = 30
MAX_SKILLS_TOTAL = 60
MAX_PARAGRAPHS = 6
MAX_WARNINGS = 30
MAX_NAMED = 10  # how many dropped skills a single warning lists

DEFAULT_GREETING = "Dear Hiring Manager,"
DEFAULT_CLOSING = "Sincerely,"

_YEAR_RE = re.compile(r"(?<!\d)(?:19|20)\d{2}(?!\d)")
_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)*")
_BULLET_PREFIX_RE = re.compile(r"^[\s\-*•·▪●]+")
_GENERIC_WHO = {"hiring manager", "hiring team", "recruiter", "recruiting team",
                "recruitment team", "sir or madam", "sir/madam", "team", "recruiting manager"}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _numbers(text: str) -> set[str]:
    """Numeric tokens, normalised: "1,200" -> "1200", "05" -> "5", "40%" -> "40"."""
    out: set[str] = set()
    for token in _NUMBER_RE.findall(text or ""):
        token = token.replace(",", "")
        if token.isdigit():
            token = str(int(token))
        out.add(token)
    return out


def _clean_name(value, limit: int = SHORT_MAX) -> str | None:
    """A short text value without the stray punctuation models add around it."""
    value = _text(_scalar(value), limit)
    if not value:
        return None
    return value.strip(" .,;:|-") or None


def _pick(raw: dict, *keys):
    for key in keys:
        if key in raw and raw[key] is not None:
            return raw[key]
    return None


def _short_term_in(text: str, term: str) -> bool:
    """Exact-case, whole-word match for very short names ("Go" is not "go live")."""
    return re.search(rf"(?<![A-Za-z0-9]){re.escape(term)}(?![A-Za-z0-9])", text) is not None


def skill_in(skill: str, src: _Source) -> bool:
    """Is this skill written in the text? Word-boundary match that also accepts a
    simple plural/singular difference ("REST API" vs "REST APIs")."""
    if src.has_text(skill):
        return True
    if len(skill) > 3 and skill.lower().endswith("s") and src.has_text(skill[:-1]):
        return True
    return len(skill) > 2 and src.has_text(skill + "s")


def mentioned(text: str, terms: list[str]) -> list[str]:
    """Which of `terms` does `text` mention?"""
    if not text or not terms:
        return []
    src = _Source(text)
    return [t for t in terms
            if (_short_term_in(text, t) if len(t) <= 3 else skill_in(t, src))]


def compute_match(parsed: dict, source_text: str) -> dict:
    """matched = job skills found in the source; gaps = the rest.

    score = matched required / total required * 100 (100 if nothing is required).
    """
    src = _Source(source_text)
    required = list(parsed.get("required_skills") or [])
    nice = list(parsed.get("nice_to_have_skills") or [])
    matched: list[str] = []
    gaps: list[str] = []
    seen: set[str] = set()
    for skill in required + nice:
        key = _collapse(skill)
        if key in seen:
            continue
        seen.add(key)
        (matched if skill_in(skill, src) else gaps).append(skill)
    matched_keys = {_collapse(s) for s in matched}
    required_keys = list(dict.fromkeys(_collapse(s) for s in required))
    if required_keys:
        hits = sum(1 for k in required_keys if k in matched_keys)
        score = round(hits / len(required_keys) * 100, 1)
    else:
        score = 100.0
    return {"score": score, "matched": matched, "gaps": gaps}


def _join(items: list[str]) -> str:
    return ", ".join(items)


# ---------------------------------------------------------------------------
# Validation context
# ---------------------------------------------------------------------------

class _Ctx:
    def __init__(self, source_text: str, job_text: str, gaps: list[str]):
        self.source_raw = source_text
        self.src = _Source(source_text)
        self.job = _Source(job_text)
        self.source_numbers = _numbers(source_text)
        self.letter_numbers = self.source_numbers | _numbers(job_text)
        self.source_years = set(_YEAR_RE.findall(source_text))
        self.mentions_current = _CURRENT_RE.search(self.src.text) is not None
        self.gaps = gaps
        self.warnings: list[str] = []

    def warn(self, message: str) -> None:
        if message not in self.warnings and len(self.warnings) < MAX_WARNINGS:
            self.warnings.append(message)

    def in_source(self, value: str) -> bool:
        return self.src.has_text(value)

    def unsupported_numbers(self, text: str, allowed: set[str] | None = None) -> list[str]:
        allowed = self.source_numbers if allowed is None else allowed
        return sorted(_numbers(text) - allowed)


# ---------------------------------------------------------------------------
# Resume parts
# ---------------------------------------------------------------------------

def _location(value, ctx: _Ctx, where: str) -> str | None:
    loc = _clean_name(value)
    if loc and not ctx.in_source(loc):
        ctx.warn(f'Removed the location "{loc}" for {where} because it is not in your resume.')
        return None
    return loc


def _dates(value, ctx: _Ctx, where: str) -> str | None:
    dates = _text(_scalar(value), DATES_MAX)
    if not dates:
        return None
    bad_years = [y for y in _YEAR_RE.findall(dates) if y not in ctx.source_years]
    claims_current = _CURRENT_RE.search(dates) is not None and not ctx.mentions_current
    if bad_years or claims_current:
        ctx.warn(f'Removed the dates "{dates}" for {where} because they do not match your resume.')
        return None
    return dates


def _bullets(values, ctx: _Ctx, where: str, limit: int) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in _str_list(values, separators=r"\n"):  # commas belong to bullets
        bullet = _text(item, BULLET_MAX)
        bullet = _BULLET_PREFIX_RE.sub("", bullet).strip() if bullet else None
        if not bullet or bullet.lower() in seen:
            continue
        hits = mentioned(bullet, ctx.gaps)
        if hits:
            ctx.warn(f'Removed a bullet under "{where}" because it mentions {_join(hits)}, '
                     "which is not in your resume.")
            continue
        extra = ctx.unsupported_numbers(bullet)
        if extra:
            ctx.warn(f'A bullet under "{where}" has a number that is not in your resume '
                     f"({_join(extra)}). Please check it.")
        seen.add(bullet.lower())
        out.append(bullet)
        if len(out) >= limit:
            break
    return out


def _header(raw, ctx: _Ctx) -> dict:
    h = raw if isinstance(raw, dict) else {}
    dropped_contact = False

    name = _clean_name(_pick(h, "name", "full_name"))
    if name and not ctx.in_source(name):
        ctx.warn(f'Removed the name "{name}" because it is not in your resume.')
        name = None

    contact = {}
    for key, check in (("email", _email), ("phone", _phone)):
        value = _scalar(h.get(key))
        contact[key] = check(value, ctx.src)
        if _text(value, SHORT_MAX) and contact[key] is None:
            dropped_contact = True

    location = _clean_name(h.get("location"))
    if location and not ctx.in_source(location):
        location, dropped_contact = None, True

    raw_links = h.get("links")
    if isinstance(raw_links, dict):
        raw_links = list(raw_links.values())
    links: list[str] = []
    seen: set[str] = set()
    for item in _str_list(raw_links, separators=r"[\s,;|]+"):
        link = _url(item, ctx.src)
        if link is None:
            dropped_contact = True
            continue
        key = _norm_url(link)
        if key not in seen:
            seen.add(key)
            links.append(link)
        if len(links) >= MAX_LINKS:
            break

    if dropped_contact:
        ctx.warn("Removed contact details that are not in your resume.")
    return {"name": name, **contact, "location": location, "links": links}


def _summary(value, ctx: _Ctx) -> str | None:
    summary = _text(_scalar(value), SUMMARY_MAX)
    if not summary:
        return None
    hits = mentioned(summary, ctx.gaps)
    if hits:
        ctx.warn(f"Removed the summary because it mentions {_join(hits)}, "
                 "which is not in your resume.")
        return None
    extra = ctx.unsupported_numbers(summary)
    if extra:
        ctx.warn(f"The summary has a number that is not in your resume ({_join(extra)}). "
                 "Please check it.")
    return summary


def _education(values, ctx: _Ctx) -> list[dict]:
    out: list[dict] = []
    for e in _object_list(values):
        school = _clean_name(_pick(e, "school", "institution", "university"))
        degree = _clean_name(e.get("degree"))
        if not school:
            if degree:
                ctx.warn("Removed an education entry without a school name.")
            continue
        if not ctx.in_source(school):
            ctx.warn(f'Removed the education entry "{school}" because that school is not '
                     "in your resume.")
            continue
        if degree and not ctx.in_source(degree):
            ctx.warn(f'Removed the degree "{degree}" because it is not in your resume.')
            degree = None
        out.append({
            "school": school,
            "location": _location(e.get("location"), ctx, school),
            "degree": degree,
            "dates": _dates(e.get("dates"), ctx, school),
            "details": _bullets(_pick(e, "details", "bullets"), ctx, school, MAX_DETAILS),
        })
        if len(out) >= MAX_EDUCATION:
            break
    return out


def _experience(values, ctx: _Ctx) -> list[dict]:
    out: list[dict] = []
    for e in _object_list(values):
        org = _clean_name(_pick(e, "organization", "company", "employer"))
        title = _clean_name(_pick(e, "title", "role", "position"))
        if not org:
            if title or e.get("bullets"):
                ctx.warn("Removed a job without an employer name.")
            continue
        if not ctx.in_source(org):
            ctx.warn(f'Removed the role at "{org}" because that employer is not in your resume.')
            continue
        if title and not ctx.in_source(title):
            ctx.warn(f'Removed the job title "{title}" because it is not in your resume.')
            title = None
        out.append({
            "organization": org,
            "location": _location(e.get("location"), ctx, org),
            "title": title,
            "dates": _dates(e.get("dates"), ctx, org),
            "bullets": _bullets(e.get("bullets"), ctx, org, MAX_BULLETS),
        })
        if len(out) >= MAX_EXPERIENCE:
            break
    return out


def _projects(values, ctx: _Ctx) -> list[dict]:
    out: list[dict] = []
    for p in _object_list(values):
        name = _clean_name(_pick(p, "name", "title"))
        if not name:
            if p.get("bullets"):
                ctx.warn("Removed a project without a name.")
            continue
        if not ctx.in_source(name):
            ctx.warn(f'Removed the project "{name}" because it is not in your resume.')
            continue
        role = _clean_name(p.get("role"))
        if role and not ctx.in_source(role):
            ctx.warn(f'Removed the role "{role}" for {name} because it is not in your resume.')
            role = None
        out.append({
            "name": name,
            "role": role,
            "dates": _dates(p.get("dates"), ctx, name),
            "bullets": _bullets(p.get("bullets"), ctx, name, MAX_PROJECT_BULLETS),
        })
        if len(out) >= MAX_PROJECTS:
            break
    return out


def _skill_groups(value) -> list[tuple[object, object]]:
    """Accept [{"category", "items"}], a flat list, a {category: items} dict or a string."""
    if isinstance(value, dict):
        return list(value.items())
    if isinstance(value, str):
        return [("Skills", value)]
    if not isinstance(value, list):
        return []
    groups: list[tuple[object, object]] = []
    loose: list = []
    for v in value:
        if isinstance(v, dict) and any(k in v for k in ("items", "skills")):
            groups.append((_pick(v, "category", "name", "group"), _pick(v, "items", "skills")))
        else:
            loose.append(v)
    if loose:
        groups.append(("Skills", loose))
    return groups


def _skills(value, ctx: _Ctx) -> list[dict]:
    merged: dict[str, dict] = {}  # category key -> group (same category written twice)
    seen: set[str] = set()
    dropped: list[str] = []
    total = 0
    for category, items in _skill_groups(value):
        label = _text(_scalar(category), CATEGORY_MAX) or "Skills"
        for item in _str_list(items):
            name = _text(item, 10_000)  # never cut junk into a valid-looking skill
            if not name or not (SKILL_MIN <= len(name) <= SKILL_MAX):
                continue
            key = _collapse(name)
            if key in seen:
                continue
            seen.add(key)
            if not skill_in(name, ctx.src):
                dropped.append(name)
                continue
            group = merged.get(label.lower())
            if group is None:
                if len(merged) >= MAX_SKILL_GROUPS:
                    continue
                group = merged[label.lower()] = {"category": label, "items": []}
            if len(group["items"]) >= MAX_SKILLS_PER_GROUP or total >= MAX_SKILLS_TOTAL:
                continue
            group["items"].append(name)
            total += 1
    if dropped:
        ctx.warn(f"Removed skills that are not in your resume: {_join(dropped[:MAX_NAMED])}.")
    return [g for g in merged.values() if g["items"]]


# ---------------------------------------------------------------------------
# Cover letter
# ---------------------------------------------------------------------------

def _greeting(value, ctx: _Ctx, recipient: str | None, company: str | None) -> str:
    greeting = _text(_scalar(value), GREETING_MAX)
    if not greeting:
        return DEFAULT_GREETING
    who = re.sub(r"^(dear|hello|hi)\s+", "", greeting.strip(), flags=re.IGNORECASE)
    who = who.rstrip(" ,:;!.").strip()
    key = re.sub(r"^the\s+", "", _collapse(who))
    if not key or key in _GENERIC_WHO:
        return greeting
    if (recipient and _collapse(recipient) in key) or ctx.job.has_text(who):
        return greeting  # a name / team that is written in the job post
    if company:
        rest = key.replace(_collapse(company), "").strip()
        if rest in _GENERIC_WHO or not rest:
            return greeting  # "Dear Acme Corp Hiring Team,"
    return DEFAULT_GREETING  # an invented person: use the safe default


def _cover_letter(raw, ctx: _Ctx, header_name: str | None,
                  fallback_company: str | None) -> dict:
    c = raw if isinstance(raw, dict) else {}

    recipient = _clean_name(c.get("recipient"))
    if recipient and not ctx.job.has_text(recipient):
        ctx.warn(f'Removed the recipient "{recipient}" because that name is not in the job post.')
        recipient = None

    company = _clean_name(c.get("company"))
    if company and not ctx.job.has_text(company):
        company = None
    company = company or fallback_company

    raw_paragraphs = _pick(c, "paragraphs", "body")
    paragraphs: list[str] = []
    seen: set[str] = set()
    for item in _str_list(raw_paragraphs, separators=r"\n\s*\n"):
        paragraph = _text(item, PARAGRAPH_MAX)
        if paragraph and paragraph.lower() not in seen:
            seen.add(paragraph.lower())
            paragraphs.append(paragraph)
        if len(paragraphs) >= MAX_PARAGRAPHS:
            break

    letter_text = "\n".join(paragraphs)
    hits = mentioned(letter_text, ctx.gaps)
    if hits:
        ctx.warn(f"The cover letter mentions {_join(hits)}, which is not in your resume. "
                 "Please edit it before sending.")
    extra = ctx.unsupported_numbers(letter_text, ctx.letter_numbers)
    if extra:
        ctx.warn(f"The cover letter has a number that is not in your resume ({_join(extra)}). "
                 "Please check it.")

    signature = _clean_name(c.get("signature"))
    if not signature or not ctx.in_source(signature):
        signature = header_name

    return {
        "recipient": recipient,
        "company": company,
        "greeting": _greeting(c.get("greeting"), ctx, recipient, company),
        "paragraphs": paragraphs,
        "closing": _text(_scalar(c.get("closing")), CLOSING_MAX) or DEFAULT_CLOSING,
        "signature": signature,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def split_output(raw) -> tuple[dict, dict]:
    """Find the resume and cover letter objects in the model's JSON (tolerates a wrapper)."""
    if not isinstance(raw, dict):
        return {}, {}
    if not any(k in raw for k in ("resume", "cover_letter")):  # e.g. {"result": {...}}
        inner = [v for v in raw.values()
                 if isinstance(v, dict) and any(k in v for k in ("resume", "cover_letter"))]
        if inner:
            raw = inner[0]
    resume = _pick(raw, "resume", "tailored_resume")
    letter = _pick(raw, "cover_letter", "coverLetter", "letter")
    return (resume if isinstance(resume, dict) else {},
            letter if isinstance(letter, dict) else {})


def validate(raw, *, source_text: str, job_text: str, gaps: list[str],
             fallback_company: str | None = None) -> tuple[dict, dict, list[str]]:
    """Return (resume, cover_letter, warnings), checked against the source text."""
    resume_raw, letter_raw = split_output(raw)
    ctx = _Ctx(source_text, job_text, gaps)

    header = _header(resume_raw.get("header"), ctx)
    resume = {
        "header": header,
        "summary": _summary(resume_raw.get("summary"), ctx),
        "education": _education(resume_raw.get("education"), ctx),
        "experience": _experience(_pick(resume_raw, "experience", "experiences"), ctx),
        "projects": _projects(resume_raw.get("projects"), ctx),
        "skills": _skills(resume_raw.get("skills"), ctx),
    }
    cover_letter = _cover_letter(letter_raw, ctx, header["name"], fallback_company)
    return resume, cover_letter, ctx.warnings


def resume_is_empty(resume: dict) -> bool:
    return not any(resume.get(k) for k in ("education", "experience", "projects", "skills"))


# ---------------------------------------------------------------------------
# Application email
# ---------------------------------------------------------------------------

SUBJECT_MAX = 150
EMAIL_BODY_MAX = 3000
EMAIL_WARNING_PREFIX = "The email"  # every email warning starts with this
EMAIL_EMPTY_WARNING = "The email is empty. Use “Write a new version” in the Tracker."
EMAIL_GREETING_WARNING = ("The email greeting named someone who is not in the job post, "
                          "so it now says “Dear Hiring Manager,”.")
EMAIL_CONTACT_WARNING = ("The email has an email address that is not in your resume. "
                         "Please check it.")

_EMAIL_KEYS = ("email", "application_email", "applicationEmail")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MD_FENCE_RE = re.compile(r"^\s*```.*$", re.MULTILINE)
_MD_HEADING_RE = re.compile(r"^[ \t]{0,3}#{1,6}[ \t]+", re.MULTILINE)
_MD_QUOTE_RE = re.compile(r"^[ \t]*>[ \t]?", re.MULTILINE)
_MD_RULE_RE = re.compile(r"^[ \t]*(?:[-*_][ \t]*){3,}$", re.MULTILINE)
_MD_BULLET_RE = re.compile(r"^[ \t]*[*+•·▪●][ \t]+", re.MULTILINE)
_MD_LINK_RE = re.compile(r"\[([^\]\n]+)\]\(([^)\s]+)\)")
_MD_BOLD_RE = re.compile(r"(\*\*|__)(?=\S)(.+?)(?<=\S)\1")
_MD_STAR_RE = re.compile(r"(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])")
_MD_UNDERSCORE_RE = re.compile(r"(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])")
_MD_CODE_RE = re.compile(r"`([^`\n]*)`")
_SUBJECT_PREFIX_RE = re.compile(r"^\s*(?:subject|re)\s*:\s*", re.IGNORECASE)
_EMAIL_ADDRESS_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_GREETING_RE = re.compile(
    r"^(dear|hello|hi|hey|greetings|good (?:morning|afternoon|day))\b[ \t]*"
    r"([^,:;!\n]*)([,:;!]?)(.*)$", re.IGNORECASE)
_HONORIFIC_RE = re.compile(r"^(?:mr|mrs|ms|miss|mx|dr|prof|professor)\.?\s+", re.IGNORECASE)
_GREETING_FILLER_RE = re.compile(r"^(?:at|of|from)\s+")
_GENERIC_EMAIL_WHO = _GENERIC_WHO | {
    "there", "all", "everyone", "hiring managers", "hiring committee", "recruiters",
    "talent team", "talent acquisition team", "hr team", "human resources team"}


def split_email(raw) -> dict:
    """Find the email object in the model's JSON: {"email": {...}}, a wrapper such as
    {"result": {"email": {...}}}, or a flat {"subject", "body"} answer."""
    if not isinstance(raw, dict):
        return {}
    for candidate in (raw, *(v for v in raw.values() if isinstance(v, dict))):
        value = _pick(candidate, *_EMAIL_KEYS)
        if isinstance(value, dict):
            return value
        if candidate is raw and isinstance(value, str) and re.search(r"\s", value.strip()):
            return {"body": value}  # the body alone (an address is not a body)
    if any(k in raw for k in ("resume", "cover_letter")):
        return {}  # never take the cover letter's "body" for the email
    flat = [raw] + ([v for v in raw.values() if isinstance(v, dict)] if len(raw) == 1 else [])
    return next((c for c in flat if "body" in c or "subject" in c), {})


def strip_markdown(text: str) -> str:
    """Plain text: no headings, bold/italic markers, code ticks, quotes or rules.
    Links become "text (url)"; "*"/"•" list markers become "- "."""
    text = _CONTROL_RE.sub("", text.replace("\r\n", "\n").replace("\r", "\n"))
    text = _MD_FENCE_RE.sub("", text)
    text = _MD_RULE_RE.sub("", text)
    text = _MD_HEADING_RE.sub("", text)
    text = _MD_QUOTE_RE.sub("", text)
    text = _MD_BULLET_RE.sub("- ", text)
    text = _MD_LINK_RE.sub(lambda m: m.group(2) if m.group(1).strip() == m.group(2)
                           else f"{m.group(1)} ({m.group(2)})", text)
    for _ in range(2):  # "***bold italic***"
        text = _MD_BOLD_RE.sub(r"\2", text)
    text = _MD_STAR_RE.sub(r"\1", text)
    text = _MD_UNDERSCORE_RE.sub(r"\1", text)
    return _MD_CODE_RE.sub(r"\1", text)


def _cap(text: str, limit: int) -> str:
    """Cut at a word boundary when possible."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = max(cut.rfind(" "), cut.rfind("\n"))
    return (cut[:space] if space > limit * 0.8 else cut).rstrip()


def _email_subject(value) -> str | None:
    text = _scalar(value)
    if not text:
        return None
    text = re.sub(r"\s+", " ", strip_markdown(text)).strip()
    text = _SUBJECT_PREFIX_RE.sub("", text).strip(" \"'“”‘’")
    if not re.search(r"\w", text):
        return None  # only symbols left
    return _cap(text, SUBJECT_MAX)


def _email_body(value) -> str | None:
    if isinstance(value, list):  # paragraphs as a list
        value = "\n\n".join(v for v in (_scalar(x) for x in value) if v)
    text = _scalar(value)
    if not text:
        return None
    text = strip_markdown(text)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    if lines and _SUBJECT_PREFIX_RE.match(lines[0]) and lines[0].lower().startswith("subject"):
        lines.pop(0)  # the subject repeated inside the body
    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines + [""]:
        if line:
            current.append(line)
        elif current:
            paragraphs.append("\n".join(current))
            current = []
    body = "\n\n".join(paragraphs)
    if not re.search(r"\w", body):
        return None  # only symbols left
    return _cap(body, EMAIL_BODY_MAX)


def default_subject(title: str | None, candidate_name: str | None) -> str:
    head = f"Application for {title}" if title else "Job application"
    return _cap(f"{head} – {candidate_name}" if candidate_name else head, SUBJECT_MAX)


def _greeting_is_safe(who: str, ctx: _Ctx, company: str | None) -> bool:
    """A generic greeting, or a person / team that is written in the job text."""
    key = re.sub(r"^the\s+", "", _collapse(who))
    if not key or key in _GENERIC_EMAIL_WHO:
        return True
    name = _HONORIFIC_RE.sub("", who).strip()
    if ctx.job.has_text(who) or (name and ctx.job.has_text(name)):
        return True
    rest = key
    for generic in sorted(_GENERIC_EMAIL_WHO, key=len, reverse=True):  # "Globex Hiring Team"
        rest = re.sub(rf"(?<![a-z]){re.escape(generic)}(?![a-z])", " ", rest)
    rest = _GREETING_FILLER_RE.sub("", re.sub(r"\s+", " ", rest).strip()).strip()
    if rest == key:
        return False  # no generic word at all: it names someone
    return (not rest or ctx.job.has_text(rest)
            or (company is not None and rest == _collapse(company)))


def _check_greeting(body: str, ctx: _Ctx, company: str | None) -> str:
    first, _, after = body.partition("\n")
    found = _GREETING_RE.match(first)
    if not found:
        return body
    who, punct, rest = found.group(2).strip(" ."), found.group(3), found.group(4).strip()
    if not punct and len(first) > 60:
        return body  # a sentence, not a greeting line
    if _greeting_is_safe(who, ctx, company):
        return body
    ctx.warn(EMAIL_GREETING_WARNING)
    line = DEFAULT_GREETING + (f" {rest}" if rest else "")
    return f"{line}\n{after}" if after else line


def validate_email_draft(raw, *, source_text: str, job_text: str, gaps: list[str],
                         title: str | None = None, company: str | None = None,
                         candidate_name: str | None = None) -> tuple[dict | None, list[str]]:
    """Return ({subject, body} or None when empty, warnings).

    `raw` is the email object from `split_email`. `title` / `company` are the job
    details given to the model; `candidate_name` (already checked) is only used for a
    missing subject.
    """
    e = raw if isinstance(raw, dict) else {}
    ctx = _Ctx(source_text, job_text, gaps)
    body = _email_body(_pick(e, "body", "text", "message", "content"))
    if not body:
        ctx.warn(EMAIL_EMPTY_WARNING)
        return None, ctx.warnings
    subject = _email_subject(_pick(e, "subject", "title")) or default_subject(title,
                                                                             candidate_name)
    body = _check_greeting(body, ctx, company)

    text = f"{subject}\n{body}"
    hits = mentioned(text, ctx.gaps)
    if hits:
        ctx.warn(f"The email mentions {_join(hits)}, which is not in your resume. "
                 "Please edit it before sending.")
    allowed = ctx.letter_numbers | _numbers(title or "") | _numbers(company or "")
    extra = [n for n in ctx.unsupported_numbers(text, allowed)
             if not (len(n) >= 7 and n.isdigit() and n in ctx.src.digits)]  # phone formats
    if extra:
        ctx.warn(f"The email has a number that is not in your resume or the job post "
                 f"({_join(extra)}). Please check it.")
    known = ctx.src.text + "\n" + ctx.job.text
    if any(a.lower() not in known for a in _EMAIL_ADDRESS_RE.findall(body)):
        ctx.warn(EMAIL_CONTACT_WARNING)
    return {"subject": subject, "body": body}, ctx.warnings
