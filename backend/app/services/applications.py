"""The application tracker: list, detail, update and delete applications.

An applications row points at one job_posts row. The job's tailored documents
(generated_docs) and skill match (match_results) hang off the same job_post_id.

The admin client bypasses RLS, so EVERY query filters by user_id - also the
related job, match, document and resume rows.

The list avoids N+1 queries: one query for the applications, then one each for
their jobs, matches and documents (ids are sent in batches of `_IN_BATCH` to keep
the request URL short, so up to 200 rows is at most 2 queries per table).

Privacy: notes, job text and document content are never logged or printed.
"""
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.db.supabase_client import get_admin_client
from app.services.documents import remove_job_files

STATUSES = ("saved", "applied", "interview", "offer", "rejected", "ghosted")
DOC_TYPES = ("resume", "cover_letter")
MAX_LIST = 200
MAX_DOCS_PER_JOB = 20
NOTES_MAX = 2000
_IN_BATCH = 100
_DOCS_LIMIT = 1000  # Supabase caps a response at 1000 rows by default
_SHORT_MAX = 200

_APP_COLUMNS = "id, job_post_id, status, applied_at, follow_up_at, notes, created_at, updated_at"
_JOB_LIST_COLUMNS = "id, title, company, source_url, created_at, location:parsed->>location"
_JOB_DETAIL_COLUMNS = "id, title, company, source_url, parsed, raw_text, created_at"
_MATCH_LIST_COLUMNS = "job_post_id, score, gaps, created_at"
_MATCH_DETAIL_COLUMNS = "job_post_id, score, matched, gaps, warnings, created_at"
_DOC_LIST_COLUMNS = "id, job_post_id, type, template, version, created_at"
_DOC_DETAIL_COLUMNS = ("id, job_post_id, type, template, version, created_at, content, "
                       "source_resume_id")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _failed(what: str, exc: Exception) -> HTTPException:
    print(f"[applications] could not {what}: {type(exc).__name__}")  # type only
    return HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not {what}")


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")


def _rows(result) -> list[dict]:
    data = result.data if result is not None else None
    return [r for r in (data or []) if isinstance(r, dict)]


def _one(query) -> dict | None:
    rows = _rows(query.limit(1).execute())
    return rows[0] if rows else None


def _str_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [v.strip() for v in value if isinstance(v, str) and v.strip()]


def _score(value) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if 0 <= number <= 100 else None


def _location(job: dict) -> str | None:
    """From the list alias (parsed->>location) or from the full parsed JSON."""
    value = job.get("location")
    if value is None and isinstance(job.get("parsed"), dict):
        value = job["parsed"].get("location")
    if not isinstance(value, str):
        return None
    return value.strip()[:_SHORT_MAX] or None


def _by_ids(db, table: str, columns: str, id_column: str, user_id: str,
            ids: list[str]) -> list[dict]:
    """Rows of `table` whose `id_column` is in `ids`, newest first, own rows only."""
    rows: list[dict] = []
    for start in range(0, len(ids), _IN_BATCH):
        query = (db.table(table).select(columns).eq("user_id", user_id)
                 .in_(id_column, ids[start:start + _IN_BATCH])
                 .order("created_at", desc=True))
        if table == "generated_docs":
            query = query.order("version", desc=True).limit(_DOCS_LIMIT)
        rows += _rows(query.execute())
    return rows


def _latest_match(rows: list[dict]) -> dict[str, dict]:
    """Newest match per job (rows arrive newest first)."""
    out: dict[str, dict] = {}
    for row in rows:
        out.setdefault(str(row.get("job_post_id")), row)
    return out


def _latest_docs(rows: list[dict]) -> dict[str, dict[str, dict]]:
    """Newest document per job and type (rows arrive newest first)."""
    out: dict[str, dict[str, dict]] = {}
    for row in rows:
        if row.get("type") in DOC_TYPES:
            out.setdefault(str(row.get("job_post_id")), {}).setdefault(row["type"], row)
    return out


def _summary(app: dict, job: dict, match: dict | None, docs: dict[str, dict]) -> dict:
    return {
        "id": app["id"],
        "status": app.get("status"),
        "applied_at": app.get("applied_at"),
        "follow_up_at": app.get("follow_up_at"),
        "notes": app.get("notes"),
        "created_at": app.get("created_at"),
        "updated_at": app.get("updated_at") or app.get("created_at"),
        "job": {
            "id": job["id"],
            "title": job.get("title"),
            "company": job.get("company"),
            "source_url": job.get("source_url"),
            "location": _location(job),
            "created_at": job.get("created_at"),
        },
        "match": None if match is None else {
            "score": _score(match.get("score")),
            "gaps_count": len(_str_list(match.get("gaps"))),
        },
        "documents": [
            {"id": d["id"], "type": d["type"], "template": d.get("template"),
             "created_at": d.get("created_at")}
            for d in (docs.get(t) for t in DOC_TYPES) if d
        ],
    }


def _summaries(db, user_id: str, apps: list[dict]) -> list[dict]:
    """Attach job, match and documents to each application (3 batched queries)."""
    job_ids = list(dict.fromkeys(str(a["job_post_id"]) for a in apps if a.get("job_post_id")))
    if not job_ids:
        return []
    jobs = {str(j["id"]): j
            for j in _by_ids(db, "job_posts", _JOB_LIST_COLUMNS, "id", user_id, job_ids)}
    matches = _latest_match(
        _by_ids(db, "match_results", _MATCH_LIST_COLUMNS, "job_post_id", user_id, job_ids))
    docs = _latest_docs(
        _by_ids(db, "generated_docs", _DOC_LIST_COLUMNS, "job_post_id", user_id, job_ids))
    out: list[dict] = []
    for app in apps:
        job_id = str(app.get("job_post_id"))
        job = jobs.get(job_id)
        if job is None:  # not this user's job (or gone): never show half a row
            continue
        out.append(_summary(app, job, matches.get(job_id), docs.get(job_id, {})))
    return out


def _load_app(db, user_id: str, application_id: str) -> dict:
    app = _one(db.table("applications").select(_APP_COLUMNS)
               .eq("id", application_id).eq("user_id", user_id))
    if app is None:
        raise _not_found()
    return app


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def list_applications(user_id: str, status_filter: str | None = None) -> list[dict]:
    """The user's applications, newest first (max 200), optionally one status."""
    db = get_admin_client()
    try:
        query = db.table("applications").select(_APP_COLUMNS).eq("user_id", user_id)
        if status_filter:
            query = query.eq("status", status_filter)
        apps = _rows(query.order("created_at", desc=True).limit(MAX_LIST).execute())
        return _summaries(db, user_id, apps)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _failed("load your applications", exc) from exc


def get_application(user_id: str, application_id: str) -> dict:
    """One application with its job, full match, latest documents and source resume.

    Document content and parsed job JSON are returned as stored; the route turns
    anything malformed into null.
    """
    db = get_admin_client()
    try:
        app = _load_app(db, user_id, application_id)
        job_id = str(app["job_post_id"])
        job = _one(db.table("job_posts").select(_JOB_DETAIL_COLUMNS)
                   .eq("id", job_id).eq("user_id", user_id))
        if job is None:
            raise _not_found()
        match = _one(db.table("match_results").select(_MATCH_DETAIL_COLUMNS)
                     .eq("job_post_id", job_id).eq("user_id", user_id)
                     .order("created_at", desc=True))
        docs = _latest_docs(_rows(
            db.table("generated_docs").select(_DOC_DETAIL_COLUMNS)
            .eq("job_post_id", job_id).eq("user_id", user_id)
            .order("created_at", desc=True).order("version", desc=True)
            .limit(MAX_DOCS_PER_JOB).execute())).get(job_id, {})
        resume_doc, letter_doc = docs.get("resume"), docs.get("cover_letter")
        source_id = ((resume_doc or {}).get("source_resume_id")
                     or (letter_doc or {}).get("source_resume_id"))
        source = None
        if source_id:
            source = _one(db.table("user_resumes").select("id, file_name")
                          .eq("id", str(source_id)).eq("user_id", user_id))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _failed("load the application", exc) from exc

    summary = _summary(app, job, match, docs)
    return {
        **summary,
        "job": {**summary["job"], "parsed": job.get("parsed"),
                "raw_text": job.get("raw_text") or ""},
        "match": None if match is None else {
            **summary["match"],
            "matched": _str_list(match.get("matched")),
            "gaps": _str_list(match.get("gaps")),
            "warnings": _str_list(match.get("warnings")),
        },
        "resume": _doc_with_content(resume_doc),
        "cover_letter": _doc_with_content(letter_doc),
        "source_resume": None if source is None else {
            "id": source["id"], "file_name": source.get("file_name") or "Resume",
        },
    }


def _doc_with_content(row: dict | None) -> dict | None:
    if row is None:
        return None
    return {"id": row["id"], "template": row.get("template"),
            "created_at": row.get("created_at"), "content": row.get("content")}


def update_application(user_id: str, application_id: str, changes: dict,
                       now: datetime | None = None) -> tuple[dict, dict]:
    """Apply the sent fields. Returns (summary, log metadata).

    When the status moves to "applied" and the application has no applied_at yet
    (and the request did not send one), applied_at is set to now.
    """
    db = get_admin_client()
    try:
        current = _load_app(db, user_id, application_id)
        update = {k: (v.isoformat() if isinstance(v, datetime) else v)
                  for k, v in changes.items()}
        old_status = current.get("status")
        new_status = changes.get("status", old_status)
        if (new_status == "applied" and old_status != "applied"
                and "applied_at" not in changes and not current.get("applied_at")):
            update["applied_at"] = (now or datetime.now(timezone.utc)).isoformat()
        rows = _rows(db.table("applications").update(update)
                     .eq("id", application_id).eq("user_id", user_id).execute())
        if not rows:
            raise _not_found()
        summaries = _summaries(db, user_id, rows)
        if not summaries:
            raise _not_found()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _failed("update the application", exc) from exc

    meta: dict = {"fields": sorted(update)}
    if "status" in changes:
        meta["old_status"], meta["new_status"] = old_status, new_status
    return summaries[0], meta


def delete_application(user_id: str, application_id: str) -> dict:
    """Delete the application by deleting its job (cascade removes the documents,
    match and application), then best-effort remove the exported files."""
    db = get_admin_client()
    try:
        app = _load_app(db, user_id, application_id)
        job_id = str(app["job_post_id"])
        deleted = _rows(db.table("job_posts").delete()
                        .eq("id", job_id).eq("user_id", user_id).execute())
        if not deleted:
            raise _not_found()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _failed("delete the application", exc) from exc
    files_removed = remove_job_files(db, user_id, job_id)
    return {"job_post_id": job_id, "files_removed": files_removed}
