---
name: security-checks
description: Pre-commit secret and .env checks the git-committer agent runs for JobFit AI, including known false positives
metadata:
  type: feedback
---

Before staging, run: `git ls-files` and `git status --short --untracked-files=all` to confirm no `.env` (only `.env.example` is allowed), `node_modules`, `.venv`, `dist` or `__pycache__` is tracked or staged. Then grep the changed files for key shapes (`gsk_`, `AIza`, `sk-`, `sk-ant-`, `sb_secret_`, `service_role`, `eyJhbGciOi`). Never read `.env` itself.

Known false positive: `frontend/src/views/LoginPage.vue` matches the `password\s*=` pattern because of the `const password = ref('')` form field. It is not a credential.

Known harmless warnings: Git prints "LF will be replaced by CRLF" for most files on Windows. This is a line-ending warning, not a failure, so report it and do not bypass it.

Ignored build output in `frontend/android/app/src/main/assets/` is covered by `frontend/android/.gitignore`, so it never shows as a change.

**Why:** the developer's rules forbid committing secrets and `.env` files, and the scan must not print real key values.
**How to apply:** report matches by file and line only, never the matched value. Confirm each match by reading the surrounding code. See [[commit-conventions]].
