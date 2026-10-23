"""Verify the Supabase access token sent by the Ionic app.

The app sends:  Authorization: Bearer <supabase access_token>

Newer Supabase projects sign tokens with asymmetric keys (ES256/RS256),
published at /auth/v1/.well-known/jwks.json. Older projects use HS256
with a shared JWT secret. This module supports both.
"""
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    email: str | None
    token: str


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


def decode_supabase_token(token: str, settings: Settings) -> dict:
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "")
    options = {"require": ["exp", "sub"]}

    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"],
                          audience="authenticated", options=options)

    signing_key = _jwks_client(settings.jwks_url).get_signing_key_from_jwt(token)
    return jwt.decode(token, signing_key.key, algorithms=["ES256", "RS256"],
                      audience="authenticated", options=options)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        claims = decode_supabase_token(creds.credentials, settings)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc
    return CurrentUser(id=claims["sub"], email=claims.get("email"), token=creds.credentials)
