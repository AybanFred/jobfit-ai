---
name: commit-conventions
description: Project commit scopes, branch naming, trailer rule and how to group changes for JobFit AI commits
metadata:
  type: project
---

Commits use Conventional Commits with the scopes `db`, `backend`, `frontend`, plus plain `chore`, `docs`, `test`, `fix`, `refactor`. Subject is imperative and under 72 characters, followed by a short body (what and why).

Branch: work happens on `main` (single-branch workflow so far). No feature branches were used in Phase 1-2.

Trailer: the developer asked for `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` on commit messages in the 2026-10-24 commit batch, while the harness attribution said Haiku 5.5. Use the trailer the developer names in the task, and flag any mismatch in the report.

**Why:** the developer reviews history by scope, and mixed scopes make the log hard to read.
**How to apply:** pick one scope per commit. Write the migration as its own `feat(db)` commit.

Grouping rules learned in the 2026-10-24 batch:
- `backend/app/main.py` registers every router in one place and the tests import `app.main`, so all backend routers and their tests go in one commit. Splitting them leaves a commit that fails at import time.
- The frontend router lazy-loads every view and `HomePage`/`ProfilePage` import the shared stores and components, so shell, profile and import changes usually cannot be split into commits that each type-check. Group them together unless you can stage partial files.
- Migrations go in before the code that uses them.

See also [[security-checks]].
