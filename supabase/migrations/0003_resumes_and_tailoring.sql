-- =====================================================================
-- JobFit AI — 0003: saved resumes + tailored documents
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- What it does and why:
--   Phase 3 lets the user pick an ORIGINAL resume (a file they upload, or
--   their Master Profile) and get a tailored resume + cover letter for a job.
--   This migration adds:
--     1. public.user_resumes  - one row per uploaded resume file, with the
--        text we extracted from it (the AI only ever uses this text, so the
--        tailored documents can be checked against it).
--     2. generated_docs.source_resume_id + generated_docs.template - which
--        resume a document was made from, and which layout ("harvard").
--     3. Helpful indexes for the tracker and for cascade deletes.
--     4. Size / type limits on the existing private "documents" bucket.
--
-- Storage: the original files go to the PRIVATE bucket "documents" at
--   <user_id>/originals/<resume_id>.pdf|.docx
--   Only the backend uploads (with the service key, which bypasses Storage
--   policies), so NO insert policy is added. The read/delete policies from
--   0001 already let a user read (signed URLs) and delete their own folder.
--
-- Safe to re-run: every statement uses "if not exists", "on conflict"
-- or "drop ... if exists" first.
-- =====================================================================

-- ---------- 1. user_resumes ----------
create table if not exists public.user_resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  file_path     text not null,                       -- object path in bucket "documents"
  file_name     text not null,                       -- original name shown in the app
  mime_type     text,
  size_bytes    int,
  text_content  text not null,                       -- extracted text (the AI's only source)
  created_at    timestamptz not null default now()
);

-- The app lists a user's resumes newest first.
create index if not exists user_resumes_user_idx
  on public.user_resumes (user_id, created_at desc);

alter table public.user_resumes enable row level security;

-- Each user can only see and manage their own rows.
drop policy if exists "own rows" on public.user_resumes;
create policy "own rows" on public.user_resumes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- 2. generated_docs: source resume + template ----------
-- source_resume_id is null when the document was made from the Master Profile
-- (or when that resume was deleted later: "on delete set null" keeps the document).
alter table public.generated_docs
  add column if not exists source_resume_id uuid
    references public.user_resumes(id) on delete set null;

alter table public.generated_docs
  add column if not exists template text;           -- e.g. 'harvard'

-- ---------- 3. Indexes ----------
-- Deleting a resume sets source_resume_id to null; this index makes that fast.
create index if not exists generated_docs_source_resume_idx
  on public.generated_docs (source_resume_id);

-- Load the documents / match / tracker entry of one job, and make the
-- "on delete cascade" from job_posts fast.
create index if not exists generated_docs_job_idx
  on public.generated_docs (job_post_id);

create index if not exists match_results_job_idx
  on public.match_results (job_post_id);

create index if not exists applications_job_idx
  on public.applications (job_post_id);

-- The tracker lists a user's applications newest first.
create index if not exists applications_user_idx
  on public.applications (user_id, created_at desc);

-- ---------- 4. Limits on the private "documents" bucket ----------
-- 0001 created the bucket without limits. Uploaded resumes and the generated
-- files (Phase 4) are PDF or DOCX only, and the backend already refuses files
-- over 5 MB. public is forced back to false.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  5242880,                                          -- 5 MB (5 * 1024 * 1024 bytes)
  array['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 5242880,
      allowed_mime_types = array['application/pdf',
                                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
