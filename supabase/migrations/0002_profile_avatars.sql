-- =====================================================================
-- JobFit AI — 0002: profile pictures (avatars)
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- What it does and why:
--   Lets a signed-in user upload a profile picture straight from the app
--   (with the Supabase client). It adds:
--     1. profiles.avatar_path  - where the picture is stored
--     2. a PRIVATE Storage bucket "avatars" (max 2 MB, JPEG/PNG/WebP only)
--     3. Storage policies so each user can only touch their OWN folder
--
-- Path convention: <user_id>/<file>, for example
--   '0b9c...-uuid/1730000000000.jpg'
--   The first folder is always the user's id. The policies below rely on it.
--   The bucket is private, so the app never uses a public URL: it asks
--   Supabase for a short-lived signed URL to show the photo.
--
-- Safe to re-run: every statement uses "if not exists", "on conflict"
-- or "drop ... if exists" first.
-- =====================================================================

-- ---------- 1. profiles.avatar_path ----------
-- Object path inside the "avatars" bucket, e.g. '<user_id>/<timestamp>.jpg'.
-- Nullable: null = no picture. The existing "own profile" RLS policy from
-- 0001 already covers this column, so no policy change is needed.
alter table public.profiles
  add column if not exists avatar_path text;

-- ---------- 2. Private bucket "avatars" ----------
-- public = false           -> files are never reachable without a signed URL
-- file_size_limit 2097152  -> 2 MB (2 * 1024 * 1024 bytes)
-- allowed_mime_types       -> only JPEG, PNG and WebP images
-- If the bucket already exists, the limits are updated and public is forced
-- back to false.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ---------- 3. Storage policies (own folder only) ----------
-- A user may only act on objects whose top-level folder equals their user id:
--   (storage.foldername(name))[1] = (select auth.uid())::text

-- Read: needed to create signed URLs and to download the picture
drop policy if exists "own avatars read" on storage.objects;
create policy "own avatars read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Upload a new picture
drop policy if exists "own avatars insert" on storage.objects;
create policy "own avatars insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Replace / overwrite a picture (upsert)
drop policy if exists "own avatars update" on storage.objects;
create policy "own avatars update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Remove a picture
drop policy if exists "own avatars delete" on storage.objects;
create policy "own avatars delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
