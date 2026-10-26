---
name: reference-test-setup-tips
description: How the JobFit AI test suites are wired and Windows/Git Bash gotchas when probing code
metadata:
  type: reference
---

- Backend tests use an in-memory `FakeSupabase` (backend/tests/fake_supabase.py) and `FakeAI`; fixtures `env` live in
  test_application_email.py and test_tailor.py (different meaning, same name). Import one with an alias
  (`from tests.test_tailor import env as tailor_env`) - pytest registers the alias as the fixture name.
- Known bugs are pinned with `@pytest.mark.xfail(strict=True)` (backend) and `it.fails` (vitest) so the suite stays green
  and turns red when the bug is fixed; the marker then has to be removed. Always say so in the report.
- Frontend `npm run build` (vue-tsc) only type-checks `src/`, NOT `tests/`; vitest does not type-check either.
- Vitest component tests stub Ionic (IonInput/IonButton) with plain elements; mailto goes in `data-href`.
- Probing Python from Git Bash on Windows: stdout is cp1252, so use `python -X utf8` (note `-I` ignores PYTHONIOENCODING).
- `npm run test:unit -- --run` prints jsdom "HTMLCanvasElement.getContext not implemented" noise from theme.spec.ts; harmless.
- Never read `.env`; settings in tests are passed explicitly (`Settings(...)`) so backend/.env is not needed.
