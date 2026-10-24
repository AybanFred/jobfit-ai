---
name: migrations-and-storage-conventions
description: Conventions for numbered Supabase migrations and Storage buckets/policies in JobFit AI
metadata:
  type: project
---

- Migrations: `supabase/migrations/000N_name.sql`; 0001 = init (run), 0002 = profile_avatars (written, developer runs it manually in the SQL Editor; never executed by the agent).
- Storage buckets are private; policies on `storage.objects` use `bucket_id = '<b>' and (storage.foldername(name))[1] = (select auth.uid())::text`, each preceded by `drop policy if exists`. Path convention `<user_id>/<file>`.
- `avatars` bucket: 2 MB, jpeg/png/webp, upserted with `on conflict (id) do update` so limits can be re-applied. Frontend uploads directly with the Supabase client and shows photos via signed URLs; `profiles.avatar_path` holds the object path.
- No `docs/` folder exists yet (as of 2026-10-24); skip docs tasks unless asked to create it.
- sqlglot is not installed in the backend venv: SQL cannot be linted locally; re-read carefully instead.
- Header style: banner comment with purpose, "Run in Supabase Dashboard -> SQL Editor", re-run safety note (db-migration skill).
