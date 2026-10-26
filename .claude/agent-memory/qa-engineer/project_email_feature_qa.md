---
name: project-email-feature-qa
description: QA findings for the recruiter email + AI application email feature (2026-10-26): open bugs, fragile spots, what was not verifiable
metadata:
  type: project
---

QA of commits 21d476b / 0532013 / f157d92 (recruiter_email, write_email, POST /applications/{id}/email, Email tab).
Baseline before my tests: backend 386 passed, frontend 21 files / 407 tests. After: backend 463 passed + 3 xfailed,
frontend 24 files / 497 tests. Build passed.

Open bugs reported (check they are still present with the strict markers before re-reporting):
- backend/app/services/applications.py `_LOCAL_RE/_LABEL_RE/_TLD_RE`: `$` matches before a trailing "\n", so
  "a\n@b.com" and "a@b\n.com" are accepted and stored. JS side is stricter (JS `$` has no such quirk).
  Guarded by xfail(strict) tests in backend/tests/test_email_qa.py.
- frontend stores/tracker.ts loadDetail/loadList: a refresh sent BEFORE a patch and answered AFTER it overwrites the
  confirmed value (recruiter_email, status, notes) with the old one; the To box then shows the old address.
  Guarded by `it.fails` in frontend/tests/unit/emailQa.spec.ts.
- tailor_validator `_MD_LINK_RE` is quadratic ("[a](" repeated: 40k chars = 2s, 160k = 40s); no max_tokens is set on AI calls.
- Email greeting is only checked on the FIRST line; placeholders ("[Your Name]") and unknown URLs in the email are not flagged.
- buildMailtoUrl throws URIError on a lone surrogate (unreachable in practice).

**Why:** these are the spots where "validated twice" logic (Python + JS) or optimistic UI can silently disagree.
**How to apply:** when new fields are added to PATCH /applications or new validators are mirrored in JS, re-run the
parity tables (emailQa.spec.ts address table vs test_email_qa.py) and look for `^...$` regexes in Python (use fullmatch).

Not verifiable in this environment: real Supabase/Postgres (migration only linted statically), real AI provider,
Android/iOS mailto from the Capacitor WebView, real mail clients (desktop clients cut mailto links near 2,000 chars;
a max-size email encodes to more than that).
