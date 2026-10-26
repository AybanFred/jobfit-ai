from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import log_activity
from app.services import user_resumes
from app.services.resume_text import detect_file_type, extract_text, read_upload

router = APIRouter(prefix="/resumes", tags=["resumes"])


class ResumeOut(BaseModel):
    id: UUID
    file_name: str
    size_bytes: int | None = None
    created_at: datetime


def _to_out(row: dict) -> ResumeOut:
    return ResumeOut(id=row["id"], file_name=row["file_name"],
                     size_bytes=row.get("size_bytes"), created_at=row["created_at"])


@router.post("", response_model=ResumeOut, status_code=status.HTTP_201_CREATED)
def upload_resume(
    file: UploadFile | None = File(None),
    user: CurrentUser = Depends(get_current_user),
):
    """Save an original resume (PDF/DOCX, max 5 MB) so it can be used for tailoring.

    The text is extracted first, so a file without readable text is never stored.
    """
    data = read_upload(file)  # 400 / 413
    file_type = detect_file_type(file.filename, data)  # 415
    text = extract_text(data, file_type)  # 422
    row = user_resumes.save_resume(user.id, data=data, file_name=file.filename,
                                   file_type=file_type, text=text)  # 500
    log_activity(user.id, "resume.uploaded", entity="resume", entity_id=str(row["id"]),
                 metadata={"file_type": file_type, "size_bytes": len(data)})
    return _to_out(row)


@router.get("", response_model=list[ResumeOut])
def list_resumes(user: CurrentUser = Depends(get_current_user)):
    """The user's uploaded resumes, newest first (max 20)."""
    return [_to_out(r) for r in user_resumes.list_resumes(user.id)]
