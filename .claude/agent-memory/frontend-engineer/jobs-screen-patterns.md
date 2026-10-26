---
name: jobs-screen-patterns
description: Phase 3 Jobs screen (slice 2 "Go" flow) - files, POST /tailor + /resumes contract choices, store design, result previews, pitfalls
metadata:
  type: project
---

Jobs tab = one form -> Go -> working; on success the store clears link+text (keeps resume/template/model), the page toasts "Saved to your Tracker" and opens `/tabs/tracker/<application_id>` (only if still on /tabs/jobs). The in-page results view and Saved jobs list were removed 2026-10-26; see [[tracker-screen-patterns]]. `tailor()` returns `TailorResult | null`.
- `services/jobsLogic.ts` (pure, tested): form validation (`validateTailorForm`, `validateJobUrl` matches backend `^https?://\S+$`, lowercases scheme), `buildTailorRequest`, `normalizeTailorOut` (null only for non-objects; every field -> '' / []), `normalizeScore` (0.82 -> 82, clamp 0..100), `TEMPLATES` list (add a template = new entry + preview component), `statusLineAt`, `friendlyJobError(e, 'tailor'|'upload'|'resumes'|'load'|'delete')`.
- `readApiError` reads BOTH `api()` errors ("API 422: body") and `apiUpload` `ApiError` (duck-typed by `name === 'ApiError'` so jobsLogic does not import api.ts).
- `services/resumes.ts` (GET/POST /resumes), `services/tailor.ts` (POST /tailor), `services/jobs.ts` (list/delete, now unused).
- `stores/jobs.ts`: phase `form|working`; `resumeTab` upload|saved|profile; Upload tab uses `uploaded` (file uploaded now), Saved tab uses `resumeId`; `effectiveResumeId`/`canGo` getters; 3-minute client timeout (`TAILOR_TIMEOUT_MS`) + Cancel via AbortController and run counters; `tabTouched` stops loadResumes from switching tabs.
- Components (now used by the Tracker detail): `HarvardResumePreview`, `CoverLetterPreview`, `JobMatchSummary` (reuses ProgressRing with `celebrate=false`), `JobDetails`.
- JobsPage keeps the form `v-show` (not v-if) so ImportModelPicker does not refetch models after Cancel/error.
- Model is sent as `model_id`. `api()` has no timeout (fetch has none); returns undefined on 204.

Pitfalls:
- Vue sets `value` on Ionic custom elements as a DOM property, not an attribute: `querySelector('ion-segment-button[value=x]')` finds nothing (match `el.value` instead).
- Material mode uppercases small `fill="clear"` ion-buttons and segment labels; the page uses a `plain-btn` class (`text-transform: none`) for small buttons. Segments left uppercase (same as LoginPage/ThemePicker).
- Georgia serif shows old-style numerals; previews set `font-variant-numeric: lining-nums`.
- Tests mock `@/services/supabase` too (jobsLogic -> resumeImport -> api -> supabase; createClient throws without env).
