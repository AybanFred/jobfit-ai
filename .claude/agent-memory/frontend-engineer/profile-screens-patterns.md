---
name: profile-screens-patterns
description: Phase 2 Master Profile screens - shared components, composable, store, sort rules and pitfalls
metadata:
  type: project
---

Structure (all under frontend/src):
- `stores/profile.ts` holds profile + section counts + `completeness`; Home and Profile both read it (single source for the ring). `refreshCounts()` after any add/delete; `reset()` on logout.
- `services/profileLogic.ts` = pure, tested helpers (validation, month/year, sorting, moveItem, addTags, filterSkills). `services/profile.ts` (profiles/experiences/projects/education via Supabase), `services/skills.ts` (bank, user_skills, `createCustomSkill` -> POST /skills/custom), `services/feedback.ts` (`showToast`, `confirmAction`), `friendlyDataError` in `services/errors.ts`.
- `composables/useSectionCrud.ts`: list load + add/edit modal state + save + confirm-delete + toasts + counts refresh. Each list page = SectionShell + a *FormModal + this composable.
- Components: `SectionShell` (header/back/add, skeleton/error/empty, `#modals` slot), `FormModal` (full-screen or `sheet`, submit/delete buttons), `LevelPicker`, Experience/Project/Education/Skill(Add|Edit) modals.
- Routes: `/tabs/profile/{personal,experience,projects,education,skills}` as tabs children.

Decisions:
- sort rule: lists sorted by `sort_order` asc, ties newest-created first. Experience `sort_order = -(endRank*10000+startRank)` (present = 9999) so newest/current first with no renumbering. Education has no sort_order column: sorted client-side by end year desc.
- Custom skill offered whenever no exact name/alias match (not only when search is empty). Category sent as null.
- Personal info saved with `upsert` on profiles (id = user id), merges other keys of `links` jsonb.

Pitfalls:
- A page must have ONE root element (SectionShell root is ion-page); put modals in the `#modals` slot, not as a sibling root.
- Ionic tabs cache pages, so use the store (reactive) rather than onMounted refreshes to keep Home in sync.
- `ion-input type="month"` gives 'YYYY-MM'; store as 'YYYY-MM-01'. Safari desktop has no month picker, so text format is validated.
- Comma-to-add chips: also handle `@ionInput` containing ',' (mobile keyboards do not send a "," keydown reliably).
- Memory dir `frontend/src/.claude/agent-memory/` is a misplaced copy; the right place is repo-root `.claude/agent-memory/frontend-engineer/`.
