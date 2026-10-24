import { supabase } from './supabase';
import {
  experienceSortOrder, sortEducation, sortExperiences, sortProjects,
  type Education, type Experience, type Project,
} from './profileLogic';

// Master Profile reads and writes. These talk to Supabase directly: row level security (RLS)
// lets each user touch only their own rows, and we still filter by user_id on every call.

/** The id of the logged-in user (from the saved session, no network call). */
export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Not signed in');
  return data.session.user.id;
}

// ---------- Personal info (table: profiles) ----------

export interface PersonalInfoInput {
  full_name: string | null;
  headline: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  links: Record<string, string>;
}

/** Saves the profile row for the logged-in user (creates it if it is somehow missing). */
export async function savePersonalInfo(input: PersonalInfoInput): Promise<void> {
  const id = await currentUserId();
  const { error } = await supabase.from('profiles').upsert({ id, ...input }, { onConflict: 'id' });
  if (error) throw error;
}

// ---------- Experience ----------

export interface ExperienceInput {
  role: string;
  company: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  bullets: string[];
}

const EXPERIENCE_COLUMNS = 'id, role, company, location, start_date, end_date, bullets, sort_order, created_at';

export async function listExperiences(): Promise<Experience[]> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from('experiences')
    .select(EXPERIENCE_COLUMNS)
    .eq('user_id', uid)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Experience[];
  return sortExperiences(
    rows.map((r) => ({ ...r, bullets: Array.isArray(r.bullets) ? r.bullets.map(String) : [] })),
  );
}

/** Insert (no id) or update (with id). sort_order is worked out from the dates: newest first. */
export async function saveExperience(input: ExperienceInput, id?: string): Promise<void> {
  const uid = await currentUserId();
  const values = { ...input, sort_order: experienceSortOrder(input.start_date, input.end_date) };
  const query = id
    ? supabase.from('experiences').update(values).eq('id', id).eq('user_id', uid)
    : supabase.from('experiences').insert({ ...values, user_id: uid });
  const { error } = await query;
  if (error) throw error;
}

export async function deleteExperience(id: string): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase.from('experiences').delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
}

// ---------- Projects ----------

export interface ProjectInput {
  name: string;
  description: string | null;
  tech_stack: string[];
  link: string | null;
}

const PROJECT_COLUMNS = 'id, name, description, tech_stack, link, sort_order, created_at';

export async function listProjects(): Promise<Project[]> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('user_id', uid)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Project[];
  return sortProjects(rows.map((r) => ({ ...r, tech_stack: Array.isArray(r.tech_stack) ? r.tech_stack : [] })));
}

/** New projects get sort_order 0, so ties are broken by "created last = shown first". */
export async function saveProject(input: ProjectInput, id?: string): Promise<void> {
  const uid = await currentUserId();
  const query = id
    ? supabase.from('projects').update(input).eq('id', id).eq('user_id', uid)
    : supabase.from('projects').insert({ ...input, user_id: uid, sort_order: 0 });
  const { error } = await query;
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
}

// ---------- Education ----------

export interface EducationInput {
  school: string;
  degree: string | null;
  honors: string | null;
  start_year: number | null;
  end_year: number | null;
}

export async function listEducation(): Promise<Education[]> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from('education')
    .select('id, school, degree, honors, start_year, end_year')
    .eq('user_id', uid);
  if (error) throw error;
  return sortEducation((data ?? []) as unknown as Education[]);
}

export async function saveEducation(input: EducationInput, id?: string): Promise<void> {
  const uid = await currentUserId();
  const query = id
    ? supabase.from('education').update(input).eq('id', id).eq('user_id', uid)
    : supabase.from('education').insert({ ...input, user_id: uid });
  const { error } = await query;
  if (error) throw error;
}

export async function deleteEducation(id: string): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase.from('education').delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
}
