import time
import uuid
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app
from tests.fake_supabase import FakeSupabase

SECRET = "test-secret-at-least-32-characters-long"
URL = "/api/v1/applications"
USER = "user-123"
OTHER = "someone-else"

PARSED = {
    "title": "Backend Engineer", "company": "Globex Inc", "location": "Porto, Portugal",
    "seniority": None, "employment_type": "Full-time", "summary": "Design APIs.",
    "required_skills": ["Python", "FastAPI", "Kubernetes"],
    "nice_to_have_skills": ["Docker"], "responsibilities": ["Design APIs"],
}

RESUME = {
    "header": {"name": "Jane Doe", "email": "jane.doe@example.com", "phone": "+1 555 123 4567",
               "location": "Lisbon, Portugal", "links": ["github.com/janedoe"]},
    "summary": "Software engineer who builds REST APIs with Python.",
    "education": [{"school": "University of Lisbon", "location": "Lisbon",
                   "degree": "BSc Computer Science", "dates": "2016 - 2020",
                   "details": ["Dean's List"]}],
    "experience": [{"organization": "Acme Corp", "location": "Lisbon",
                    "title": "Software Engineer", "dates": "Jan 2021 - Present",
                    "bullets": ["Built REST APIs with Python and FastAPI."]}],
    "projects": [{"name": "JobFit AI", "role": None, "dates": None,
                  "bullets": ["Built an app that tailors resumes."]}],
    "skills": [{"category": "Languages", "items": ["Python"]}],
}

LETTER = {
    "recipient": "Laura Smith", "company": "Globex Inc", "greeting": "Dear Ms. Smith,",
    "paragraphs": ["I am applying for the Backend Engineer role.", "Thank you."],
    "closing": "Sincerely,", "signature": "Jane Doe",
}

SUMMARY_KEYS = {"id", "status", "applied_at", "follow_up_at", "notes", "created_at",
                "updated_at", "job", "match", "documents"}
DETAIL_KEYS = SUMMARY_KEYS | {"resume", "cover_letter", "source_resume"}


def _settings() -> Settings:
    # Pass everything explicitly: Settings() would otherwise also read backend/.env.
    return Settings(supabase_url="https://example.supabase.co", supabase_jwt_secret=SECRET,
                    groq_api_key="gsk-test", gemini_api_key="", openai_api_key="",
                    groq_models="llama-3.3-70b-versatile", gemini_models="", openai_models="")


@pytest.fixture(autouse=True)
def _settings_override():
    previous = app.dependency_overrides.get(get_settings)
    app.dependency_overrides[get_settings] = _settings
    yield
    if previous is None:
        app.dependency_overrides.pop(get_settings, None)
    else:
        app.dependency_overrides[get_settings] = previous


client = TestClient(app)


def _auth(sub: str = USER):
    token = jwt.encode(
        {"sub": sub, "email": "a@b.com", "aud": "authenticated", "exp": int(time.time()) + 60},
        SECRET, algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def ts(i: int) -> str:
    """Increasing timestamps that also sort correctly as strings."""
    return f"2026-03-01T{i // 60:02d}:{i % 60:02d}:00+00:00"


def add_app(db, i: int = 0, *, user: str = USER, status: str = "saved", docs: bool = True,
            match: bool = True, source_resume_id: str | None = None,
            applied_at: str | None = None, parsed=PARSED, company: str | None = "Globex Inc",
            resume=RESUME, letter=LETTER) -> SimpleNamespace:
    """Seed one tailored application: job, match, resume + cover letter, application."""
    ids = SimpleNamespace(job_id=str(uuid.uuid4()), app_id=str(uuid.uuid4()),
                          resume_id=None, letter_id=None)
    db.tables.setdefault("job_posts", []).append({
        "id": ids.job_id, "user_id": user, "raw_text": f"Backend Engineer at Globex Inc #{i}",
        "title": "Backend Engineer", "company": company,
        "source_url": "https://globex.example/jobs/7", "parsed": parsed, "created_at": ts(i),
    })
    if match:
        db.tables.setdefault("match_results", []).append({
            "id": str(uuid.uuid4()), "user_id": user, "job_post_id": ids.job_id, "score": 66.7,
            "matched": ["Python", "FastAPI"], "gaps": ["Kubernetes", "Docker"],
            "warnings": ["Removed skills that are not in your resume: Terraform."],
            "created_at": ts(i),
        })
    if docs:
        ids.resume_id, ids.letter_id = str(uuid.uuid4()), str(uuid.uuid4())
        for doc_id, doc_type, content in ((ids.resume_id, "resume", resume),
                                          (ids.letter_id, "cover_letter", letter)):
            db.tables.setdefault("generated_docs", []).append({
                "id": doc_id, "user_id": user, "job_post_id": ids.job_id, "type": doc_type,
                "content": content, "template": "harvard", "version": 1,
                "source_resume_id": source_resume_id, "model": "groq:llama-3.3-70b-versatile",
                "created_at": ts(i),
            })
    db.tables.setdefault("applications", []).append({
        "id": ids.app_id, "user_id": user, "job_post_id": ids.job_id, "status": status,
        "applied_at": applied_at, "follow_up_at": None, "notes": None,
        "created_at": ts(i), "updated_at": ts(i),
    })
    return ids


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    fake.logged = []
    monkeypatch.setattr("app.services.applications.get_admin_client", lambda: fake)
    monkeypatch.setattr("app.services.documents.get_admin_client", lambda: fake)
    monkeypatch.setattr("app.api.applications.log_activity",
                        lambda *a, **k: fake.logged.append((a, k)))
    return fake


def _get(path: str = "", sub: str = USER, **kw):
    return client.get(URL + path, headers=_auth(sub), **kw)


def _patch(app_id: str, body, sub: str = USER):
    return client.patch(f"{URL}/{app_id}", json=body, headers=_auth(sub))


def _delete(app_id: str, sub: str = USER):
    return client.delete(f"{URL}/{app_id}", headers=_auth(sub))


# ---- GET /applications -------------------------------------------------------

def test_list_happy_path_shape(db):
    ids = add_app(db)
    r = _get()
    assert r.status_code == 200, r.text
    [item] = r.json()
    assert set(item) == SUMMARY_KEYS
    assert item["id"] == ids.app_id and item["status"] == "saved"
    assert item["applied_at"] is None and item["notes"] is None
    assert item["job"] == {"id": ids.job_id, "title": "Backend Engineer", "company": "Globex Inc",
                           "source_url": "https://globex.example/jobs/7",
                           "location": "Porto, Portugal", "created_at": "2026-03-01T00:00:00Z"}
    assert item["match"] == {"score": 66.7, "gaps_count": 2}
    assert [(d["id"], d["type"], d["template"]) for d in item["documents"]] == [
        (ids.resume_id, "resume", "harvard"), (ids.letter_id, "cover_letter", "harvard")]
    assert all(set(d) == {"id", "type", "template", "created_at"} for d in item["documents"])
    # The list never sends document content, job text or warnings.
    for private in ("Jane", "Acme", "Backend Engineer at Globex Inc #", "Terraform"):
        assert private not in r.text


def test_list_newest_first_and_only_own(db):
    first, second, third = add_app(db, 1), add_app(db, 2), add_app(db, 3)
    add_app(db, 9, user=OTHER)
    body = _get().json()
    assert [a["id"] for a in body] == [third.app_id, second.app_id, first.app_id]


def test_list_filters_by_status(db):
    add_app(db, 1, status="saved")
    applied = add_app(db, 2, status="applied")
    add_app(db, 3, status="applied", user=OTHER)
    body = _get(params={"status": "applied"}).json()
    assert [a["id"] for a in body] == [applied.app_id]
    assert _get(params={"status": "ghosted"}).json() == []


def test_list_unknown_status_is_422(db):
    assert _get(params={"status": "hired"}).status_code == 422


def test_list_max_200_without_n_plus_1(db):
    for i in range(205):
        add_app(db, i, docs=(i % 2 == 0))
    r = _get()
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 200
    assert body[0]["job"]["created_at"].startswith("2026-03-01T03:24")  # i = 204, newest
    assert body[0]["documents"] and not body[1]["documents"]
    selects = [c for c in db.calls if c[1] == "select"]
    by_table: dict[str, int] = {}
    for table, _mode, _filters in selects:
        by_table[table] = by_table.get(table, 0) + 1
    # 1 query for applications, then batches of 100 ids per related table.
    assert by_table == {"applications": 1, "job_posts": 2, "match_results": 2,
                        "generated_docs": 2}
    assert all((("user_id", USER) in filters) for _t, _m, filters in selects)


def test_list_uses_latest_document_and_match(db):
    ids = add_app(db, 1)
    newer_resume = str(uuid.uuid4())
    db.tables["generated_docs"].append({
        "id": newer_resume, "user_id": USER, "job_post_id": ids.job_id, "type": "resume",
        "content": RESUME, "template": "harvard", "version": 2, "source_resume_id": None,
        "created_at": ts(30),
    })
    db.tables["match_results"].append({
        "id": str(uuid.uuid4()), "user_id": USER, "job_post_id": ids.job_id, "score": 90,
        "matched": [], "gaps": ["Go"], "warnings": [], "created_at": ts(30),
    })
    [item] = _get().json()
    assert [d["id"] for d in item["documents"]] == [newer_resume, ids.letter_id]
    assert item["match"] == {"score": 90.0, "gaps_count": 1}


def test_list_without_match_or_documents(db):
    add_app(db, docs=False, match=False, parsed=None)
    [item] = _get().json()
    assert item["match"] is None and item["documents"] == []
    assert item["job"]["location"] is None


def test_list_ignores_rows_pointing_at_other_users_data(db):
    theirs = add_app(db, 1, user=OTHER)
    # A row of ours that points at someone else's job must not show their job.
    db.tables["applications"].append({
        "id": str(uuid.uuid4()), "user_id": USER, "job_post_id": theirs.job_id,
        "status": "saved", "created_at": ts(5), "updated_at": ts(5)})
    mine = add_app(db, 2, docs=False)
    # Someone else's document attached to our job must not appear either.
    db.tables["generated_docs"].append({
        "id": str(uuid.uuid4()), "user_id": OTHER, "job_post_id": mine.job_id,
        "type": "resume", "content": {}, "template": "harvard", "created_at": ts(9)})
    body = _get().json()
    assert [a["id"] for a in body] == [mine.app_id]
    assert body[0]["documents"] == []


def test_list_requires_auth(db):
    assert client.get(URL).status_code == 401


def test_list_db_failure_is_clean_500(db):
    add_app(db)
    db.fail_on.add("match_results")
    r = _get()
    assert r.status_code == 500
    assert r.json() == {"detail": "Could not load your applications"}
    assert "secret-key-123" not in r.text


# ---- GET /applications/{id} --------------------------------------------------

def test_detail_happy_path(db):
    resume_file = str(uuid.uuid4())
    db.tables["user_resumes"] = [{"id": resume_file, "user_id": USER, "file_name": "Jane CV.pdf",
                                  "text_content": "secret resume text", "file_path": "x",
                                  "created_at": ts(0)}]
    ids = add_app(db, source_resume_id=resume_file)
    r = _get(f"/{ids.app_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == DETAIL_KEYS
    assert body["job"]["parsed"]["required_skills"] == ["Python", "FastAPI", "Kubernetes"]
    assert body["job"]["raw_text"] == "Backend Engineer at Globex Inc #0"
    assert body["job"]["location"] == "Porto, Portugal"
    assert body["match"] == {
        "score": 66.7, "gaps_count": 2, "matched": ["Python", "FastAPI"],
        "gaps": ["Kubernetes", "Docker"],
        "warnings": ["Removed skills that are not in your resume: Terraform."]}
    assert body["resume"]["id"] == ids.resume_id and body["resume"]["template"] == "harvard"
    assert body["resume"]["content"]["header"]["name"] == "Jane Doe"
    assert body["resume"]["content"]["experience"][0]["organization"] == "Acme Corp"
    assert body["cover_letter"]["id"] == ids.letter_id
    assert body["cover_letter"]["content"] == LETTER
    assert body["source_resume"] == {"id": resume_file, "file_name": "Jane CV.pdf"}
    assert len(body["documents"]) == 2
    assert "secret resume text" not in r.text


def test_detail_from_master_profile_has_no_source_resume(db):
    ids = add_app(db)
    assert _get(f"/{ids.app_id}").json()["source_resume"] is None


def test_detail_hides_another_users_source_resume(db):
    theirs = str(uuid.uuid4())
    db.tables["user_resumes"] = [{"id": theirs, "user_id": OTHER, "file_name": "theirs.pdf",
                                  "text_content": "x", "file_path": "x", "created_at": ts(0)}]
    ids = add_app(db, source_resume_id=theirs)
    r = _get(f"/{ids.app_id}")
    assert r.json()["source_resume"] is None and "theirs.pdf" not in r.text


def test_detail_malformed_stored_json_becomes_null(db):
    ids = add_app(db, parsed={"required_skills": "not a list"},
                  resume={"header": "not an object"}, letter={"paragraphs": ["no greeting"]})
    db.tables["match_results"][0].update({"score": "abc", "gaps": "oops", "matched": None,
                                          "warnings": [1, "Kept.", None]})
    r = _get(f"/{ids.app_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job"]["parsed"] is None
    assert body["resume"] is None and body["cover_letter"] is None
    assert body["match"] == {"score": None, "gaps_count": 0, "matched": [], "gaps": [],
                             "warnings": ["Kept."]}
    assert len(body["documents"]) == 2  # the metadata is still listed


def test_detail_other_users_or_unknown_is_404(db):
    theirs = add_app(db, user=OTHER)
    r = _get(f"/{theirs.app_id}")
    assert r.status_code == 404 and r.json() == {"detail": "Application not found"}
    assert _get(f"/{uuid.uuid4()}").status_code == 404


def test_detail_bad_id_is_422(db):
    assert _get("/not-a-uuid").status_code == 422


def test_detail_requires_auth(db):
    ids = add_app(db)
    assert client.get(f"{URL}/{ids.app_id}").status_code == 401


# ---- PATCH /applications/{id} ------------------------------------------------

def test_patch_to_applied_sets_applied_at(db):
    ids = add_app(db)
    r = _patch(ids.app_id, {"status": "applied"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == SUMMARY_KEYS
    assert body["status"] == "applied" and body["applied_at"] is not None
    assert body["job"]["id"] == ids.job_id and len(body["documents"]) == 2
    row = db.rows("applications")[0]
    assert row["status"] == "applied" and row["applied_at"].endswith("+00:00")
    [(args, kwargs)] = db.logged
    assert args == (USER, "application.updated")
    assert kwargs["entity"] == "application" and kwargs["entity_id"] == ids.app_id
    assert kwargs["metadata"] == {"fields": ["applied_at", "status"],
                                  "old_status": "saved", "new_status": "applied"}


def test_patch_to_applied_keeps_an_existing_applied_at(db):
    ids = add_app(db, status="interview", applied_at="2026-02-01T09:00:00+00:00")
    body = _patch(ids.app_id, {"status": "applied"}).json()
    assert body["applied_at"] == "2026-02-01T09:00:00Z"
    assert db.logged[0][1]["metadata"]["fields"] == ["status"]


def test_patch_to_applied_with_explicit_null_keeps_it_empty(db):
    ids = add_app(db)
    body = _patch(ids.app_id, {"status": "applied", "applied_at": None}).json()
    assert body["status"] == "applied" and body["applied_at"] is None


def test_patch_to_applied_with_a_date_uses_that_date(db):
    ids = add_app(db)
    body = _patch(ids.app_id, {"status": "applied",
                               "applied_at": "2026-02-03T08:30:00+01:00"}).json()
    assert body["applied_at"] == "2026-02-03T08:30:00+01:00"


def test_patch_other_status_does_not_touch_applied_at(db):
    ids = add_app(db, status="applied", applied_at="2026-02-01T09:00:00+00:00")
    body = _patch(ids.app_id, {"status": "interview"}).json()
    assert body["status"] == "interview" and body["applied_at"] == "2026-02-01T09:00:00Z"
    assert db.logged[0][1]["metadata"] == {"fields": ["status"], "old_status": "applied",
                                           "new_status": "interview"}


def test_patch_notes_and_follow_up(db):
    ids = add_app(db)
    r = _patch(ids.app_id, {"notes": "  Call Laura on Monday.\nBring portfolio.  ",
                            "follow_up_at": "2026-03-10T09:00:00"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["notes"] == "Call Laura on Monday.\nBring portfolio."
    assert body["follow_up_at"] == "2026-03-10T09:00:00Z"  # no time zone = UTC
    assert body["status"] == "saved" and body["applied_at"] is None
    meta = db.logged[0][1]["metadata"]
    assert meta == {"fields": ["follow_up_at", "notes"]}  # no status keys, no note text
    assert "Laura" not in str(db.logged)


def test_patch_blank_notes_and_null_dates_clear_them(db):
    ids = add_app(db, applied_at="2026-02-01T09:00:00+00:00")
    db.rows("applications")[0]["notes"] = "old note"
    body = _patch(ids.app_id, {"notes": "   ", "applied_at": None}).json()
    assert body["notes"] is None and body["applied_at"] is None


@pytest.mark.parametrize("body", [
    {},
    {"status": None},
    {"status": "hired"},
    {"notes": "x" * 2001},
    {"applied_at": "not a date"},
    {"follow_up_at": 12.5e100},
    {"job_post_id": str(uuid.uuid4())},
    {"status": "applied", "user_id": OTHER},
], ids=["empty", "null-status", "bad-status", "long-notes", "bad-date", "bad-follow-up",
        "unknown-field", "user-id"])
def test_patch_validation_errors_are_422(db, body):
    ids = add_app(db)
    assert _patch(ids.app_id, body).status_code == 422
    assert db.rows("applications")[0]["status"] == "saved" and db.logged == []


def test_patch_accepts_notes_at_the_limit(db):
    ids = add_app(db)
    assert _patch(ids.app_id, {"notes": "x" * 2000}).status_code == 200


def test_patch_other_users_or_unknown_is_404(db):
    theirs = add_app(db, user=OTHER)
    r = _patch(theirs.app_id, {"status": "offer"})
    assert r.status_code == 404
    assert db.rows("applications")[0]["status"] == "saved"
    assert _patch(str(uuid.uuid4()), {"status": "offer"}).status_code == 404
    assert _patch("not-a-uuid", {"status": "offer"}).status_code == 422
    assert db.logged == []


def test_patch_requires_auth(db):
    ids = add_app(db)
    assert client.patch(f"{URL}/{ids.app_id}", json={"status": "offer"}).status_code == 401


def test_patch_db_failure_is_clean_500(db):
    ids = add_app(db)
    db.fail_on.add(("applications", "update"))
    r = _patch(ids.app_id, {"notes": "Jane"})
    assert r.status_code == 500
    assert r.json() == {"detail": "Could not update the application"}
    assert "secret-key-123" not in r.text and db.logged == []


# ---- DELETE /applications/{id} -----------------------------------------------

def test_delete_removes_everything_of_that_job(db):
    ids = add_app(db, 1)
    keep = add_app(db, 2)
    theirs = add_app(db, 3, user=OTHER)
    files = db.storage.files
    for path in (f"{USER}/{ids.job_id}/{ids.resume_id}.pdf",
                 f"{USER}/{ids.job_id}/{ids.letter_id}.docx",
                 f"{USER}/{keep.job_id}/{keep.resume_id}.pdf",
                 f"{USER}/originals/cv.pdf"):
        files[("documents", path)] = {"data": b"x", "options": {}}

    r = _delete(ids.app_id)
    assert r.status_code == 204 and r.content == b""

    assert {j["id"] for j in db.rows("job_posts")} == {keep.job_id, theirs.job_id}
    assert {a["id"] for a in db.rows("applications")} == {keep.app_id, theirs.app_id}
    assert all(d["job_post_id"] != ids.job_id for d in db.rows("generated_docs"))
    assert all(m["job_post_id"] != ids.job_id for m in db.rows("match_results"))
    assert sorted(p for _b, p in files) == sorted([
        f"{USER}/{keep.job_id}/{keep.resume_id}.pdf", f"{USER}/originals/cv.pdf"])
    deletes = [c for c in db.calls if c[:2] == ("job_posts", "delete")]
    assert len(deletes) == 1 and ("user_id", USER) in deletes[0][2]

    [(args, kwargs)] = db.logged
    assert args == (USER, "application.deleted")
    assert kwargs["entity_id"] == ids.app_id
    assert kwargs["metadata"] == {"job_post_id": ids.job_id, "files_removed": 2}


def test_delete_without_exported_files(db):
    ids = add_app(db)
    assert _delete(ids.app_id).status_code == 204
    assert db.storage.removed == []
    assert db.logged[0][1]["metadata"]["files_removed"] == 0


def test_delete_storage_failure_still_deletes_the_rows(db):
    ids = add_app(db)
    db.storage.fail_list = True
    assert _delete(ids.app_id).status_code == 204
    assert db.rows("job_posts") == [] and db.rows("applications") == []


def test_delete_other_users_or_unknown_is_404(db):
    theirs = add_app(db, user=OTHER)
    db.storage.files[("documents", f"{OTHER}/{theirs.job_id}/x.pdf")] = {"data": b"x",
                                                                          "options": {}}
    assert _delete(theirs.app_id).status_code == 404
    assert len(db.rows("job_posts")) == 1 and len(db.storage.files) == 1
    assert _delete(str(uuid.uuid4())).status_code == 404
    assert _delete("not-a-uuid").status_code == 422
    assert db.logged == []


def test_delete_requires_auth(db):
    ids = add_app(db)
    assert client.delete(f"{URL}/{ids.app_id}").status_code == 401
    assert len(db.rows("applications")) == 1


def test_delete_db_failure_is_clean_500(db):
    ids = add_app(db)
    db.fail_on.add(("job_posts", "delete"))
    r = _delete(ids.app_id)
    assert r.status_code == 500
    assert r.json() == {"detail": "Could not delete the application"}
    assert "secret-key-123" not in r.text and db.logged == []


# ---- tailor -> tracker round trip --------------------------------------------

def test_tailored_application_shows_up_in_the_tracker(db, monkeypatch):
    """Rows written by POST /tailor (through the shared fake) are read back correctly."""
    from app.services import tailor as tailor_service

    for module in ("job_parser", "user_resumes", "tailor"):
        monkeypatch.setattr(f"app.services.{module}.get_admin_client", lambda: db)
    job_row = tailor_service.job_parser.save_job(USER, {
        "raw_text": "Backend Engineer at Globex Inc", "title": "Backend Engineer",
        "company": "Globex Inc", "source_url": None, "parsed": PARSED})
    app_id = tailor_service._persist(
        USER, job_row, resume=RESUME, cover_letter=LETTER,
        match={"score": 50.0, "matched": ["Python"], "gaps": ["Go"]},
        warnings=["Removed the project \"X\" because it is not in your resume."],
        template="harvard", model_id="groq:llama-3.3-70b-versatile", duration_ms=5,
        source_resume_id=None)

    [item] = _get().json()
    assert item["id"] == app_id and item["match"] == {"score": 50.0, "gaps_count": 1}
    assert {d["type"] for d in item["documents"]} == {"resume", "cover_letter"}
    detail = _get(f"/{app_id}").json()
    assert detail["match"]["warnings"] == [
        "Removed the project \"X\" because it is not in your resume."]
    assert detail["resume"]["content"]["header"]["name"] == "Jane Doe"
