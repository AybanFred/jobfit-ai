---
name: ui-redesign-and-avatar
description: "Vibrant but clean" UI system (theme/ui.css tokens, shared components) and the profile-photo feature; pitfalls found while building them
metadata:
  type: project
---

Design system (frontend/src):
- `theme/ui.css` = tokens (`--ui-radius-*`, `--ui-shadow-*`, `--ui-gradient`, `--ui-text-soft/faint`, `--ui-error-ink`, `--ui-accent-ink`) + classes prefixed `ui-` (`ui-page`, `ui-surface`, `ui-card`, `ui-pill`, `ui-btn`, `ui-lift`, `ui-sliding/ui-entry/ui-list`, tone classes `ui-tone-primary...info` that set `--tone`, `--tone-ink`, `--tone-tint`). Only daisyUI theme vars + color-mix(); page bg = base-200, cards = base-100.
- Components: `IconChip` (tone chip), `UserAvatar` (photo or initials gradient), `EmptyState` (inline SVG variants), `ProgressRing` (shared count-up value, gradient stroke, sparkles at 100), `AvatarChanger/AvatarEditorModal/AvatarCropper`, `SectionShell` now takes `blurb/tone/countText/emptyVariant`.
- Pure helpers (tested): `services/avatarLogic.ts`, `services/imageCrop.ts`, `services/motion.ts` (easing/count-up/ring math). `stores/avatar.ts` (signed URL cache, upload/remove, never throws, returns friendly message). `composables/useIdentity.ts` (name + photo for pages), `useCountUp.ts`.
- Photo: `profiles.avatar_path` is read in a SEPARATE query (not in `fetchProfile`) so a missing column can never break the profile load. Bucket `avatars`, path `<uid>/<Date.now()>.jpg`.

Pitfalls:
- daisyUI classes collide with ours because Tailwind scans the sources: `.card`, `.btn`, `.avatar`, `.badge`, `.skeleton`, `.hero`, and the Tailwind utility `.ring` (draws a 1px box outline). Use `ui-` or unusual names.
- Ionic styles `h3/p` inside `ion-label` with equal specificity and loads later: write `.x ion-label h3`. Same for `ion-list` background: use `ion-list.ui-list`.
- `.ui-pill` must not declare `--tone` itself (it overrode `ui-tone-*` classes).
- Collision list found later (all renamed): `.select` on ion-select (double border + 2 arrows), `.toggle`, `.btn`, `.card`, `.glass`, `.label`, `.footer`, `.range`, `.link`, `.step`, `.mask`. Scan: collect template class names and compare with `.name{` rules in the built global css.
- Do not mix toward `tone-content` for gradients (kills icon contrast); keep chips flat with highlight.
- Decoded ImageBitmap must live in `shallowRef` (Vue proxy breaks drawImage).
- Ionic page hooks (`onIonViewWillEnter`) only run in the routed page component, not children.
- Alias plugin in Vite runs before user resolvers: match resolved paths too when redirecting modules.

Visual testing without the real backend (outside the repo, in the session scratchpad): a second Vite config with a fake supabase module + static server on port 5199 + headless Edge driven over the DevTools protocol (node 24 has WebSocket). Contrast of all 35 themes was checked by script with color-mix resolved through a canvas. Daisy's own primary/primary-content pairs are 3.6-4.4:1 in dark, corporate, valentine, garden, winter.
