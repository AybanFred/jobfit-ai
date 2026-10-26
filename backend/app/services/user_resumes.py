"""Saved original resumes (table public.user_resumes + private Storage bucket "documents").

A resume is uploaded once, its text is extracted (see resume_text.py) and stored
with the row, so tailoring can always check the AI output against that exact text.

File path convention: <user_id>/originals/<resume_id>.<pdf|docx>

The admin client bypasses RLS and Storage policies, so every query filters by
user_id and every path starts with the user's id.

Privacy: the file name and the text are never logged.
"""
import re
import uuid

from fastapi import HTTPException, status

from app.db.supabase_client import get_admin_client

BUCKET = "documents"
MAX_LIST_RESUMES = 20
FILE_NAME_MAX = 200

MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_COLUMNS = "id, file_name, size_bytes, created_at"


def _failed(what: str, exc: Exception) -> HTTPException:
    print(f"[resumes] could not {what}: {type(exc).__name__}")  # type only, no details
    return HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not {what}")


def safe_file_name(name: str | None, file_type: str) -> str:
    """Keep only the last path part, drop control characters, cap the length."""
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    if not name:
        return f"resume.{file_type}"
    if len(name) > FILE_NAME_MAX:
        name = f"{name[:FILE_NAME_MAX - len(file_type) - 1].rstrip()}.{file_type}"
    return name


def save_resume(user_id: str, *, data: bytes, file_name: str | None, file_type: str,
                text: str) -> dict:
    """Upload the original file, then save the row. If the row cannot be saved, the
    uploaded file is removed again so no orphan file is left behind."""
    resume_id = str(uuid.uuid4())
    path = f"{user_id}/originals/{resume_id}.{file_type}"
    mime = MIME_TYPES[file_type]
    client = get_admin_client()

    try:
        client.storage.from_(BUCKET).upload(path, data, {"content-type": mime})
    except Exception as exc:  # noqa: BLE001
        raise _failed("save the resume", exc) from exc

    try:
        result = client.table("user_resumes").insert({
            "id": resume_id,
            "user_id": user_id,
            "file_path": path,
            "file_name": safe_file_name(file_name, file_type),
            "mime_type": mime,
            "size_bytes": len(data),
            "text_content": text,
        }).execute()
        row = result.data[0] if result is not None and result.data else None
        if not row:
            raise RuntimeError("insert returned no row")
    except Exception as exc:  # noqa: BLE001
        try:
            client.storage.from_(BUCKET).remove([path])
        except Exception as cleanup_exc:  # noqa: BLE001
            print(f"[resumes] could not remove the uploaded file: {type(cleanup_exc).__name__}")
        raise _failed("save the resume", exc) from exc
    return row


def list_resumes(user_id: str) -> list[dict]:
    try:
        result = (get_admin_client().table("user_resumes").select(_COLUMNS)
                  .eq("user_id", user_id).order("created_at", desc=True)
                  .limit(MAX_LIST_RESUMES).execute())
        return list(result.data or []) if result is not None else []
    except Exception as exc:  # noqa: BLE001
        raise _failed("load your resumes", exc) from exc


def get_resume_text(user_id: str, resume_id: str) -> str:
    """The extracted text of one of the user's resumes. 404 if it is not theirs."""
    try:
        result = (get_admin_client().table("user_resumes").select("id, text_content")
                  .eq("id", resume_id).eq("user_id", user_id).limit(1).execute())
        rows = result.data if result is not None else None
    except Exception as exc:  # noqa: BLE001
        raise _failed("load the resume", exc) from exc
    if not rows or not (rows[0].get("text_content") or "").strip():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found")
    return rows[0]["text_content"]
