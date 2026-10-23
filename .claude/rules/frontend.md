---
paths:
  - "frontend/src/**/*.{vue,ts}"
---

# Frontend rules (Ionic + Vue)

- Vue 3 `<script setup lang="ts">` single-file components. Import Ionic components
  explicitly from `@ionic/vue`.
- Pages go in `src/views/` and end with `Page.vue`. Reusable parts go in `src/components/`.
- Shared state goes in Pinia stores in `src/stores/`. Network calls go in `src/services/`,
  never directly inside templates.
- Simple user data (profile, experiences) may be read/written directly with the Supabase
  client (RLS protects it). AI work, file generation and anything needing the secret key
  goes through the FastAPI backend via `api()` in `src/services/api.ts`.
- Every screen that loads data has: a loading state (`ion-spinner` or skeleton),
  an empty state, and a friendly error message (`ion-toast` or `ion-text color="danger"`).
- Mobile-first. Test at 375px width. Use Ionic CSS utilities and theme variables,
  not hard-coded colors.
- Keep the UI simple and clean; avoid heavy decoration.
- Only `VITE_` variables are available in the app. Never use the Supabase secret key here.
