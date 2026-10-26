from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import (
    BaseModel, ConfigDict, StringConstraints, ValidationError, field_validator, model_validator,
)

from app.api.jobs import ParsedJob
from app.api.tailor import CoverLetter, TailoredResume
from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import log_activity
from app.services import applications as service

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
    created_at: datetime
    updated_at: datetime
    job: ApplicationJob
    match: ApplicationMatch | None = None
    documents: list[ApplicationDocument] = []  # latest version per type


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


class ApplicationDetail(ApplicationSummary):
    job: ApplicationJobDetail
    match: ApplicationMatchDetail | None = None
    resume: ResumeDocument | None = None
    cover_letter: CoverLetterDocument | None = None
    source_resume: SourceResume | None = None  # null = made from the Master Profile


# ---- request -----------------------------------------------------------------

class ApplicationUpdate(BaseModel):
    """Send only the fields to change (at least one). null clears a date or the notes."""
    model_config = ConfigDict(extra="forbid")

    status: ApplicationStatus | None = None
    applied_at: datetime | None = None
    follow_up_at: datetime | None = None
    notes: Notes | None = None

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

    @model_validator(mode="after")
    def _at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Send at least one field to update")
        return self


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


def _detail_out(data: dict) -> ApplicationDetail:
    return ApplicationDetail.model_validate({
        **data,
        "job": {**data["job"], "parsed": _valid(ParsedJob, data["job"].get("parsed"))},
        "resume": _with_content(data.get("resume"), TailoredResume, ResumeDocument),
        "cover_letter": _with_content(data.get("cover_letter"), CoverLetter,
                                      CoverLetterDocument),
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
    """One application with its job, match, latest resume + cover letter and source resume."""
    return _detail_out(service.get_application(user.id, str(application_id)))


@router.patch("/{application_id}", response_model=ApplicationSummary)
def update_application(
    application_id: UUID,
    body: ApplicationUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Change status, dates or notes. Moving to "applied" fills applied_at if empty."""
    changes = body.model_dump(include=body.model_fields_set)
    summary, meta = service.update_application(user.id, str(application_id), changes)
    log_activity(user.id, "application.updated", entity="application",
                 entity_id=str(application_id), metadata=meta)  # field names + status only
    return ApplicationSummary.model_validate(summary)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: UUID, user: CurrentUser = Depends(get_current_user)):
    """Delete the application with its job, documents, match and exported files."""
    meta = service.delete_application(user.id, str(application_id))
    log_activity(user.id, "application.deleted", entity="application",
                 entity_id=str(application_id), metadata=meta)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
