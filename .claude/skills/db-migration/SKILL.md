---
name: db-migration
description: Create a new numbered Supabase SQL migration with RLS, safe re-run patterns and clear comments. Use when the database schema needs a new table, column, index, policy or seed data.
argument-hint: "[what the migration should do]"
---

Create a new Supabase migration for: $ARGUMENTS

1. List `supabase/migrations/` and pick the next number (e.g. `0002_...sql`).
   Use a short snake_case name describing the change.
2. Never edit an existing migration.
3. Follow `.claude/rules/database.md`:
   - Comment at the top: what this migration does and why
   - `if not exists` / `drop policy if exists` so it can be re-run safely
   - `user_id` + RLS + policies with `(select auth.uid())` for user-owned tables
   - Indexes for filtered/ordered columns; `updated_at` trigger for editable tables
4. If backend code depends on the change, mention which files need updating.
5. Tell the developer exactly how to apply it:
   Supabase Dashboard > SQL Editor > New query > paste the file > Run >
   expect "Success. No rows returned". Then how to check it in Table Editor.
