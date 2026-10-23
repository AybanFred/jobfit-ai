---
name: feature
description: Build a complete full-stack feature with the specialist team - plan, UI/UX design, backend, frontend, QA, docs and commit. Use when the developer asks to build a whole feature or screen end to end.
argument-hint: "[feature description]"
disable-model-invocation: true
---

# Build a full-stack feature: $ARGUMENTS

You are the tech lead. Coordinate the specialist subagents in order. After each step,
give the developer a 2-3 line update in plain language.

## Step 1 - Plan (wait for approval)
Read `CLAUDE.md`, the related code, and `supabase/migrations/`. Then show a short plan:
- Goal of the feature in one sentence
- Database changes (new migration? which tables/columns?)
- Backend endpoints (method + path)
- Frontend screens/components/stores
- How we will test it
STOP and wait for the developer to say OK or request changes.

## Step 2 - Design
Ask the `ui-ux-designer` subagent to design the screen(s): flow, layout, states, microcopy.

## Step 3 - Backend
Ask the `backend-engineer` subagent to build the migration (if any), endpoints, services,
and tests, using the plan. Collect the endpoint contract it reports.
If there is a new migration, tell the developer to run it in the Supabase SQL Editor
and wait for confirmation before the frontend relies on it.

## Step 4 - Frontend
Ask the `frontend-engineer` subagent to build the screens using the designer's spec and
the backend's endpoint contract.

## Step 5 - UI review
Ask the `ui-ux-designer` subagent to review the new `.vue` files. Send any "Must fix"
items back to the `frontend-engineer`.

## Step 6 - QA
Ask the `qa-engineer` subagent to test everything. If it reports bugs, send each bug to
the right engineer, then run QA again. Maximum 2 fix rounds; after that, report the
remaining issues to the developer.

## Step 7 - Docs
Ask the `docs-writer` subagent to update the changelog, API docs, and README if needed.

## Step 8 - Wrap up (do not commit automatically)
Give the developer:
- Summary of what was built
- Files changed (grouped: database, backend, frontend, docs)
- Manual test steps in the app
- Any migration they must run
Then ask: "Shall I commit this with /commit?"
