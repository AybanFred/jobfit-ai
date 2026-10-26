---
name: migrations-and-storage-conventions
description: Conventions for numbered Supabase migrations and Storage buckets/policies in JobFit AI
metadata:
  type: project
---

- Migrations: `supabase/migrations/000N_name.sql` (0001-0005 exist); 0001 = init (run), 0002 = profile_avatars, 0003 = resumes_and_tailoring (user_resumes table, generated_docs.source_resume_id/template, indexes, documents bucket limits), 0004 = tracker (match_results.warnings, applications(user_id,status,created_at desc) index, re-asserted applications updated_at trigger; 0001 already had it). The developer runs each one manually in the SQL Editor; the agent never executes them.
- 0005 = recruiter_email (doc_type value 'email' + applications.recruiter_email text, check <= 254). Every tracker query selects recruiter_email, so the tracker 500s until 0005 runs.
- Pitfall: when the backend reads/writes a new column (e.g. match_results.warnings), the migration must run BEFORE the new backend is deployed; say so loudly in the report.
- Enum pitfall: the SQL Editor runs a file as ONE transaction; `alter type ... add value` works there (PG12+) but the new value cannot be USED in the same file. Put enum additions in a file that never references the value.
- Exported files: `<user_id>/<job_post_id>/<doc_id>.<pdf|docx>` in `documents` (upsert); deleting an application lists and removes that folder (best effort).
- `documents` bucket: private; 0003 sets 5 MB + PDF/DOCX only. Only the backend uploads (service key bypasses Storage policies), so there is no insert policy. Originals live at `<user_id>/originals/<resume_id>.<ext>`. Bucket mime limits mean uploads must send the exact content-type.
- Storage buckets are private; policies on `storage.objects` use `bucket_id = '<b>' and (storage.foldername(name))[1] = (select auth.uid())::text`, each preceded by `drop policy if exists`. Path convention `<user_id>/<file>`.
- `avatars` bucket: 2 MB, jpeg/png/webp, upserted with `on conflict (id) do update` so limits can be re-applied. Frontend uploads directly with the Supabase client and shows photos via signed URLs; `profiles.avatar_path` holds the object path.
- No `docs/` folder exists yet (as of 2026-10-24); skip docs tasks unless asked to create it.
- sqlglot is not installed in the backend venv: SQL cannot be linted locally; re-read carefully instead.
- Header style: banner comment with purpose, "Run in Supabase Dashboard -> SQL Editor", re-run safety note (db-migration skill).
