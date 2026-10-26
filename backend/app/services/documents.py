"""Export a tailored document (a generated_docs row) as a Harvard DOCX or PDF.

The file is built from the SAVED JSON content (never new AI output), uploaded to
the PRIVATE bucket "documents" at <user_id>/<job_post_id>/<doc_id>.<docx|pdf>
(upsert, so exporting again replaces the old file) and returned as a short-lived
signed URL that downloads with a friendly file name.

The admin client bypasses RLS and Storage policies, so every query filters by
user_id and every Storage path starts with the user's id.

Privacy: document content, names and company names are never logged or printed.
"""
from datetime import date

from fastapi import HTTPException, status

from app.db.supabase_client import get_admin_client
from app.services import export
from app.services.export.layout import export_file_name, letter_name, resume_name
from app.services.user_resumes import BUCKET, MIME_TYPES

SIGNED_URL_SECONDS = 600
_LIST_LIMIT = 1000

_DAMAGED = "This document is empty or damaged and cannot be exported."
_NOT_DOWNLOADABLE = "Only resumes and cover letters can be downloaded."


def _failed(what: str, exc: Exception) -> HTTPException:
    print(f"[documents] could not {what}: {type(exc).__name__}")  # type only, no details
    return HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not {what}")


def _one(query) -> dict | None:
    result = query.limit(1).execute()
    rows = result.data if result is not None else None
    row = rows[0] if rows else None
    return row if isinstance(row, dict) else None


def job_folder(user_id: str, job_post_id: str) -> str:
    return f"{user_id}/{job_post_id}"


def remove_job_files(db, user_id: str, job_post_id: str) -> int:
    """Best effort: delete every exported file of one job. Returns how many.

    Never raises - the database rows are already gone when this runs.
    """
    folder = job_folder(user_id, job_post_id)
    try:
        bucket = db.storage.from_(BUCKET)
        entries = bucket.list(folder, {"limit": _LIST_LIMIT}) or []
        paths = [f"{folder}/{e['name']}" for e in entries
                 if isinstance(e, dict) and isinstance(e.get("name"), str) and e["name"]]
        if paths:
            bucket.remove(paths)
        return len(paths)
    except Exception as exc:  # noqa: BLE001
        print(f"[documents] could not remove exported files: {type(exc).__name__}")
        return 0


def _load(db, user_id: str, doc_id: str) -> tuple[dict, dict | None, dict | None]:
    """The document, its job (for the company) and, for a cover letter, the same
    job's latest resume header (the sender block)."""
    doc = _one(db.table("generated_docs").select("id, job_post_id, type, content")
               .eq("id", doc_id).eq("user_id", user_id))
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    job_id = str(doc["job_post_id"])
    job = _one(db.table("job_posts").select("id, company")
               .eq("id", job_id).eq("user_id", user_id))
    sender = None
    if doc.get("type") == "cover_letter":
        resume = _one(db.table("generated_docs").select("content")
                      .eq("job_post_id", job_id).eq("user_id", user_id).eq("type", "resume")
                      .order("created_at", desc=True))
        content = (resume or {}).get("content")
        header = content.get("header") if isinstance(content, dict) else None
        sender = header if isinstance(header, dict) else None
    return doc, job, sender


def export_document(user_id: str, doc_id: str, fmt: str, today: date | None = None) -> dict:
    """Build, upload and sign the file. Returns url, file_name, expires_in (+ type
    and size_bytes for the activity log)."""
    db = get_admin_client()
    try:
        doc, job, sender = _load(db, user_id, doc_id)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _failed("export the document", exc) from exc

    doc_type, content = doc.get("type"), doc.get("content")
    if doc_type not in export.DOC_TYPES:  # e.g. the application email
        raise HTTPException(422, _NOT_DOWNLOADABLE)
    if not isinstance(content, dict) or not content:
        raise HTTPException(422, _DAMAGED)

    try:
        data = export.render(doc_type, fmt, content, sender=sender, today=today)
    except Exception as exc:  # noqa: BLE001
        raise _failed("create the file", exc) from exc

    if doc_type == "resume":
        name = resume_name(content)
        company = (job or {}).get("company")
    else:
        name = letter_name(content, sender)
        company = (job or {}).get("company") or content.get("company")
    file_name = export_file_name(doc_type, name, company, fmt)
    path = f"{job_folder(user_id, str(doc['job_post_id']))}/{doc_id}.{fmt}"

    try:
        bucket = db.storage.from_(BUCKET)
        bucket.upload(path, data, {"content-type": MIME_TYPES[fmt], "upsert": "true"})
        signed = bucket.create_signed_url(path, SIGNED_URL_SECONDS, {"download": file_name})
        url = (signed or {}).get("signedUrl") or (signed or {}).get("signedURL")
        if not url:
            raise RuntimeError("no signed URL returned")
    except Exception as exc:  # noqa: BLE001
        raise _failed("export the document", exc) from exc

    return {"url": url, "file_name": file_name, "expires_in": SIGNED_URL_SECONDS,
            "type": doc_type, "size_bytes": len(data)}
