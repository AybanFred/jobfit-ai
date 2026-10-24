import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app

SECRET = "test-secret-at-least-32-characters-long"
URL = "/api/v1/skills/custom"


def _settings():
    return Settings(supabase_url="https://example.supabase.co", supabase_jwt_secret=SECRET)


app.dependency_overrides[get_settings] = _settings
client = TestClient(app)


def _auth():
    token = jwt.encode(
        {"sub": "user-123", "email": "a@b.com", "aud": "authenticated",
         "exp": int(time.time()) + 60},
        SECRET, algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


class FakeQuery:
    """Tiny stand-in for the supabase-py query builder on the `skills` table."""

    def __init__(self, db: "FakeDb"):
        self.db = db
        self.mode = "select"
        self.filters: list = []
        self.payload: dict | None = None

    def select(self, *_args):
        self.mode = "select"
        return self

    def eq(self, column, value):
        self.filters.append(lambda r: r.get(column) == value)
        return self

    def contains(self, column, values):
        self.filters.append(lambda r: all(v in r.get(column, []) for v in values))
        return self

    def limit(self, _n):
        return self

    def insert(self, payload):
        self.mode = "insert"
        self.payload = payload
        return self

    def execute(self):
        if self.db.fail:
            raise RuntimeError("db exploded: secret-key-123")
        if self.mode == "insert":
            row = {"id": "new-skill-id", **self.payload}
            self.db.rows.append(row)
            self.db.inserted.append(row)
            return type("R", (), {"data": [row]})()
        found = [r for r in self.db.rows if all(f(r) for f in self.filters)]
        return type("R", (), {"data": found})()


class FakeDb:
    def __init__(self, rows=None, fail=False):
        self.rows = rows or []
        self.fail = fail
        self.inserted: list = []

    def table(self, name):
        assert name == "skills"
        return FakeQuery(self)


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    logged: list = []
    monkeypatch.setattr("app.services.skills.get_admin_client", lambda: fake)
    monkeypatch.setattr("app.api.skills.log_activity",
                        lambda *a, **k: logged.append((a, k)))
    fake.logged = logged
    return fake


def test_creates_new_skill(db):
    r = client.post(URL, json={"name": "  Tailwind   CSS ", "category": "frontend"},
                    headers=_auth())
    assert r.status_code == 200
    body = r.json()
    assert body == {"id": "new-skill-id", "canonical_name": "tailwind css",
                    "display_name": "Tailwind   CSS", "category": "frontend",
                    "created": True}
    assert db.inserted[0]["aliases"] == []
    args, kwargs = db.logged[0]
    assert args == ("user-123", "skill.created")
    assert kwargs["entity"] == "skill" and kwargs["entity_id"] == "new-skill-id"
    assert kwargs["metadata"] == {"name": "Tailwind   CSS"}


def test_existing_skill_is_returned_without_duplicate(db):
    db.rows.append({"id": "abc", "canonical_name": "vue.js", "display_name": "Vue.js",
                    "aliases": ["vue"], "category": "frontend"})
    r = client.post(URL, json={"name": "VUE.JS"}, headers=_auth())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "abc" and body["created"] is False
    assert body["display_name"] == "Vue.js"
    assert db.inserted == [] and db.logged == []


def test_alias_match_returns_existing(db):
    db.rows.append({"id": "abc", "canonical_name": "vue.js", "display_name": "Vue.js",
                    "aliases": ["vue", "vue 3"], "category": "frontend"})
    r = client.post(URL, json={"name": "Vue 3"}, headers=_auth())
    assert r.status_code == 200
    assert r.json()["id"] == "abc" and r.json()["created"] is False
    assert db.inserted == []


@pytest.mark.parametrize("name", ["bad<script>", "drop;table", "emoji \U0001F600", "a%b"])
def test_invalid_characters_rejected(db, name):
    r = client.post(URL, json={"name": name}, headers=_auth())
    assert r.status_code == 422
    assert "letters, digits" in r.text
    assert db.inserted == []


@pytest.mark.parametrize("name", ["", " ", "a", " a ", "x" * 61])
def test_bad_length_rejected(db, name):
    assert client.post(URL, json={"name": name}, headers=_auth()).status_code == 422


def test_category_too_long_rejected(db):
    r = client.post(URL, json={"name": "Rust", "category": "c" * 31}, headers=_auth())
    assert r.status_code == 422


def test_allowed_special_characters(db):
    r = client.post(URL, json={"name": "C++ / C# & .NET_x-y"}, headers=_auth())
    assert r.status_code == 200
    assert r.json()["canonical_name"] == "c++ / c# & .net_x-y"


def test_database_failure_is_clean_500(db):
    db.fail = True
    r = client.post(URL, json={"name": "Rust"}, headers=_auth())
    assert r.status_code == 500
    assert r.json() == {"detail": "Could not save the skill"}
    assert "secret-key-123" not in r.text


def test_requires_token():
    assert client.post(URL, json={"name": "Rust"}).status_code == 401
