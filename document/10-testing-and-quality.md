# 10 - Testing and Quality

| Item | Detail |
|---|---|
| Document | Testing and quality |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Audience | Testers, developers, clients (acceptance, section 5) |

**Purpose:** To describe how VantixFit AI is tested, what the automated tests cover, how to run them, a manual acceptance checklist for client sign-off, and what has **not** been verified yet.

---

## 1. Test strategy

| Level | Approach | Tools | Status |
|---|---|---|---|
| Backend unit and API tests | Test routes with a test client, with the database and AI providers replaced by fakes; test provider calls with a recording fake network | pytest | In place |
| Frontend unit tests | Test pure logic (validation, sorting, duplicate detection, merge, crop maths, error wording) and stores with mocked network | Vitest + jsdom | In place |
| Component / screen tests | Mount screens and check behaviour | Vue Test Utils | Not in place (only a stale starter test) |
| End-to-end tests | Drive a real browser | Cypress | Configured, only a starter spec exists |
| Manual acceptance (UAT) | A tester follows the checklist in section 5 on a real Supabase project | Browser, Android | Checklist ready; **not yet executed** |
| Real-service checks | Real AI provider calls, real Supabase storage upload | Manual | Not yet done |

Design choice: logic is kept in plain functions (`profileLogic.ts`, `importLogic.ts`, `avatarLogic.ts`, `resume_parser.py`) because plain functions are fast and reliable to test.

## 2. What is covered

Last verified numbers (reported by the project owner's test runs): **backend 101 tests passing; frontend 177 passing with 1 known failure** (the stale starter test `tests/unit/example.spec.ts`, which still looks for the text "Ready to create an app?" on a page that no longer shows it). It should be rewritten or removed.

### 2.1 Backend (`backend/tests`)

| File | Test functions* | What it covers |
|---|---|---|
| `test_api.py` | 4 | Health; `/me` without a token and with a bad token; HS256 token decoding |
| `test_skills.py` | 9 | Create skill; return existing (by name and by alias) without a duplicate; bad characters and lengths; allowed special characters; category length; clean 500 on database failure; token required |
| `test_ai_models.py` | 9 | Token required; exact fields; availability follows keys; default is the first available; Groq wins the default; no key material in responses; lists come from environment; `/health` `ai_configured` |
| `test_ai_providers.py` | 16 | Request shape per provider; key only in the right header; only the chosen provider's key is sent; allow-list and missing-key checks never reach the network; lenient JSON parsing; one retry; no retry for HTTP errors; error messages never contain keys or bodies; 404 and 429 messages |
| `test_resume_import.py` | 39 | PDF and DOCX happy paths (including tables); missing fields stay null; hallucinated values dropped; current-job and year rules; invalid dates; length clamps; file size, type and content errors; empty, scanned, short and corrupt files; no AI configured; unexpected AI errors; sloppy output; prompt injection stays inside data tags; log contains counts only; nothing saved to the database; model choice, default and allow-list; provider 429, 5xx, rejected key, timeout, invalid JSON twice; end-to-end through the provider layer |

\* Counted as test functions; parameterised functions run several times, which is why the reported total (101) is higher than the sum of functions (77).

### 2.2 Frontend (`frontend/tests/unit`)

| File | Tests* | What it covers |
|---|---|---|
| `profileLogic.spec.ts` | 30 | Text, URL and phone validation; months and years; sorting; bullets and tags; skills search and levels; shared completeness; data error wording |
| `importLogic.spec.ts` | 44 | Draft normalisation; required fields; personal-info merge; duplicate detection; skill matching; validation reuse; save plan; summary sentences; skills without a level |
| `resumeImport.spec.ts` | 19 | File checks; friendly import errors; upload with mocked network; partial saves with fake writers |
| `aiModels.spec.ts` | 19 | Model selection rules; availability; list normalisation; remembered choice; requests; provider-named errors |
| `avatarLogic.spec.ts` | 16 | Initials, colour tone, storage paths, signed-link refresh timing, friendly photo errors |
| `imageCrop.spec.ts` | 16 | Photo file checks, zoom and offset limits, crop rectangle, pinch distance |
| `avatarStore.spec.ts` | 10 | Photo store loading, upload, remove, reset |
| `motion.spec.ts` | 10 | Easing, count-up and ring maths, "just reached full" |
| `dashboard.spec.ts` | 9 | Completeness, dashboard helpers, friendly errors, activity icons |
| `theme.spec.ts` | 4 | Theme store |
| `example.spec.ts` | 1 | Stale starter test (**fails**) |

\* Test counts per file are from counting `it`/`test` calls; the owner's reported total is 178 (177 passing and 1 failing).

## 3. How to run the tests (Windows PowerShell)

From the project root (`C:\Projects\jobfit-ai`).

### 3.1 Backend

```powershell
cd backend
.venv\Scripts\python -m pytest -q
```

**How to check it worked:** the last line reads like `101 passed`.

### 3.2 Frontend unit tests

```powershell
cd frontend
npm run test:unit -- --run
```

**How to check it worked:** Vitest lists the files; at the time of writing, one failure in `example.spec.ts` is expected.

### 3.3 Frontend type check and build

```powershell
cd frontend
npm run build
```

**How to check it worked:** the command ends without type errors and creates the `dist` folder.

## 4. Accessibility notes

What the code shows (not a formal audit; a full audit is **to be confirmed**):

- Buttons and icons have text or `aria-label`s (for example "Log out", "Open your profile", "Change profile photo").
- Errors use `role="alert"`; status changes use `role="status"` or `aria-live`.
- Form fields use visible floating labels, with error text under the field.
- Tap targets are designed to be about 44 pixels or larger.
- Animations stop when the device asks for reduced motion.
- The themes include light and dark choices. Colour contrast in every one of the 35 themes has not been measured.
- The progress ring has a label ("Profile completeness").
- Keyboard use on the web version has not been systematically tested.

## 5. Manual acceptance checklist (UAT)

Use two test accounts (A and B) on a Supabase project where migrations 0001 and 0002 have been applied and at least one AI provider key is configured. Prepare: a text-based PDF resume, a DOCX resume, a scanned/image PDF, a `.doc` file, a file over 5 MB, and a JPEG photo. Leave **Pass / Fail** and **Notes** empty until tested.

| ID | Scenario | Steps | Expected result | Pass / Fail |
|---|---|---|---|---|
| UAT-01 | Sign up | Login screen, Sign up, enter name, email, password (6+ chars), Create account | Message "Account created. Check your email to confirm, then log in."; profile row exists in Supabase | |
| UAT-02 | Log in | Enter correct details, Log in | Arrive on Home with greeting; opening `/login` while signed in goes to Home; signed out, opening Home goes to login | |
| UAT-03 | Wrong password | Enter wrong password | "That email or password does not look right."; stay on login | |
| UAT-04 | Personal info | Profile, Personal info; fill all fields including `github.com/sample`; Save; try a bad phone | "Profile saved."; link stored with `https://`; bad phone shows message; empty name refused | |
| UAT-05 | Experience | Add a current job; add a past job; edit; delete via swipe and confirm | Messages shown; current job listed first; end month required when not current; counts and Home ring update | |
| UAT-06 | Projects | Add project with technologies "Vue, Git, vue"; edit; delete | Tags saved without duplicates; invalid link refused | |
| UAT-07 | Education | Add entry with end year before start year; correct it; delete | Error "The end year cannot be before the start year."; saved after correction | |
| UAT-08 | Skills from bank | Add skill "Python" level 4 years 2.5 | Skill listed with 4 bars and "Level 4: Advanced · 2.5 years"; already-owned skills hidden from search | |
| UAT-09 | Custom skill | Search a skill not in the bank; add as new; repeat with the same name from account B | Created once; account B receives the existing skill (no duplicate row in `skills`) | |
| UAT-10 | Edit and remove skill | Tap a skill, change level; swipe left, remove, confirm | Updated and removed; messages shown | |
| UAT-11 | Import: model and PDF | Import from resume; choose a model; choose the text PDF; observe reading; test Cancel once | Model list shows availability; "Reading your resume..." with Cancel; Cancel returns to file box; a second attempt reaches the review | |
| UAT-12 | Import: DOCX | Import the DOCX (with a table if possible) | Review appears with details from paragraphs and table | |
| UAT-13 | Review and edit | Edit a field, untick an item, check the "Will save" line | Edits kept; unticked items not counted; nothing saved yet (check Profile counts) | |
| UAT-14 | Duplicates | Import the same resume twice; save the first time only | On the second import, matching experience, education, project and skills show "Already in your profile" and cannot be saved | |
| UAT-15 | Personal-info conflict | Profile has a different headline; import a resume with another headline | "Your profile has: ..." shown; default Keep current; Use imported replaces only when chosen; email never imported | |
| UAT-16 | No invented data | Compare review with the source file field by field | No email, phone, link, date, skill or technology appears that is not in the file; blanks are "Not found - add it yourself" | |
| UAT-17 | Save and skills without level | Press Save to profile | Done screen with summary; imported skills have "Set level"; Profile counts and Home ring increased; custom skills only if ticked | |
| UAT-18 | Discard | Edit a draft, press Discard | Confirmation shown; after confirming, nothing is saved and the file box returns | |
| UAT-19 | Scanned PDF | Import the scanned PDF | Message about text-based PDF or DOCX; "Choose another file" offered | |
| UAT-20 | Wrong type and size | Choose the `.doc` file, a `.txt` file, and the over-5 MB file | Each refused before upload with the specific message | |
| UAT-21 | Photo upload | Profile, tap photo, Choose from gallery, move, zoom, Save photo | Photo appears on Profile and Home; file exists under the user's folder in the `avatars` bucket | |
| UAT-22 | Photo remove | Tap photo, Remove photo, confirm | Initials return; file removed from the bucket | |
| UAT-23 | Friendly errors | Stop the backend; reload Home | System status shows "The backend is not reachable..."; no raw error text; Retry works after restarting the backend | |
| UAT-24 | Theme | Change theme on Login and Home; close and reopen | Theme applied at once and remembered | |
| UAT-25 | Completeness and Home | Start with an empty profile and add one item per check | Ring moves in equal steps to 100 percent; "Next:" hint follows the order; refresh by pulling down | |
| UAT-26 | Log out | Log out, then log in as account B | Account A's data, photo and any draft are not visible | |
| UAT-27 | Placeholders | Open Jobs and Tracker; use "Paste a job description" | "Coming soon" screens only; no pretend feature | |
| UAT-28 | Mobile layout and Android | Check at 375 pixels wide; build and run on Android emulator or phone (see [12](12-installation-and-operations.md)) | Screens usable; bottom tabs not covered; camera option tried and result recorded | |
| UAT-29 | Data isolation | As account B, try to see account A's data (no UI path; check in Supabase with B's login or through the API) | Account B sees no rows or files of account A | |

## 6. Known quality gaps (not verified)

| # | Gap |
|---|---|
| Q-1 | **No real AI provider calls** are made by the automated tests. Real provider behaviour, current model names, rate limits and answer quality are unverified. |
| Q-2 | **Real Supabase storage upload** (photo) and the real storage policies are not covered by automated tests. |
| Q-3 | **Touch gestures** (drag, pinch) and the camera on real devices are unverified. |
| Q-4 | **No screen-level tests** (component or end-to-end). Behaviour such as the review layout, tick boxes, sheets and navigation relies on manual checking. |
| Q-5 | **Live Row Level Security** with two real accounts has not been exercised by a test. |
| Q-6 | One stale frontend test fails (`example.spec.ts`). |
| Q-7 | No automated type or lint result is recorded here; run `npm run build` (type check) before release. |
| Q-8 | No performance or load testing; no formal accessibility audit; no security penetration test. |
| Q-9 | Email confirmation behaviour depends on Supabase settings and was not tested here. |

Related: [02-requirements-specification.md](02-requirements-specification.md) (traceability), [09-roadmap-and-status.md](09-roadmap-and-status.md).
