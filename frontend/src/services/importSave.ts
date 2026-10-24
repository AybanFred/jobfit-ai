import {
  saveExperience, saveEducation, saveProject, listExperiences, listEducation, listProjects,
  type EducationInput, type ExperienceInput, type PersonalInfoInput, type ProjectInput,
} from './profile';
import { addUserSkill, createCustomSkill, listSkillBank, listUserSkills } from './skills';
import { useProfileStore } from '@/stores/profile';
import {
  educationKey, experienceKey, projectKey, countsOfPlan, totalOfCounts,
  type ImportCounts, type ImportExisting, type SavePlan,
} from './importLogic';
import type { SkillBankItem } from './profileLogic';

// Writes the reviewed import to the profile (Supabase with RLS, plus POST /skills/custom for new skills).
// One failing write never stops the others, and the result says honestly what worked.

/** Everything the review screen needs to know about the profile as it is now. */
export interface ImportContext {
  existing: ImportExisting;
  bank: SkillBankItem[];
}

export async function loadImportContext(): Promise<ImportContext> {
  const [experiences, education, projects, userSkills, bank] = await Promise.all([
    listExperiences(), listEducation(), listProjects(), listUserSkills(), listSkillBank(),
  ]);
  return {
    existing: {
      experienceKeys: experiences.map((x) => experienceKey(x.company, x.role, x.start_date ? x.start_date.slice(0, 7) : '')),
      educationKeys: education.map((x) => educationKey(x.school, x.degree)),
      projectKeys: projects.map((x) => projectKey(x.name)),
      ownedSkillIds: userSkills.map((x) => x.skill_id),
    },
    bank,
  };
}

/** The write operations, injectable so the logic can be tested without a network. */
export interface Writers {
  personal(input: PersonalInfoInput): Promise<void>;
  experience(input: ExperienceInput): Promise<void>;
  education(input: EducationInput): Promise<void>;
  project(input: ProjectInput): Promise<void>;
  /** Adds a skill to the user's list with NO level and NO years (we never invent them). */
  addSkill(skillId: string): Promise<void>;
  createSkill(name: string): Promise<SkillBankItem>;
}

export const defaultWriters: Writers = {
  personal: (input) => useProfileStore().savePersonal(input),
  experience: (input) => saveExperience(input),
  education: (input) => saveEducation(input),
  project: (input) => saveProject(input),
  addSkill: (skillId) => addUserSkill(skillId, null, null),
  createSkill: (name) => createCustomSkill(name, null),
};

export interface SaveOutcome {
  /** How many writes were planned and how many worked. */
  total: number;
  saved: number;
  failed: number;
  /** What was really written (used for the summary and to mark items as saved). */
  counts: ImportCounts;
  experienceKeys: number[];
  educationKeys: number[];
  projectKeys: number[];
  /** Skills now in the user's list (matched ones and newly created ones). */
  skillsAdded: SkillBankItem[];
  /** The last error, so the screen can pick friendly wording. */
  lastError: unknown;
}

export async function executePlan(
  plan: SavePlan,
  writers: Writers = defaultWriters,
  ownedSkillIds: readonly string[] = [],
): Promise<SaveOutcome> {
  const owned = new Set(ownedSkillIds);
  const out: SaveOutcome = {
    total: totalOfCounts(countsOfPlan(plan)), saved: 0, failed: 0,
    counts: { personal: false, experiences: 0, education: 0, projects: 0, skills: 0 },
    experienceKeys: [], educationKeys: [], projectKeys: [], skillsAdded: [], lastError: null,
  };
  const fail = (e: unknown) => { out.failed += 1; out.lastError = e; };

  if (plan.personal) {
    try { await writers.personal(plan.personal); out.counts.personal = true; out.saved += 1; } catch (e) { fail(e); }
  }
  for (const x of plan.experiences) {
    try { await writers.experience(x.input); out.experienceKeys.push(x.key); out.counts.experiences += 1; out.saved += 1; } catch (e) { fail(e); }
  }
  for (const x of plan.education) {
    try { await writers.education(x.input); out.educationKeys.push(x.key); out.counts.education += 1; out.saved += 1; } catch (e) { fail(e); }
  }
  // Projects have no date to sort by, so the newest row is shown first: write them last-to-first
  // so the first project of the resume ends up on top.
  for (const x of [...plan.projects].reverse()) {
    try { await writers.project(x.input); out.projectKeys.push(x.key); out.counts.projects += 1; out.saved += 1; } catch (e) { fail(e); }
  }

  const skillJobs = [
    ...plan.skills.map((skill) => async () => {
      await writers.addSkill(skill.id);
      return skill;
    }),
    ...plan.customNames.map((name) => async () => {
      const skill = await writers.createSkill(name);
      if (owned.has(skill.id)) return null; // the backend returned a skill the user already has
      await writers.addSkill(skill.id);
      return skill;
    }),
  ];
  const results = await Promise.allSettled(skillJobs.map((job) => job()));
  for (const r of results) {
    if (r.status === 'rejected') { fail(r.reason); continue; }
    if (r.value) { out.skillsAdded.push(r.value); out.counts.skills += 1; }
    out.saved += 1;
  }
  return out;
}
