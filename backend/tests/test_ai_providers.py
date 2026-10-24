"""Provider layer: URL, headers and body per provider, lenient JSON, retry once."""
import json

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.services import ai_providers
from app.services.ai_providers import complete_json, parse_json_object

KEYS = {"groq": "KEY-groq-111", "gemini": "KEY-gemini-222", "openai": "KEY-openai-333"}
GOOD = {"personal": {}, "skills": ["Python"]}


def _settings(**over) -> Settings:
    base = dict(groq_api_key=KEYS["groq"], gemini_api_key=KEYS["gemini"],
                openai_api_key=KEYS["openai"],
                groq_models="llama-3.3-70b-versatile,llama-3.1-8b-instant",
                gemini_models="gemini-2.5-flash,gemini-2.5-flash-lite",
                openai_models="gpt-4o-mini")
    base.update(over)
    return Settings(**base)


class Recorder:
    """Mock transport that records requests and replays a list of canned responses."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def handler(self, request):
        self.requests.append(request)
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, Exception):
            raise item
        return item


def _openai_reply(text: str, code: int = 200) -> httpx.Response:
    return httpx.Response(code, json={"choices": [{"message": {"content": text}}]})


def _gemini_reply(text: str) -> httpx.Response:
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


@pytest.fixture
def rec(monkeypatch):
    def install(responses):
        r = Recorder(responses)
        monkeypatch.setattr(ai_providers, "_make_client",
                            lambda: httpx.Client(transport=httpx.MockTransport(r.handler)))
        return r
    return install


# ---- request building -------------------------------------------------------

@pytest.mark.parametrize("provider,model,url", [
    ("groq", "llama-3.3-70b-versatile", "https://api.groq.com/openai/v1/chat/completions"),
    ("openai", "gpt-4o-mini", "https://api.openai.com/v1/chat/completions"),
])
def test_openai_style_request(rec, provider, model, url):
    r = rec([_openai_reply(json.dumps(GOOD))])
    out = complete_json(_settings(), f"{provider}:{model}", "Return JSON.", "hello")
    assert out == GOOD
    req = r.requests[0]
    assert req.method == "POST" and str(req.url) == url
    assert req.headers["authorization"] == f"Bearer {KEYS[provider]}"
    body = json.loads(req.content)
    assert body["model"] == model
    assert body["temperature"] == 0
    assert body["response_format"] == {"type": "json_object"}
    assert body["messages"] == [{"role": "system", "content": "Return JSON."},
                                {"role": "user", "content": "hello"}]


def test_gemini_request_key_only_in_header(rec):
    r = rec([_gemini_reply(json.dumps(GOOD))])
    out = complete_json(_settings(), "gemini:gemini-2.5-flash", "Return JSON.", "hello")
    assert out == GOOD
    req = r.requests[0]
    assert str(req.url) == ("https://generativelanguage.googleapis.com/v1beta/models/"
                            "gemini-2.5-flash:generateContent")
    assert req.url.query == b""
    assert KEYS["gemini"] not in str(req.url)
    assert req.headers["x-goog-api-key"] == KEYS["gemini"]
    assert "authorization" not in req.headers
    body = json.loads(req.content)
    assert body["system_instruction"] == {"parts": [{"text": "Return JSON."}]}
    assert body["contents"] == [{"role": "user", "parts": [{"text": "hello"}]}]
    assert body["generationConfig"] == {"temperature": 0, "responseMimeType": "application/json"}
    assert KEYS["gemini"] not in req.content.decode()


def test_only_the_chosen_providers_key_is_sent(rec):
    r = rec([_openai_reply(json.dumps(GOOD))])
    complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x")
    sent = str(r.requests[0].headers) + r.requests[0].content.decode()
    assert KEYS["gemini"] not in sent and KEYS["openai"] not in sent


def test_model_not_on_allow_list_never_reaches_the_network(rec):
    r = rec([_openai_reply("{}")])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "groq:evil-model", "JSON", "x")
    assert e.value.status_code == 400
    assert r.requests == []


def test_provider_without_key_never_reaches_the_network(rec):
    r = rec([_openai_reply("{}")])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(openai_api_key=""), "openai:gpt-4o-mini", "JSON", "x")
    assert e.value.status_code == 503 and e.value.detail == "OpenAI is not set up on the server"
    assert r.requests == []


# ---- lenient JSON + retry ---------------------------------------------------

@pytest.mark.parametrize("text", [
    json.dumps(GOOD),
    "```json\n" + json.dumps(GOOD) + "\n```",
    "```\n" + json.dumps(GOOD) + "\n```",
    "Sure! Here is the JSON:\n" + json.dumps(GOOD) + "\nHope that helps.",
])
def test_parse_json_object_accepts_fences_and_chatter(text):
    assert parse_json_object(text) == GOOD


@pytest.mark.parametrize("text", [None, "", "no json here", "{broken", "[1, 2]", '{"a": }'])
def test_parse_json_object_rejects_garbage(text):
    assert parse_json_object(text) is None


def test_garbled_first_answer_is_retried_once(rec):
    r = rec([_openai_reply("not json at all"), _openai_reply(json.dumps(GOOD))])
    assert complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x") == GOOD
    assert len(r.requests) == 2


def test_two_garbled_answers_raise_502_after_exactly_two_calls(rec):
    r = rec([_openai_reply("nope")])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x")
    assert e.value.status_code == 502
    assert len(r.requests) == 2


def test_unexpected_envelope_counts_as_bad_answer(rec):
    r = rec([httpx.Response(200, json={"weird": True})])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x")
    assert e.value.status_code == 502 and len(r.requests) == 2


def test_http_errors_are_not_retried(rec):
    r = rec([httpx.Response(500, text="boom")])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x")
    assert e.value.status_code == 502 and len(r.requests) == 1


def test_error_messages_never_contain_keys_or_bodies(rec):
    for code, expected in [(401, 502), (403, 502), (429, 429), (500, 502)]:
        rec([httpx.Response(code, text=f"echo {KEYS['groq']} secret-resume-text")])
        with pytest.raises(HTTPException) as e:
            complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x")
        assert e.value.status_code == expected
        assert KEYS["groq"] not in e.value.detail and "secret-resume" not in e.value.detail


# ---- model not found / no quota ----------------------------------------------

def test_404_says_the_model_was_not_found_and_logs_the_reason(rec, capsys):
    rec([httpx.Response(404, json={"error": {"code": "model_not_found",
                                             "message": "The model `x` does not exist"}})])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x")
    assert e.value.status_code == 502
    assert "could not find this model" in e.value.detail and "Groq" in e.value.detail
    assert "model_not_found" in capsys.readouterr().out  # server log only


def test_404_detail_never_contains_provider_body_or_key(rec):
    rec([httpx.Response(404, json={"error": {"message": f"echo {KEYS['gemini']} resume-secret"}})])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "gemini:gemini-2.5-flash", "JSON", "x")
    assert KEYS["gemini"] not in e.value.detail and "resume-secret" not in e.value.detail


def test_429_insufficient_quota_gets_its_own_message(rec):
    rec([httpx.Response(429, json={"error": {"code": "insufficient_quota",
                                             "message": "You exceeded your current quota"}})])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "openai:gpt-4o-mini", "JSON", "x")
    assert e.value.status_code == 429
    assert "no credit or quota" in e.value.detail and "OpenAI" in e.value.detail


def test_plain_429_still_says_busy(rec):
    rec([httpx.Response(429, json={"error": {"code": "rate_limit_exceeded"}})])
    with pytest.raises(HTTPException) as e:
        complete_json(_settings(), "groq:llama-3.3-70b-versatile", "JSON", "x")
    assert e.value.status_code == 429 and "busy" in e.value.detail
