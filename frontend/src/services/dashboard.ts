import { supabase } from './supabase';

// Reads used by the Home dashboard. RLS makes sure each user only sees their own rows.

export interface ProfileRow {
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  /** Web links such as {"github": "...", "linkedin": "..."}. Optional so older callers still work. */
  links?: Record<string, string> | null;
}

export interface SectionCounts {
  experiences: number;
  education: number;
  projects: number;
  skills: number;
}

export interface ActivityItem {
  id: number;
  action: string;
  created_at: string;
}

export interface Completeness {
  percent: number;
  done: number;
  total: number;
  /** Plain-language hint about the next thing to add, or '' when everything is done. */
  nextStep: string;
}

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** The 4 "personal info" checks. Shared so the Profile screen and the Home ring always agree. */
function personalChecks(profile: ProfileRow | null): Array<[boolean, string]> {
  return [
    [filled(profile?.full_name), 'Add your full name'],
    [filled(profile?.headline), 'Add a short headline'],
    [filled(profile?.summary), 'Write a short summary'],
    [filled(profile?.phone) || filled(profile?.location), 'Add your phone or location'],
  ];
}

/** True when all 4 personal-info checks pass (used for the tick on the Profile screen). */
export function isPersonalInfoComplete(profile: ProfileRow | null): boolean {
  return personalChecks(profile).every(([ok]) => ok);
}

/** Profile completeness from real data only: each of the 8 checks is worth the same. */
export function computeCompleteness(profile: ProfileRow | null, counts: SectionCounts | null): Completeness {
  const checks: Array<[boolean, string]> = [
    ...personalChecks(profile),
    [(counts?.experiences ?? 0) > 0, 'Add your first work experience'],
    [(counts?.education ?? 0) > 0, 'Add your education'],
    [(counts?.projects ?? 0) > 0, 'Add a project'],
    [(counts?.skills ?? 0) > 0, 'Add your skills'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  const next = checks.find(([ok]) => !ok);
  return {
    percent: Math.round((done / checks.length) * 100),
    done,
    total: checks.length,
    nextStep: next ? next[1] : '',
  };
}

export async function fetchProfile(): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, headline, email, phone, location, links, summary')
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

async function countRows(table: 'experiences' | 'education' | 'projects' | 'user_skills'): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function fetchSectionCounts(): Promise<SectionCounts> {
  const [experiences, education, projects, skills] = await Promise.all([
    countRows('experiences'),
    countRows('education'),
    countRows('projects'),
    countRows('user_skills'),
  ]);
  return { experiences, education, projects, skills };
}

export async function fetchRecentActivity(limit = 5): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('id, action, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityItem[];
}

/** "job.parsed" -> "Job parsed" */
export function describeAction(action: string): string {
  const text = action.replace(/[._]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Activity';
}

export type ActivityKind = 'profile' | 'experience' | 'project' | 'education' | 'skill' | 'resume' | 'job' | 'auth' | 'other';

/** Which icon family an activity belongs to, from the start of its code ("skill.created" -> 'skill'). */
export function activityKind(action: string): ActivityKind {
  const head = (action.toLowerCase().split(/[._\s-]/)[0] ?? '').trim();
  switch (head) {
    case 'profile': case 'personal': return 'profile';
    case 'experience': case 'experiences': return 'experience';
    case 'project': case 'projects': return 'project';
    case 'education': return 'education';
    case 'skill': case 'skills': return 'skill';
    case 'resume': case 'import': case 'cv': return 'resume';
    case 'job': case 'jd': case 'application': case 'cover': return 'job';
    case 'auth': case 'login': case 'logout': return 'auth';
    default: return 'other';
  }
}

/** "5 minutes ago", "yesterday"... */
export function timeAgo(iso: string, now = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
