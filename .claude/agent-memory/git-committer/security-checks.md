---
name: security-checks
description: Pre-commit secret and .env checks the git-committer agent runs for JobFit AI, including known false positives
metadata:
  type: feedback
---

Before staging, run: `git ls-files` and `git status --short --untracked-files=all` to confirm no `.env` (only `.env.example` is allowed), `node_modules`, `.venv`, `dist` or `__pycache__` is tracked or staged. Then grep the changed files for key shapes: the Groq prefix `gsk_`, the Google prefix `AIza`, the OpenAI and Anthropic `sk-` prefixes, the Supabase secret-key prefix, the Supabase service-role term, and the JWT header prefix `eyJhbGciOi`. Never read `.env` itself.

Scan the STAGED content, not just the working tree: for each path in `git diff --cached --name-only`, run `git show ":<path>" | grep -qE <pattern>` and print only the path. Run this after `git add` and before `git commit`. Keep the scan script in the session scratchpad, not in the repo.

Known false positive: `frontend/src/views/LoginPage.vue` matches the `password\s*=` pattern because of the `const password = ref('')` form field. It is not a credential.

Known false positive (2026-10-26): `backend/tests/test_applications.py` and `backend/tests/test_resumes.py` match the generic key-value pattern through a fixture named `groq_api_key` that is set to an 8-character `gsk-` placeholder. Confirm it by printing only the value's length and first 4 characters.

Known harmless warnings: Git prints "LF will be replaced by CRLF" for most files on Windows. This is a line-ending warning, not a failure, so report it and do not bypass it.

Ignored build output in `frontend/android/app/src/main/assets/` is covered by `frontend/android/.gitignore`, so it never shows as a change.

Not part of the commit flow: `frontend/.vscode/extensions.json` shows a diff that is whitespace or line-ending only (`git diff --ignore-all-space --ignore-cr-at-eol` is empty). Leave it unstaged unless the developer asks.

**Why:** the developer's rules forbid committing secrets and `.env` files, and the scan must not print real key values.
**How to apply:** report matches by file and line only, never the matched value. Confirm each match by reading the surrounding code or the value's length and prefix. See [[commit-conventions]].
