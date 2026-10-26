# 01 - Product Overview

| Item | Detail |
|---|---|
| Document | Product overview |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Audience | Clients, sponsors, end users, project team |

**Purpose:** To explain what JobFit AI is for, who it helps, what it does today, and what it will not do. This file is written in plain language.

---

## 1. Vision

Applying for jobs is slow because every employer wants a slightly different resume and cover letter. JobFit AI aims to make this faster and calmer: you keep one trusted record of your real background, and the app helps you present it well for each job, without ever making things up.

## 2. Problem statement

| Problem | Effect on the job seeker |
|---|---|
| Resumes must be rewritten for each job | Hours of repeated work, copy-and-paste mistakes |
| Details are scattered across old files | Hard to remember what was said where |
| Online tools that "write for you" may add skills you do not have | Risk of false claims in an application |
| Applications are hard to track | Missed follow-ups |

JobFit AI's answer is a **Master Profile** (one source of truth), with an AI that is only allowed to work with the facts in it.

## 3. Target users

| User group | Description | Main need |
|---|---|---|
| Active job seekers | People applying to several jobs | Keep details in one place, reuse them |
| Career changers and graduates | People with limited experience or mixed backgrounds | Present real strengths honestly |
| Mobile-first users | People who prefer a phone | A simple app that works on a phone screen |

The primary user and owner of the project is a single developer (Ivant) building the app as a portfolio project. No customer list, user numbers or market figures exist, and none are claimed here.

## 4. Value proposition

- **One place for your facts.** Personal details, jobs, projects, education and skills in a single profile.
- **Honest by design.** The AI never invents skills or experience.
- **Fast start.** Import an existing PDF or DOCX resume, then review and correct it before anything is saved.
- **You stay in control.** Nothing is saved from an import until you press "Save to profile". Duplicates are detected for you.
- **Private.** Your uploaded resume file is not stored, and your profile data is only visible to you (see [07-security-and-privacy.md](07-security-and-privacy.md)).

## 5. The core rule

> **The AI never invents skills or experience.** It may rephrase, reorder and highlight real data only. Anything it cannot find stays blank. In the planned matching feature, skills that a job asks for but you do not have go to a "gaps" list instead of being added to your resume.

How this rule is enforced **today** in resume import:

1. The AI is told to copy only what is written in the resume and to use "not found" otherwise.
2. After the AI answers, the server checks emails, phone numbers, web links, dates, years, skills and technologies against the resume text. Values it cannot find in the text are removed.
3. Imported skills are added **without a level**. The app never guesses your level.
4. You review every item and can edit or untick it before saving.

Honest limit: free-text fields such as job titles, company names, bullet points and the summary are copied by the AI and are not word-for-word verified by the server. This is why the review step exists. See [07-security-and-privacy.md](07-security-and-privacy.md), section 4.

## 6. Key features and status

| Feature | Description | Status |
|---|---|---|
| Sign up and log in | Email and password through Supabase | Available now |
| Home dashboard: system checks | Shows whether login, profile record and backend are working | Available now |
| Home dashboard: profile completeness and recent activity | Progress ring (8 checks) and last 5 logged actions | Built, awaiting verification |
| Personal info | Name, headline, phone, location, links, summary | Built, awaiting verification |
| Experience, Projects, Education | Add, edit, delete entries | Built, awaiting verification |
| Skills with levels | Search the shared skills bank, set level 1 to 5 and years | Built, awaiting verification |
| Custom skills | Add a skill that is not in the bank | Built, awaiting verification |
| Resume import | Upload PDF or DOCX, choose an AI model, review, save | Built, awaiting verification |
| Profile photo | Choose or take a photo, adjust, save, remove | Built, awaiting verification |
| Themes | 35 colour themes, light and dark | Available now |
| Job description parsing and skill matching | Paste a job post, match against your profile, list gaps | Planned (Phase 3) |
| Tailored resume and cover letter generation | Using only real profile data | Planned (Phase 3) |
| DOCX/PDF export and editor | Download and edit generated documents | Planned (Phase 4) |
| Application tracker, activity logs, analytics | Follow each application from saved to offer | Planned (Phase 5) |
| Automation | Share-to-app, follow-up reminders, weekly report | Planned (Phase 6) |
| Release polish | Testing, Android/iOS builds, screenshots | Planned (Phase 7) |

The **Jobs** and **Tracker** tabs exist in the app but only show a "Coming soon" message.

## 7. Scope

### 7.1 In scope (version 0.1.0)

| Area | Included |
|---|---|
| Accounts | Sign up, log in, log out |
| Master Profile | Personal info, experience, projects, education, skills (with custom skills) |
| Resume import | PDF and DOCX, up to 5 MB, choice of AI model, review before saving |
| Profile photo | Private storage, in-app crop |
| Appearance | 35 themes |
| Platforms | Web browser; Android through Capacitor |

### 7.2 Out of scope (version 0.1.0)

| Area | Reason |
|---|---|
| Job description parsing, matching, resume and cover letter generation | Planned for Phase 3 |
| DOCX/PDF export and document editor | Planned for Phase 4 |
| Application tracker and analytics | Planned for Phase 5 |
| Reminders, share-to-app, weekly report | Planned for Phase 6 |
| iOS app | No iOS project exists yet; release work is Phase 7 |
| Reading scanned (image-only) resumes | No text recognition (OCR) is built |
| Old Word files (.doc) | Not supported; save as .docx or PDF |
| Password reset, account deletion, profile export screens | Not found in the app; **to be confirmed** whether planned |

## 8. Assumptions

| ID | Assumption |
|---|---|
| A-1 | Users have an email address and an internet connection. |
| A-2 | The project owner runs the Supabase project and applies the database migrations in order (0001, then 0002). |
| A-3 | At least one AI provider key (Groq, Google Gemini or OpenAI) is configured on the server for resume import to work. |
| A-4 | Free-tier AI plans are enough for development and testing. |
| A-5 | Users upload text-based PDF or DOCX resumes. |
| A-6 | Whether new accounts must confirm their email depends on the Supabase project settings. |

## 9. Constraints

| ID | Constraint |
|---|---|
| C-1 | Technology is fixed: Ionic and Vue front end, FastAPI back end, Supabase for database, login and storage. |
| C-2 | AI cost must stay low: resume import uses free-tier providers, which have rate limits and may change model names. |
| C-3 | Secrets (service key, AI keys) must live only on the server. |
| C-4 | The AI must never invent skills or experience. |
| C-5 | A single developer builds and maintains the project. |
| C-6 | Resume file limits: 5 MB, 30 pages read, 30,000 characters sent to the AI. |

## 10. Success criteria

These are qualitative. No numeric targets have been agreed, so none are stated.

| ID | Criterion | How it is judged |
|---|---|---|
| S-1 | A new user can create an account and reach the Home screen without help. | Acceptance checklist UAT-01 to UAT-03 ([10](10-testing-and-quality.md)) |
| S-2 | A user can build a complete Master Profile by hand. | UAT-04 to UAT-10 |
| S-3 | A user can import a text-based resume, review it and save it, and nothing is saved without confirmation. | UAT-11 to UAT-18 |
| S-4 | Imported data contains no skills, dates or contact details that are not in the resume. | UAT-16 and the automated anti-invention tests |
| S-5 | One user can never see another user's profile data or photo. | Access-rule review ([06](06-data-model.md)); live check **to be confirmed** |
| S-6 | Errors are shown in friendly words, never as raw technical text. | UAT-23 and troubleshooting table in [03](03-user-guide.md) |
| S-7 | The project owner can explain, run and extend the system using this documentation. | Review of files 05, 06, 08 and 12 |

## 11. Related documents

- Requirements in detail: [02-requirements-specification.md](02-requirements-specification.md)
- How to use the app: [03-user-guide.md](03-user-guide.md)
- Roadmap: [09-roadmap-and-status.md](09-roadmap-and-status.md)
