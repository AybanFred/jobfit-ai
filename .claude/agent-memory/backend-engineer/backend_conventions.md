---
name: backend-conventions-and-pitfalls
description: Reusable backend/test conventions for JobFit AI (settings override in tests, multi-provider AI layer, resume import design)
metadata:
  type: project
---

- Tests: `app.dependency_overrides[get_settings]` is global; older test files set it at import time. In new test files use an autouse/fixture that sets and restores it. Pass provider keys AND model lists explicitly in test Settings, because `Settings()` also reads backend/.env.
- Routes get settings via `Depends(get_settings)` and pass them into services (so tests can override); services never call get_settings() themselves.
- Tests patch `log_activity` where it is imported (`app.api.<module>.log_activity`).
- AI layer (Anthropic was dropped as too costly; free tiers of Groq/Gemini/OpenAI instead): `app/services/ai_providers.py` has `complete_json(settings, model_id, system, user)`, `list_models`, `resolve_model`. Plain httpx, no SDKs. Model ids are `"<provider>:<model>"`, allow-listed from env (`GROQ_MODELS` etc.). Default = first available in order groq, gemini, openai. Gemini key goes in `x-goog-api-key` header only.
- AI test mocking: patch `app.services.resume_parser.complete_json` for route-level tests, or patch `app.services.ai_providers._make_client` to return `httpx.Client(transport=httpx.MockTransport(handler))` for real URL/header/retry/error-mapping tests. No SDK errors to build anymore.
- Error mapping rule: provider 401/403 -> 502 "<Label> key was rejected", 429 -> 429 busy, timeout/5xx/bad JSON after one retry -> 502 generic. Never echo provider bodies, keys, resume text. Only parse failures retry (once), HTTP errors do not.
- `resume_parser.coerce_raw` reshapes sloppy model JSON before `clean_draft`; `clean_draft` (anti-invention guard) is unchanged and must stay the last step. Bullets only split on newline when a model returns a string (commas belong to bullets).
- Use plain ints 413/422 in HTTPException: starlette's `HTTP_413_REQUEST_ENTITY_TOO_LARGE` / `HTTP_422_UNPROCESSABLE_ENTITY` constants emit deprecation warnings.
- Resume import (`POST /api/v1/profile/import-resume`): in-memory only, optional form field `model_id`, model resolved (400/503) BEFORE reading the file. Skill matching is word-boundary, not raw substring (so "Go" does not match "Google"). Skills of 1 character (C, R) are dropped by the 2..60 rule.
- Starlette may spool uploads over ~1 MB to a temp file before the route runs; it is deleted automatically, our code never writes the file.
- Bash tool heredocs break on triple quotes in Python source; write helper scripts with the Write tool instead (scratchpad dir).
- Never open backend/.env; only .env.example.
