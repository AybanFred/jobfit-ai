from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.api.jobs import JOB_TEXT_MAX, JOB_TEXT_MIN, JobOut, Short
from app.api.jobs import _to_out as job_to_out
from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.db.supabase_client import log_activity
from app.services import tailor as tailor_service
from app.services.ai_providers import resolve_model
from app.services.applications import clean_recruiter_email

router = APIRouter(prefix="/tailor", tags=["tailor"])


# ---- request ---------------------------------------------------------------

class TailorIn(BaseModel):
    job_text: Annotated[str, StringConstraints(strip_whitespace=True,
                                               min_length=JOB_TEXT_MIN, max_length=JOB_TEXT_MAX)]
    source_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500,
                                                 pattern=r"^https?://\S+$")] | None = None
    job_title: Short | None = None  # typed by the user; wins over the AI-detected title
    company: Short | None = None    # typed by the user; wins over the AI-detected company
    # Saved on the application only; never sent to the AI, never logged.
    recruiter_email: str | None = None
    # false = do not ask the AI for the application email at all (email is null).
    write_email: bool = True
    source: Literal["resume", "profile"]
    resume_id: UUID | None = None  # required when source = "resume"
    template: Literal["harvard"] = "harvard"
    model_id: str | None = Field(default=None, max_length=100)  # from GET /ai/models

    @field_validator("source_url", "job_title", "company", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("recruiter_email")
    @classmethod
    def _valid_recruiter_email(cls, value: str | None) -> str | None:
        return clean_recruiter_email(value)  # trimmed; blank -> None; 422 if invalid

    @model_validator(mode="after")
    def _resume_needs_id(self):
        if self.source == "resume" and self.resume_id is None:
            raise ValueError("resume_id is required when source is 'resume'")
        if self.source == "profile":
            self.resume_id = None  # ignored for the Master Profile
        return self


# ---- response --------------------------------------------------------------

class ResumeHeader(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = []


class EducationItem(BaseModel):
    school: str | None = None
    location: str | None = None
    degree: str | None = None
    dates: str | None = None
    details: list[str] = []


class ExperienceItem(BaseModel):
    organization: str | None = None
    location: str | None = None
    title: str | None = None
    dates: str | None = None
    bullets: list[str] = []


class ProjectItem(BaseModel):
    name: str | None = None
    role: str | None = None
    dates: str | None = None
    bullets: list[str] = []


class SkillGroup(BaseModel):
    category: str
    items: list[str] = []


class TailoredResume(BaseModel):
    header: ResumeHeader
    summary: str | None = None
    education: list[EducationItem] = []
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
    skills: list[SkillGroup] = []


class CoverLetter(BaseModel):
    recipient: str | None = None
    company: str | None = None
    greeting: str
    paragraphs: list[str] = []
    closing: str
    signature: str | None = None


class EmailDraft(BaseModel):
    """The application email: plain text, paragraphs separated by a blank line."""
    subject: str
    body: str


class MatchOut(BaseModel):
    score: float  # 0..100, one decimal
    matched: list[str] = []
    gaps: list[str] = []


class TailorOut(BaseModel):
    application_id: UUID
    job: JobOut
    template: Literal["harvard"]
    model: str  # "<provider>:<model>"
    resume: TailoredResume
    cover_letter: CoverLetter
    # null when write_email was false, or when the model wrote no usable email (see warnings)
    email: EmailDraft | None = None
    match: MatchOut
    warnings: list[str] = []


# ---- route -----------------------------------------------------------------

@router.post("", response_model=TailorOut, status_code=status.HTTP_201_CREATED)
def tailor(
    body: TailorIn,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Tailor a resume + cover letter + application email from the user's ORIGINAL
    resume (an uploaded resume or the Master Profile), save everything and add a
    tracker entry (with the optional recruiter email address).

    The AI may only rephrase, reorder and highlight real data; anything it invents is
    removed and reported in `warnings`. Job skills not in the source are `match.gaps`.
    """
    provider, model = resolve_model(settings, body.model_id)  # 400 / 503
    result = tailor_service.tailor(
        user.id, job_text=body.job_text, source_url=body.source_url, source=body.source,
        resume_id=str(body.resume_id) if body.resume_id else None, template=body.template,
        settings=settings, model_id=f"{provider}:{model}",
        job_title=body.job_title, company=body.company,
        recruiter_email=body.recruiter_email, write_email=body.write_email,
    )  # 404 / 422 / 429 / 500 / 502

    resume, match = result["resume"], result["match"]
    log_activity(user.id, "job.tailored", entity="application",
                 entity_id=result["application_id"], metadata={
                     "job_post_id": str(result["job_row"]["id"]),
                     "provider": provider,
                     "model": model,
                     "template": body.template,
                     "source": body.source,
                     "score": match["score"],
                     "matched": len(match["matched"]),
                     "gaps": len(match["gaps"]),
                     "education": len(resume["education"]),
                     "experience": len(resume["experience"]),
                     "projects": len(resume["projects"]),
                     "skills": sum(len(g["items"]) for g in resume["skills"]),
                     "paragraphs": len(result["cover_letter"]["paragraphs"]),
                     "write_email": body.write_email,
                     "has_email": result["email"] is not None,
                     "has_recruiter_email": body.recruiter_email is not None,  # never the address
                     "warnings": len(result["warnings"]),
                     "duration_ms": result["duration_ms"],
                 })
    return TailorOut(
        application_id=result["application_id"],
        job=job_to_out(result["job_row"]),
        template=result["template"],
        model=result["model"],
        resume=TailoredResume(**resume),
        cover_letter=CoverLetter(**result["cover_letter"]),
        email=EmailDraft(**result["email"]) if result["email"] else None,
        match=MatchOut(**match),
        warnings=result["warnings"],
    )
