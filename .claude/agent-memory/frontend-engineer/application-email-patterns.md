---
name: application-email-patterns
description: Recruiter email + AI application email slice (2026-10-26, fix round same day) - Jobs form field/toggle, Tracker Email tab, store email state, refresh-vs-save race guard, mailto builder, "Sent it?" composable, page test setup, pitfalls
metadata:
  type: project
---

Built 2026-10-26 (frontend only; backend contract from the backend-engineer). See [[tracker-screen-patterns]], [[jobs-screen-patterns]].
- jobsLogic: `isEmailAddress` mirrors backend `app/services/applications.py` regexes exactly (keep in sync), `cleanEmail`, `validateOptionalEmail`, `EMAIL_ERROR`, `RECRUITER_EMAIL_HINT`. `TailorForm` has `recruiterEmail` + `writeEmail`; request sends `recruiter_email` / `write_email`. `statusLineAt(ms, withEmail)`, `savedToTrackerMessage` (3 texts) + `savedToTrackerDuration` (4000 ms when an email was asked for).
- trackerLogic: `recruiter_email` is an EditableField (PATCH reuses optimistic `patchApplication`). `emailWarningsOf/matchWarningsOf` (prefix "The email"), `buildMailtoUrl` returns `string | null` (null = encodeURIComponent URIError on a lone surrogate; `emailSendState` then disables Open with `CANNOT_OPEN_EMAIL_HINT`), `friendlyEmailError` (400 with "model" in detail -> adds `CHOOSE_OTHER_MODEL`), `newestEmail`.
- stores/tracker: `writeEmail(id, modelId)` / `cancelEmail` (AbortController + run counters + 2-min timeout). Refresh-vs-save race guard: module `patchClock` bumped on every patch start AND finish (`patchTouched` per id); `loadList`/`loadDetail` note `since = patchClock` and, if `patchedSince(id, since)`, keep `currentFields(id)` and do not overwrite `confirmed`. `withPending(a, since)`.
- Components: `ApplicationEmailPanel` (To label "To (recruiter email)"; after a new email focuses the warning h2 if warnings, else the title; both `focus-target` with no outline), `EmailTextBlock`, `EmailSentBanner`; `composables/useSentItBanner`; `services/clipboard.copyText`.
- TrackerDetailPage: Email tab model = `jobs.modelId ?? savedModelId` (ref from `loadSavedModel()`, re-read in onIonViewWillEnter; jobs store is only filled once the Jobs tab mounted). `markApplied` calls `store.patchApplication` directly (save() would show the error on the off-screen Progress card). `check-row` holds the Match pill and an Email pill ("Please check N lines in the Email tab", hidden while writing).

Testing a routed Ionic page (tests/unit/trackerDetailPage.spec.ts): `vi.mock('@ionic/vue', async (orig) => ({ ...(await orig()), onIonViewWillEnter: push-to-array, onIonViewWillLeave: noop, useIonRouter: () => ({ back, navigate }) }))`; VTU stubs by PascalCase name work for script-setup-imported Ionic components; containers need slot-rendering stubs; emit `ionChange` from the IonSegment stub via `findComponent(Stub).vm.$emit`.

Pitfalls found:
- `ion-button` moves `aria-describedby` into its shadow DOM, so a light-DOM id does not resolve: do not use it on ion-button (hint just follows the button).
- `scrollIntoView` does not scroll ion-content in headless checks: resize first, then `(await ionContent.getScrollElement()).scrollTop += …`.
- Tailwind/daisy collisions found: `.to-error`, `.card-title`. Check new class names against the built dist CSS (grep `.<name>` rules without `data-v-`).
- Material segment labels: use `text-transform: none; letter-spacing: 0` + `overflow-wrap/word-break: normal` on every segment (Jobs and Tracker now match).
