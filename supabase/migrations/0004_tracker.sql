-- =====================================================================
-- JobFit AI — 0004: application tracker + saved validator warnings
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- What it does and why:
--   Phase 5 adds the application tracker screens (list, detail, status
--   changes) and Phase 4 adds DOCX/PDF export. This migration adds:
--     1. match_results.warnings - the anti-invention warnings from tailoring
--        ("Removed the job title ... because it is not in your resume"), so
--        the detail screen can show them again later. Old rows get [].
--     2. An index for the tracker list filtered by status, newest first.
--     3. The updated_at trigger on applications. 0001 already created it;
--        it is re-created here only to be sure it exists (harmless).
--
-- No new table, so no new RLS policy: match_results and applications keep
-- the "own rows" policies from 0001.
--
-- Storage: exported files go to the PRIVATE bucket "documents" at
--   <user_id>/<job_post_id>/<doc_id>.pdf|.docx
--   0003 already limits that bucket to 5 MB and PDF/DOCX. Only the backend
--   uploads (service key), and the 0001 read/delete policies already cover
--   the user's own folder.
--
-- IMPORTANT: run this BEFORE starting the new backend version. The backend
-- now saves and reads match_results.warnings.
--
-- Safe to re-run: every statement uses "if not exists" or
-- "drop ... if exists" first.
-- =====================================================================

-- ---------- 1. match_results.warnings ----------
alter table public.match_results
  add column if not exists warnings jsonb not null default '[]'::jsonb;

-- ---------- 2. Tracker index ----------
-- GET /applications?status=applied lists one user's rows with one status,
-- newest first.
create index if not exists applications_user_status_idx
  on public.applications (user_id, status, created_at desc);

-- ---------- 3. applications.updated_at trigger ----------
-- public.set_updated_at() comes from 0001; "create or replace" keeps it identical.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_applications_updated on public.applications;
create trigger trg_applications_updated
  before update on public.applications
  for each row execute function public.set_updated_at();
