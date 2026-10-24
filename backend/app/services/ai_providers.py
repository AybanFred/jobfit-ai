"""A small multi-provider layer: ask Groq, Google Gemini or OpenAI for a JSON answer.

Plain `httpx` calls only (no provider SDKs). Which models exist is configured in
env (`GROQ_MODELS`, ...). A model is addressed as "<provider>:<model>", for example
"groq:llama-3.3-70b-versatile", and only models on the allow-list are ever called.

Privacy: prompts, answers and keys are never logged or put into error messages.
The server log gets a provider name, a status code and, for 404/429 only, the
provider's short error code and message (never sent to the browser).
"""
import json
import re
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from app.core.config import Settings

REQUEST_TIMEOUT_SECONDS = 60.0

# Order matters: the first available model of the first configured provider is the default.
PROVIDER_ORDER = ("groq", "gemini", "openai")

PROVIDERS: dict[str, dict[str, str]] = {
    "groq": {
        "label": "Groq",
        "key_attr": "groq_api_key",
        "models_attr": "groq_models",
        "url": "https://api.groq.com/openai/v1/chat/completions",
    },
    "gemini": {
        "label": "Google Gemini",
        "key_attr": "gemini_api_key",
        "models_attr": "gemini_models",
        "url": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    },
    "openai": {
        "label": "OpenAI",
        "key_attr": "openai_api_key",
        "models_attr": "openai_models",
        "url": "https://api.openai.com/v1/chat/completions",
    },
}

# Friendly names for known model IDs. Unknown IDs fall back to the raw ID.
MODEL_LABELS: dict[str, str] = {
    "openai/gpt-oss-120b": "GPT-OSS 120B",
    "openai/gpt-oss-20b": "GPT-OSS 20B (fast)",
    "llama-3.3-70b-versatile": "Llama 3.3 70B",
    "llama-3.1-8b-instant": "Llama 3.1 8B (fast)",
    "gemini-3.8-flash": "Gemini 3.8 Flash",
    "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
    "gpt-4o-mini": "GPT-4o mini",
}

BUSY_MESSAGE = "The AI service is busy right now. Please wait a minute and try again."
FAILED_MESSAGE = "The AI service could not read this resume. Please try again."


# ---------------------------------------------------------------------------
# Which models exist, and which are usable
# ---------------------------------------------------------------------------

def provider_key(settings: Settings, provider: str) -> str:
    return getattr(settings, PROVIDERS[provider]["key_attr"], "") or ""


def allowed_models(settings: Settings, provider: str) -> list[str]:
    raw = getattr(settings, PROVIDERS[provider]["models_attr"], "") or ""
    out: list[str] = []
    for item in raw.split(","):
        item = item.strip()
        if item and item not in out:
            out.append(item)
    return out


def list_models(settings: Settings) -> list[dict]:
    """Every allowed model with its availability (is the provider's key set?)."""
    models = []
    for provider in PROVIDER_ORDER:
        available = bool(provider_key(settings, provider))
        for model in allowed_models(settings, provider):
            models.append({
                "id": f"{provider}:{model}",
                "provider": provider,
                "provider_label": PROVIDERS[provider]["label"],
                "model": model,
                "label": MODEL_LABELS.get(model, model),
                "available": available,
            })
    return models


def default_model_id(settings: Settings) -> str | None:
    for m in list_models(settings):
        if m["available"]:
            return m["id"]
    return None


def resolve_model(settings: Settings, model_id: str | None) -> tuple[str, str]:
    """Turn the client's choice (or the default) into a safe (provider, model) pair."""
    model_id = (model_id or "").strip()
    if not model_id:
        model_id = default_model_id(settings) or ""
        if not model_id:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                                "AI is not set up on the server")
    chosen = next((m for m in list_models(settings) if m["id"] == model_id), None)
    if chosen is None:  # allow-list check: never pass an arbitrary client string on
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown AI model")
    if not chosen["available"]:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            f"{chosen['provider_label']} is not set up on the server")
    return chosen["provider"], chosen["model"]


# ---------------------------------------------------------------------------
# Talking to the providers
# ---------------------------------------------------------------------------

def _make_client() -> httpx.Client:
    return httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS)


def _build_request(provider: str, model: str, key: str, system: str, user: str):
    """Return (url, headers, json_body) for one provider."""
    url = PROVIDERS[provider]["url"]
    if provider == "gemini":
        return (
            url.format(model=quote(model, safe="")),
            {"x-goog-api-key": key, "Content-Type": "application/json"},  # key: header only
            {
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {"temperature": 0,
                                     "responseMimeType": "application/json"},
            },
        )
    return (  # groq and openai share the OpenAI chat format
        url,
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        {
            "model": model,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        },
    )


def _answer_text(provider: str, data) -> str | None:
    """Pull the model's text out of the provider's response envelope."""
    try:
        if provider == "gemini":
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
        else:
            text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, AttributeError):
        return None
    return text if isinstance(text, str) and text.strip() else None


def parse_json_object(text: str | None) -> dict | None:
    """Lenient parse: ignore ``` fences and chatter around the outermost {...}."""
    if not text:
        return None
    text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        value = json.loads(text[start:end + 1])
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def _error_info(response: httpx.Response) -> str:
    """Short provider error reason for the SERVER log only (never sent to the browser).

    Only the structured error fields are used, cut to 160 characters.
    """
    try:
        err = response.json().get("error", {})
        if not isinstance(err, dict):
            return ""
        parts = [str(err.get(k)) for k in ("code", "status", "type") if err.get(k)]
        message = str(err.get("message") or "")[:160]
        return f" ({', '.join(parts)}: {message})" if parts or message else ""
    except (ValueError, AttributeError):
        return ""


def _failed(provider: str, reason: str) -> HTTPException:
    print(f"[ai_providers] {provider} call failed: {reason}")  # no bodies, no keys
    return HTTPException(status.HTTP_502_BAD_GATEWAY, FAILED_MESSAGE)


def _call_once(client: httpx.Client, provider: str, model: str, key: str,
               system: str, user: str) -> dict | None:
    """One request. Returns the parsed object, or None if the answer was unusable JSON."""
    url, headers, body = _build_request(provider, model, key, system, user)
    try:
        response = client.post(url, headers=headers, json=body)
    except httpx.HTTPError as exc:  # timeouts, connection errors
        raise _failed(provider, type(exc).__name__) from exc

    code = response.status_code
    if code in (401, 403):
        print(f"[ai_providers] {provider} rejected the key (HTTP {code})")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"{PROVIDERS[provider]['label']} key was rejected. "
            "Please check the key on the server.",
        )
    if code == 429:
        info = _error_info(response)
        print(f"[ai_providers] {provider} rate limited{info}")
        if "insufficient_quota" in info or "billing" in info.lower():
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"{PROVIDERS[provider]['label']} has no credit or quota left on this key. "
                "Please pick another model.",
            )
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, BUSY_MESSAGE)
    if code == 404:
        print(f"[ai_providers] {provider} call failed: HTTP 404{_error_info(response)}")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"{PROVIDERS[provider]['label']} could not find this model. "
            "Please pick another model.",
        )
    if code >= 400:
        raise _failed(provider, f"HTTP {code}")

    try:
        data = response.json()
    except ValueError:
        return None
    return parse_json_object(_answer_text(provider, data))


def complete_json(settings: Settings, model_id: str, system: str, user: str) -> dict:
    """Ask `model_id` ("<provider>:<model>") for a JSON object and return it as a dict.

    Retries once if the answer is not parseable JSON. Raises a clean HTTPException
    (429 / 502 / 503 / 400) otherwise; error text never includes keys or content.
    """
    provider, model = resolve_model(settings, model_id)
    key = provider_key(settings, provider)
    with _make_client() as client:
        for _attempt in range(2):
            result = _call_once(client, provider, model, key, system, user)
            if result is not None:
                return result
    raise _failed(provider, "answer was not valid JSON")
