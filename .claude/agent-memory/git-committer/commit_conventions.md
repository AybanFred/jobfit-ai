---
name: commit-conventions
description: Project commit scopes, branch naming, trailer rule and how to group changes for JobFit AI commits
metadata:
  type: project
---

Commits use Conventional Commits with the scopes `db`, `backend`, `frontend`, plus plain `chore`, `docs`, `test`, `fix`, `refactor`. Subject is imperative and under 72 characters, followed by a short body (what and why).

Branch: work happens on `main` (single-branch workflow so far). No feature branches were used in Phase 1-3.

Trailer: use the `Co-Authored-By` trailer the developer or lead names in the task. The harness attribution named Haiku 5.5 in every batch so far, while the tasks named Sonnet 5.5 (2026-10-24) and Opus 5.5 (2026-10-26). Use the named trailer and flag the mismatch in the report.

**Why:** the developer reviews history by scope, and mixed scopes make the log hard to read. The trailer model name is the developer's call, not the agent's.
**How to apply:** pick one scope per commit. Write the migration as its own `feat(db)` commit.

Grouping rules learned in the 2026-10-24 and 2026-10-26 batches:
- `backend/app/main.py` registers every router in one place and the tests import `app.main`, so all backend routers and their tests go in one commit. Splitting them leaves a commit that fails at import time. `job_parser` also imports `documents.remove_job_files`, so the export files cannot be split from the jobs/tailor files. The 2026-10-26 backend went into one `feat(backend)` commit.
- The frontend router lazy-loads every view and `HomePage`/`ProfilePage` import the shared stores and components, so shell, profile and import changes usually cannot be split into commits that each type-check. Jobs and Tracker share services and stores, so the 2026-10-26 frontend went into one `feat(frontend)` commit.
- Migrations go in before the code that uses them. Put them first in the batch as `feat(db)`, and say in the body to run them before deploying the backend.
- A fix to a file that already exists at HEAD (e.g. the AI failure message) gets its own `fix(...)` commit, placed before the feature commits.
- Memory updates go in one `chore:` commit at the end of the batch.

Verification that worked (2026-10-26): after the backend commit, run `git archive <hash> backend | tar -x -C <scratchpad>/iso` and run the venv pytest inside that extracted directory. This proves the commit does not depend on untracked or ignored files. The full suite passed this way (269 tests). Run the same check after a fix commit that changes tests.

See also [[security-checks]].
