---
name: test
description: Run all backend and frontend checks for JobFit AI and report the results clearly.
disable-model-invocation: true
---

Run every check and report honestly. Do not change any code in this skill.

1. Backend tests:
   `cd backend && .venv/Scripts/python -m pytest -q`
2. Frontend type check and build:
   `cd frontend && npm run build`
3. Frontend unit tests (only if a `test:unit` script exists in `frontend/package.json`):
   `cd frontend && npm run test:unit -- --run`

Report as a short table:

| Check | Result | Details |
|---|---|---|
| Backend tests | PASS/FAIL | e.g. 12 passed, 1 warning |
| Frontend build | PASS/FAIL | |
| Frontend unit tests | PASS/FAIL/SKIPPED | |

If something fails, explain the cause in plain language, name the file, and suggest
the fix. Ask before fixing.
