"""Write a new version of the application email for one tracked application.

POST /applications/{id}/email makes ONE AI call:
  1. Load the application, its job, the latest resume / cover letter (for the
     source resume id, the template and the candidate's name) and the latest
     match - own rows only (the admin client bypasses RLS).
  2. Load the ORIGINAL source text: the uploaded resume the documents were made
     from (user_resumes.text_content), else the Master Profile text.
  3. Ask the model for {"email": {subject, body}} with the same rules as tailoring.
  4. Check it with tailor_validator.validate_email_draft and save a NEW
     generated_docs row of type "email". Older versions are kept, but only the
     newest EMAIL_VERSIONS_KEPT per job (best effort); the detail screen shows the
     latest one.
  5. Best effort: replace the old email warnings ("The email ...") saved with the
     match by the new ones, so the detail screen does not show stale warnings.

Deleted source resume: deleting an uploaded resume sets source_resume_id to null on
the documents, which looks the same as "made from the Master Profile". The
"job.tailored" activity log of the application tells them apart (its metadata has
"source": "resume" | "profile"). When the resume was deleted, the email is written
from the Master Profile with a warning saying so; when the log is missing, nothing
is claimed.

Privacy: the recruiter email address is never even loaded here, so it cannot
reach the AI. Resume text, job text and model output are never logged.
"""
import time

from fastapi import HTTPException, status

from app.core.config import Settings
from app.db.supabase_client import get_admin_client
from app.services import tailor, tailor_validator
from app.services.ai_providers import complete_json
from app.services.applications import (
    _IN_BATCH, DOC_TYPES, EMAIL_DOC_TYPE, MAX_DOCS_PER_JOB, _not_found, _one, _rows,
    _str_list,
)

EMAIL_VERSIONS_KEPT = 10  # per job; older email versions are removed after a new one
_PRUNE_SCAN = 1000
_SHORT_MAX = 200
_AI_FAILED = "The AI service could not write the email. Please try again."
RESUME_DELETED_WARNING = ("The email uses your Master Profile because the original resume "
                          "is no longer saved.")
_RESUME_DELETED_EMPTY_PROFILE = (
    "The resume this application was made from has been deleted, and your Master Profile "
    "is empty. Add your experience, education or skills to your Master Profile first, "
    "or tailor this job again from another resume."
)


def _ai_failed(exc: Exception) -> HTTPException:
    print(f"[email] AI output unusable: {type(exc).__name__}")  # type only, no details
    return HTTPException(status.HTTP_502_BAD_GATEWAY, _AI_FAILED)


def _db_failed(what: str, exc: Exception) -> HTTPException:
    print(f"[email] could not {what}: {type(exc).__name__}")
    return HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not {what}")


def _short(value) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip()[:_SHORT_MAX] or None


def _load(db, user_id: str, application_id: str) -> dict:
    # Only id + job_post_id: the recruiter address is deliberately not selected.
    app = _one(db.table("applications").select("id, job_post_id")
               .eq("id", application_id).eq("user_id", user_id))
    if app is None:
        raise _not_found()
    job_id = str(app["job_post_id"])
    job = _one(db.table("job_posts").select("id, raw_text, title, company, parsed")
               .eq("id", job_id).eq("user_id", user_id))
    if job is None:
        raise _not_found()
    latest: dict[str, dict] = {}
    for doc in _rows(db.table("generated_docs")
                     .select("id, type, template, content, source_resume_id, created_at")
                     .eq("job_post_id", job_id).eq("user_id", user_id)
                     .in_("type", list(DOC_TYPES)).order("created_at", desc=True)
                     .limit(MAX_DOCS_PER_JOB).execute()):
        latest.setdefault(str(doc.get("type")), doc)
    match = _one(db.table("match_results").select("id, matched, gaps, warnings, created_at")
                 .eq("job_post_id", job_id).eq("user_id", user_id)
                 .order("created_at", desc=True))
    return {"job_id": job_id, "job": job, "resume": latest.get("resume") or {},
            "letter": latest.get("cover_letter") or {}, "match": match}


def _skills(match: dict | None, parsed: dict, source_text: str) -> tuple[list[str], list[str]]:
    """(matched, gaps) from the saved match; recomputed from the parsed job if missing."""
    if match is not None:
        return _str_list(match.get("matched")), _str_list(match.get("gaps"))
    computed = tailor_validator.compute_match({
        "required_skills": _str_list(parsed.get("required_skills")),
        "nice_to_have_skills": _str_list(parsed.get("nice_to_have_skills")),
    }, source_text)
    return computed["matched"], computed["gaps"]


def _candidate_name(resume_doc: dict) -> str | None:
    content = resume_doc.get("content")
    header = content.get("header") if isinstance(content, dict) else None
    return _short(header.get("name")) if isinstance(header, dict) else None


def _resume_was_deleted(db, user_id: str, application_id: str) -> bool:
    """True when the application was tailored from an uploaded resume (per its
    "job.tailored" activity log) that is gone now. Only called when the documents have
    no source_resume_id. Best effort: a missing log or a failed query means False."""
    try:
        log = _one(db.table("activity_logs").select("metadata")
                   .eq("user_id", user_id).eq("action", "job.tailored")
                   .eq("entity_id", application_id).order("created_at", desc=True))
    except Exception as exc:  # noqa: BLE001
        print(f"[email] could not read the tailoring log: {type(exc).__name__}")
        return False
    meta = (log or {}).get("metadata")
    return isinstance(meta, dict) and meta.get("source") == "resume"


def _load_source_text(user_id: str, source_id, resume_deleted: bool) -> str:
    try:
        return tailor.load_source_text(  # 404 / 422 / 500
            user_id, "resume" if source_id else "profile", str(source_id) if source_id else None)
    except HTTPException as exc:
        if resume_deleted and exc.status_code == 422:  # the Master Profile is empty
            raise HTTPException(422, _RESUME_DELETED_EMPTY_PROFILE) from exc
        raise


def _prune_old_emails(db, user_id: str, job_id: str, new_id: str) -> None:
    """Keep the newest EMAIL_VERSIONS_KEPT email rows of this job (the new one always
    stays). Best effort, never raises; never touches resume / cover letter rows."""
    try:
        rows = _rows(db.table("generated_docs").select("id, created_at")
                     .eq("job_post_id", job_id).eq("user_id", user_id)
                     .eq("type", EMAIL_DOC_TYPE).order("created_at", desc=True)
                     .limit(_PRUNE_SCAN).execute())
        others = [str(r["id"]) for r in rows if r.get("id") and str(r["id"]) != new_id]
        old = others[EMAIL_VERSIONS_KEPT - 1:]
        for start in range(0, len(old), _IN_BATCH):
            (db.table("generated_docs").delete()
             .eq("user_id", user_id).eq("job_post_id", job_id).eq("type", EMAIL_DOC_TYPE)
             .in_("id", old[start:start + _IN_BATCH]).execute())
    except Exception as exc:  # noqa: BLE001
        print(f"[email] could not remove old email versions: {type(exc).__name__}")


def _replace_email_warnings(db, user_id: str, match: dict | None, warnings: list[str]) -> None:
    """Best effort, never raises: the new email is already saved."""
    if not match or not match.get("id"):
        return
    old = _str_list(match.get("warnings"))
    kept = [w for w in old if not w.startswith(tailor_validator.EMAIL_WARNING_PREFIX)]
    new = kept + [w for w in warnings if w not in kept]
    if new == old:
        return
    try:
        (db.table("match_results").update({"warnings": new})
         .eq("id", str(match["id"])).eq("user_id", user_id).execute())
    except Exception as exc:  # noqa: BLE001
        print(f"[email] could not update the saved warnings: {type(exc).__name__}")


def write_email(user_id: str, application_id: str, *, settings: Settings,
                model_id: str) -> dict:
    """Write, check and save a new email. `model_id` is an allow-listed
    "<provider>:<model>". Returns id, created_at, subject, body, warnings, duration_ms."""
    db = get_admin_client()
    try:
        loaded = _load(db, user_id, application_id)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _db_failed("load the application", exc) from exc

    job, resume_doc, letter_doc = loaded["job"], loaded["resume"], loaded["letter"]
    source_id = resume_doc.get("source_resume_id") or letter_doc.get("source_resume_id")
    resume_deleted = not source_id and _resume_was_deleted(db, user_id, application_id)
    source_text = _load_source_text(user_id, source_id, resume_deleted)  # 404 / 422 / 500

    parsed = job.get("parsed") if isinstance(job.get("parsed"), dict) else {}
    job_text = job.get("raw_text") if isinstance(job.get("raw_text"), str) else ""
    title = _short(job.get("title")) or _short(parsed.get("title"))
    company = _short(job.get("company")) or _short(parsed.get("company"))
    matched, gaps = _skills(loaded["match"], parsed, source_text)

    started = time.monotonic()
    try:
        raw = complete_json(settings, model_id, tailor.EMAIL_SYSTEM_PROMPT,
                            tailor.build_email_message(job_text, source_text, matched, gaps,
                                                       title, company))
    except HTTPException:
        raise  # already a clean 429 / 502 / 503 from the provider layer
    except Exception as exc:  # noqa: BLE001
        raise _ai_failed(exc) from exc
    duration_ms = int((time.monotonic() - started) * 1000)

    try:
        email, warnings = tailor_validator.validate_email_draft(
            tailor_validator.split_email(raw), source_text=source_text, job_text=job_text,
            gaps=gaps, title=title, company=company,
            candidate_name=_candidate_name(resume_doc))
    except Exception as exc:  # noqa: BLE001 - malformed model output
        raise _ai_failed(exc) from exc
    if email is None:  # this call exists only to write the email
        raise _ai_failed(ValueError("empty email"))
    if resume_deleted:
        warnings = [RESUME_DELETED_WARNING] + warnings

    try:
        result = db.table("generated_docs").insert({
            "user_id": user_id, "job_post_id": loaded["job_id"], "type": EMAIL_DOC_TYPE,
            "content": email, "model": model_id, "duration_ms": duration_ms,
            "template": (resume_doc.get("template") or letter_doc.get("template")
                         or tailor.TEMPLATES[0]),
            "source_resume_id": str(source_id) if source_id else None,
        }).execute()
        rows = _rows(result)
        if not rows:
            raise RuntimeError("insert returned no row")
        row = rows[0]
    except Exception as exc:  # noqa: BLE001
        raise _db_failed("save the email", exc) from exc

    _prune_old_emails(db, user_id, loaded["job_id"], str(row["id"]))
    _replace_email_warnings(db, user_id, loaded["match"], warnings)
    return {"id": row["id"], "created_at": row.get("created_at"), **email,
            "warnings": warnings, "duration_ms": duration_ms}
