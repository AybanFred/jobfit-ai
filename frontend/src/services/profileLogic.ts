// Pure helpers for the Master Profile screens (no network, no Vue). Easy to unit test.

// ---------- Types ----------

export interface Experience {
  id: string;
  role: string;
  company: string;
  location: string | null;
  start_date: string | null; // 'YYYY-MM-DD'
  end_date: string | null; // null = present
  bullets: string[];
  sort_order: number;
  created_at?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  tech_stack: string[];
  link: string | null;
  sort_order: number;
  created_at?: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string | null;
  honors: string | null;
  start_year: number | null;
  end_year: number | null;
}

export interface SkillBankItem {
  id: string;
  canonical_name: string;
  display_name: string;
  aliases: string[];
  category: string | null;
}

export interface UserSkill {
  skill_id: string;
  level: number | null;
  years: number | null;
  skill: SkillBankItem;
}

// ---------- Limits (kept in one place so forms and checks agree) ----------

export const LIMITS = {
  fullName: 100,
  headline: 120,
  phone: 30,
  location: 100,
  url: 200,
  summary: 1000,
  role: 100,
  company: 100,
  bullet: 300,
  bullets: 12,
  projectName: 100,
  projectDescription: 600,
  tech: 30,
  techCount: 20,
  school: 120,
  degree: 120,
  honors: 120,
  skillName: 60,
  maxYears: 60,
} as const;

// ---------- Text and validation ----------

export const trimText = (v: string | number | null | undefined): string => String(v ?? '').trim();

/** '' becomes null, so we never store empty strings. */
export const toNull = (v: string | number | null | undefined): string | null => trimText(v) || null;

/** Error text for a required field, or '' when it is fine. */
export function requiredError(label: string, value: string | null | undefined, max: number): string {
  const v = trimText(value);
  if (!v) return `Please enter ${label}.`;
  if (v.length > max) return `Please keep ${label} under ${max} characters.`;
  return '';
}

/** Error text for an optional field that has a maximum length. */
export function maxLengthError(label: string, value: string | null | undefined, max: number): string {
  return trimText(value).length > max ? `Please keep ${label} under ${max} characters.` : '';
}

/** "github.com/me" becomes "https://github.com/me". Empty stays empty. */
export function normalizeUrl(value: string | null | undefined): string {
  const v = trimText(value);
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

/** Empty is fine. Otherwise it must look like a real http(s) web address. */
export function urlError(value: string | null | undefined): string {
  const v = trimText(value);
  if (!v) return '';
  if (v.length > LIMITS.url) return `Please keep the link under ${LIMITS.url} characters.`;
  const message = 'Please enter a valid web address, like https://example.com.';
  if (/\s/.test(v)) return message;
  try {
    const url = new URL(normalizeUrl(v));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return message;
    if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) return message;
    return '';
  } catch {
    return message;
  }
}

/** Phone is optional; allow digits, spaces and + - ( ) . only. */
export function phoneError(value: string | null | undefined): string {
  const v = trimText(value);
  if (!v) return '';
  if (v.length > LIMITS.phone) return `Please keep the phone number under ${LIMITS.phone} characters.`;
  if (!/^[+()\d][\d\s().+-]*$/.test(v) || v.replace(/\D/g, '').length < 5) {
    return 'Please enter a valid phone number, like +1 555 123 4567.';
  }
  return '';
}

// ---------- Links stored in profiles.links (jsonb) ----------

export interface PersonalLinks {
  github: string;
  linkedin: string;
  website: string;
}

const LINK_KEYS: Array<keyof PersonalLinks> = ['github', 'linkedin', 'website'];

export function linksOf(links: Record<string, string> | null | undefined): PersonalLinks {
  return {
    github: trimText(links?.github),
    linkedin: trimText(links?.linkedin),
    website: trimText(links?.website),
  };
}

/** Updates the three known links but keeps any other keys already stored. Empty removes the key. */
export function buildLinks(
  existing: Record<string, string> | null | undefined,
  form: PersonalLinks,
): Record<string, string> {
  const result: Record<string, string> = { ...(existing ?? {}) };
  for (const key of LINK_KEYS) {
    const value = normalizeUrl(form[key]);
    if (value) result[key] = value;
    else delete result[key];
  }
  return result;
}

// ---------- Months and years ----------

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2024-05' (what a month input gives us) is valid. */
export const isValidMonth = (v: string | null | undefined): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(trimText(v));

/** '2024-05' -> '2024-05-01' (database date) */
export const monthToDate = (month: string | null | undefined): string | null =>
  isValidMonth(month) ? `${trimText(month)}-01` : null;

/** '2024-05-01' -> '2024-05' (month input value) */
export const dateToMonth = (date: string | null | undefined): string => (date ? date.slice(0, 7) : '');

/** '2024-05-01' -> 'May 2024' (no Date object, so time zones cannot shift the month) */
export function formatMonth(date: string | null | undefined): string {
  if (!date) return '';
  const [y, m] = date.split('-');
  const name = MONTH_NAMES[Number(m) - 1];
  return name && y ? `${name} ${y}` : '';
}

/** "May 2022 - Present" style label for lists. */
export function monthRangeLabel(start: string | null, end: string | null): string {
  const from = formatMonth(start);
  const to = end ? formatMonth(end) : 'Present';
  if (!from) return end ? to : 'Present';
  return `${from} – ${to}`;
}

/** Checks the start/end months typed in the experience form. */
export function monthRangeError(start: string, end: string, present: boolean): { start: string; end: string } {
  const result = { start: '', end: '' };
  if (!trimText(start)) result.start = 'Please choose a start month.';
  else if (!isValidMonth(start)) result.start = 'Use the format YYYY-MM, for example 2023-06.';
  if (!present) {
    if (!trimText(end)) result.end = 'Please choose an end month, or switch on "I currently work here".';
    else if (!isValidMonth(end)) result.end = 'Use the format YYYY-MM, for example 2024-02.';
    else if (!result.start && trimText(end) < trimText(start)) result.end = 'The end month cannot be before the start.';
  }
  return result;
}

/** A year field is optional; must be a whole number in a sensible range. */
export function parseYear(v: string | number | null | undefined): number | null {
  const t = trimText(v);
  if (!/^\d{4}$/.test(t)) return null;
  return Number(t);
}

export function yearError(label: string, v: string | number | null | undefined, now = new Date()): string {
  const t = trimText(v);
  if (!t) return '';
  const year = parseYear(t);
  if (year === null) return `${label} must be a 4-digit year, like 2021.`;
  if (year < 1950 || year > now.getFullYear() + 8) return `Please check the ${label.toLowerCase()}.`;
  return '';
}

export function yearRangeError(start: string | number | null, end: string | number | null): string {
  const s = parseYear(start);
  const e = parseYear(end);
  return s !== null && e !== null && e < s ? 'The end year cannot be before the start year.' : '';
}

// ---------- Sorting ----------
// Order rule for the whole app: lists are sorted by `sort_order` ascending (smallest = shown first);
// when two rows tie, the one created later is shown first.

const monthRank = (date: string | null): number => {
  if (!date) return 0;
  const [y, m] = date.split('-').map(Number);
  if (!y || !m) return 0;
  return Math.max(0, (y - 1970) * 12 + (m - 1));
};

const PRESENT_RANK = 9999;

/**
 * sort_order for an experience, so "newest first" needs no re-numbering of other rows.
 * Current jobs come first, then by end month, then by start month. Smaller number = higher on the list.
 */
export function experienceSortOrder(start: string | null, end: string | null): number {
  const endRank = end ? monthRank(end) : PRESENT_RANK;
  return -(endRank * 10000 + monthRank(start));
}

const byOrderThenNewest = <T extends { sort_order: number; created_at?: string }>(a: T, b: T): number =>
  a.sort_order - b.sort_order || (b.created_at ?? '').localeCompare(a.created_at ?? '');

export const sortExperiences = (list: Experience[]): Experience[] => [...list].sort(byOrderThenNewest);
export const sortProjects = (list: Project[]): Project[] => [...list].sort(byOrderThenNewest);

/** Education has no sort_order column: latest finishing year first (no end year = still studying = first). */
export function sortEducation(list: Education[]): Education[] {
  const key = (e: Education) => e.end_year ?? 9999;
  return [...list].sort((a, b) => key(b) - key(a) || (b.start_year ?? 0) - (a.start_year ?? 0));
}

// ---------- Reordering and lists ----------

/** Returns a new array with the item at `from` moved to `to`. Out-of-range moves change nothing. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/** Trim bullet points and drop empty ones. */
export const cleanBullets = (list: readonly string[]): string[] =>
  list.map((b) => trimText(b)).filter((b) => b.length > 0);

/** Adds one or more comma-separated tags: trims, drops empties and duplicates (any letter case), respects limits. */
export function addTags(
  current: readonly string[],
  raw: string,
  maxCount: number = LIMITS.techCount,
  maxLength: number = LIMITS.tech,
): string[] {
  const result = [...current];
  for (const piece of raw.split(/[,\n]/)) {
    const tag = trimText(piece).slice(0, maxLength);
    if (!tag || result.length >= maxCount) continue;
    if (result.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    result.push(tag);
  }
  return result;
}

// ---------- Skills ----------

export const LEVEL_LABELS: Record<number, string> = {
  1: 'Beginner',
  2: 'Basic',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
};

export const levelLabel = (level: number | null | undefined): string => (level ? (LEVEL_LABELS[level] ?? '') : '');

const norm = (s: string | null | undefined): string => trimText(s).toLowerCase().replace(/\s+/g, ' ');

/** How well a skill matches the search text: lower is better, null = no match. */
function matchScore(skill: SkillBankItem, q: string): number | null {
  const name = norm(skill.display_name);
  const canon = norm(skill.canonical_name);
  const aliases = (skill.aliases ?? []).map(norm);
  if (name === q || canon === q || aliases.includes(q)) return 0;
  if (name.startsWith(q) || canon.startsWith(q)) return 1;
  if (aliases.some((a) => a.startsWith(q))) return 2;
  if (name.includes(q) || canon.includes(q)) return 3;
  if (aliases.some((a) => a.includes(q))) return 4;
  return null;
}

/** Search the skills bank (name, canonical name and aliases, any letter case). Hides skills the user already has. */
export function filterSkills(
  bank: readonly SkillBankItem[],
  query: string,
  ownedIds: ReadonlySet<string> | readonly string[] = [],
  limit = 40,
): SkillBankItem[] {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds);
  const q = norm(query);
  const scored: Array<{ skill: SkillBankItem; score: number }> = [];
  for (const skill of bank) {
    if (owned.has(skill.id)) continue;
    const score = q ? matchScore(skill, q) : 0;
    if (score !== null) scored.push({ skill, score });
  }
  scored.sort((a, b) => a.score - b.score || a.skill.display_name.localeCompare(b.skill.display_name));
  return scored.slice(0, limit).map((s) => s.skill);
}

/** The skill whose name or alias equals the text exactly (used to avoid offering a duplicate custom skill). */
export function findExactSkill(bank: readonly SkillBankItem[], query: string): SkillBankItem | null {
  const q = norm(query);
  if (!q) return null;
  return bank.find((s) => matchScore(s, q) === 0) ?? null;
}

/** Highest level first, then A to Z. */
export function sortUserSkills(list: readonly UserSkill[]): UserSkill[] {
  return [...list].sort(
    (a, b) => (b.level ?? 0) - (a.level ?? 0) || a.skill.display_name.localeCompare(b.skill.display_name),
  );
}

/** Years of experience: optional, 0 to 60, one decimal at most. */
export function yearsError(v: string | number | null | undefined): string {
  const t = trimText(v);
  if (!t) return '';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > LIMITS.maxYears) return `Years must be a number from 0 to ${LIMITS.maxYears}.`;
  if (Math.round(n * 10) !== n * 10 && Math.abs(Math.round(n * 10) - n * 10) > 1e-9) {
    return 'Use at most one decimal, like 2.5.';
  }
  return '';
}

export function parseYears(v: string | number | null | undefined): number | null {
  const t = trimText(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function levelError(level: number | null): string {
  return level && level >= 1 && level <= 5 ? '' : 'Please choose your level from 1 to 5.';
}
