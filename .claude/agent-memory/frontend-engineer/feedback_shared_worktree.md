---
name: feedback-shared-worktree
description: Other agents edit backend/ in the same working tree at the same time - never git stash/checkout/reset there; visual-check servers must not touch the user's dev servers or node_modules/.vite
metadata:
  type: feedback
---

Never run `git stash`, `git checkout -- .`, `git reset` or similar whole-tree commands, even briefly to compare test results.
**Why:** on 2026-10-26 I stashed to compare a test baseline while the backend-engineer was editing backend files in parallel; it popped back cleanly, but it could have lost or clobbered their work. The task brief also says I own `frontend/` only.
**How to apply:** for a baseline, run tests before editing, or copy files to the scratchpad. Path-limited read-only git commands (`git diff -- frontend`) are fine.

Visual checks: the user keeps their own dev servers running (ports 5173 and 8100) and they lock `frontend/node_modules/.vite`. A scratchpad Vite config must set its own `cacheDir` in the scratchpad (else EPERM on the deps rename) and use a free port. Killing processes with `taskkill` was blocked by the permission classifier, so start new helpers on new ports instead of killing, and mention any helper left running in the report. See [[ui-redesign-and-avatar]] for the visual-check setup.
