# VantixFit AI - Project Documentation

| Item | Detail |
|---|---|
| Document | Documentation set - index and reading guide |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Author | Prepared with Claude Code for Ivant |
| Project owner | Ivant |
| Product version described | 0.1.0 |
| Audience | Clients, end users, project owner, developers, testers |

**Purpose:** This folder is the complete documentation set for VantixFit AI. This page explains what is in each file and who should read it.

---

## 1. What is VantixFit AI?

VantixFit AI is a job-hunting app. The long-term idea is simple: you paste a job description, and the app helps you create a resume and cover letter that fit that job, using only the real facts you have stored about yourself.

Today (24 October 2026), the app helps you build and keep your **Master Profile**. This is one safe place that holds your personal details, work experience, projects, education and skills. You can type everything in yourself, or import it from an existing PDF or DOCX resume and review it before it is saved.

> **Core rule of the product:** the AI never invents skills or experience. It may only rephrase, reorder and highlight real data. Anything the app cannot find stays blank, and in the planned job-matching feature, missing skills go to a "gaps" list.

## 2. Where the project stands today

Every feature in this documentation carries one of three status labels.

| Label | Meaning |
|---|---|
| **Available now** | Built and accepted as complete (Phase 1). |
| **Built, awaiting verification** | Built (Phase 2) and covered by automated tests where noted, but not yet formally accepted. The manual acceptance checklist is in [10-testing-and-quality.md](10-testing-and-quality.md). |
| **Planned** | Not built. Described only so readers know the direction. Phases 3 to 7 are all in this group. |

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: database, API skeleton, app shell, login | Available now |
| 2 | Master Profile: profile screens, resume import, profile photo | Built, awaiting verification |
| 3 to 7 | AI job matching and document generation, export and editor, tracker and analytics, automation, release polish | Planned (nothing built) |

Details are in [09-roadmap-and-status.md](09-roadmap-and-status.md).

## 3. Table of contents

| # | File | One-line description | Who should read it |
|---|---|---|---|
| 01 | [01-product-overview.md](01-product-overview.md) | Vision, problem, users, scope, assumptions and success criteria | Everyone, especially clients |
| 02 | [02-requirements-specification.md](02-requirements-specification.md) | Business, functional and non-functional requirements, user stories, traceability | Clients, analysts, testers |
| 03 | [03-user-guide.md](03-user-guide.md) | Step-by-step guide for using the app, FAQ and troubleshooting | End users, support staff |
| 04 | [04-system-analysis-and-design.md](04-system-analysis-and-design.md) | Actors, use cases, diagrams, business rules, error handling | Analysts, developers, testers |
| 05 | [05-architecture.md](05-architecture.md) | Architecture, technology, components, AI provider layer, design decisions | Developers, technical stakeholders |
| 06 | [06-data-model.md](06-data-model.md) | Tables, relationships, access rules, storage buckets, sample data | Developers, database staff |
| 07 | [07-security-and-privacy.md](07-security-and-privacy.md) | Security model, privacy and data handling, risks | Clients, security reviewers, developers |
| 08 | [08-api-reference.md](08-api-reference.md) | Every backend endpoint and the direct Supabase access | Developers |
| 09 | [09-roadmap-and-status.md](09-roadmap-and-status.md) | Phase roadmap, limitations, risks, next steps, decisions log | Clients, project owner |
| 10 | [10-testing-and-quality.md](10-testing-and-quality.md) | Test strategy, results, how to run tests, acceptance checklist | Testers, clients (acceptance) |
| 11 | [11-glossary.md](11-glossary.md) | Plain-language explanation of terms | Everyone |
| 12 | [12-installation-and-operations.md](12-installation-and-operations.md) | Setup on Windows, configuration, running, Android, troubleshooting | Technical staff |
| - | [CHANGELOG.md](CHANGELOG.md) | What changed, by version | Everyone |

## 4. How to read this documentation

Pick the path that matches your role. You do not need to read everything.

| If you are... | Start with | Then read |
|---|---|---|
| A client or sponsor | [01](01-product-overview.md) | [09](09-roadmap-and-status.md), [07](07-security-and-privacy.md) (sections 1 to 3), [02](02-requirements-specification.md) |
| An end user | [03](03-user-guide.md) | [11](11-glossary.md) if a word is unclear |
| An acceptance tester | [10](10-testing-and-quality.md) (section 5) | [03](03-user-guide.md), [02](02-requirements-specification.md) |
| A business or system analyst | [02](02-requirements-specification.md) | [04](04-system-analysis-and-design.md), [06](06-data-model.md) |
| A developer | [05](05-architecture.md) | [08](08-api-reference.md), [06](06-data-model.md), [12](12-installation-and-operations.md) |
| A security reviewer | [07](07-security-and-privacy.md) | [05](05-architecture.md), [06](06-data-model.md) |

**Two audiences, kept apart.** Files 01, 03 and 09 are written in plain language. Files 04, 05, 06, 07 (later sections), 08 and 12 are technical. File 02 has both: the business requirements and user stories are plain, the non-functional requirements are technical.

## 5. Conventions used in all files

- **Product name:** VantixFit AI. **Main data area:** Master Profile.
- **IDs:** `BRQ-` business requirement, `FR-` functional requirement, `NFR-` non-functional requirement, `US-` user story, `UC-` use case, `BR-` business rule (file 04), `UAT-` acceptance test (file 10), `ERR-` error case (file 04).
- **Priorities:** Must, Should, Could.
- **Honesty rule:** If the code does not clearly confirm a behaviour, the text says **to be confirmed** instead of guessing.
- **No secrets:** These documents never contain keys, passwords or the contents of any `.env` file. Only variable *names* are shown, with placeholder values.
- **Screenshots:** Not included yet. The checklist of screenshots to add is at the end of [03-user-guide.md](03-user-guide.md).
- **Dates:** Written as day, month name, year (for example 24 October 2026).

## 6. Source of truth

This documentation was written by reading the actual code, database migrations and tests in the repository on 24 October 2026. If the code and a document disagree, the code is correct and the document should be corrected. Please report the difference to the project owner.
