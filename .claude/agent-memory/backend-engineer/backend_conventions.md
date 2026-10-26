---
name: backend-conventions-and-pitfalls
description: Reusable backend/test conventions for JobFit AI (settings override in tests, multi-provider AI layer, resume import, tailoring validator policy, shared Supabase fake)
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
- Jobs (Phase 3 slice 1): `app/services/job_parser.py` reuses resume_parser helpers (`_Source`, `_terms`, `_text`, `_scalar`, `_str_list`). Guard: title/company/location + skills must literally appear in the JD text (word-boundary); seniority/employment_type only length-capped. `job_posts` RLS "own rows" policy already exists in 0001, no migration needed. DB logic in the service uses `get_admin_client` (patch `app.services.job_parser.get_admin_client` with a fake table in tests; see tests/test_jobs.py FakeQuery). POST /jobs returns 201; DELETE returns 204.
- Tailoring (Phase 3 slice 2, 2026-10-26): POST /tailor makes TWO AI calls (job_parser.parse_job, then one {resume, cover_letter} call). Policy in tailor_validator: DROP + warn for skills/orgs/schools/titles/degrees/projects/locations/contact/dates-with-unknown-years/bullets mentioning a gap skill; WARN only (keep) for numbers not in source and gap mentions in the cover letter. generated_docs.model stores the full "<provider>:<model>" id. Rollback = delete the job_posts row (cascade).
- Known matcher limit: `_Source.has_text` is case-insensitive, so skill "Go" matches "go-to" in a source. Deliberately kept for consistency; only gap-mention checks use exact case for terms of 3 chars or fewer.
- Shared test fake: `tests/fake_supabase.py` (tables + storage, chained order, job_posts cascade). Patch `get_admin_client` in EVERY service module that imports it (job_parser, user_resumes, tailor).
- Pitfall: never put large bytes in `pytest.mark.parametrize` without `ids=`; the id goes into PYTEST_CURRENT_TEST and Windows rejects env vars over 32767 chars.
- Never open backend/.env; only .env.example.
- Tracker + export (2026-10-26): GET endpoints (list/detail) are NOT logged, same as GET /jobs and /resumes; only mutations call log_activity. Related rows (job, match, docs, source resume) are ALSO filtered by user_id: FK checks ignore RLS, so another user could point a row at your job_post_id.
- List without N+1: `.in_()` with ids in batches of 100 (URL length); job location via select alias `location:parsed->>location`.
- fake_supabase now has in_, update, `alias:col->>key` select, storage list/create_signed_url, and upload REFUSES an existing path unless file_options upsert == "true".
- A test module that imports helpers from another test module must define its own autouse settings override (fixtures do not come along with the import).
- storage3 2.33: `create_signed_url(path, secs, {"download": file_name})` forces download; upsert = file_options `{"upsert": "true"}` (string).
- PDF export (reportlab, built-in Times fonts): chars outside cp1252 render as black boxes, so harvard_pdf.pdf_text transliterates Latin letters; pypdf extracts "•" as \x7f (harmless). SimpleDocTemplate frames add 6 pt padding, so use BaseDocTemplate + zero-padding Frame for exact margins. Check layout visually by reading the PDF with the Read tool.
- Not done yet: DELETE /jobs/{id} does not remove exported Storage files (only DELETE /applications/{id} does).
- Recruiter email + AI email (2026-10-26): `email-validator` is NOT installed and we chose not to add it; addresses are checked by regex in `services/applications.clean_recruiter_email` (shared by TailorIn + ApplicationUpdate). The address is never selected by the email-writing service, never in prompts, logs only `has_recruiter_email`.
- generated_docs now has type 'email' (many versions per job). Any generated_docs query meant for resume/cover letter must filter `.in_("type", DOC_TYPES)`, or 20+ email rewrites push them out of the row limit. Summary `documents` never lists the email.
- Every email warning starts with "The email" (tailor_validator.EMAIL_WARNING_PREFIX); POST /applications/{id}/email swaps those in match_results.warnings (best effort). Empty email: warning in /tailor, but 502 in the rewrite endpoint (its only job).
- TailorIn.write_email (default true): false uses `tailor.build_system_prompt(with_email=False)` (= SYSTEM_PROMPT_NO_EMAIL: no email rules/key, saves tokens), skips email validation, saves no email row, adds no email warning; an "email" key the model sends anyway is ignored. recruiter_email is independent of it.
- Test pitfall: fake insert `created_at` is "2026-01-01T00:00:NN" but test_applications.ts() seeds "2026-03-01...", so freshly inserted rows sort OLDER than seeded ones; seed "older" rows with 2025 dates.
