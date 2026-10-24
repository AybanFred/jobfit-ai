from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.db.supabase_client import log_activity
from app.services.ai_providers import resolve_model
from app.services.resume_parser import parse_resume
from app.services.resume_text import detect_file_type, extract_text, read_upload

router = APIRouter(prefix="/profile", tags=["profile"])


class PersonalDraft(BaseModel):
    full_name: str | None = None
    headline: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    github: str | None = None
    linkedin: str | None = None
    website: str | None = None
    summary: str | None = None


class ExperienceDraft(BaseModel):
    role: str | None = None
    company: str | None = None
    location: str | None = None
    start_date: str | None = None  # "YYYY-MM"
    end_date: str | None = None  # "YYYY-MM"
    is_current: bool = False
    bullets: list[str] = []


class EducationDraft(BaseModel):
    school: str | None = None
    degree: str | None = None
    honors: str | None = None
    start_year: int | None = None
    end_year: int | None = None


class ProjectDraft(BaseModel):
    name: str | None = None
    description: str | None = None
    tech_stack: list[str] = []
    link: str | None = None


class ResumeDraftOut(BaseModel):
    """A DRAFT only. Nothing is saved; the user reviews it in the app first."""

    personal: PersonalDraft
    experiences: list[ExperienceDraft]
    education: list[EducationDraft]
    projects: list[ProjectDraft]
    skills: list[str]


@router.post("/import-resume", response_model=ResumeDraftOut)
def import_resume(
    file: UploadFile | None = File(None),
    model_id: str | None = Form(None),
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Read a PDF/DOCX resume in memory and return a draft profile. Saves nothing.

    `model_id` (optional, "<provider>:<model>" from GET /ai/models) picks which AI reads
    the resume; if omitted the server default is used.
    """
    provider, model = resolve_model(settings, model_id)  # 400 / 503

    data = read_upload(file)  # 400 / 413
    file_type = detect_file_type(file.filename, data)  # 415
    text = extract_text(data, file_type)  # 422
    draft = parse_resume(text, settings, f"{provider}:{model}")  # 429 / 502

    log_activity(user.id, "resume.parsed", metadata={
        "provider": provider,
        "model": model,
        "experiences": len(draft["experiences"]),
        "education": len(draft["education"]),
        "projects": len(draft["projects"]),
        "skills": len(draft["skills"]),
        "file_type": file_type,
    })
    return ResumeDraftOut(**draft)
