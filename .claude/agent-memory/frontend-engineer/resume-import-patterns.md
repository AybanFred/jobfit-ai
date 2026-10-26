---
name: resume-import-patterns
description: How "Import from resume" is built (draft in memory, review, merge rules, upload helper) and pitfalls
metadata:
  type: project
---

Route `/tabs/profile/import` (ImportResumePage). Entry points: `ImportResumeCard` on Profile (prominent when completeness < 50), quick action on Home while profile incomplete.

Layers (all under frontend/src):
- `services/api.ts`: `apiUpload(path, FormData, signal)` + `ApiError(status, detail)`. Never set Content-Type for FormData (browser adds the boundary). `api()` is untouched.
- `services/resumeImport.ts`: file check (`validateResumeFile`, pdf/docx, 5 MB), `friendlyImportError` (503 = "not set up yet", only shows backend `detail` if it is a short plain sentence), `uploadResume`.
- `services/importLogic.ts`: pure + tested. `normalizeDraft`, `buildReview`, `planPersonalMerge` (fill only empty, conflict defaults to keep current), duplicate keys/flags, `matchSkills` (uses `findExactSkill`), `buildSavePlan`, summary sentences.
- `services/importSave.ts`: `executePlan(plan, writers)` writes item by item (partial failure reported honestly), `loadImportContext`. Writers are injectable for tests.
- `stores/resumeImport.ts`: draft lives ONLY in memory; `reset()` on logout (HomePage.logout), discard and leaving the done screen. File and AbortController are module variables, not state.
- Components: ImportDropZone, ImportItemCard (checkbox + collapsible fields), ImportPersonalReview, ImportSkillsReview, ImportReview.

AI model dropdown (added later; backend now uses Groq/Gemini/OpenAI free tiers):
- `services/aiModels.ts`: `fetchAiModels` (GET /ai/models), pure `resolveInitialModel` (saved if available, else backend default, else first available, else null), `optionLabel` ("Provider - Label" + " - not set up"), `loadSavedModel`/`saveModelChoice` (localStorage key `jobfit-ai-model`, try/catch, preference only).
- `components/ImportModelPicker.vue` (ion-select, interface popover) emits `change(modelId|null)`; page disables `ImportDropZone` while null. `uploadResume(file, signal, modelId)` adds form field `model_id`; store remembers the model id for "Try again".
- 503 now shows the backend's friendly detail ("Groq is not set up on the server").

Decisions:
- Imported skills get `level = null`, `years = null` (DB allows null). SkillsPage shows a "Set level" pill instead of dots.
- Experience: start date may be blank (never invented); end month required unless "currently work here" (end_date null means Present in the DB, so blank end would be a lie).
- Profile `email` from the resume is ignored (no email field in the profile screens).
- Duplicates are computed live from edited values; duplicates are skipped at save, not just unticked. Saved items get `saved = true` so a retry after a partial failure never duplicates.
- Leaving the page mid-review keeps the draft in memory (Ionic caches the page); only Discard/save/logout clear it.

Pitfalls:
- Tests that import services touching `supabase.ts` must `vi.mock('@/services/supabase', ...)` (createClient throws without env vars).
- Use `:checked` + `@update:checked`, not both `v-model:checked` and `:checked`.
- Saved resume files (POST/GET /resumes) for the Jobs screen live in `services/resumes.ts`; it reuses `validateResumeFile` and `ImportDropZone` from here.
