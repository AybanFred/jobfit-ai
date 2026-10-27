# 07 - Security and Privacy

| Item | Detail |
|---|---|
| Document | Security and privacy |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Audience | Clients, security reviewers, developers (sections 1 to 3 are in plain language) |

**Purpose:** To explain how VantixFit AI protects personal data (a resume is personal data), what is stored and what is not, what is shared with outside AI companies, and which risks remain. No keys, passwords or `.env` contents appear in this document.

> This is a description of the code as read on 24 October 2026. It is **not** an independent security audit or a legal compliance review. No penetration test has been done.

---

## 1. Plain-language summary

| Question | Short answer |
|---|---|
| Who can see my profile? | Only you. The database checks this on every request. |
| Is my resume file kept? | No. It is read in memory and thrown away. |
| Is my resume text kept or logged? | No. |
| Does my resume text leave the system? | Yes, but only when you import a resume: the text is sent to the AI provider you choose. |
| Can the AI invent skills for me? | No. The server removes anything it cannot find in your resume, and you review everything before it is saved. |
| Is my profile photo public? | No. It is private and shown only through a short-lived link. |
| Are passwords stored by VantixFit AI? | No. Login is handled by Supabase Auth. |

## 2. Security model

| # | Control | How it works | Evidence |
|---|---|---|---|
| 2.1 | Authentication | Supabase Auth handles sign-up, login and sessions (email and password). The app keeps the session on the device and refreshes it automatically. | `services/supabase.ts`, `stores/auth.ts` |
| 2.2 | Token verification in the API | Every protected endpoint requires `Authorization: Bearer <token>`. The API verifies the signature, expiry and subject, and requires audience `authenticated`. Newer Supabase projects use asymmetric keys (ES256/RS256, fetched from the project's JWKS address); older ones use a shared secret (HS256). Missing or bad tokens get 401. | `core/auth.py`, `test_api.py` |
| 2.3 | Route guard in the app | Screens under `/tabs` require login; signed-in users cannot open the login screen. This is for convenience; real protection is in the database and API. | `router/index.ts` |
| 2.4 | Row Level Security (RLS) | Enabled on all tables. A signed-in user can read and change only rows whose owner is their own id. Storage rules do the same for folders. | Migrations 0001 and 0002 |
| 2.5 | Two kinds of Supabase key | The app uses only the publishable (anon) key. The secret (service) key, which bypasses RLS, is read only by the backend from its environment. | `core/config.py`, `.env.example` files |
| 2.6 | Service-key queries are filtered | Backend code that uses the admin client must filter by user id (project rule). Current backend code writes only: `activity_logs` rows for the caller, shared `skills`, and a `profiles` read for the caller. | `routes.py`, `services/skills.py` |
| 2.7 | Private buckets, signed URLs | Buckets `documents` and `avatars` are private. Photos are shown through a signed link valid for 1 hour. | Migrations; `services/avatar.ts` |
| 2.8 | Input validation and limits | Pydantic models validate the custom-skill request. Form fields have length limits in the app. Resume upload is limited to 5 MB, 30 pages and 30,000 characters. | `api/skills.py`, `resume_text.py`, `profileLogic.ts` |
| 2.9 | File validation | The extension must be `.pdf` or `.docx`, and the content must match: PDFs must start with the PDF signature; DOCX must be a valid zip containing `word/document.xml`. Oversized DOCX content is refused (guard against zip bombs). Reading stops at 5 MB plus one byte. | `resume_text.py`, `test_resume_import.py` |
| 2.10 | Model allow-list | Only models named in the server configuration can be called. A client cannot send an arbitrary model name. | `ai_providers.py`, `test_ai_providers.py` |
| 2.11 | Keys never leave the server | AI keys are used only in outgoing requests (Gemini key in a header, not in the web address). Error messages and logs never contain keys, request bodies or provider answers. | `test_ai_providers.py` (no-leak tests) |
| 2.12 | CORS | Only origins in `CORS_ORIGINS` may call the API from a browser. | `main.py`, `config.py` |
| 2.13 | Friendly errors | Users see short sentences, not stack traces or raw responses. | `errors.ts`, `resumeImport.ts` |

### 2.14 Prompt-injection defence

A resume could contain text such as "ignore previous instructions". The defences are:

1. The resume text is placed between `<resume_text>` and `</resume_text>` tags, and the prompt says that everything inside is data only.
2. Look-alike tags inside the resume are removed so the data block cannot be closed early.
3. The prompt tells the model to ignore instruction-like text and to extract only what is explicitly written.
4. Whatever the model answers is checked again by the anti-invention guard, so injected "skills" that are not in the resume text are dropped.
5. The model answers in JSON that is reshaped by code; it cannot trigger actions.

Tests: `test_prompt_injection_stays_inside_data_tags` and `test_injection_text_only_inside_data_tags_in_the_real_request`.

## 3. Privacy and data handling

### 3.1 What is stored

| Data | Where | Notes |
|---|---|---|
| Email and login | Supabase Auth | Passwords are handled by Supabase |
| Profile details | `profiles` | Name, headline, email, phone, location, links, summary, photo path |
| Experience, projects, education | Their own tables | As entered or imported and confirmed |
| Skills | `user_skills` (and the shared `skills` bank for names) | Level and years optional |
| Profile photo | Private bucket `avatars` | 512 by 512 JPEG |
| Activity log | `activity_logs` | Action codes and small facts |
| Preferences on the device | Browser storage | Theme, last AI model choice, login session |

### 3.2 What is NOT stored

- The uploaded resume file (PDF or DOCX).
- The extracted resume text.
- The AI provider's raw answer.
- The original (uncropped) photo. Cropping and shrinking happen in the browser; only the final JPEG is uploaded.
- Any activity log field containing resume content: `resume.parsed` keeps only provider, model, counts and file type.

### 3.3 What is sent to third parties, and when

| Recipient | What | When |
|---|---|---|
| Supabase | Account data, profile data, photos | Normal use |
| Groq, Google (Gemini) or OpenAI (only the one you choose) | The system prompt and the **text of your resume** (up to 30,000 characters). The file itself and your account details are not sent; the text contains whatever is written in your resume, including any contact details | Only when you press to read a resume in Import from resume |

Plain-language note shown to users and repeated here: **free plans of some AI providers may use submitted content to improve their products.** The app does not control this. Users who are concerned should type their profile by hand instead of importing. Each provider's own terms apply; they are not summarised here and should be reviewed by the project owner before real users are invited (**to be confirmed**).

### 3.4 Profile photo

The photo is cropped on the device, uploaded as a JPEG to the private `avatars` bucket in the user's own folder, and shown through a signed link. Removing the photo clears the reference and deletes the file. Each upload uses a new file name; the previous file is deleted after the new one is saved.

## 4. The anti-invention guard

After the AI answers, `clean_draft` in `resume_parser.py` compares the answer with the resume text:

| Field | Rule |
|---|---|
| Email | Must look like an email and appear in the text |
| Phone | 7 to 15 digits, and the digits must appear in the text's digits |
| GitHub, LinkedIn, website, project link | Must look like a web address and appear in the text (scheme and `www.` ignored) |
| Start/end month | Format `YYYY-MM`, year 1950 to 2100, and the year must appear in the text |
| Education years | Whole number 1950 to 2100 that appears in the text |
| Current job | Allowed only if the text contains a word such as present, current, now, ongoing or today; then the end date is cleared |
| Skills, project technologies | 2 to 60 characters, must appear in the text as a whole word (so "Go" does not match "Google"); duplicates removed |
| All text fields | Trimmed, empty becomes null, length clamped (200 short, 1,000 long, 500 per bullet) |
| Lists | Capped: 20 experiences, 12 bullets each, 10 education, 20 projects, 30 technologies each, 60 skills |

**Honest limit.** Names, job titles, companies, locations, degrees, bullets, descriptions and the summary are **not** compared word for word with the resume. They rely on the prompt ("copy the original wording") and on the user's review. A model could in theory paraphrase or misplace such text. This is why nothing is saved without review, and why the review screen lets the user edit or untick everything.

## 5. Shared global skills bank: trade-off

The `skills` table has no owner. Every signed-in user can read all of it, and custom skills added by anyone are part of it. Consequences:

- A custom skill name (for example "Rust") becomes visible to all signed-in users when they search for skills.
- A user's level and years are in `user_skills` and are private.
- Only the backend can add skills (users have no write access), and the name is validated (2 to 60 characters; letters, digits, spaces and `. + # - / & _`).
- Users are warned in this documentation not to type personal information as a skill name. Whether the app itself should show a warning is **to be confirmed**.

Benefit: one shared vocabulary, no duplicates, and future matching can use it.

## 6. Data-protection checklist

| # | Item | Status |
|---|---|---|
| 1 | Secrets only in `.env` files that are not committed (`.env`, `.env.*` are ignored; `.env.example` is kept) | In place |
| 2 | Service key and AI keys absent from the frontend | In place (frontend reads only `VITE_` variables with the anon key) |
| 3 | RLS enabled on every table | In place |
| 4 | Private buckets with per-user folder policies | In place |
| 5 | Resume file and text not stored or logged | In place (tested) |
| 6 | Users informed about third-party AI processing before upload | In place (note on the import screen) |
| 7 | Activity log contains no resume content | In place (tested) |
| 8 | Live cross-user isolation test with two real accounts | Not yet done (UAT-29) |
| 9 | Review of each AI provider's data terms | **To be confirmed** |
| 10 | Privacy policy and terms for users | Not written |
| 11 | Account deletion and data export for users | Not available in the app |
| 12 | Data retention periods and backup policy | **To be defined** |
| 13 | Migration 0002 applied on the live Supabase project | **To be confirmed** by the project owner |

## 7. Known risks and mitigations

| ID | Risk | Likelihood / impact | Mitigation in place | Recommended next step |
|---|---|---|---|---|
| R-01 | Resume text processed by a third party that may reuse free-plan content | Medium / Medium | Clear note before upload; user chooses the provider; file not stored | Review provider terms; consider a paid plan or a provider with a no-training policy |
| R-02 | AI paraphrases or mis-assigns free-text fields | Medium / Medium | Prompt rules; review step; guard for verifiable fields | Optional: extra similarity check for bullets |
| R-03 | Service key used carelessly, bypassing RLS | Low / High | Project rule to filter by user id; backend writes are few | Add a test that every user-data query filters by user id as the API grows |
| R-04 | Invalid-token error text echoes the library's reason (`Invalid token: ...`) | Low / Low | Contains no secrets | Consider a generic message |
| R-05 | No application-level rate limiting on the API | Medium / Medium | Provider limits and 60-second timeout; login is protected by Supabase | Add per-user rate limits before public release |
| R-06 | `GET /health` is public and reports the environment name and whether Supabase/AI are configured | Medium / Low | No secrets or values | Reduce detail in production |
| R-07 | Android debug settings: `usesCleartextTraffic` is true and `allowBackup` is true | Medium / Medium for release | Fine for local development | Switch to HTTPS only and review backup setting before release |
| R-08 | Capacitor `appId`/`appName` are still starter placeholders | Certain / Low | None | Set real values in Phase 7 |
| R-09 | Custom skill names are visible to all users | Medium / Low | Name validation; documented | Optional: moderation or per-user custom skills |
| R-10 | Free AI tiers rate-limit or change models | High / Low | Friendly busy message; configurable model lists; user can switch provider | Monitor; keep lists current |
| R-11 | Direct app writes are not in the activity log | Certain / Low | None | Decide whether to log profile edits (project convention says backend actions are logged) |
| R-12 | Unused photo file left behind after a failed cleanup | Low / Low | Private bucket; cleanup attempted | Periodic cleanup job (optional) |
| R-13 | Login session is kept in browser storage, readable by script on the same origin | Low / Medium | Standard Supabase behaviour; no `v-html` or `innerHTML` use found in the frontend source | Keep dependencies updated; review before release |

## 8. Responsible-use guidance for users

- Only enter facts that are true. You are responsible for what you send to employers.
- Review everything the import suggests; the AI can misread layouts.
- Avoid importing resumes that contain sensitive details you do not want processed by an outside AI company (for example national ID numbers). Remove them first.
- Do not share your login. Log out on shared devices.
- Use a strong, unique password.
- Do not type personal information into skill names, because the names of custom skills are shared.

Related: [05-architecture.md](05-architecture.md), [06-data-model.md](06-data-model.md), [08-api-reference.md](08-api-reference.md).
