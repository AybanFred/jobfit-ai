---
paths:
  - "backend/**/*.py"
---

# Backend rules (FastAPI)

- Python 3.12, type hints everywhere, Pydantic v2 models for request and response bodies.
- Routers live in `backend/app/api/`, business logic in `backend/app/services/`.
  Keep route functions thin: validate, call a service, return.
- Protected routes use `user: CurrentUser = Depends(get_current_user)`.
- The Supabase admin client bypasses RLS, so EVERY query on user data must filter
  by `user.id` (`.eq("user_id", user.id)`).
- Log meaningful actions with `log_activity(user.id, "<entity>.<verb>", ...)`,
  for example `profile.updated`, `job.parsed`, `doc.generated`.
- Return clear HTTP errors (`HTTPException(status_code, "message")`); never leak stack traces or keys.
- Every endpoint gets at least one test in `backend/tests/` (happy path + unauthorized).
- Read settings only through `get_settings()`; never hard-code URLs or keys.
