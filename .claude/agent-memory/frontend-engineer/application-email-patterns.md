---
name: application-email-patterns
description: Recruiter email + AI application email slice (2026-10-26) - Jobs form field/toggle, Tracker Email tab, store email state, mailto builder, "Sent it?" composable, pitfalls
metadata:
  type: project
---

Built 2026-10-26 (frontend only; backend contract from the backend-engineer). See [[tracker-screen-patterns]], [[jobs-screen-patterns]].
- jobsLogic: `isEmailAddress` mirrors backend `app/services/applications.py` regexes exactly (keep in sync), `cleanEmail`, `validateOptionalEmail`, `EMAIL_ERROR`, `RECRUITER_EMAIL_HINT` (go-hint differs from the field error; `firstFormProblem` maps it). `TailorForm` has `recruiterEmail` + `writeEmail`; request sends `recruiter_email` / `write_email`. `normalizeEmailDraft`, `cleanEmailSubject/Body` (CRLF->LF). `statusLineAt(ms, withEmail)`, `savedToTrackerMessage`.
- trackerLogic: `recruiter_email` is an EditableField (so PATCH reuses the optimistic `patchApplication` with undo). `StoredEmail`, `normalizeWrittenEmail`, `emailWarningsOf/matchWarningsOf` (prefix "The email"; Match tab + pill exclude them), `buildMailtoUrl` (encodeURIComponent, CRLF, address encoded except @, empty To -> `mailto:?`), `emailSendState`, `friendlyEmailError(e, 'first'|'regenerate')`, `newestEmail` (loadDetail keeps an email written while a refresh was in flight).
- stores/tracker: `writeEmail(id, modelId)` / `cancelEmail` with module-level AbortController + run counters + 2-min timeout; `emailWriting/emailError/emailWarnings` (warnings keyed by email id); toasts live in the store.
- Components: `ApplicationEmailPanel` (Email tab; To draft keeps typed text after a failed save via a `lastSaved` baseline), `EmailTextBlock` (read-only text + Copy), `EmailSentBanner`; `composables/useSentItBanner` (arm on Open tap; reveal on visibilitychange/window focus/Capacitor App resume or 4 s fallback; hidden while page hidden; `canShow` = status saved || marking). `services/clipboard.copyText` (Clipboard API, execCommand fallback, restores focus). `showToast(msg, kind, durationMs?)`.
- TrackerDetailPage: 5-tab `doc-seg` uses normal letter case (Material uppercase cut "RESUME" at 375 px); Progress card "Saving…" counts only its own saves (`savesRunning`), not the shared `store.saving`. Model for the Email tab = jobs store `modelId` (null -> backend default).

Pitfalls found:
- `ion-button` moves `aria-describedby` into its shadow DOM, so an id in light DOM does not resolve (kept per spec; hint follows the button in reading order).
- `scrollIntoView` does not scroll ion-content in headless checks: resize first, then `(await ionContent.getScrollElement()).scrollTop += …`.
- Tailwind/daisy collisions found this time: `.to-error` (gradient utility), `.card-title` (daisy). Run scratchpad `visual/class-scan.mjs <frontendDir> <files…>` after adding class names.
