---
name: tracker-screen-patterns
description: Tracker list/detail (Phase 3-5 slice, 2026-10-26) - files, /applications + /documents export contract choices, optimistic store design, Ionic pitfalls (datetime-button, ion-color classes, cross-tab back)
metadata:
  type: project
---

Tracker owns finished jobs (built 2026-10-26; Jobs tab now only has form -> working, then opens `/tabs/tracker/<application_id>`).
- `services/trackerLogic.ts` (pure, tested): normalisers for ApplicationSummary/Detail (bad status -> 'saved', `safeLink` drops non-http links, score via jobsLogic `normalizeScore`), `STATUSES` + Ionic colour names (medium/primary/tertiary/success/danger/warning), filter/sort/count, `formatDate` (plain YYYY-MM-DD read as local day), `toDateInput`/`fromDateInput` (dates saved as local NOON ISO so the day never shifts), `cleanNotes` (2000), `normalizeExport`, `friendlyTrackerError(e, list|detail|save|delete|download)`.
- `services/applications.ts`, `services/documents.ts` (`exportDocument` + `openDownload`: web = temp `<a download>`, native = `window.open`; no new plugins).
- `stores/tracker.ts`: optimistic PATCH with module-level `pending` + `confirmed` maps and per-id run counters; only the LATEST change per id may undo, undo restores the last server-confirmed values; list refresh overlays pending changes; `epoch` for logout. Delete keeps `details[id]` with status 'deleted' so the closing page does not go blank. `patchApplication` returns a message (no toast); `changeStatus` (list) toasts.
- Components: `StatusBadge` (button/span), `TrackerDateField`, composables `useMediaQuery`, `useTrackerActions` (status + PDF/DOCX action sheets via `chooseAction` in feedback.ts).
- Route `tracker/:id` uses `props: true` (ion-router-outlet passes per-view params, safe with tab caching).

Pitfalls:
- `ion-datetime-button` shows TODAY when the datetime has no value: show an "Add date" button instead (keep the datetime-button mounted with v-show so it adds `ion-datetime-button-overlay` sizing), open via `modalRef.$el.present()`. Its Clear button does not close the modal.
- `ion-datetime` background defaults to Ionic's fixed light grey: set `--background: var(--color-base-100)` (else dark themes break). Style the button via `ion-datetime-button::part(native)`.
- Ionic's global `.ion-color-<name>` classes give `--ion-color-base` on our own elements (status pills). `medium` = daisy neutral, near-black in dark themes: special-case it with `--ui-soft` grey.
- Cross-tab push (Jobs -> tracker detail) makes Ionic's back go to Jobs: custom back button checks `history.state.back === '/tabs/tracker'` -> `ionRouter.back()`, else `ionRouter.navigate('/tabs/tracker', 'back', 'replace')`.
- Table sticky header: no `overflow:hidden` on ancestors; th backgrounds show hairline gaps -> `box-shadow: 1px 0 0 <same bg>`.
- `services/jobs.ts` (listJobs/deleteJob) is unused since this slice; deletion was left for the owner to approve.
