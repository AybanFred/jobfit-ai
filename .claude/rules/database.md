---
paths:
  - "supabase/**/*.sql"
---

# Database rules (Supabase / Postgres)

- Never edit a migration that has already been run. Create the next numbered file,
  e.g. `supabase/migrations/0002_profile_extras.sql`.
- Migrations must be safe to re-run: `create table if not exists`,
  `drop policy if exists` before `create policy`, `on conflict do nothing` for seeds.
- Every user-owned table has `user_id uuid not null references auth.users(id) on delete cascade`,
  RLS enabled, and a policy using `(select auth.uid())`.
- Add indexes for columns used in filters and ordering.
- Use `timestamptz` and `jsonb`; add `updated_at` triggers for editable tables.
- At the top of each migration, add a comment explaining what it does and why.
