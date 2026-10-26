from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field, StringConstraints, ValidationError, field_validator

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.db.supabase_client import log_activity
from app.services import job_parser
from app.services.ai_providers import resolve_model
from app.services.job_parser import (
    ITEM_MAX, MAX_RESPONSIBILITIES, MAX_SKILLS, SHORT_MAX, SUMMARY_MAX,
)

router = APIRouter(prefix="/jobs", tags=["jobs"])

JOB_TEXT_MIN, JOB_TEXT_MAX = 50, 15_000

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=SHORT_MAX)]
Skill = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Item = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=ITEM_MAX)]


class ParsedJob(BaseModel):
    title: Short | None = None
    company: Short | None = None
    location: Short | None = None
    seniority: Short | None = None
    employment_type: Short | None = None
    summary: Annotated[str, StringConstraints(strip_whitespace=True, max_length=SUMMARY_MAX)] | None = None
    required_skills: list[Skill] = Field(default_factory=list, max_length=MAX_SKILLS)
    nice_to_have_skills: list[Skill] = Field(default_factory=list, max_length=MAX_SKILLS)
    responsibilities: list[Item] = Field(default_factory=list, max_length=MAX_RESPONSIBILITIES)

    @field_validator("title", "company", "location", "seniority", "employment_type", "summary")
    @classmethod
    def _empty_is_none(cls, value: str | None) -> str | None:
        return value or None


class ParseJobIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True,
                                           min_length=JOB_TEXT_MIN, max_length=JOB_TEXT_MAX)]
    model_id: str | None = Field(default=None, max_length=100)  # "<provider>:<model>" from GET /ai/models


class SaveJobIn(BaseModel):
    raw_text: Annotated[str, StringConstraints(strip_whitespace=True,
                                               min_length=JOB_TEXT_MIN, max_length=JOB_TEXT_MAX)]
    title: Short | None = None
    company: Short | None = None
    source_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500,
                                                 pattern=r"^https?://\S+$")] | None = None
    parsed: ParsedJob

    @field_validator("title", "company")
    @classmethod
    def _empty_is_none(cls, value: str | None) -> str | None:
        return value or None


class JobOut(BaseModel):
    id: UUID
    title: str | None = None
    company: str | None = None
    source_url: str | None = None
    parsed: ParsedJob | None = None
    raw_text: str
    created_at: datetime


def _to_out(row: dict) -> JobOut:
    try:
        parsed = ParsedJob.model_validate(row.get("parsed")) if row.get("parsed") else None
    except ValidationError:
        parsed = None  # an old or odd row must not break the whole list
    return JobOut(
        id=row["id"], title=row.get("title"), company=row.get("company"),
        source_url=row.get("source_url"), parsed=parsed,
        raw_text=row["raw_text"], created_at=row["created_at"],
    )


@router.post("/parse", response_model=ParsedJob)
def parse_job(
    body: ParseJobIn,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Read pasted job text with the chosen AI and return a DRAFT. Saves nothing."""
    provider, model = resolve_model(settings, body.model_id)  # 400 / 503
    draft = job_parser.parse_job(body.text, settings, f"{provider}:{model}")  # 429 / 502
    log_activity(user.id, "job.parsed", entity="job", metadata={
        "provider": provider,
        "model": model,
        "required_skills": len(draft["required_skills"]),
        "nice_to_have_skills": len(draft["nice_to_have_skills"]),
        "responsibilities": len(draft["responsibilities"]),
    })
    return ParsedJob(**draft)


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def save_job(body: SaveJobIn, user: CurrentUser = Depends(get_current_user)):
    """Save a reviewed job. Title/company fall back to the parsed values when empty."""
    row = job_parser.save_job(user.id, {
        "raw_text": body.raw_text,
        "title": body.title or body.parsed.title,
        "company": body.company or body.parsed.company,
        "source_url": body.source_url,
        "parsed": body.parsed.model_dump(),
    })
    log_activity(user.id, "job.saved", entity="job", entity_id=str(row["id"]),
                 metadata={"title": row.get("title"), "company": row.get("company")})
    return _to_out(row)


@router.get("", response_model=list[JobOut])
def list_jobs(user: CurrentUser = Depends(get_current_user)):
    """The user's saved jobs, newest first (max 100)."""
    return [_to_out(r) for r in job_parser.list_jobs(user.id)]


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: UUID, user: CurrentUser = Depends(get_current_user)):
    return _to_out(job_parser.get_job(user.id, str(job_id)))


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: UUID, user: CurrentUser = Depends(get_current_user)):
    job_parser.delete_job(user.id, str(job_id))
    log_activity(user.id, "job.deleted", entity="job", entity_id=str(job_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
