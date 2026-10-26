from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import (
    BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator,
    model_validator,
)

from app.api.jobs import ParsedJob
from app.api.tailor import CoverLetter, EmailDraft, TailoredResume
from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.db.supabase_client import log_activity
from app.services import application_email
from app.services import applications as service
from app.services.ai_providers import resolve_model

router = APIRouter(prefix="/applications", tags=["applications"])

ApplicationStatus = Literal["saved", "applied", "interview", "offer", "rejected", "ghosted"]
DocType = Literal["resume", "cover_letter"]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=service.NOTES_MAX)]


# ---- response: list ----------------------------------------------------------

class ApplicationJob(BaseModel):
    id: UUID
    title: str | None = None
    company: str | None = None
    source_url: str | None = None
    location: str | None = None  # from the parsed job
    created_at: datetime


class ApplicationMatch(BaseModel):
    score: float | None = None  # 0..100
    gaps_count: int = 0


class ApplicationDocument(BaseModel):
    id: UUID
    type: DocType
    template: str | None = None
    created_at: datetime


class ApplicationSummary(BaseModel):
    id: UUID
    status: ApplicationStatus
    applied_at: datetime | None = None
    follow_up_at: datetime | None = None
    notes: str | None = None
    recruiter_email: str | None = None
    created_at: datetime
    updated_at: datetime
    job: ApplicationJob
    match: ApplicationMatch | None = None
    documents: list[ApplicationDocument] = []  # latest resume + cover letter (never the email)


# ---- response: detail --------------------------------------------------------

class ApplicationJobDetail(ApplicationJob):
    parsed: ParsedJob | None = None
    raw_text: str


class ApplicationMatchDetail(ApplicationMatch):
    matched: list[str] = []
    gaps: list[str] = []
    warnings: list[str] = []


class ResumeDocument(BaseModel):
    id: UUID
    template: str | None = None
    created_at: datetime
    content: TailoredResume


class CoverLetterDocument(BaseModel):
    id: UUID
    template: str | None = None
    created_at: datetime
    content: CoverLetter


class SourceResume(BaseModel):
    id: UUID
    file_name: str


class ApplicationEmail(BaseModel):
    """The latest application email (plain text, paragraphs separated by a blank line)."""
    id: UUID
    created_at: datetime
    subject: str
    body: str


class ApplicationDetail(ApplicationSummary):
    job: ApplicationJobDetail
    match: ApplicationMatchDetail | None = None
    resume: ResumeDocument | None = None
    cover_letter: CoverLetterDocument | None = None
    email: ApplicationEmail | None = None  # the latest version
    source_resume: SourceResume | None = None  # null = made from the Master Profile


class EmailWritten(ApplicationEmail):
    warnings: list[str] = []  # every email warning starts with "The email"


# ---- request -----------------------------------------------------------------

class ApplicationUpdate(BaseModel):
    """Send only the fields to change (at least one). null clears a date, the notes or
    the recruiter email."""
    model_config = ConfigDict(extra="forbid")

    status: ApplicationStatus | None = None
    applied_at: datetime | None = None
    follow_up_at: datetime | None = None
    notes: Notes | None = None
    recruiter_email: str | None = None

    @field_validator("status")
    @classmethod
    def _status_not_null(cls, value):
        if value is None:
            raise ValueError("status cannot be null")
        return value

    @field_validator("applied_at", "follow_up_at")
    @classmethod
    def _naive_is_utc(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @field_validator("notes")
    @classmethod
    def _blank_notes_is_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("recruiter_email")
    @classmethod
    def _valid_recruiter_email(cls, value: str | None) -> str | None:
        return service.clean_recruiter_email(value)  # trimmed; blank -> None; 422 if invalid

    @model_validator(mode="after")
    def _at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Send at least one field to update")
        return self


class WriteEmailIn(BaseModel):
    model_id: str | None = Field(default=None, max_length=100)  # from GET /ai/models


# ---- converters --------------------------------------------------------------

def _valid(model, value):
    """Stored JSON that does not fit the model becomes None (never a 500)."""
    if not isinstance(value, dict):
        return None
    try:
        return model.model_validate(value)
    except ValidationError:
        return None


def _with_content(doc: dict | None, model, wrapper):
    if not doc:
        return None
    content = _valid(model, doc.get("content"))
    return None if content is None else wrapper(**{**doc, "content": content})


def _email_out(doc: dict | None) -> ApplicationEmail | None:
    content = _valid(EmailDraft, (doc or {}).get("content"))
    if content is None or not doc.get("created_at"):
        return None
    return ApplicationEmail(id=doc["id"], created_at=doc["created_at"],
                            subject=content.subject, body=content.body)


def _detail_out(data: dict) -> ApplicationDetail:
    return ApplicationDetail.model_validate({
        **data,
        "job": {**data["job"], "parsed": _valid(ParsedJob, data["job"].get("parsed"))},
        "resume": _with_content(data.get("resume"), TailoredResume, ResumeDocument),
        "cover_letter": _with_content(data.get("cover_letter"), CoverLetter,
                                      CoverLetterDocument),
        "email": _email_out(data.get("email")),
    })


# ---- routes ------------------------------------------------------------------

@router.get("", response_model=list[ApplicationSummary])
def list_applications(
    status_filter: ApplicationStatus | None = Query(default=None, alias="status"),
    user: CurrentUser = Depends(get_current_user),
):
    """The user's applications, newest first (max 200). Optional `?status=applied`."""
    return [ApplicationSummary.model_validate(a)
            for a in service.list_applications(user.id, status_filter)]


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application(application_id: UUID, user: CurrentUser = Depends(get_current_user)):
    """One application with its job, match, latest resume + cover letter, latest
    application email and source resume."""
    return _detail_out(service.get_application(user.id, str(application_id)))


@router.patch("/{application_id}", response_model=ApplicationSummary)
def update_application(
    application_id: UUID,
    body: ApplicationUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Change status, dates, notes or the recruiter email. Moving to "applied" fills
    applied_at if empty."""
    changes = body.model_dump(include=body.model_fields_set)
    summary, meta = service.update_application(user.id, str(application_id), changes)
    log_activity(user.id, "application.updated", entity="application",
                 entity_id=str(application_id), metadata=meta)  # field names + status only
    return ApplicationSummary.model_validate(summary)


@router.post("/{application_id}/email", response_model=EmailWritten,
             status_code=status.HTTP_201_CREATED)
def write_email(
    application_id: UUID,
    body: WriteEmailIn | None = None,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Write a new version of the application email with ONE AI call, from the same
    original resume (or Master Profile) as the documents. The newest 10 versions per
    job are kept; the detail shows the latest. If the original resume was deleted, the
    Master Profile is used and a warning says so. The recruiter address is never sent
    to the AI."""
    provider, model = resolve_model(settings, body.model_id if body else None)  # 400 / 503
    result = application_email.write_email(
        user.id, str(application_id), settings=settings, model_id=f"{provider}:{model}",
    )  # 404 / 422 / 429 / 500 / 502
    log_activity(user.id, "doc.generated", entity="document", entity_id=str(result["id"]),
                 metadata={
                     "type": "email",
                     "application_id": str(application_id),
                     "provider": provider,
                     "model": model,
                     "warnings": len(result["warnings"]),
                     "duration_ms": result["duration_ms"],
                 })
    return EmailWritten(id=result["id"], created_at=result["created_at"],
                        subject=result["subject"], body=result["body"],
                        warnings=result["warnings"])


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: UUID, user: CurrentUser = Depends(get_current_user)):
    """Delete the application with its job, documents, match and exported files."""
    meta = service.delete_application(user.id, str(application_id))
    log_activity(user.id, "application.deleted", entity="application",
                 entity_id=str(application_id), metadata=meta)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
