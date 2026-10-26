# JobFit AI — Project Instructions for Claude

## What this project is
An AI-powered job hunting app. The user pastes a job description; the app parses it,
matches it against the user's Master Profile and skills, then generates a tailored,
ATS-friendly resume and cover letter. Every action is saved to logs and an
application tracker with analytics.

Core rule of the product: the AI must NEVER invent skills or experience. It may
rephrase, reorder and highlight real data only. Missing skills go to a "gaps" list.

## Tech stack
- Frontend: Ionic 8 + Vue 3 (Composition API, `<script setup lang="ts">`) + Capacitor, built with Vite
- State: Pinia
- Backend: Python 3.12 + FastAPI
- Database / Auth / Storage: Supabase (Postgres + RLS + pgvector)
- AI: Claude API (from Phase 3)
- Deploy: frontend on Vercel; backend on Vercel or Render

## Folder structure
- `frontend/` — Ionic Vue app (`src/views`, `src/components`, `src/stores`, `src/services`)
- `backend/` — FastAPI (`app/api`, `app/core`, `app/db`, `app/services`, `tests/`)
- `supabase/migrations/` — numbered SQL files (`0001_init.sql`, `0002_...sql`)
- `docs/` — project documentation, changelog, phase notes
- `.claude/` — agents, skills, rules, settings for Claude Code

## Commands (the developer is on Windows; Claude's shell is Git Bash)
- Backend tests: `cd backend && .venv/Scripts/python -m pytest -q`
- Backend server: `cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- Frontend dev: `cd frontend && npm run dev` (or `ionic serve`)
- Frontend type check + build: `cd frontend && npm run build`
- Frontend unit tests: `cd frontend && npm run test:unit -- --run`
- Android: `cd frontend && npm run build && npx cap sync android`

## Roadmap and current status
- [x] Phase 1 — Foundation: Supabase schema + RLS, FastAPI skeleton, Ionic app, login works
- [x] Phase 2 — Master Profile: profile, experience, projects, education, skills screens, resume import
- [ ] Phase 3 — AI core: JD parsing, skill matcher, resume + cover letter generation, validation  ← CURRENT
- [ ] Phase 4 — Export & editor: DOCX/PDF templates, editor screen, Storage uploads
- [ ] Phase 5 — Tracker & logs: application tracker, activity logs, analytics dashboard
- [ ] Phase 6 — Automation: share-to-app, follow-up reminders, weekly report
- [ ] Phase 7 — Polish & release: testing, Android/iOS builds, README with screenshots
Update this checklist when a phase is finished.

## Engineering conventions
- Small, focused changes. Do not refactor unrelated code.
- Every new backend endpoint: Pydantic request/response models, auth via
  `get_current_user`, filter every query by `user.id`, call `log_activity(...)`, and a test.
- Every new table: a new numbered migration file, RLS enabled, policies by `auth.uid()`.
  Never edit a migration that was already run; add a new one.
- Frontend: Ionic components first, simple and clean UI, mobile-first, loading and
  error states on every screen that calls the network.
- Secrets live only in `.env` files. Never read, print, or commit `.env`.
  The frontend may only use the publishable/anon key, never the secret key.
- Commit messages use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).

## Specialist team (subagents in `.claude/agents/`)
- `backend-engineer` — FastAPI, Python, Supabase SQL, migrations, AI pipeline
- `frontend-engineer` — Ionic + Vue screens, Pinia stores, services, Capacitor
- `ui-ux-designer` — reviews screens for usability, layout, accessibility, consistency
- `qa-engineer` — writes and runs tests, finds bugs, verifies features end to end
- `docs-writer` — README, tutorials, changelog, API docs, phase notes
- `git-committer` — reviews the diff, groups changes, writes commit messages, commits
Use them for focused work. For a whole feature, use the `/feature` skill, which runs them in order.

## How Ivant works (follow this)
- He is learning while building: explain WHAT you changed and WHY in plain language,
  in short steps. Give exact commands for Windows PowerShell when he must run something.
- Prefer step-by-step, beginner-friendly instructions with a "how to check it worked" line.
- Use polite, professional, clear wording in docs and messages. Correct grammar.
- He likes simple, clean, not overdesigned UI.
- When a request is ambiguous or a change is large, propose a short plan first and wait.
- Always run the relevant tests after changing code and report the result honestly.
- Never `git push` and never delete files without asking him first.
- At the end of a task, give: a short summary, files changed, how to test, next suggested step.

## Project docs to read when relevant
- Setup guide: `README.md` and `TUTORIAL-Phase1-Beginner.txt`
- Database schema: `supabase/migrations/0001_init.sql`
