import time

import jwt
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app

SECRET = "test-secret-at-least-32-characters-long"


def _settings():
    return Settings(supabase_url="https://example.supabase.co", supabase_jwt_secret=SECRET)


app.dependency_overrides[get_settings] = _settings
client = TestClient(app)


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_me_requires_token():
    assert client.get("/api/v1/me").status_code == 401


def test_me_rejects_bad_token():
    r = client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


def test_valid_hs256_token_decodes():
    from app.core.auth import decode_supabase_token

    token = jwt.encode(
        {"sub": "user-123", "email": "a@b.com", "aud": "authenticated",
         "exp": int(time.time()) + 60},
        SECRET, algorithm="HS256",
    )
    claims = decode_supabase_token(token, _settings())
    assert claims["sub"] == "user-123"
