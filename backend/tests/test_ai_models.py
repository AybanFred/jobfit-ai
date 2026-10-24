import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app

SECRET = "test-secret-at-least-32-characters-long"
URL = "/api/v1/ai/models"
KEYS = {"groq": "KEY-groq-secret-111", "gemini": "KEY-gemini-secret-222",
        "openai": "KEY-openai-secret-333"}


def _settings(groq="", gemini="", openai="", **over) -> Settings:
    # Explicit values, because Settings() would otherwise also read backend/.env.
    base = dict(supabase_url="https://example.supabase.co", supabase_jwt_secret=SECRET,
                groq_api_key=groq, gemini_api_key=gemini, openai_api_key=openai,
                groq_models="llama-3.3-70b-versatile,llama-3.1-8b-instant",
                gemini_models="gemini-2.5-flash,gemini-2.5-flash-lite",
                openai_models="gpt-4o-mini")
    base.update(over)
    return Settings(**base)


@pytest.fixture
def use_settings():
    previous = app.dependency_overrides.get(get_settings)

    def apply(**kw):
        s = _settings(**kw)
        app.dependency_overrides[get_settings] = lambda: s
    apply()
    yield apply
    if previous is None:
        app.dependency_overrides.pop(get_settings, None)
    else:
        app.dependency_overrides[get_settings] = previous


client = TestClient(app)


def _auth():
    token = jwt.encode({"sub": "user-123", "email": "a@b.com", "aud": "authenticated",
                        "exp": int(time.time()) + 60}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def _get():
    return client.get(URL, headers=_auth())


def test_requires_token(use_settings):
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_lists_all_models_with_exact_fields(use_settings):
    r = _get()
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"default", "models"}
    ids = [m["id"] for m in body["models"]]
    assert ids == ["groq:llama-3.3-70b-versatile", "groq:llama-3.1-8b-instant",
                   "gemini:gemini-2.5-flash", "gemini:gemini-2.5-flash-lite",
                   "openai:gpt-4o-mini"]
    first = body["models"][0]
    assert first == {"id": "groq:llama-3.3-70b-versatile", "provider": "groq",
                     "provider_label": "Groq", "model": "llama-3.3-70b-versatile",
                     "label": "Llama 3.3 70B", "available": False}
    labels = {m["provider"]: m["provider_label"] for m in body["models"]}
    assert labels == {"groq": "Groq", "gemini": "Google Gemini", "openai": "OpenAI"}


def test_none_available_gives_null_default(use_settings):
    body = _get().json()
    assert body["default"] is None
    assert all(m["available"] is False for m in body["models"])


def test_availability_follows_keys_and_default_is_first_available(use_settings):
    use_settings(gemini=KEYS["gemini"], openai=KEYS["openai"])
    body = _get().json()
    avail = {m["id"]: m["available"] for m in body["models"]}
    assert avail["groq:llama-3.3-70b-versatile"] is False
    assert avail["gemini:gemini-2.5-flash"] is True
    assert avail["gemini:gemini-2.5-flash-lite"] is True
    assert avail["openai:gpt-4o-mini"] is True
    assert body["default"] == "gemini:gemini-2.5-flash"  # groq has no key


def test_groq_wins_the_default_when_present(use_settings):
    use_settings(groq=KEYS["groq"], gemini=KEYS["gemini"], openai=KEYS["openai"])
    assert _get().json()["default"] == "groq:llama-3.3-70b-versatile"


def test_only_openai_configured(use_settings):
    use_settings(openai=KEYS["openai"])
    assert _get().json()["default"] == "openai:gpt-4o-mini"


def test_never_contains_key_material(use_settings):
    use_settings(groq=KEYS["groq"], gemini=KEYS["gemini"], openai=KEYS["openai"])
    text = _get().text
    for key in KEYS.values():
        assert key not in text
        assert key[:6] not in text
    assert "api_key" not in text.lower() and "length" not in text.lower()


def test_model_lists_come_from_env_and_unknown_ids_use_raw_name(use_settings):
    use_settings(groq=KEYS["groq"], groq_models=" new-model-9 , llama-3.1-8b-instant,, new-model-9",
                 gemini_models="", openai_models="gpt-4o-mini")
    body = _get().json()
    groq = [m for m in body["models"] if m["provider"] == "groq"]
    assert [m["model"] for m in groq] == ["new-model-9", "llama-3.1-8b-instant"]
    assert groq[0]["label"] == "new-model-9"  # fallback to the raw id
    assert not [m for m in body["models"] if m["provider"] == "gemini"]


def test_health_ai_configured_reflects_any_key(use_settings):
    health = lambda: client.get("/api/v1/health").json()["ai_configured"]  # noqa: E731
    assert health() is False
    use_settings(gemini=KEYS["gemini"])
    assert health() is True
    use_settings(openai=KEYS["openai"])
    assert health() is True
    assert KEYS["openai"] not in client.get("/api/v1/health").text
