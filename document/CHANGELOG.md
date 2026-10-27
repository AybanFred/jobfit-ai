# Changelog

| Item | Detail |
|---|---|
| Document | Changelog |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Audience | Everyone |

**Purpose:** To record notable changes to VantixFit AI by version. The format follows [Keep a Changelog](https://keepachangelog.com/) (Added, Changed, Fixed, and so on). Dates come from the repository commit log (local time, UTC+8). Only what is visible in the repository is listed; no earlier history is invented.

Status labels: see [README.md](README.md). Phase 1 is *Available now*. Phase 2 is *Built, awaiting verification*.

---

## [Unreleased]

Nothing built yet. Planned work (Phases 3 to 7) is described in [09-roadmap-and-status.md](09-roadmap-and-status.md).

---

## [0.1.0] - 24 October 2026

### Phase 2 - Master Profile (built, awaiting verification) - 24 October 2026

#### Added

- **Database (migration 0002):** `profiles.avatar_path` column; private `avatars` storage bucket (2 MB limit; JPEG, PNG, WebP); storage policies so each user can read, upload, replace and delete only inside their own folder.
- **Backend:**
  - `POST /api/v1/skills/custom` to add a skill to the shared skills bank without creating duplicates.
  - `GET /api/v1/ai/models` to list selectable AI models and whether each is available.
  - `POST /api/v1/profile/import-resume` to read a PDF or DOCX resume and return a draft profile (saves nothing).
  - AI provider layer for Groq, Google Gemini and OpenAI (plain HTTP, model allow-list, one retry on invalid JSON, friendly error mapping).
  - Anti-invention guard that removes values not found in the resume text.
  - `/health` now reports `ai_configured`.
  - Environment settings for the three AI keys and model lists.
  - New backend tests (backend suite last reported at 101 passing).
- **Frontend:**
  - Master Profile screens: Personal info, Experience, Projects, Education, Skills (with levels and years, and custom skills).
  - Resume import flow: AI model picker, file box, reading state with Cancel, review screen, duplicate detection, personal-info merge choices, save summary, discard with confirmation.
  - Profile photo: gallery or camera, crop and zoom, private storage with signed links, remove.
  - Home: profile completeness ring (8 checks), next-step hint, quick actions, recent activity, pull to refresh.
  - Profile tab with section rows, counts and ticks.
  - Jobs and Tracker placeholder tabs ("Coming soon").
  - Friendly error wording, haptic feedback, reduced-motion support.
  - New frontend unit tests (suite last reported at 177 passing, 1 known stale starter test failing).

#### Changed

- Resume import uses free-tier Groq, Google Gemini and OpenAI models chosen by the user, instead of Anthropic, because of cost (decision recorded 24 October 2026; the earlier approach is not visible in the commit history). The Anthropic key setting remains reserved for Phase 3.
- Logging out clears the profile, photo and any import draft held in memory (what Phase 1 cleared before is not visible in the commit history).
- UI direction set to "vibrant but clean".

#### Known issues

- `frontend/tests/unit/example.spec.ts` is a stale starter test and fails; it should be rewritten or removed.
- Real AI provider calls, real storage upload and device gestures have not been verified. See [10-testing-and-quality.md](10-testing-and-quality.md).

### Phase 1 - Foundation (complete) - 23 October 2026

#### Added

- Initial project: Supabase schema (migration 0001) with 11 tables, Row Level Security, the private `documents` bucket and 25 starter skills; automatic profile creation at sign-up.
- FastAPI skeleton: `GET /api/v1/health`, `GET /api/v1/me`, Supabase token verification (asymmetric keys and legacy shared secret), activity logging helper, CORS settings.
- Ionic + Vue app: login and sign-up, route guard, Home screen with three system checks.
- Frontend files tracked in the main repository.
- Claude Code project setup (agents, rules, skills).
- daisyUI themes (35) with a theme picker in the header.
- Android platform setup with Capacitor.

---

## Version notes

- The backend API reports version `0.1.0`. `frontend/package.json` still shows `0.0.1`; this documentation treats 0.1.0 as the product version.
- Phase 3 will be the first release to add AI job matching and document generation.
