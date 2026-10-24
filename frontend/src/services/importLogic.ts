// Pure logic for "Import from resume" (no network, no Vue): turning the backend draft into an editable
// review, flagging missing and duplicate items, merging personal info safely, matching skills and
// building the list of things to save. Everything here is unit tested.

import {
  LIMITS, trimText, toNull, requiredError, maxLengthError, phoneError, urlError, normalizeUrl,
  isValidMonth, monthToDate, yearError, yearRangeError, parseYear, cleanBullets, addTags,
  linksOf, buildLinks, findExactSkill, type SkillBankItem,
} from './profileLogic';
import type { ProfileRow } from './dashboard';
import type { EducationInput, ExperienceInput, PersonalInfoInput, ProjectInput } from './profile';

// ---------- What the backend sends (all keys present; missing = null / []) ----------

export interface ResumeDraft {
  personal: {
    full_name: string | null; headline: string | null; email: string | null; phone: string | null;
    location: string | null; github: string | null; linkedin: string | null; website: string | null;
    summary: string | null;
  };
  experiences: Array<{
    role: string | null; company: string | null; location: string | null;
    start_date: string | null; end_date: string | null; is_current: boolean; bullets: string[];
  }>;
  education: Array<{
    school: string | null; degree: string | null; honors: string | null;
    start_year: number | null; end_year: number | null;
  }>;
  projects: Array<{ name: string | null; description: string | null; tech_stack: string[]; link: string | null }>;
  skills: string[];
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asText = (v: unknown): string | null => (typeof v === 'string' ? trimText(v) || null : null);
const asTexts = (v: unknown): string[] => asList(v).map(asText).filter((t): t is string => !!t);
/** '2024-05' or '2024-05-01' becomes '2024-05'; anything else becomes null (left blank for the user). */
const asMonth = (v: unknown): string | null => {
  const m = typeof v === 'string' ? /^(\d{4}-\d{2})(?:-\d{2})?$/.exec(v.trim()) : null;
  return m && m[1] && isValidMonth(m[1]) ? m[1] : null;
};
const asYear = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : null;
};

/** Makes the backend answer safe to use even if a key is missing or has the wrong type. */
export function normalizeDraft(raw: unknown): ResumeDraft {
  const root = asObj(raw);
  const p = asObj(root.personal);
  return {
    personal: {
      full_name: asText(p.full_name), headline: asText(p.headline), email: asText(p.email),
      phone: asText(p.phone), location: asText(p.location), github: asText(p.github),
      linkedin: asText(p.linkedin), website: asText(p.website), summary: asText(p.summary),
    },
    experiences: asList(root.experiences).map((r) => {
      const x = asObj(r);
      const current = x.is_current === true;
      return {
        role: asText(x.role), company: asText(x.company), location: asText(x.location),
        start_date: asMonth(x.start_date), end_date: current ? null : asMonth(x.end_date),
        is_current: current, bullets: asTexts(x.bullets),
      };
    }),
    education: asList(root.education).map((r) => {
      const x = asObj(r);
      return {
        school: asText(x.school), degree: asText(x.degree), honors: asText(x.honors),
        start_year: asYear(x.start_year), end_year: asYear(x.end_year),
      };
    }),
    projects: asList(root.projects).map((r) => {
      const x = asObj(r);
      return { name: asText(x.name), description: asText(x.description), tech_stack: asTexts(x.tech_stack), link: asText(x.link) };
    }),
    skills: asTexts(root.skills),
  };
}

/** True when the resume gave us nothing at all (so we show a clear message instead of an empty review). */
export function draftIsEmpty(d: ResumeDraft): boolean {
  const personalEmpty = Object.values(d.personal).every((v) => v === null);
  return personalEmpty && !d.experiences.length && !d.education.length && !d.projects.length && !d.skills.length;
}

// ---------- The review the user edits ----------

export type PersonalKey = 'full_name' | 'headline' | 'phone' | 'location' | 'github' | 'linkedin' | 'website' | 'summary';
export type PersonalValues = Record<PersonalKey, string>;
export type Choice = 'keep' | 'use';

export const PERSONAL_KEYS: PersonalKey[] = [
  'full_name', 'headline', 'phone', 'location', 'github', 'linkedin', 'website', 'summary',
];

export interface ReviewExperience {
  key: number; include: boolean; saved: boolean;
  role: string; company: string; location: string;
  startMonth: string; endMonth: string; present: boolean;
  /** One bullet point per line. */
  bulletsText: string;
}
export interface ReviewEducation {
  key: number; include: boolean; saved: boolean;
  school: string; degree: string; honors: string; startYear: string; endYear: string;
}
export interface ReviewProject {
  key: number; include: boolean; saved: boolean;
  name: string; description: string; techText: string; link: string;
}
export interface ReviewState {
  personal: PersonalValues;
  /** Only used where the profile already has a different value. Missing = keep current. */
  choices: Partial<Record<PersonalKey, Choice>>;
  experiences: ReviewExperience[];
  education: ReviewEducation[];
  projects: ReviewProject[];
  skills: { names: string[]; customPicked: string[] };
}

// Required fields: an item missing one is flagged and starts unchecked.
export const missingExperience = (x: Pick<ReviewExperience, 'role' | 'company'>): string[] =>
  [!trimText(x.role) && 'role', !trimText(x.company) && 'company'].filter((v): v is string => !!v);
export const missingEducation = (x: Pick<ReviewEducation, 'school'>): string[] => (trimText(x.school) ? [] : ['school']);
export const missingProject = (x: Pick<ReviewProject, 'name'>): string[] => (trimText(x.name) ? [] : ['name']);

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();

export function normalizeSkillNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const n of names) {
    const name = trimText(n).replace(/\s+/g, ' ');
    const k = name.toLowerCase();
    if (!name || seen.has(k)) continue;
    seen.add(k);
    result.push(name);
  }
  return result;
}

export function buildReview(d: ResumeDraft): ReviewState {
  const p = d.personal;
  return {
    personal: {
      full_name: p.full_name ?? '', headline: p.headline ?? '', phone: p.phone ?? '', location: p.location ?? '',
      github: p.github ?? '', linkedin: p.linkedin ?? '', website: p.website ?? '', summary: p.summary ?? '',
    },
    choices: {},
    experiences: d.experiences.map((x, key) => {
      const item: ReviewExperience = {
        key, include: false, saved: false,
        role: x.role ?? '', company: x.company ?? '', location: x.location ?? '',
        startMonth: x.start_date ?? '', endMonth: x.is_current ? '' : (x.end_date ?? ''), present: x.is_current,
        bulletsText: x.bullets.map(oneLine).filter(Boolean).join('\n'),
      };
      item.include = missingExperience(item).length === 0;
      return item;
    }),
    education: d.education.map((x, key) => {
      const item: ReviewEducation = {
        key, include: false, saved: false,
        school: x.school ?? '', degree: x.degree ?? '', honors: x.honors ?? '',
        startYear: x.start_year === null ? '' : String(x.start_year), endYear: x.end_year === null ? '' : String(x.end_year),
      };
      item.include = missingEducation(item).length === 0;
      return item;
    }),
    projects: d.projects.map((x, key) => {
      const item: ReviewProject = {
        key, include: false, saved: false,
        name: x.name ?? '', description: x.description ?? '', techText: x.tech_stack.join(', '), link: x.link ?? '',
      };
      item.include = missingProject(item).length === 0;
      return item;
    }),
    skills: { names: normalizeSkillNames(d.skills), customPicked: [] },
  };
}

// ---------- Personal info: fill only what is empty, never overwrite by accident ----------

export const PERSONAL_LABELS: Record<PersonalKey, string> = {
  full_name: 'Full name', headline: 'Headline', phone: 'Phone', location: 'Location',
  github: 'GitHub', linkedin: 'LinkedIn', website: 'Website', summary: 'Summary',
};

/** What the profile holds now, as plain strings. */
export function personalFromProfile(profile: ProfileRow | null): PersonalValues {
  const links = linksOf(profile?.links);
  return {
    full_name: trimText(profile?.full_name), headline: trimText(profile?.headline),
    phone: trimText(profile?.phone), location: trimText(profile?.location),
    github: links.github, linkedin: links.linkedin, website: links.website, summary: trimText(profile?.summary),
  };
}

export type PersonalStatus =
  | 'missing'       // nothing in the resume and nothing in the profile: the user can fill it in
  | 'only-current'  // nothing found in the resume: the profile value stays
  | 'fill'          // the profile field is empty: the imported value will be added
  | 'same'          // both agree: nothing to do
  | 'conflict';     // both have a different value: the user chooses (default keep current)

const isLink = (k: PersonalKey) => k === 'github' || k === 'linkedin' || k === 'website';
const sameText = (k: PersonalKey, a: string, b: string): boolean => {
  const fix = (s: string) => (isLink(k) ? normalizeUrl(s).replace(/\/+$/, '') : s).toLowerCase().replace(/\s+/g, ' ');
  return fix(trimText(a)) === fix(trimText(b));
};

export interface PersonalPlan {
  fields: Array<{ key: PersonalKey; status: PersonalStatus; final: string }>;
  /** The values that will be in the profile after saving. */
  result: PersonalValues;
  /** Fields whose value will change. */
  changed: PersonalKey[];
}

export function planPersonalMerge(
  current: PersonalValues,
  imported: PersonalValues,
  choices: Partial<Record<PersonalKey, Choice>> = {},
): PersonalPlan {
  const result = { ...current };
  const fields: PersonalPlan['fields'] = [];
  const changed: PersonalKey[] = [];
  for (const key of PERSONAL_KEYS) {
    const cur = trimText(current[key]);
    const imp = trimText(imported[key]);
    let status: PersonalStatus;
    let final = cur;
    if (!imp) status = cur ? 'only-current' : 'missing';
    else if (!cur) { status = 'fill'; final = imp; }
    else if (sameText(key, cur, imp)) status = 'same';
    else {
      status = 'conflict';
      if (choices[key] === 'use') final = imp;
    }
    result[key] = final;
    if (final !== cur) changed.push(key);
    fields.push({ key, status, final });
  }
  return { fields, result, changed };
}

/** Error text for each imported value that will actually be saved (values we keep out are not checked). */
export function personalErrors(plan: PersonalPlan, imported: PersonalValues): Partial<Record<PersonalKey, string>> {
  const errors: Partial<Record<PersonalKey, string>> = {};
  for (const key of plan.changed) {
    const v = imported[key];
    const msg =
      key === 'full_name' ? requiredError('your full name', v, LIMITS.fullName)
      : key === 'headline' ? maxLengthError('the headline', v, LIMITS.headline)
      : key === 'phone' ? phoneError(v)
      : key === 'location' ? maxLengthError('the location', v, LIMITS.location)
      : key === 'summary' ? maxLengthError('the summary', v, LIMITS.summary)
      : urlError(v);
    if (msg) errors[key] = msg;
  }
  return errors;
}

export function buildPersonalInput(plan: PersonalPlan, existingLinks: Record<string, string> | null | undefined): PersonalInfoInput {
  const r = plan.result;
  return {
    full_name: toNull(r.full_name), headline: toNull(r.headline), phone: toNull(r.phone),
    location: toNull(r.location), summary: toNull(r.summary),
    links: buildLinks(existingLinks, { github: r.github, linkedin: r.linkedin, website: r.website }),
  };
}

// ---------- Item validation (same rules and wording as the normal forms) ----------

export const hasErrors = (e: Record<string, string>): boolean => Object.values(e).some(Boolean);

export const splitBullets = (text: string): string[] => cleanBullets(text.split(/\r?\n/));

export function validateExperience(x: ReviewExperience): Record<'role' | 'company' | 'location' | 'start' | 'end' | 'bullets', string> {
  const start = trimText(x.startMonth);
  const end = trimText(x.endMonth);
  let startErr = '';
  let endErr = '';
  if (start && !isValidMonth(start)) startErr = 'Use the format YYYY-MM, for example 2023-06.';
  if (!x.present) {
    if (!end) endErr = 'Please add an end month, or switch on "I currently work here".';
    else if (!isValidMonth(end)) endErr = 'Use the format YYYY-MM, for example 2024-02.';
    else if (start && !startErr && end < start) endErr = 'The end month cannot be before the start.';
  }
  const bullets = splitBullets(x.bulletsText);
  let bulletsErr = '';
  if (bullets.length > LIMITS.bullets) bulletsErr = `Please keep to ${LIMITS.bullets} bullet points or fewer.`;
  else if (bullets.some((b) => b.length > LIMITS.bullet)) bulletsErr = `Please keep each bullet point under ${LIMITS.bullet} characters.`;
  return {
    role: requiredError('your role', x.role, LIMITS.role),
    company: requiredError('the company', x.company, LIMITS.company),
    location: maxLengthError('the location', x.location, LIMITS.location),
    start: startErr, end: endErr, bullets: bulletsErr,
  };
}

export function validateEducation(x: ReviewEducation): Record<'school' | 'degree' | 'honors' | 'startYear' | 'endYear', string> {
  const startErr = yearError('Start year', x.startYear);
  const endErr = yearError('End year', x.endYear) || (startErr ? '' : yearRangeError(x.startYear, x.endYear));
  return {
    school: requiredError('the school', x.school, LIMITS.school),
    degree: maxLengthError('the degree', x.degree, LIMITS.degree),
    honors: maxLengthError('the honors', x.honors, LIMITS.honors),
    startYear: startErr, endYear: endErr,
  };
}

export const parseTech = (text: string): string[] => addTags([], text);

export function validateProject(x: ReviewProject): Record<'name' | 'description' | 'tech' | 'link', string> {
  const pieces = x.techText.split(/[,\n]/).map(trimText).filter(Boolean);
  const techBad = pieces.length > LIMITS.techCount || pieces.some((t) => t.length > LIMITS.tech);
  return {
    name: requiredError('the project name', x.name, LIMITS.projectName),
    description: maxLengthError('the description', x.description, LIMITS.projectDescription),
    tech: techBad ? `Please use up to ${LIMITS.techCount} technologies, each under ${LIMITS.tech} characters.` : '',
    link: urlError(x.link),
  };
}

// ---------- Duplicates ----------

const k = (s: string | null | undefined): string => trimText(s).toLowerCase().replace(/\s+/g, ' ');

/** Likely duplicate keys. Experience: company + role + start month. Education: school + degree. Project: name. */
export const experienceKey = (company: string, role: string, startMonth: string | null): string =>
  `${k(company)}|${k(role)}|${trimText(startMonth).slice(0, 7)}`;
export const educationKey = (school: string, degree: string | null): string => `${k(school)}|${k(degree)}`;
export const projectKey = (name: string): string => k(name);

export type DupFlag = 'existing' | 'batch' | null;

/** For each item: 'existing' (already in the profile), 'batch' (same as an earlier ticked item), or null. */
export function findDuplicateFlags(
  entries: ReadonlyArray<{ key: string | null; include: boolean; saved?: boolean }>,
  existing: Iterable<string>,
): DupFlag[] {
  const existingSet = new Set(existing);
  const seen = new Set<string>();
  return entries.map((e) => {
    if (e.key === null) return null;
    if (e.saved) { seen.add(e.key); return null; }
    if (existingSet.has(e.key)) return 'existing';
    if (seen.has(e.key)) return 'batch';
    if (e.include) seen.add(e.key);
    return null;
  });
}

export interface ImportExisting {
  experienceKeys: string[];
  educationKeys: string[];
  projectKeys: string[];
  ownedSkillIds: string[];
}

export function experienceFlags(items: readonly ReviewExperience[], existing: ImportExisting | null): DupFlag[] {
  return findDuplicateFlags(
    items.map((x) => ({
      key: missingExperience(x).length ? null : experienceKey(x.company, x.role, x.startMonth),
      include: x.include, saved: x.saved,
    })),
    existing?.experienceKeys ?? [],
  );
}
export function educationFlags(items: readonly ReviewEducation[], existing: ImportExisting | null): DupFlag[] {
  return findDuplicateFlags(
    items.map((x) => ({
      key: missingEducation(x).length ? null : educationKey(x.school, x.degree),
      include: x.include, saved: x.saved,
    })),
    existing?.educationKeys ?? [],
  );
}
export function projectFlags(items: readonly ReviewProject[], existing: ImportExisting | null): DupFlag[] {
  return findDuplicateFlags(
    items.map((x) => ({ key: missingProject(x).length ? null : projectKey(x.name), include: x.include, saved: x.saved })),
    existing?.projectKeys ?? [],
  );
}

// ---------- Skills ----------

export interface SkillMatches {
  /** In the bank and not yet owned: will be added with no level. */
  matched: Array<{ name: string; skill: SkillBankItem }>;
  /** In the bank and already in the user's skills. */
  owned: Array<{ name: string; skill: SkillBankItem }>;
  /** Not in the bank: the user may tick them to create custom skills. */
  unmatched: string[];
}

/** Case-insensitive match on display name, canonical name and aliases. Two names for one skill count once. */
export function matchSkills(
  names: readonly string[],
  bank: readonly SkillBankItem[],
  ownedIds: ReadonlySet<string> | readonly string[] = [],
): SkillMatches {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds);
  const out: SkillMatches = { matched: [], owned: [], unmatched: [] };
  const used = new Set<string>();
  for (const name of normalizeSkillNames(names)) {
    const skill = findExactSkill(bank, name);
    if (!skill) { out.unmatched.push(name); continue; }
    if (used.has(skill.id)) continue;
    used.add(skill.id);
    (owned.has(skill.id) ? out.owned : out.matched).push({ name, skill });
  }
  return out;
}

/** A new skill name must be 2 to 60 characters (same limit as the Add skill sheet). */
export const canCreateSkill = (name: string): boolean => trimText(name).length >= 2 && trimText(name).length <= LIMITS.skillName;

// ---------- What will be saved ----------

export interface SavePlan {
  personal: PersonalInfoInput | null;
  experiences: Array<{ key: number; input: ExperienceInput }>;
  education: Array<{ key: number; input: EducationInput }>;
  projects: Array<{ key: number; input: ProjectInput }>;
  skills: SkillBankItem[];
  customNames: string[];
}

export interface PlanContext {
  existing: ImportExisting | null;
  bank: readonly SkillBankItem[];
  profile: ProfileRow | null;
}

export function currentPersonalPlan(review: ReviewState, profile: ProfileRow | null): PersonalPlan {
  return planPersonalMerge(personalFromProfile(profile), review.personal, review.choices);
}

/** Only ticked items that are not duplicates and not already saved. Pure: does not check validation. */
export function buildSavePlan(review: ReviewState, ctx: PlanContext): SavePlan {
  const personalPlan = currentPersonalPlan(review, ctx.profile);
  const exFlags = experienceFlags(review.experiences, ctx.existing);
  const edFlags = educationFlags(review.education, ctx.existing);
  const prFlags = projectFlags(review.projects, ctx.existing);
  const skills = matchSkills(review.skills.names, ctx.bank, ctx.existing?.ownedSkillIds ?? []);
  const picked = new Set(review.skills.customPicked.map((n) => k(n)));

  return {
    personal: personalPlan.changed.length ? buildPersonalInput(personalPlan, ctx.profile?.links) : null,
    experiences: review.experiences
      .map((x, i) => ({ x, flag: exFlags[i] }))
      .filter(({ x, flag }) => x.include && !x.saved && !flag)
      .map(({ x }) => ({
        key: x.key,
        input: {
          role: trimText(x.role), company: trimText(x.company), location: toNull(x.location),
          start_date: monthToDate(x.startMonth), end_date: x.present ? null : monthToDate(x.endMonth),
          bullets: splitBullets(x.bulletsText),
        },
      })),
    education: review.education
      .map((x, i) => ({ x, flag: edFlags[i] }))
      .filter(({ x, flag }) => x.include && !x.saved && !flag)
      .map(({ x }) => ({
        key: x.key,
        input: {
          school: trimText(x.school), degree: toNull(x.degree), honors: toNull(x.honors),
          start_year: parseYear(x.startYear), end_year: parseYear(x.endYear),
        },
      })),
    projects: review.projects
      .map((x, i) => ({ x, flag: prFlags[i] }))
      .filter(({ x, flag }) => x.include && !x.saved && !flag)
      .map(({ x }) => ({
        key: x.key,
        input: {
          name: trimText(x.name), description: toNull(x.description), tech_stack: parseTech(x.techText),
          link: toNull(normalizeUrl(x.link)),
        },
      })),
    skills: skills.matched.map((m) => m.skill),
    customNames: skills.unmatched.filter((n) => picked.has(k(n)) && canCreateSkill(n)),
  };
}

/** True when any ticked item or imported value that would be saved fails the normal form rules. */
export function reviewHasErrors(review: ReviewState, ctx: PlanContext): boolean {
  const personalPlan = currentPersonalPlan(review, ctx.profile);
  if (Object.keys(personalErrors(personalPlan, review.personal)).length) return true;
  const plan = buildSavePlan(review, ctx);
  const ex = new Set(plan.experiences.map((p) => p.key));
  const ed = new Set(plan.education.map((p) => p.key));
  const pr = new Set(plan.projects.map((p) => p.key));
  return (
    review.experiences.some((x) => ex.has(x.key) && hasErrors(validateExperience(x))) ||
    review.education.some((x) => ed.has(x.key) && hasErrors(validateEducation(x))) ||
    review.projects.some((x) => pr.has(x.key) && hasErrors(validateProject(x)))
  );
}

// ---------- Counts and sentences ----------

export interface ImportCounts {
  personal: boolean;
  experiences: number;
  education: number;
  projects: number;
  skills: number;
}

export const countsOfPlan = (p: SavePlan): ImportCounts => ({
  personal: !!p.personal,
  experiences: p.experiences.length,
  education: p.education.length,
  projects: p.projects.length,
  skills: p.skills.length + p.customNames.length,
});

export const totalOfCounts = (c: ImportCounts): number =>
  (c.personal ? 1 : 0) + c.experiences + c.education + c.projects + c.skills;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "2 experiences, 1 education, 8 skills" (zero counts are left out). */
export function describeCounts(c: ImportCounts, includePersonal = false): string {
  const parts: string[] = [];
  if (includePersonal && c.personal) parts.push('personal info');
  if (c.experiences) parts.push(plural(c.experiences, 'experience', 'experiences'));
  if (c.education) parts.push(`${c.education} education`);
  if (c.projects) parts.push(plural(c.projects, 'project', 'projects'));
  if (c.skills) parts.push(plural(c.skills, 'skill', 'skills'));
  return parts.join(', ');
}

/** The short summary shown after a successful save. */
export function savedSummary(c: ImportCounts): string {
  const items = describeCounts(c);
  const parts: string[] = [];
  if (items) parts.push(`Added ${items}.`);
  if (c.personal) parts.push('Personal info updated.');
  return parts.length ? parts.join(' ') : 'Nothing was added.';
}

/** Honest message when only some writes worked. */
export function partialMessage(saved: number, total: number): string {
  const failed = total - saved;
  return `Saved ${saved} of ${total} ${total === 1 ? 'item' : 'items'}, ${failed} failed - try again.`;
}
