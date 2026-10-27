# 02 - Requirements Specification

| Item | Detail |
|---|---|
| Document | Requirements specification |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Audience | Clients, business and system analysts, testers |

**Purpose:** To list what VantixFit AI must do (business, functional and non-functional requirements), to describe the implemented features as user stories with acceptance criteria, and to trace each requirement to a feature, a status and a test.

**Status labels:** *Available now* (Phase 1 complete), *Built, awaiting verification* (Phase 2), *Planned* (Phases 3 to 7, not built). See [README.md](README.md).

---

## 1. Business requirements

| ID | Business requirement | Priority | Status |
|---|---|---|---|
| BRQ-01 | Each user has one trusted Master Profile that holds their real background. | Must | Built, awaiting verification |
| BRQ-02 | Users can save typing time by importing an existing resume. | Must | Built, awaiting verification |
| BRQ-03 | The AI never invents skills or experience; missing items stay blank (and go to a "gaps" list in the planned matching feature). | Must | Built, awaiting verification (import); Planned (gaps list) |
| BRQ-04 | A user's data is private to that user. | Must | Built, awaiting verification |
| BRQ-05 | Running costs stay low (free-tier AI providers for resume import). | Should | Built, awaiting verification |
| BRQ-06 | The app works in a web browser and on Android phones. | Should | Available now (web); Built, awaiting verification (Android) |
| BRQ-07 | Users can paste a job description and receive a tailored resume and cover letter. | Must (product goal) | Planned (Phase 3) |
| BRQ-08 | Users can track every application and see analytics. | Should | Planned (Phase 5) |
| BRQ-09 | All messages are friendly and understandable to non-technical users. | Should | Built, awaiting verification |

## 2. Functional requirements

Priority: Must, Should, Could. "Tested by" lists automated test files (see [10-testing-and-quality.md](10-testing-and-quality.md)) and manual acceptance tests (UAT).

### 2.1 Accounts and access (AUTH)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-AUTH-01 | A visitor can sign up with email, password (at least 6 characters, checked in the app) and an optional full name. | Must | Available now | UAT-01 |
| FR-AUTH-02 | A user can log in with email and password. Wrong details show a friendly message. | Must | Available now | UAT-02, UAT-03; `dashboard.spec.ts` (friendly errors) |
| FR-AUTH-03 | A profile record is created automatically when an account is created (database trigger). | Must | Available now | UAT-01 |
| FR-AUTH-04 | A user can log out. Logging out clears the profile, photo and any import draft held in memory. | Must | Built, awaiting verification | `avatarStore.spec.ts` (reset); UAT-26 |
| FR-AUTH-05 | Signed-out visitors are sent to the login screen; signed-in users who open the login screen are sent to Home. | Must | Available now | UAT-02 |
| FR-AUTH-06 | The backend rejects requests without a valid login token (HTTP 401). | Must | Available now | `test_api.py`, `test_skills.py`, `test_resume_import.py`, `test_ai_models.py` |

### 2.2 Home dashboard (DSH)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-DSH-01 | Home greets the user by time of day and first name. | Should | Built, awaiting verification | UAT-25 |
| FR-DSH-02 | Home shows profile completeness as a percentage, built from 8 equal checks (see [04](04-system-analysis-and-design.md), section 6). | Must | Built, awaiting verification | `dashboard.spec.ts`, `profileLogic.spec.ts`; UAT-25 |
| FR-DSH-03 | Home shows the next suggested step and a Start/Continue button until the profile is complete. | Should | Built, awaiting verification | UAT-25 |
| FR-DSH-04 | Home lists the 5 most recent logged activities with an icon and a relative time. | Should | Built, awaiting verification | `dashboard.spec.ts` (activityKind) |
| FR-DSH-05 | Home shows system status for login, profile record and backend, with a Retry button. | Should | Available now | UAT-23 |
| FR-DSH-06 | Pulling down on Home and Profile refreshes the data. | Could | Built, awaiting verification | UAT-25 |
| FR-DSH-07 | Quick actions: "Paste a job description" (opens the Jobs tab, which says "Coming soon"), "Edit profile", and "Import from resume" (shown only while the profile is incomplete). | Should | Built, awaiting verification | UAT-27 |

### 2.3 Personal info (PROF)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-PROF-01 | A user can save full name (required, up to 100 characters), headline (120), phone (30), location (100) and summary (1,000). | Must | Built, awaiting verification | `profileLogic.spec.ts`; UAT-04 |
| FR-PROF-02 | A user can save GitHub, LinkedIn and website links (up to 200 characters). A missing `https://` is added automatically. | Should | Built, awaiting verification | `profileLogic.spec.ts`; UAT-04 |
| FR-PROF-03 | Invalid phone numbers and web addresses show a friendly message before saving. | Must | Built, awaiting verification | `profileLogic.spec.ts` |
| FR-PROF-04 | The Profile screen shows name, headline, location, counts of jobs/projects/skills, completeness and a row per section with a tick when done. | Should | Built, awaiting verification | UAT-25 |

### 2.4 Experience, projects, education (EXP, PRJ, EDU, CRUD)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-EXP-01 | A user can add, edit and delete work experience: role and company (required, up to 100 each), location, start month, end month or "I currently work here", up to 12 bullet points of up to 300 characters. | Must | Built, awaiting verification | `profileLogic.spec.ts`; UAT-05 |
| FR-EXP-02 | Experience is listed newest first; current jobs come first. | Should | Built, awaiting verification | `profileLogic.spec.ts` (sorting) |
| FR-PRJ-01 | A user can add, edit and delete projects: name (required, up to 100), description (600), up to 20 technologies (30 characters each), link. | Must | Built, awaiting verification | `profileLogic.spec.ts`; UAT-06 |
| FR-PRJ-02 | Projects are listed newest first. | Should | Built, awaiting verification | `profileLogic.spec.ts` (sorting) |
| FR-EDU-01 | A user can add, edit and delete education: school (required, up to 120), degree, honors, start and end year (4 digits, 1950 up to 8 years ahead, end not before start). | Must | Built, awaiting verification | `profileLogic.spec.ts`; UAT-07 |
| FR-EDU-02 | Education is listed with the latest finishing year first; no end year (still studying) comes first. | Should | Built, awaiting verification | `profileLogic.spec.ts` (sorting) |
| FR-CRUD-01 | Deleting any entry asks for confirmation. Saving or deleting shows a short message and updates the Home progress. | Must | Built, awaiting verification | UAT-05 to UAT-10, UAT-25 |

### 2.5 Skills (SKL)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-SKL-01 | A user can search the shared skills bank by name, canonical name or alias. Skills the user already has are hidden from the results. | Must | Built, awaiting verification | `profileLogic.spec.ts` (skills); UAT-08 |
| FR-SKL-02 | A user adds a skill with a level from 1 to 5 (Beginner, Basic, Intermediate, Advanced, Expert) and optional years of experience (0 to 60, one decimal). | Must | Built, awaiting verification | `profileLogic.spec.ts`; UAT-08 |
| FR-SKL-03 | A user can change the level or years of a skill, and remove a skill (swipe left, with confirmation). | Must | Built, awaiting verification | UAT-10 |
| FR-SKL-04 | If a skill is not in the bank, the user can add it as a custom skill (2 to 60 characters; letters, digits, spaces and `. + # - / & _` only). The server never creates a duplicate. | Must | Built, awaiting verification | `test_skills.py`; UAT-09 |
| FR-SKL-05 | Skills without a level (from resume import) show a "Set level" tag. | Should | Built, awaiting verification | `importLogic.spec.ts`; UAT-17 |
| FR-SKL-06 | The skills bank starts with 25 seeded skills (database migration 0001). | Should | Available now | UAT-08 |

### 2.6 Resume import (IMP)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-IMP-01 | The user can choose one PDF or DOCX file up to 5 MB. Wrong type, empty or too-large files are refused in the app before upload; old `.doc` files get a specific message. | Must | Built, awaiting verification | `resumeImport.spec.ts`; UAT-20 |
| FR-IMP-02 | The user can choose which AI model reads the resume from a list supplied by the server. Models whose provider has no key are shown as "not set up" and cannot be chosen. The last choice is remembered on the device. | Must | Built, awaiting verification | `aiModels.spec.ts`, `test_ai_models.py`; UAT-11 |
| FR-IMP-03 | The server reads the file in memory only (PDF: first 30 pages; DOCX: paragraphs, tables and page header) and sends at most 30,000 characters of text to the AI. | Must | Built, awaiting verification | `test_resume_import.py` |
| FR-IMP-04 | The server removes anything the AI returned that cannot be found in the resume text (anti-invention guard). | Must | Built, awaiting verification | `test_resume_import.py` (hallucination tests); UAT-16 |
| FR-IMP-05 | The result is a draft shown for review. Nothing is saved until the user presses "Save to profile". | Must | Built, awaiting verification | `test_resume_import.py` (nothing is saved); UAT-13 |
| FR-IMP-06 | Items missing a required detail (role and company; school; project name) are flagged and start unticked. | Should | Built, awaiting verification | `importLogic.spec.ts` |
| FR-IMP-07 | Items that match something already in the profile, or another ticked item in the same import, are flagged and not saved. | Must | Built, awaiting verification | `importLogic.spec.ts`; UAT-14 |
| FR-IMP-08 | Personal info is merged safely: empty profile fields are filled; where both differ, the user chooses "Keep current" (default) or "Use imported". Email is not imported. | Must | Built, awaiting verification | `importLogic.spec.ts`; UAT-15 |
| FR-IMP-09 | Skills are matched to the bank (name, canonical name, alias, any letter case). Skills the user already has are skipped. Skills not in the bank are added only if the user ticks them. All are added without a level. | Must | Built, awaiting verification | `importLogic.spec.ts`; UAT-17 |
| FR-IMP-10 | If some writes fail, the others still save, the message states how many worked, and trying again does not save the same item twice. | Should | Built, awaiting verification | `resumeImport.spec.ts` (executePlan) |
| FR-IMP-11 | The draft lives only in memory. It is wiped after a successful save, after Discard, and at log out. Discarding an edited draft asks for confirmation. | Must | Built, awaiting verification | UAT-18, UAT-26 |
| FR-IMP-12 | The user can cancel while the resume is being read. | Should | Built, awaiting verification | UAT-11 |
| FR-IMP-13 | Every failure shows a short friendly message and, where it makes sense, a "Try again" button. | Must | Built, awaiting verification | `resumeImport.spec.ts`; UAT-19, UAT-20 |
| FR-IMP-14 | The uploaded file and its text are never stored or logged. The activity log keeps only the provider, model, counts and file type. | Must | Built, awaiting verification | `test_resume_import.py` (log and storage tests) |

### 2.7 Profile photo (AVA)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-AVA-01 | The user can choose a photo from the gallery or take one with the camera (JPEG, PNG or WebP, up to 10 MB). | Should | Built, awaiting verification | `imageCrop.spec.ts`; UAT-21 |
| FR-AVA-02 | The user can move and zoom the photo in a round window; the saved result is a 512 by 512 pixel JPEG. | Should | Built, awaiting verification | `imageCrop.spec.ts`; UAT-21 |
| FR-AVA-03 | The photo is stored in a private bucket, in the user's own folder, and shown through a short-lived link (1 hour) that is renewed automatically. | Must | Built, awaiting verification | `avatarLogic.spec.ts`, `avatarStore.spec.ts` |
| FR-AVA-04 | The user can remove the photo (with confirmation); initials are shown instead. | Should | Built, awaiting verification | `avatarStore.spec.ts`; UAT-22 |
| FR-AVA-05 | If the database update (migration 0002) has not been applied, the app keeps working and says "Photo upload is not set up yet - run the database update." | Should | Built, awaiting verification | `avatarLogic.spec.ts`, `avatarStore.spec.ts` |

### 2.8 Appearance (THM)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-THM-01 | The user can choose from 35 colour themes (filter: Light, Dark, All) on the Login and Home screens. | Should | Available now | `theme.spec.ts`; UAT-24 |
| FR-THM-02 | The choice is saved on the device. With no saved choice, the app follows the device's light or dark setting. | Should | Available now | `theme.spec.ts`; UAT-24 |
| FR-THM-03 | Animations are reduced when the device asks for reduced motion. | Should | Built, awaiting verification | `motion.spec.ts` |

### 2.9 Backend services (API)

| ID | Requirement | Priority | Status | Tested by |
|---|---|---|---|---|
| FR-API-01 | `GET /api/v1/health` is public and reports status, environment, and whether Supabase and AI are configured. | Must | Available now | `test_api.py`, `test_ai_models.py` |
| FR-API-02 | `GET /api/v1/me` returns the user id, email and profile row for a valid token. | Must | Available now | `test_api.py` |
| FR-API-03 | `POST /api/v1/skills/custom` creates or returns a skill in the shared bank. | Must | Built, awaiting verification | `test_skills.py` |
| FR-API-04 | `GET /api/v1/ai/models` lists selectable models and availability, never keys. | Must | Built, awaiting verification | `test_ai_models.py` |
| FR-API-05 | `POST /api/v1/profile/import-resume` returns a draft profile and saves nothing. | Must | Built, awaiting verification | `test_resume_import.py`, `test_ai_providers.py` |
| FR-API-06 | Meaningful backend actions are written to the activity log (`auth.me_checked`, `skill.created`, `resume.parsed`). | Should | Built, awaiting verification | `test_resume_import.py`, `test_skills.py` |

### 2.10 Planned functional requirements (not built)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-AI-01 | Parse a pasted job description into structured data. | Must | Planned (Phase 3) |
| FR-AI-02 | Match the job against the Master Profile and list matched skills and gaps. | Must | Planned (Phase 3) |
| FR-AI-03 | Generate a tailored, ATS-friendly resume and cover letter from real profile data only. | Must | Planned (Phase 3) |
| FR-AI-04 | Validate generated documents so nothing invented is included. | Must | Planned (Phase 3) |
| FR-DOC-01 | Export documents as DOCX and PDF using templates. | Must | Planned (Phase 4) |
| FR-DOC-02 | Edit generated documents in an editor screen; store files in private storage. | Should | Planned (Phase 4) |
| FR-TRK-01 | Track applications through statuses (saved, applied, interview, offer, rejected, ghosted). | Must | Planned (Phase 5) |
| FR-TRK-02 | Activity logs and an analytics dashboard. | Should | Planned (Phase 5) |
| FR-AUT-01 | Share-to-app and follow-up reminders. | Could | Planned (Phase 6) |
| FR-AUT-02 | Weekly report. | Could | Planned (Phase 6) |
| FR-REL-01 | Release testing, Android and iOS builds, README with screenshots. | Should | Planned (Phase 7) |

## 3. Non-functional requirements

| ID | Category | Requirement | Evidence / status |
|---|---|---|---|
| NFR-SEC-01 | Security | Login uses Supabase Auth. The API verifies the token signature (asymmetric keys, or the legacy shared secret), expiry and subject. | `backend/app/core/auth.py`; `test_api.py` |
| NFR-SEC-02 | Security | Every user-owned table has Row Level Security so users see only their own rows. | Migration 0001 |
| NFR-SEC-03 | Security | The Supabase service (secret) key and AI keys exist only in the server environment, never in the app or documents. | Code review; [07](07-security-and-privacy.md) |
| NFR-SEC-04 | Security | Storage buckets are private. Photos are shown through signed links. | Migrations 0001, 0002 |
| NFR-SEC-05 | Security | Uploaded files are checked for size, extension and real content type (PDF signature; DOCX structure). | `resume_text.py`; `test_resume_import.py` |
| NFR-SEC-06 | Security | Resume text is placed inside data tags in the AI prompt, and the AI is told to ignore instructions inside the resume (prompt-injection defence). | `resume_parser.py`; `test_resume_import.py` |
| NFR-SEC-07 | Security | Only model names on a server-side allow-list can be sent to an AI provider. | `ai_providers.py`; `test_ai_providers.py` |
| NFR-PRI-01 | Privacy | The resume file is not stored and resume text is not logged. | `test_resume_import.py` |
| NFR-PRI-02 | Privacy | Users are told before upload that resume text is sent to the chosen AI provider and that free plans of some providers may use submitted content to improve their products. | `ImportModelPicker.vue` |
| NFR-USE-01 | Usability | Every screen that loads data has a loading state, an empty state and a friendly error. | Frontend rules; UAT-23 |
| NFR-USE-02 | Usability | Raw technical errors are never shown to users. | `errors.ts`; `dashboard.spec.ts` |
| NFR-USE-03 | Usability | Mobile-first layout, designed and checked at 375 pixels wide. | Frontend rules; UAT-28 |
| NFR-ACC-01 | Accessibility | Buttons have text or labels for screen readers; errors are announced; tap targets are at least about 44 pixels; reduced-motion is respected. | Code review. No formal audit yet: **to be confirmed** |
| NFR-PERF-01 | Performance | A single AI provider request times out after 60 seconds; at most one retry is made when the answer is not valid JSON. | `ai_providers.py` |
| NFR-PERF-02 | Performance | Response-time and load targets. | **To be defined** (no targets agreed) |
| NFR-COMP-01 | Compatibility | Modern web browsers (development with Vite); Android through Capacitor. | Android project present; device testing **to be confirmed** |
| NFR-COMP-02 | Compatibility | iOS support. | Planned (Phase 7); no iOS project yet |
| NFR-MNT-01 | Maintainability | Business logic in plain functions with unit tests; routers thin; settings only through one settings module; model lists in environment variables. | Code structure; [05](05-architecture.md) |
| NFR-MNT-02 | Maintainability | Database changes are numbered migration files that are safe to re-run. | `supabase/migrations/` |
| NFR-REL-01 | Reliability | A failing activity-log write never breaks a request; one failing save in an import does not stop the others. | `supabase_client.py`; `importSave.ts` |

## 4. User stories and acceptance criteria

Format: *As a (role), I want (goal), so that (benefit).* Acceptance criteria use Given / When / Then.

### US-01 Sign up and log in (FR-AUTH-01 to FR-AUTH-05)

As a job seeker, I want to create an account and log in, so that my profile is saved privately.

- Given I am on the login screen, when I choose "Sign up", enter an email, a password of at least 6 characters and press "Create account", then I see "Account created. Check your email to confirm, then log in." and I am switched to the log-in form.
- Given I have an account, when I enter the correct email and password and press "Log in", then I arrive on the Home screen.
- Given I enter a wrong password, then I see "That email or password does not look right." and I stay on the login screen.
- Given I am not logged in, when I open any app address, then I am sent to the login screen.

### US-02 Personal info (FR-PROF-01 to FR-PROF-03)

As a job seeker, I want to save my basic details, so that they appear at the top of future resumes.

- Given I open Profile, Personal info, when I enter a full name and press Save, then I see "Profile saved." and the Profile screen shows my name.
- Given I leave the full name empty, then Save is refused with "Please enter your full name."
- Given I type "github.com/me" in GitHub, then it is saved as "https://github.com/me".
- Given I type letters in the phone field, then I see "Please enter a valid phone number, like +1 555 123 4567."

### US-03 Experience (FR-EXP-01, FR-EXP-02)

As a job seeker, I want to list my jobs, so that employers can see my history.

- Given I tap "Add", when I enter a role, company and start month and switch on "I currently work here", then the job is saved and listed first.
- Given I leave the end month empty and "I currently work here" is off, then I am asked to add an end month.
- Given I swipe an entry left and confirm, then it is deleted and the Home progress updates.

### US-04 Projects (FR-PRJ-01, FR-PRJ-02)

As a job seeker, I want to list projects I built, so that my skills are shown in action.

- Given I add a project name, a description and technologies separated by commas, then the project is saved with each technology as a tag, without duplicates.
- Given I enter an invalid web address in Link, then I see a friendly message and nothing is saved.

### US-05 Education (FR-EDU-01, FR-EDU-02)

As a job seeker, I want to list my education, so that my background is clear.

- Given I enter a school, then the entry can be saved even without a degree or years.
- Given the end year is before the start year, then I see "The end year cannot be before the start year."

### US-06 Skills and levels (FR-SKL-01 to FR-SKL-03, FR-SKL-05)

As a job seeker, I want to add the skills I really have with a level, so that matching can be honest later.

- Given I tap "Add skill" and search "python", then matching skills from the bank are listed; skills I already have are not.
- Given I pick a skill, then I must choose a level from 1 to 5 before saving; years are optional.
- Given a skill has no level, then it shows "Set level" and tapping it lets me set one.

### US-07 Custom skills (FR-SKL-04)

As a job seeker, I want to add a skill that is not in the list, so that my profile is complete.

- Given I search for a skill that is not in the bank, then I see `Add "<my text>" as a new skill`.
- Given the name has 2 to 60 characters with allowed characters only, when I save, then the skill is created once in the shared bank and added to my skills.
- Given another person already added the same skill, then the existing skill is used and no duplicate is created.
- Given the server cannot create the skill, then I see a message saying so and that I can pick a skill from the list.

### US-08 Resume import with AI model choice (FR-IMP-01 to FR-IMP-14)

As a job seeker, I want to import my existing resume and review the result, so that I do not retype everything and nothing wrong is saved.

- Given I open "Import from resume", then I see an "AI model" list and the note that my resume text is sent to the chosen provider and that my file is not stored.
- Given no provider is set up on the server, then I see "No AI provider is set up on the server yet. Please try again later." and cannot upload.
- Given I choose a PDF or DOCX up to 5 MB, then I see "Reading your resume..." with a Cancel button.
- Given the file is readable, then I see "Review what we found" with Personal info, Experience, Education, Projects and Skills sections.
- Given something could not be found, then it is left empty with the note "Not found - add it yourself".
- Given an item is already in my profile, then it is marked "Already in your profile" and cannot be saved again.
- Given I press "Save to profile", then only ticked, valid, non-duplicate items are saved and I see a summary such as "Added 2 experiences, 1 education, 8 skills."
- Given I press Discard after editing, then I am asked to confirm and nothing is saved.
- Given the file is a scanned image, then I see a message explaining that scanned resumes cannot be read yet.

### US-09 Profile photo (FR-AVA-01 to FR-AVA-05)

As a job seeker, I want a profile photo, so that my profile feels personal.

- Given I tap my avatar on the Profile screen, then I can choose from the gallery, take a photo, or (if I have one) remove it.
- Given I pick a JPEG, PNG or WebP photo up to 10 MB, then I can drag and zoom it in a round window and press "Save photo".
- Given I pick another file type, then I see "Please choose a JPEG, PNG or WebP photo."
- Given the database update has not been applied, then I see "Photo upload is not set up yet - run the database update."

### US-10 Themes (FR-THM-01 to FR-THM-03)

As a user, I want to change the colours, so that the app is comfortable for me.

- Given I tap the palette icon, then I see themes grouped as Light, Dark or All, and the one I tap is applied at once.
- Given I close and reopen the app, then my theme is still applied.

### US-11 Dashboard completeness (FR-DSH-02 to FR-DSH-05)

As a job seeker, I want to see how complete my profile is, so that I know what to do next.

- Given my profile is empty, then Home shows 0 of 8 steps and "Next: Add your full name".
- Given I add a work experience, then the ring and count update after I return to Home.
- Given all 8 checks pass, then Home shows "Your profile is complete. Nice work."

## 5. Requirements traceability

| Requirement | Feature | Status | Where tested |
|---|---|---|---|
| BRQ-01 | Master Profile screens | Built, awaiting verification | UAT-04 to UAT-10 |
| BRQ-02 | Resume import | Built, awaiting verification | `test_resume_import.py`, `importLogic.spec.ts`, UAT-11 to UAT-20 |
| BRQ-03 | Anti-invention guard; skills without level | Built, awaiting verification | `test_resume_import.py`, UAT-16 |
| BRQ-04 | RLS, private buckets | Built, awaiting verification | Migration review; UAT-29 |
| BRQ-05 | Free-tier providers | Built, awaiting verification | `test_ai_providers.py` (no real calls) |
| BRQ-06 | Web and Android | Available now / awaiting verification | UAT-28 |
| BRQ-07, BRQ-08 | Matching, generation, tracker | Planned | - |
| BRQ-09 | Friendly messages | Built, awaiting verification | `resumeImport.spec.ts`, `dashboard.spec.ts`, UAT-23 |
| FR-AUTH-01 to 05 | Login screen, router guard, database trigger | Available now | UAT-01 to UAT-03 |
| FR-AUTH-06 | Token check in API | Available now | `test_api.py` |
| FR-DSH-01 to 07 | Home screen | Available now / awaiting verification | `dashboard.spec.ts`, `profileLogic.spec.ts`, UAT-23, UAT-25 |
| FR-PROF-01 to 04 | Personal info and Profile screens | Built, awaiting verification | `profileLogic.spec.ts`, UAT-04 |
| FR-EXP, FR-PRJ, FR-EDU, FR-CRUD | Section screens | Built, awaiting verification | `profileLogic.spec.ts`, UAT-05 to UAT-07 |
| FR-SKL-01 to 06 | Skills screen, `/skills/custom` | Built, awaiting verification | `profileLogic.spec.ts`, `test_skills.py`, UAT-08 to UAT-10 |
| FR-IMP-01 to 14 | Import screen, `/profile/import-resume`, `/ai/models` | Built, awaiting verification | `test_resume_import.py`, `test_ai_providers.py`, `test_ai_models.py`, `importLogic.spec.ts`, `resumeImport.spec.ts`, `aiModels.spec.ts`, UAT-11 to UAT-20 |
| FR-AVA-01 to 05 | Profile photo | Built, awaiting verification | `imageCrop.spec.ts`, `avatarLogic.spec.ts`, `avatarStore.spec.ts`, UAT-21, UAT-22 |
| FR-THM-01 to 03 | Theme picker | Available now / awaiting verification | `theme.spec.ts`, `motion.spec.ts`, UAT-24 |
| FR-API-01 to 06 | Backend endpoints | Available now / awaiting verification | Backend test files |
| FR-AI, FR-DOC, FR-TRK, FR-AUT, FR-REL | Phases 3 to 7 | Planned | - |

Note: no automated test drives the screens themselves (there are no component or end-to-end tests yet). Screen behaviour is covered by the manual acceptance checklist in [10-testing-and-quality.md](10-testing-and-quality.md).
