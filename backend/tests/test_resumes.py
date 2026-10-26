import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app
from app.services.resume_text import MAX_FILE_BYTES
from app.services.user_resumes import safe_file_name
from tests.fake_supabase import FakeSupabase
from tests.test_resume_import import DOCX_MIME, PDF_MIME, RESUME_LINES, blank_pdf, make_docx, make_pdf

SECRET = "test-secret-at-least-32-characters-long"
URL = "/api/v1/resumes"


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


def _auth(sub: str = "user-123"):
    token = jwt.encode(
        {"sub": sub, "email": "a@b.com", "aud": "authenticated", "exp": int(time.time()) + 60},
        SECRET, algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    fake.logged = []
    monkeypatch.setattr("app.services.user_resumes.get_admin_client", lambda: fake)
    monkeypatch.setattr("app.api.resumes.log_activity",
                        lambda *a, **k: fake.logged.append((a, k)))
    return fake


def _upload(data: bytes, name: str = "Jane CV.pdf", mime: str = PDF_MIME, sub: str = "user-123",
            headers=None):
    return client.post(URL, files={"file": (name, data, mime)},
                       headers=_auth(sub) if headers is None else headers)


# ---- POST /resumes ---------------------------------------------------------

def test_upload_pdf_happy_path(db):
    data = make_pdf(RESUME_LINES)
    r = _upload(data)
    assert r.status_code == 201, r.text
    body = r.json()
    assert set(body) == {"id", "file_name", "size_bytes", "created_at"}
    assert body["file_name"] == "Jane CV.pdf"
    assert body["size_bytes"] == len(data)

    row = db.rows("user_resumes")[0]
    assert row["id"] == body["id"] and row["user_id"] == "user-123"
    assert row["file_path"] == f"user-123/originals/{body['id']}.pdf"
    assert row["mime_type"] == PDF_MIME
    assert "Software Engineer at Acme Corp" in row["text_content"]
    assert "text_content" not in body  # the text never goes back to the browser

    stored = db.storage.files[("documents", row["file_path"])]
    assert stored["data"] == data
    assert stored["options"]["content-type"] == PDF_MIME


def test_upload_docx_uses_docx_path_and_mime(db):
    r = _upload(make_docx(RESUME_LINES), name="cv.docx", mime=DOCX_MIME)
    assert r.status_code == 201, r.text
    row = db.rows("user_resumes")[0]
    assert row["file_path"].endswith(f"{r.json()['id']}.docx")
    assert row["mime_type"] == DOCX_MIME


def test_upload_logs_without_file_name_or_text(db):
    r = _upload(make_pdf(RESUME_LINES))
    assert r.status_code == 201
    assert len(db.logged) == 1
    args, kwargs = db.logged[0]
    assert args == ("user-123", "resume.uploaded")
    assert kwargs["entity"] == "resume" and kwargs["entity_id"] == r.json()["id"]
    assert set(kwargs["metadata"]) == {"file_type", "size_bytes"}
    assert "Jane" not in str(db.logged)  # neither the file name nor the resume text


def test_upload_requires_auth(db):
    r = client.post(URL, files={"file": ("cv.pdf", make_pdf(RESUME_LINES), PDF_MIME)})
    assert r.status_code == 401
    assert db.storage.files == {} and db.rows("user_resumes") == []


@pytest.mark.parametrize("data,name,mime,code", [
    (b"hello world", "cv.txt", "text/plain", 415),
    (b"MZ not a pdf", "cv.pdf", PDF_MIME, 415),
    (b"", "cv.pdf", PDF_MIME, 400),
    (b"%PDF-" + b"0" * MAX_FILE_BYTES, "cv.pdf", PDF_MIME, 413),
], ids=["txt", "fake-pdf", "empty", "too-large"])
def test_upload_rejects_bad_files(db, data, name, mime, code):
    assert _upload(data, name=name, mime=mime).status_code == code
    assert db.storage.files == {} and db.rows("user_resumes") == []


def test_upload_without_file_is_400(db):
    assert client.post(URL, headers=_auth()).status_code == 400


def test_unreadable_pdf_is_422_and_not_stored(db):
    r = _upload(blank_pdf())
    assert r.status_code == 422
    assert db.storage.files == {} and db.rows("user_resumes") == []


def test_db_failure_removes_the_uploaded_file(db):
    db.fail_on.add(("user_resumes", "insert"))
    r = _upload(make_pdf(RESUME_LINES))
    assert r.status_code == 500
    assert r.json() == {"detail": "Could not save the resume"}
    assert "secret-key-123" not in r.text
    assert db.storage.files == {}  # cleaned up
    assert len(db.storage.removed) == 1
    bucket, path = db.storage.removed[0]
    assert bucket == "documents" and path.startswith("user-123/originals/")
    assert db.logged == []


def test_storage_failure_is_clean_500_and_saves_no_row(db):
    db.storage.fail_upload = True
    r = _upload(make_pdf(RESUME_LINES))
    assert r.status_code == 500
    assert "secret-key-123" not in r.text
    assert db.rows("user_resumes") == []


def test_safe_file_name():
    assert safe_file_name("C:\\fakepath\\my cv.pdf", "pdf") == "my cv.pdf"
    assert safe_file_name("../../etc/passwd.docx", "docx") == "passwd.docx"
    assert safe_file_name("bad\x00\x1fname.pdf", "pdf") == "badname.pdf"
    assert safe_file_name("", "pdf") == "resume.pdf"
    long_name = safe_file_name("a" * 500 + ".pdf", "pdf")
    assert len(long_name) <= 200 and long_name.endswith(".pdf")


# ---- GET /resumes ----------------------------------------------------------

def test_list_newest_first_only_own_and_max_20(db):
    for i in range(22):
        db.tables.setdefault("user_resumes", []).append({
            "id": str(uuid.uuid4()), "user_id": "user-123", "file_name": f"cv{i}.pdf",
            "size_bytes": 100 + i, "text_content": "secret resume text",
            "file_path": f"user-123/originals/{i}.pdf",
            "created_at": f"2026-01-01T00:00:{i:02d}+00:00",
        })
    db.tables["user_resumes"].append({
        "id": str(uuid.uuid4()), "user_id": "someone-else", "file_name": "theirs.pdf",
        "size_bytes": 1, "text_content": "x", "file_path": "x",
        "created_at": "2026-01-01T00:00:59+00:00",
    })
    r = client.get(URL, headers=_auth())
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 20
    assert body[0]["file_name"] == "cv21.pdf" and body[-1]["file_name"] == "cv2.pdf"
    assert all(set(item) == {"id", "file_name", "size_bytes", "created_at"} for item in body)
    assert "theirs.pdf" not in r.text and "secret resume text" not in r.text


def test_list_after_upload(db):
    _upload(make_pdf(RESUME_LINES), name="first.pdf")
    _upload(make_pdf(RESUME_LINES), name="second.pdf")
    _upload(make_pdf(RESUME_LINES), name="other.pdf", sub="someone-else")
    names = [x["file_name"] for x in client.get(URL, headers=_auth()).json()]
    assert names == ["second.pdf", "first.pdf"]


def test_list_requires_auth(db):
    assert client.get(URL).status_code == 401


def test_list_db_failure_is_clean_500(db):
    db.fail_on.add("user_resumes")
    r = client.get(URL, headers=_auth())
    assert r.status_code == 500
    assert "secret-key-123" not in r.text
