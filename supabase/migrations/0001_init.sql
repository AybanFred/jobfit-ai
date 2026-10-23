-- =====================================================================
-- JobFit AI — Phase 1 database schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists vector;      -- pgvector, for semantic skill matching
create extension if not exists pg_trgm;     -- fuzzy text search on skill names

-- ---------- Helper: auto-update updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Enums ----------
do $$ begin
  create type application_status as enum
    ('saved', 'applied', 'interview', 'offer', 'rejected', 'ghosted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doc_type as enum ('resume', 'cover_letter');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- MASTER PROFILE
-- =====================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  headline    text,
  email       text,
  phone       text,
  location    text,
  links       jsonb not null default '{}'::jsonb,   -- {"github": "...", "linkedin": "..."}
  summary     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.experiences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null,
  company     text not null,
  location    text,
  start_date  date,
  end_date    date,                                  -- null = present
  bullets     jsonb not null default '[]'::jsonb,    -- ["Built X...", "Led Y..."]
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  tech_stack  text[] not null default '{}',
  link        text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.education (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  school      text not null,
  degree      text,
  honors      text,
  start_year  int,
  end_year    int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- SKILLS (global bank) + USER SKILLS
-- =====================================================================
create table if not exists public.skills (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null unique,              -- e.g. "vue.js"
  display_name    text not null,                     -- e.g. "Vue.js"
  aliases         text[] not null default '{}',      -- {"vue","vuejs","vue 3"}
  category        text,                              -- frontend, backend, data, soft-skill...
  embedding       vector(1536),                      -- filled in Phase 3
  created_at      timestamptz not null default now()
);
create index if not exists skills_aliases_idx on public.skills using gin (aliases);
create index if not exists skills_name_trgm_idx on public.skills using gin (canonical_name gin_trgm_ops);

create table if not exists public.user_skills (
  user_id       uuid not null references auth.users(id) on delete cascade,
  skill_id      uuid not null references public.skills(id) on delete cascade,
  level         smallint check (level between 1 and 5),
  years         numeric(4,1),
  evidence_ids  jsonb not null default '[]'::jsonb,  -- [{"type":"experience","id":"..."}]
  created_at    timestamptz not null default now(),
  primary key (user_id, skill_id)
);

-- =====================================================================
-- JOBS, MATCHING, GENERATED DOCS, APPLICATIONS
-- =====================================================================
create table if not exists public.job_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  raw_text    text not null,
  title       text,
  company     text,
  source_url  text,
  parsed      jsonb,                                 -- structured JD from the AI
  created_at  timestamptz not null default now()
);
create index if not exists job_posts_user_idx on public.job_posts (user_id, created_at desc);

create table if not exists public.match_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  job_post_id  uuid not null references public.job_posts(id) on delete cascade,
  score        numeric(5,2) check (score between 0 and 100),
  matched      jsonb not null default '[]'::jsonb,
  gaps         jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists public.generated_docs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  job_post_id  uuid not null references public.job_posts(id) on delete cascade,
  type         doc_type not null,
  content      jsonb not null,
  file_path    text,                                 -- path in Storage bucket "documents"
  version      int  not null default 1,
  model        text,
  tokens_used  int,
  duration_ms  int,
  created_at   timestamptz not null default now()
);

create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  job_post_id   uuid not null references public.job_posts(id) on delete cascade,
  status        application_status not null default 'saved',
  applied_at    timestamptz,
  follow_up_at  timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists applications_followup_idx
  on public.applications (status, follow_up_at);

create table if not exists public.activity_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null,                         -- e.g. "job.parsed", "doc.generated"
  entity      text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_logs_user_idx on public.activity_logs (user_id, created_at desc);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','experiences','projects','education','applications'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- Auto-create a profile row when a user signs up ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- ROW LEVEL SECURITY — each user can only see their own data
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.experiences    enable row level security;
alter table public.projects       enable row level security;
alter table public.education      enable row level security;
alter table public.skills         enable row level security;
alter table public.user_skills    enable row level security;
alter table public.job_posts      enable row level security;
alter table public.match_results  enable row level security;
alter table public.generated_docs enable row level security;
alter table public.applications   enable row level security;
alter table public.activity_logs  enable row level security;

-- profiles: keyed by id
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- all tables keyed by user_id
do $$
declare t text;
begin
  foreach t in array array['experiences','projects','education','user_skills','job_posts',
                           'match_results','generated_docs','applications'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid()))
                    with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- activity_logs: users can read their logs; only the backend (service key) writes
drop policy if exists "read own logs" on public.activity_logs;
create policy "read own logs" on public.activity_logs
  for select to authenticated using (user_id = (select auth.uid()));

-- skills: everyone signed in can read; only the backend (service key) writes
drop policy if exists "read skills" on public.skills;
create policy "read skills" on public.skills
  for select to authenticated using (true);

-- =====================================================================
-- STORAGE — private bucket for generated resumes / cover letters
-- Files are stored as: documents/<user_id>/<job_post_id>/<file>.pdf
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "own documents read" on storage.objects;
create policy "own documents read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own documents delete" on storage.objects;
create policy "own documents delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- SEED — a starter skills bank (extend anytime)
-- =====================================================================
insert into public.skills (canonical_name, display_name, aliases, category) values
  ('python',        'Python',        '{"py","python3"}',                         'backend'),
  ('fastapi',       'FastAPI',       '{"fast api"}',                             'backend'),
  ('laravel',       'Laravel',       '{}',                                       'backend'),
  ('php',           'PHP',           '{}',                                       'backend'),
  ('javascript',    'JavaScript',    '{"js","es6","ecmascript"}',                'frontend'),
  ('typescript',    'TypeScript',    '{"ts"}',                                   'frontend'),
  ('vue.js',        'Vue.js',        '{"vue","vuejs","vue 3","vue3"}',           'frontend'),
  ('ionic',         'Ionic',         '{"ionic framework"}',                      'mobile'),
  ('capacitor',     'Capacitor',     '{}',                                       'mobile'),
  ('sql',           'SQL',           '{"structured query language"}',            'data'),
  ('postgresql',    'PostgreSQL',    '{"postgres","psql"}',                      'data'),
  ('mongodb',       'MongoDB',       '{"mongo"}',                                'data'),
  ('supabase',      'Supabase',      '{}',                                       'data'),
  ('pandas',        'pandas',        '{}',                                       'data'),
  ('power bi',      'Power BI',      '{"powerbi"}',                              'data'),
  ('excel',         'Microsoft Excel','{"ms excel","spreadsheets"}',             'data'),
  ('data analysis', 'Data Analysis', '{"data analytics","analytics"}',          'data'),
  ('docker',        'Docker',        '{"containers","containerization"}',       'devops'),
  ('git',           'Git',           '{"github","gitlab","version control"}',    'devops'),
  ('rest api',      'REST API',      '{"restful","rest apis","api development"}','backend'),
  ('llm',           'LLM / Generative AI','{"generative ai","genai","prompt engineering","ai"}','ai'),
  ('automation',    'Automation',    '{"workflow automation","n8n","zapier"}',   'ai'),
  ('canva',         'Canva',         '{}',                                       'design'),
  ('communication', 'Communication', '{"written communication","verbal communication"}','soft-skill'),
  ('leadership',    'Leadership',    '{"team leadership","people management"}',  'soft-skill')
on conflict (canonical_name) do nothing;
