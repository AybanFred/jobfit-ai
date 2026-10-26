-- =====================================================================
-- JobFit AI — 0005: recruiter email + AI application email
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- What it does and why:
--   When the user tailors a job, they can now type the recruiter's email
--   address, and the AI also writes a short application email (subject +
--   body) to send with the resume and cover letter. This migration adds:
--     1. A new value 'email' for the doc_type enum, so generated_docs can
--        store the application email ({"subject", "body"}) next to the
--        resume and the cover letter of the same job.
--     2. applications.recruiter_email - the address the user wants to send
--        the application to (optional, null = not set). A check constraint
--        keeps it at most 254 characters (the longest valid email address).
--        The backend never sends this address to the AI and never logs it.
--
-- About step 1 (the new enum value):
--   Postgres does not allow a new enum value to be USED in the same
--   transaction that adds it ("unsafe use of new value"). The SQL Editor
--   runs this whole file as one transaction, so this file only ADDS the
--   value: nothing below inserts, compares, defaults or indexes 'email'.
--   The backend starts using it only after this script has finished.
--   (Adding an enum value inside a transaction needs Postgres 12 or newer;
--   Supabase runs 15+.)
--
-- No new table, so no new RLS policy: generated_docs and applications keep
-- the "own rows" policies from 0001.
--
-- IMPORTANT: run this BEFORE starting the new backend version. The backend
-- now reads and writes applications.recruiter_email (every tracker request
-- selects it) and saves generated_docs rows with type 'email'.
--
-- Safe to re-run: every statement uses "if not exists" or
-- "drop ... if exists" first.
-- =====================================================================

-- ---------- 1. doc_type: add 'email' ----------
alter type public.doc_type add value if not exists 'email';

-- ---------- 2. applications.recruiter_email ----------
alter table public.applications
  add column if not exists recruiter_email text;

-- Drop first so the file can be run again without "constraint already exists".
alter table public.applications
  drop constraint if exists applications_recruiter_email_length;
alter table public.applications
  add constraint applications_recruiter_email_length
  check (recruiter_email is null or char_length(recruiter_email) <= 254);
