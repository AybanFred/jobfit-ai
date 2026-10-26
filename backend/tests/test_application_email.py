"""Recruiter email on the tracker + POST /applications/{id}/email (write a new version)."""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.config import Settings, get_settings
from app.main import app
from app.services import application_email, tailor, tailor_validator
from tests.fake_supabase import FakeSupabase
from tests.test_applications import (
    OTHER, SECRET, URL, USER, _auth, _get, _patch, add_app, client, ts,
)
from tests.test_tailor import (
    GOOD_EMAIL_BODY, GOOD_SUBJECT, JOB_TEXT, RECRUITER, SOURCE_TEXT, FakeAI, _seed_profile,
    long_address,
)

GOOD_EMAIL = {"subject": GOOD_SUBJECT, "body": GOOD_EMAIL_BODY}
FAILED = "The AI service could not write the email. Please try again."
EMPTY_WARNING = "The email is empty. Use “Write a new version” in the Tracker."


def _settings() -> Settings:
    # Pass everything explicitly: Settings() would otherwise also read backend/.env.
    # Gemini is listed but has no key (-> 503); OpenAI lists nothing (-> 400).
    return Settings(supabase_url="https://example.supabase.co", supabase_jwt_secret=SECRET,
                    groq_api_key="gsk-test", gemini_api_key="", openai_api_key="",
                    groq_models="llama-3.3-70b-versatile,llama-3.1-8b-instant",
                    gemini_models="gemini-2.5-flash", openai_models="")


@pytest.fixture(autouse=True)
def _settings_override():
    previous = app.dependency_overrides.get(get_settings)
    app.dependency_overrides[get_settings] = _settings
    yield
    if previous is None:
        app.dependency_overrides.pop(get_settings, None)
    else:
        app.dependency_overrides[get_settings] = previous


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    for module in ("applications", "application_email", "tailor", "user_resumes", "documents"):
        monkeypatch.setattr(f"app.services.{module}.get_admin_client", lambda: db)
    ai = FakeAI({"email": dict(GOOD_EMAIL)})
    monkeypatch.setattr("app.services.application_email.complete_json", ai)
    logged: list = []
    monkeypatch.setattr("app.api.applications.log_activity",
                        lambda *a, **k: logged.append((a, k)))
    resume_file = str(uuid.uuid4())
    db.tables["user_resumes"] = [{
        "id": resume_file, "user_id": USER, "file_name": "cv.pdf", "text_content": SOURCE_TEXT,
        "file_path": f"{USER}/originals/{resume_file}.pdf", "created_at": ts(0)}]
    ids = add_app(db, source_resume_id=resume_file)
    db.rows("applications")[0]["recruiter_email"] = RECRUITER
    db.rows("job_posts")[0]["raw_text"] = JOB_TEXT
    return SimpleNamespace(db=db, ai=ai, logged=logged, ids=ids, resume_file=resume_file)


def add_email(db, job_id: str, created_at: str, *, user: str = USER,
              content=None) -> str:
    doc_id = str(uuid.uuid4())
    db.tables.setdefault("generated_docs", []).append({
        "id": doc_id, "user_id": user, "job_post_id": job_id, "type": "email",
        "content": {"subject": "Old subject", "body": "Old body"} if content is None else content,
        "template": "harvard", "version": 1, "source_resume_id": None, "created_at": created_at,
    })
    return doc_id


def _write(app_id: str, body=None, sub: str = USER):
    kwargs = {} if body is None else {"json": body}
    return client.post(f"{URL}/{app_id}/email", headers=_auth(sub), **kwargs)


def _email_rows(db) -> list[dict]:
    return [d for d in db.rows("generated_docs") if d["type"] == "email"]


# ---- list / detail -------------------------------------------------------------

def test_summary_has_recruiter_email_and_documents_never_list_the_email(env):
    email_id = add_email(env.db, env.ids.job_id, ts(50))  # newest document of the job
    r = _get()
    assert r.status_code == 200, r.text
    [item] = r.json()
    assert item["recruiter_email"] == RECRUITER
    assert [d["type"] for d in item["documents"]] == ["resume", "cover_letter"]
    assert email_id not in r.text and "Old body" not in r.text
    detail = _get(f"/{env.ids.app_id}").json()
    assert [d["type"] for d in detail["documents"]] == ["resume", "cover_letter"]
    assert detail["recruiter_email"] == RECRUITER


def test_detail_returns_the_latest_own_email(env):
    add_email(env.db, env.ids.job_id, ts(5), content={"subject": "First", "body": "Old."})
    newest = add_email(env.db, env.ids.job_id, ts(9), content=GOOD_EMAIL)
    add_email(env.db, env.ids.job_id, ts(20), user=OTHER,
              content={"subject": "Mallory", "body": "Not yours."})
    r = _get(f"/{env.ids.app_id}")
    assert r.status_code == 200, r.text
    email = r.json()["email"]
    assert email == {"id": newest, "created_at": "2026-03-01T00:09:00Z",
                     "subject": GOOD_SUBJECT, "body": GOOD_EMAIL_BODY}
    assert "Mallory" not in r.text


def test_detail_without_an_email_or_with_a_damaged_one_is_null(env):
    assert _get(f"/{env.ids.app_id}").json()["email"] is None
    add_email(env.db, env.ids.job_id, ts(9), content={"subject": "No body"})
    r = _get(f"/{env.ids.app_id}")
    assert r.status_code == 200 and r.json()["email"] is None
    assert r.json()["resume"] is not None


def test_many_emails_never_hide_the_resume_and_cover_letter(env):
    for i in range(30):
        add_email(env.db, env.ids.job_id, ts(100 + i))
    detail = _get(f"/{env.ids.app_id}").json()
    assert detail["resume"]["id"] == env.ids.resume_id
    assert detail["cover_letter"]["id"] == env.ids.letter_id
    assert detail["email"]["subject"] == "Old subject"
    [item] = _get().json()
    assert [d["type"] for d in item["documents"]] == ["resume", "cover_letter"]


# ---- PATCH recruiter_email ---------------------------------------------------------

def test_patch_recruiter_email_is_trimmed_and_only_the_field_name_is_logged(env):
    r = _patch(env.ids.app_id, {"recruiter_email": "  HR.Team@Globex.example  "})
    assert r.status_code == 200, r.text
    assert r.json()["recruiter_email"] == "HR.Team@Globex.example"
    assert env.db.rows("applications")[0]["recruiter_email"] == "HR.Team@Globex.example"
    [(args, kwargs)] = env.logged
    assert args == (USER, "application.updated")
    assert kwargs["metadata"] == {"fields": ["recruiter_email"]}
    assert "Globex.example" not in str(env.logged) and RECRUITER not in str(env.logged)


@pytest.mark.parametrize("value", ["   ", "", None], ids=["spaces", "empty", "null"])
def test_patch_blank_or_null_recruiter_email_clears_it(env, value):
    r = _patch(env.ids.app_id, {"recruiter_email": value})
    assert r.status_code == 200, r.text
    assert r.json()["recruiter_email"] is None
    assert env.db.rows("applications")[0]["recruiter_email"] is None


def test_patch_recruiter_email_with_other_fields(env):
    r = _patch(env.ids.app_id, {"status": "applied", "recruiter_email": "jobs@globex.example"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "applied"
    assert r.json()["recruiter_email"] == "jobs@globex.example"
    assert env.logged[0][1]["metadata"]["fields"] == ["applied_at", "recruiter_email", "status"]


@pytest.mark.parametrize("value", ["not-an-email", "jane@globex", "a b@globex.com",
                                   long_address(255), 5],
                         ids=["no-at", "no-tld", "space", "255-chars", "number"])
def test_patch_invalid_recruiter_email_is_422(env, value):
    r = _patch(env.ids.app_id, {"recruiter_email": value})
    assert r.status_code == 422
    assert env.db.rows("applications")[0]["recruiter_email"] == RECRUITER
    assert env.logged == []


def test_patch_accepts_a_254_character_address(env):
    address = long_address(254)
    r = _patch(env.ids.app_id, {"recruiter_email": address})
    assert r.status_code == 200 and r.json()["recruiter_email"] == address


# ---- POST /applications/{id}/email -------------------------------------------------

def test_write_email_happy_path(env):
    r = _write(env.ids.app_id, {"model_id": None})
    assert r.status_code == 201, r.text
    body = r.json()
    assert set(body) == {"id", "created_at", "subject", "body", "warnings"}
    assert body["subject"] == GOOD_SUBJECT and body["body"] == GOOD_EMAIL_BODY
    assert body["warnings"] == []

    [row] = _email_rows(env.db)
    assert row["id"] == body["id"] and row["user_id"] == USER
    assert row["job_post_id"] == env.ids.job_id and row["content"] == GOOD_EMAIL
    assert row["template"] == "harvard" and row["model"] == "groq:llama-3.3-70b-versatile"
    assert row["source_resume_id"] == env.resume_file and isinstance(row["duration_ms"], int)

    # ONE AI call, from the original resume, with the saved gaps; never the address.
    [call] = env.ai.calls
    assert call["model_id"] == "groq:llama-3.3-70b-versatile"
    assert call["system"] == tailor.EMAIL_SYSTEM_PROMPT
    assert '"email": {"subject": string, "body": string}' in call["system"]
    user = call["user"]
    assert "Software Engineer, Acme Corp, Lisbon | Jan 2021 - Present" in user
    assert '"missing_never_claim": ["Kubernetes", "Docker"]' in user
    assert '"job_title": "Backend Engineer", "company": "Globex Inc"' in user
    assert "Contact: Ms. Laura Smith." in user  # the job text
    for part in (call["system"], user):
        assert RECRUITER not in part and "globex.example" not in part

    [(args, kwargs)] = env.logged
    assert args == (USER, "doc.generated")
    assert kwargs["entity"] == "document" and kwargs["entity_id"] == body["id"]
    assert kwargs["metadata"] == {
        "type": "email", "application_id": env.ids.app_id, "provider": "groq",
        "model": "llama-3.3-70b-versatile", "warnings": 0, "duration_ms": row["duration_ms"]}
    for private in (RECRUITER, "Jane", "Laura", "Acme", GOOD_SUBJECT):
        assert private not in str(env.logged)


def test_write_email_keeps_older_versions_and_the_detail_shows_the_new_one(env):
    old = add_email(env.db, env.ids.job_id, "2025-12-01T00:00:00+00:00")
    new = _write(env.ids.app_id).json()  # no body at all is fine
    assert {d["id"] for d in _email_rows(env.db)} == {old, new["id"]}
    detail = _get(f"/{env.ids.app_id}").json()
    assert detail["email"]["id"] == new["id"]
    assert detail["email"]["body"] == GOOD_EMAIL_BODY


def test_write_email_uses_the_chosen_model(env):
    r = _write(env.ids.app_id, {"model_id": "groq:llama-3.1-8b-instant"})
    assert r.status_code == 201
    assert env.ai.calls[0]["model_id"] == "groq:llama-3.1-8b-instant"
    assert _email_rows(env.db)[0]["model"] == "groq:llama-3.1-8b-instant"
    assert env.logged[0][1]["metadata"]["model"] == "llama-3.1-8b-instant"


def test_write_email_from_the_master_profile(env):
    ids = add_app(env.db, 1)  # documents made from the Master Profile
    env.db.rows("job_posts")[-1]["raw_text"] = JOB_TEXT
    _seed_profile(env.db)
    r = _write(ids.app_id)
    assert r.status_code == 201, r.text
    user = env.ai.calls[0]["user"]
    assert "Backend: Python" in user and "Initech" not in user  # profile, own rows only
    row = [d for d in _email_rows(env.db) if d["job_post_id"] == ids.job_id][0]
    assert row["source_resume_id"] is None


def test_write_email_with_an_empty_master_profile_is_422(env):
    ids = add_app(env.db, 1)
    env.db.tables["profiles"] = [{"id": USER, "full_name": "Jane Doe", "links": {}}]
    r = _write(ids.app_id)
    assert r.status_code == 422 and "Master Profile is empty" in r.json()["detail"]
    assert env.ai.calls == [] and _email_rows(env.db) == []


def test_write_email_without_a_saved_match_recomputes_the_gaps(env):
    ids = add_app(env.db, 1, match=False, source_resume_id=env.resume_file)
    assert _write(ids.app_id).status_code == 201
    assert '"missing_never_claim": ["Kubernetes", "Docker"]' in env.ai.calls[0]["user"]


def test_write_email_checks_the_output(env):
    env.ai.output = {"email": {
        "subject": "", "body": "Dear John Brown,\n\nI run **Kubernetes** daily.\n\nJane Doe"}}
    r = _write(env.ids.app_id)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["subject"] == "Application for Backend Engineer – Jane Doe"  # default
    assert body["body"] == "Dear Hiring Manager,\n\nI run Kubernetes daily.\n\nJane Doe"
    assert body["warnings"] == [
        tailor_validator.EMAIL_GREETING_WARNING,
        "The email mentions Kubernetes, which is not in your resume. Please edit it before sending.",
    ]
    assert env.logged[0][1]["metadata"]["warnings"] == 2


def test_write_email_replaces_the_old_email_warnings_of_the_match(env):
    env.db.rows("match_results")[0]["warnings"] = [
        "Removed skills that are not in your resume: Terraform.", EMPTY_WARNING]
    env.ai.output = {"email": {"subject": "Hi", "body": "Dear Hiring Manager,\n\nI know Docker."}}
    assert _write(env.ids.app_id).status_code == 201
    expected = ["Removed skills that are not in your resume: Terraform.",
                "The email mentions Docker, which is not in your resume. "
                "Please edit it before sending."]
    assert env.db.rows("match_results")[0]["warnings"] == expected
    assert _get(f"/{env.ids.app_id}").json()["match"]["warnings"] == expected


def test_write_email_warning_update_failure_is_not_fatal(env):
    env.db.fail_on.add(("match_results", "update"))
    env.db.rows("match_results")[0]["warnings"] = [EMPTY_WARNING]
    r = _write(env.ids.app_id)
    assert r.status_code == 201 and len(_email_rows(env.db)) == 1


def test_write_email_requires_auth(env):
    r = client.post(f"{URL}/{env.ids.app_id}/email", json={})
    assert r.status_code == 401
    assert env.ai.calls == [] and _email_rows(env.db) == []


def test_write_email_other_users_or_unknown_is_404(env):
    theirs = add_app(env.db, 2, user=OTHER)
    r = _write(theirs.app_id)
    assert r.status_code == 404 and r.json() == {"detail": "Application not found"}
    assert _write(str(uuid.uuid4())).status_code == 404
    assert _write("not-a-uuid").status_code == 422
    assert env.ai.calls == [] and _email_rows(env.db) == [] and env.logged == []


def test_write_email_never_reads_another_users_source_resume(env):
    theirs = str(uuid.uuid4())
    env.db.tables["user_resumes"].append({
        "id": theirs, "user_id": OTHER, "file_name": "theirs.pdf",
        "text_content": "Mallory, CEO of Initech", "file_path": "x", "created_at": ts(0)})
    ids = add_app(env.db, 3, source_resume_id=theirs)
    r = _write(ids.app_id)
    assert r.status_code == 404 and r.json() == {"detail": "Resume not found"}
    assert env.ai.calls == []


def test_write_email_unknown_model_400_and_unconfigured_provider_503(env):
    assert _write(env.ids.app_id, {"model_id": "evil:model"}).status_code == 400
    assert _write(env.ids.app_id, {"model_id": "gemini:gemini-2.5-flash"}).status_code == 503
    assert _write(env.ids.app_id, {"model_id": "m" * 101}).status_code == 422
    assert env.ai.calls == [] and _email_rows(env.db) == []


@pytest.mark.parametrize("error,output,code,detail", [
    (HTTPException(429, "The AI service is busy right now."), None, 429,
     "The AI service is busy right now."),
    (HTTPException(502, "Groq key was rejected"), None, 502, "Groq key was rejected"),
    (RuntimeError("boom Jane Doe sk-secret"), None, 502, FAILED),
    (None, {"nothing": "useful"}, 502, FAILED),
    (None, {"email": {"subject": "Hi", "body": "  "}}, 502, FAILED),
    (None, ["not", "an", "object"], 502, FAILED),
], ids=["busy", "provider-502", "unexpected", "unusable", "empty-body", "not-a-dict"])
def test_write_email_ai_errors_are_mapped(env, error, output, code, detail):
    env.ai.error = error
    if output is not None:
        env.ai.output = output
    r = _write(env.ids.app_id)
    assert r.status_code == code
    assert r.json() == {"detail": detail}
    assert "Jane" not in r.text and "sk-secret" not in r.text
    assert _email_rows(env.db) == [] and env.logged == []


def test_write_email_save_failure_is_clean_500(env):
    env.db.fail_on.add(("generated_docs", "insert"))
    r = _write(env.ids.app_id)
    assert r.status_code == 500
    assert r.json() == {"detail": "Could not save the email"}
    assert "secret-key-123" not in r.text and env.logged == []


def test_write_email_load_failure_is_clean_500(env):
    env.db.fail_on.add("match_results")
    r = _write(env.ids.app_id)
    assert r.status_code == 500
    assert r.json() == {"detail": "Could not load the application"}
    assert env.ai.calls == []


# ---- only the newest 10 email versions are kept ------------------------------------

def _old(i: int) -> str:
    # Older than anything the fake inserts ("2026-01-01T00:00:NN").
    return f"2025-06-01T{i // 60:02d}:{i % 60:02d}:00+00:00"


def test_write_email_keeps_only_the_newest_ten_versions_of_that_job(env):
    old = [add_email(env.db, env.ids.job_id, _old(i)) for i in range(12)]  # oldest first
    other_job = add_app(env.db, 1)
    other_job_emails = [add_email(env.db, other_job.job_id, _old(i)) for i in range(11)]
    theirs = add_email(env.db, env.ids.job_id, _old(0), user=OTHER)  # a foreign row, same job id

    r = _write(env.ids.app_id)
    assert r.status_code == 201, r.text

    mine = {d["id"] for d in _email_rows(env.db)
            if d["job_post_id"] == env.ids.job_id and d["user_id"] == USER}
    assert len(mine) == application_email.EMAIL_VERSIONS_KEPT == 10
    assert mine == {r.json()["id"], *old[3:]}  # the new one + the 9 newest old ones
    # other jobs, other users and the resume / cover letter are never touched
    ids = {d["id"] for d in env.db.rows("generated_docs")}
    assert set(other_job_emails) <= ids and theirs in ids
    assert {env.ids.resume_id, env.ids.letter_id} <= ids
    [delete] = [c for c in env.db.calls if c[:2] == ("generated_docs", "delete")]
    filters = dict((col, val) for col, val in delete[2] if not isinstance(val, tuple))
    assert filters == {"user_id": USER, "job_post_id": env.ids.job_id, "type": "email"}
    assert _get(f"/{env.ids.app_id}").json()["email"]["id"] == r.json()["id"]


def test_write_email_with_few_versions_removes_nothing(env):
    old = [add_email(env.db, env.ids.job_id, _old(i)) for i in range(9)]
    r = _write(env.ids.app_id)
    assert r.status_code == 201
    assert {d["id"] for d in _email_rows(env.db)} == {r.json()["id"], *old}
    assert not [c for c in env.db.calls if c[:2] == ("generated_docs", "delete")]


def test_write_email_keeps_the_new_version_even_if_its_timestamp_sorts_oldest(env):
    # Clock skew: the fake's insert timestamp sorts OLDER than these seeded rows.
    newer = [add_email(env.db, env.ids.job_id, ts(100 + i)) for i in range(12)]
    r = _write(env.ids.app_id)
    assert r.status_code == 201
    assert {d["id"] for d in _email_rows(env.db)} == {r.json()["id"], *newer[3:]}


def test_write_email_prune_failure_is_not_fatal(env, capsys):
    old = [add_email(env.db, env.ids.job_id, _old(i)) for i in range(12)]
    env.db.fail_on.add(("generated_docs", "delete"))
    r = _write(env.ids.app_id)
    assert r.status_code == 201
    assert len(_email_rows(env.db)) == 13 and set(old) <= {d["id"] for d in _email_rows(env.db)}
    out = capsys.readouterr().out
    assert "could not remove old email versions: RuntimeError" in out
    assert "secret-key-123" not in out and "Jane" not in out


# ---- the original resume was deleted ----------------------------------------------

def _tailored_log(db, app_id: str, source: str, user: str = USER) -> None:
    db.tables.setdefault("activity_logs", []).append({
        "id": len(db.tables["activity_logs"]) + 1, "user_id": user, "action": "job.tailored",
        "entity": "application", "entity_id": app_id, "created_at": ts(0),
        "metadata": {"job_post_id": "x", "source": source, "template": "harvard"},
    })


def _deleted_resume_app(env, log_source: str | None = "resume"):
    """An application whose documents lost their source_resume_id (on delete set null)."""
    ids = add_app(env.db, 1)
    env.db.rows("job_posts")[-1]["raw_text"] = JOB_TEXT
    if log_source:
        _tailored_log(env.db, ids.app_id, log_source)
    return ids


def test_write_email_after_the_resume_was_deleted_uses_the_profile_and_says_so(env):
    ids = _deleted_resume_app(env)
    _seed_profile(env.db)
    r = _write(ids.app_id)
    assert r.status_code == 201, r.text
    warnings = r.json()["warnings"]
    assert warnings[0] == application_email.RESUME_DELETED_WARNING
    assert warnings[0] == ("The email uses your Master Profile because the original resume "
                           "is no longer saved.")
    assert all(w.startswith(tailor_validator.EMAIL_WARNING_PREFIX) for w in warnings)
    assert "Backend: Python" in env.ai.calls[0]["user"]  # the Master Profile text
    match = next(m for m in env.db.rows("match_results") if m["job_post_id"] == ids.job_id)
    assert application_email.RESUME_DELETED_WARNING in match["warnings"]
    assert env.logged[0][1]["metadata"]["warnings"] == len(warnings)


@pytest.mark.parametrize("log_source", ["profile", None], ids=["made-from-profile", "no-log"])
def test_write_email_from_the_profile_never_claims_a_deleted_resume(env, log_source):
    ids = _deleted_resume_app(env, log_source)
    _seed_profile(env.db)
    r = _write(ids.app_id)
    assert r.status_code == 201, r.text
    assert application_email.RESUME_DELETED_WARNING not in r.json()["warnings"]


def test_another_users_log_never_counts(env):
    ids = _deleted_resume_app(env, log_source=None)
    _tailored_log(env.db, ids.app_id, "resume", user=OTHER)
    _seed_profile(env.db)
    r = _write(ids.app_id)
    assert r.status_code == 201
    assert application_email.RESUME_DELETED_WARNING not in r.json()["warnings"]


def test_a_failed_log_lookup_is_not_fatal(env, capsys):
    ids = _deleted_resume_app(env)
    _seed_profile(env.db)
    env.db.fail_on.add("activity_logs")
    r = _write(ids.app_id)
    assert r.status_code == 201, r.text
    assert application_email.RESUME_DELETED_WARNING not in r.json()["warnings"]
    assert "could not read the tailoring log: RuntimeError" in capsys.readouterr().out


def test_the_log_is_not_read_while_the_source_resume_still_exists(env):
    assert _write(env.ids.app_id).status_code == 201
    assert not [c for c in env.db.calls if c[0] == "activity_logs"]


def test_deleted_resume_and_empty_master_profile_is_a_clear_422(env):
    ids = _deleted_resume_app(env)
    env.db.tables["profiles"] = [{"id": USER, "full_name": "Jane Doe", "links": {}}]
    r = _write(ids.app_id)
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "resume this application was made from has been deleted" in detail
    assert "Master Profile is empty" in detail
    assert env.ai.calls == [] and _email_rows(env.db) == []
