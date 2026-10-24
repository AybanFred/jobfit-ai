import { supabase } from './supabase';
import { api } from './api';
import { currentUserId } from './profile';
import { sortUserSkills, type SkillBankItem, type UserSkill } from './profileLogic';

// Skills: a global read-only bank (table `skills`) and the user's own picks (table `user_skills`).

const SKILL_COLUMNS = 'id, canonical_name, display_name, aliases, category';

function toBankItem(row: Partial<SkillBankItem>): SkillBankItem {
  return {
    id: String(row.id),
    canonical_name: String(row.canonical_name ?? ''),
    display_name: String(row.display_name ?? ''),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    category: row.category ?? null,
  };
}

/** The whole shared skills bank (it is small, so we search it on the device). */
export async function listSkillBank(): Promise<SkillBankItem[]> {
  const { data, error } = await supabase.from('skills').select(SKILL_COLUMNS).order('display_name');
  if (error) throw error;
  return (data ?? []).map((r) => toBankItem(r as Partial<SkillBankItem>));
}

export async function listUserSkills(): Promise<UserSkill[]> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from('user_skills')
    .select(`skill_id, level, years, skills ( ${SKILL_COLUMNS} )`)
    .eq('user_id', uid);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    skill_id: string;
    level: number | null;
    years: number | string | null;
    skills: Partial<SkillBankItem> | Array<Partial<SkillBankItem>> | null;
  }>;
  const result: UserSkill[] = [];
  for (const row of rows) {
    const skill = Array.isArray(row.skills) ? row.skills[0] : row.skills;
    if (!skill) continue; // the skill was removed from the bank; nothing to show
    result.push({
      skill_id: row.skill_id,
      level: row.level,
      years: row.years === null ? null : Number(row.years),
      skill: toBankItem(skill),
    });
  }
  return sortUserSkills(result);
}

/** `level` may be null (skills imported from a resume have no level until the user sets one). */
export async function addUserSkill(skillId: string, level: number | null, years: number | null): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase.from('user_skills').insert({ user_id: uid, skill_id: skillId, level, years });
  if (error) throw error;
}

export async function updateUserSkill(skillId: string, level: number, years: number | null): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase
    .from('user_skills')
    .update({ level, years })
    .eq('user_id', uid)
    .eq('skill_id', skillId);
  if (error) throw error;
}

export async function removeUserSkill(skillId: string): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase.from('user_skills').delete().eq('user_id', uid).eq('skill_id', skillId);
  if (error) throw error;
}

/** What the add/edit skill sheets hand back. Either `skill` (from the bank) or `customName` (new) is set. */
export interface SkillFormInput {
  skill: SkillBankItem | null;
  customName: string | null;
  level: number;
  years: number | null;
}

/** Thrown when only the "create a new skill" backend step fails, so the screen can explain it clearly. */
export class CustomSkillError extends Error {
  constructor(public original: unknown) {
    super('Could not create the custom skill');
  }
}

export interface CustomSkillResponse {
  id: string;
  canonical_name: string;
  display_name: string;
  category: string | null;
  created: boolean;
}

/** Asks the backend to create a new skill in the shared bank (or return the existing one). */
export async function createCustomSkill(name: string, category: string | null = null): Promise<SkillBankItem> {
  const res = await api<CustomSkillResponse>('/skills/custom', {
    method: 'POST',
    body: JSON.stringify({ name, category }),
  });
  return { id: res.id, canonical_name: res.canonical_name, display_name: res.display_name, aliases: [], category: res.category };
}
