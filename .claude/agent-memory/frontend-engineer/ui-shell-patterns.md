---
name: ui-shell-patterns
description: Reusable components, helpers and pitfalls from the app shell / login / dashboard upgrade (Ionic + daisyUI bridge)
metadata:
  type: project
---

Reusable pieces (all under frontend/src):
- `components/ComingSoon.vue` (icon, title, description) for placeholder tabs.
- `components/ProgressRing.vue`, `QuickActionCard.vue`, `StatusRow.vue` (exports `CheckStatus` from a plain `<script>` block).
- `services/haptics.ts` `tapHaptic()` (native-only, silent in browser), `services/motion.ts` `prefersReducedMotion()`, `services/errors.ts` (`friendlyAuthError`, `friendlyApiError`), `services/dashboard.ts` (profile/counts/activity reads + `computeCompleteness`).
- `theme/motion.css`: global `.fade-in-up` (stagger with `style="--i: n"`) and `.pressable`; honours reduced motion. main.ts passes `animated: !prefersReducedMotion()` to IonicVue.

Patterns:
- Tabs: `/tabs/` parent route (TabsPage.vue) with `meta.requiresAuth`, children inherit it. Tab buttons need `tab` + `href`.
- Style with `var(--ion-color-step-50..150)` for card bg/borders and `--ion-color-primary`; never hard-code colors. Default theme left as daisy "light" (follows system dark).
- Ionic `ion-input` errors: add classes `ion-invalid ion-touched` plus `error-text`.

Pitfalls:
- `tests/unit/example.spec.ts` is the stale Ionic starter test (expects "Ready to create an app?") and fails; not ours, nothing deleted.
- No `export` of values from `<script setup>`; use a second plain `<script lang="ts">` for exported types.
- Enter-to-submit: use a `<form @submit.prevent>` with an `ion-button type="submit"`; keep a `loading` guard.
