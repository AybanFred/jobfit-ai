---
name: email-feature-design
description: Design decisions for "Recruiter email + AI application email" (Jobs field, Tracker Email tab), decided 2026-10-26
metadata:
  type: project
---

Feature spec delivered 2026-10-26. Decisions (the frontend-engineer implements; I never edit source):

- Tracker detail tab order: Resume | Cover letter | Email | Match | Job post (the three things you send are grouped; analysis after). Keep the segment non-scrollable, 5 equal buttons.
- Email tab order top to bottom: warning card (if any) -> "Application email" card (To, Subject+Copy, Message+Copy, quiet "Write a new version") -> "Attach your resume and cover letter" card (existing Download PDF/DOCX per document) -> primary "Open in email app" (gradient, size large, mailto via href) -> hint -> "Sent it?" banner. Download comes before Open because files must exist before the user attaches them.
- "Sent it? Mark as Applied" is an INLINE banner (role=status, no auto-hide), not a toast. Why: toasts here are top-positioned, 2.2 s, no action button, and are missed when the user comes back from another app. Shows only when status is "saved", after the app regains focus (visibilitychange/focus/Capacitor resume, 4 s fallback). Ends on Mark / "Not yet" / status change / tab switch. Backend already sets applied_at when status becomes applied.
- Regenerate asks for confirmation (confirmAction) because it replaces the text; the old email stays until the new one arrives; Cancel and errors restore it. First-time "Write email" has no confirm.
- Copy feedback is in-place ("Copy" -> "Copied" for 2 s + hidden live region), not a toast. Subject/Message are read-only text blocks, never readonly inputs.
- Visible label "Message" (not "Body") for plain language.
- Recruiter email input: autocomplete="off" (never autofill the user's own address), optional, validated on blur, helper says "Not sent to the AI".
- Email warnings stay inside the Email tab (own card, heading "Please check these lines"); do not merge into the Match-tab pill count.
- Partial failure: if the email part of Go fails, still save resume + letter; Email tab shows the empty state.

**Why:** owner wants simple, clean UI; job seekers are stressed; the product rule is never to invent facts, so warnings must be visible next to the text being sent.
**How to apply:** reuse these choices for any later email-related screens (follow-up reminder emails in Phase 6 should reuse the same Copy / Open in email app / Sent it banner patterns).
