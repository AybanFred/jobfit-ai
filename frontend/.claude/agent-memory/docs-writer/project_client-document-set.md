---
name: client-document-set
description: Conventions of the client-facing documentation set in C:\Projects\jobfit-ai\document (IDs, status labels, header, file list, facts to re-verify)
metadata:
  type: project
---

On 24 October 2026 a full client/end-user documentation set was created in `C:\Projects\jobfit-ai\document` (README, 01 to 12, CHANGELOG). It is separate from `docs/` (CHANGELOG/API/phase notes, which did not exist yet).

Conventions used (keep them when updating):
- Header table per file (Document, Version 1.0 draft, Date, Status, Audience) then a bold **Purpose:** line; numbered headings; no emojis; "Master Profile" term.
- Status labels: "Available now" (Phase 1), "Built, awaiting verification" (Phase 2), "Planned" (Phases 3-7, never described as working). Unsure facts are marked "to be confirmed" / "to be defined".
- ID prefixes: BRQ (business requirement), FR-<AREA>-nn, NFR-, US-, UC-, BR-nn (business RULE), ERR-, UAT-nn (29 acceptance tests in file 10), R-/PR- risks, D- decisions, L- limitations.
- Mermaid only (flowchart, sequenceDiagram, erDiagram, stateDiagram-v2); quote labels with special characters.

**Why:** the owner (Ivant) wants a professional deliverable for clients and end users, with honest status and no invented metrics.

**How to apply:** when code changes, update the matching files (API -> 08, tables -> 06, screens/messages -> 03 and 04, tests/counts -> 10, status -> 09 and README, changes -> CHANGELOG). Re-verify against code first; test counts last reported: backend 101 passing, frontend 177 passing + 1 stale `tests/unit/example.spec.ts` failing.

Known inconsistencies noted in file 09 section 6 (Ionic 8 vs package.json ^9, version 0.0.1 vs 0.1.0, Python 3.11 vs 3.12, root README is Phase 1 only, frontend env template lives in `frontend-files/`).
