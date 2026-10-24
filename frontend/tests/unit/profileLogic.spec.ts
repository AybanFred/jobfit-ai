import { describe, it, expect } from 'vitest';
import {
  requiredError, maxLengthError, normalizeUrl, urlError, phoneError, buildLinks, linksOf,
  isValidMonth, monthToDate, dateToMonth, formatMonth, monthRangeLabel, monthRangeError,
  yearError, yearRangeError, parseYear,
  experienceSortOrder, sortExperiences, sortProjects, sortEducation,
  moveItem, cleanBullets, addTags,
  filterSkills, findExactSkill, sortUserSkills, yearsError, parseYears, levelError,
  type Experience, type Project, type Education, type SkillBankItem, type UserSkill,
} from '@/services/profileLogic';
import { computeCompleteness, isPersonalInfoComplete } from '@/services/dashboard';
import { friendlyDataError } from '@/services/errors';

describe('text validation', () => {
  it('requires text and enforces the maximum length', () => {
    expect(requiredError('your role', '   ', 10)).toMatch(/enter your role/);
    expect(requiredError('your role', 'x'.repeat(11), 10)).toMatch(/under 10/);
    expect(requiredError('your role', ' Dev ', 10)).toBe('');
    expect(maxLengthError('the summary', 'abc', 2)).toMatch(/under 2/);
    expect(maxLengthError('the summary', null, 2)).toBe('');
  });
});

describe('urls and phone', () => {
  it('accepts empty and real web addresses', () => {
    expect(urlError('')).toBe('');
    expect(urlError('https://github.com/me')).toBe('');
    expect(urlError('linkedin.com/in/me')).toBe('');
  });

  it('rejects things that are not web addresses', () => {
    expect(urlError('not a url')).not.toBe('');
    expect(urlError('ftp://example.com')).not.toBe('');
    expect(urlError('localhost')).not.toBe('');
    expect(urlError('https://' + 'a'.repeat(250) + '.com')).not.toBe('');
  });

  it('adds https:// only when there is no scheme', () => {
    expect(normalizeUrl('github.com/me')).toBe('https://github.com/me');
    expect(normalizeUrl('http://x.io')).toBe('http://x.io');
    expect(normalizeUrl('  ')).toBe('');
  });

  it('checks phone numbers loosely', () => {
    expect(phoneError('')).toBe('');
    expect(phoneError('+1 (555) 123-4567')).toBe('');
    expect(phoneError('abc')).not.toBe('');
    expect(phoneError('12')).not.toBe('');
  });

  it('keeps other stored links and removes empty ones', () => {
    const existing = { github: 'https://github.com/old', twitter: 'https://x.com/me' };
    const result = buildLinks(existing, { github: '', linkedin: 'linkedin.com/in/me', website: '' });
    expect(result).toEqual({ twitter: 'https://x.com/me', linkedin: 'https://linkedin.com/in/me' });
    expect(linksOf(null)).toEqual({ github: '', linkedin: '', website: '' });
  });
});

describe('months and years', () => {
  it('converts between month input values and database dates', () => {
    expect(isValidMonth('2024-05')).toBe(true);
    expect(isValidMonth('2024-13')).toBe(false);
    expect(monthToDate('2024-05')).toBe('2024-05-01');
    expect(monthToDate('nope')).toBeNull();
    expect(dateToMonth('2024-05-01')).toBe('2024-05');
    expect(dateToMonth(null)).toBe('');
  });

  it('formats labels without time zone surprises', () => {
    expect(formatMonth('2024-01-01')).toBe('Jan 2024');
    expect(monthRangeLabel('2022-05-01', null)).toBe('May 2022 – Present');
    expect(monthRangeLabel('2022-05-01', '2023-02-01')).toBe('May 2022 – Feb 2023');
  });

  it('validates the experience date range', () => {
    expect(monthRangeError('', '', true).start).toMatch(/start/);
    expect(monthRangeError('2024-01', '', true)).toEqual({ start: '', end: '' });
    expect(monthRangeError('2024-01', '', false).end).toMatch(/end month/);
    expect(monthRangeError('2024-05', '2024-01', false).end).toMatch(/before/);
    expect(monthRangeError('2024-01', '2024-05', false)).toEqual({ start: '', end: '' });
  });

  it('validates years', () => {
    const now = new Date('2026-06-01');
    expect(yearError('Start year', '', now)).toBe('');
    expect(yearError('Start year', '2020', now)).toBe('');
    expect(yearError('Start year', '20', now)).toMatch(/4-digit/);
    expect(yearError('Start year', '1800', now)).not.toBe('');
    expect(yearRangeError(2022, 2020)).toMatch(/before/);
    expect(yearRangeError(2020, '')).toBe('');
    expect(parseYear('2021')).toBe(2021);
    expect(parseYear('')).toBeNull();
  });
});

describe('sorting', () => {
  const exp = (id: string, start: string, end: string | null, created = '2026-01-01'): Experience => ({
    id, role: id, company: 'C', location: null, start_date: start, end_date: end, bullets: [],
    sort_order: experienceSortOrder(start, end), created_at: created,
  });

  it('puts current jobs first, then the most recently ended', () => {
    const old = exp('old', '2015-01-01', '2018-01-01');
    const recent = exp('recent', '2019-01-01', '2022-06-01');
    const current = exp('current', '2020-01-01', null);
    expect(sortExperiences([old, current, recent]).map((e) => e.id)).toEqual(['current', 'recent', 'old']);
  });

  it('uses the start month to order jobs that end the same month', () => {
    const a = exp('a', '2020-01-01', '2022-01-01');
    const b = exp('b', '2021-06-01', '2022-01-01');
    expect(sortExperiences([a, b]).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('keeps sort_order within the database int range', () => {
    expect(Math.abs(experienceSortOrder('2099-12-01', null))).toBeLessThan(2147483647);
    expect(experienceSortOrder(null, null)).toBe(-99990000);
  });

  it('shows the newest project first when sort_order ties', () => {
    const p = (id: string, created: string): Project => ({
      id, name: id, description: null, tech_stack: [], link: null, sort_order: 0, created_at: created,
    });
    expect(sortProjects([p('a', '2026-01-01'), p('b', '2026-03-01')]).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('sorts education by latest end year, still-studying first', () => {
    const e = (id: string, s: number | null, en: number | null): Education => ({
      id, school: id, degree: null, honors: null, start_year: s, end_year: en,
    });
    const list = [e('old', 2010, 2014), e('now', 2024, null), e('mid', 2015, 2019)];
    expect(sortEducation(list).map((x) => x.id)).toEqual(['now', 'mid', 'old']);
  });
});

describe('bullets and tags', () => {
  it('moves items without changing the original array', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(list, 2, 1)).toEqual(['a', 'c', 'b']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('ignores moves that fall off the list', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('drops empty bullets and trims the rest', () => {
    expect(cleanBullets(['  Built X ', '', '   ', 'Led Y'])).toEqual(['Built X', 'Led Y']);
  });

  it('adds comma-separated tags without duplicates', () => {
    expect(addTags(['Vue'], 'vue, Ionic,, Supabase ')).toEqual(['Vue', 'Ionic', 'Supabase']);
    expect(addTags([], '   ')).toEqual([]);
  });

  it('respects the tag limits', () => {
    expect(addTags(['a', 'b'], 'c, d', 3)).toEqual(['a', 'b', 'c']);
    expect(addTags([], 'x'.repeat(50), 5, 10)).toEqual(['x'.repeat(10)]);
  });
});

describe('skills', () => {
  const bank: SkillBankItem[] = [
    { id: '1', canonical_name: 'vue.js', display_name: 'Vue.js', aliases: ['vue', 'vuejs', 'vue 3'], category: 'frontend' },
    { id: '2', canonical_name: 'python', display_name: 'Python', aliases: ['py', 'python3'], category: 'backend' },
    { id: '3', canonical_name: 'postgresql', display_name: 'PostgreSQL', aliases: ['postgres', 'psql'], category: 'data' },
    { id: '4', canonical_name: 'react native', display_name: 'React Native', aliases: [], category: 'mobile' },
  ];

  it('finds skills by name or alias, ignoring letter case', () => {
    expect(filterSkills(bank, 'POSTGRES').map((s) => s.id)).toEqual(['3']);
    expect(filterSkills(bank, 'vuejs').map((s) => s.id)).toEqual(['1']);
    expect(filterSkills(bank, '  py ').map((s) => s.id)).toEqual(['2']);
  });

  it('hides skills the user already has', () => {
    expect(filterSkills(bank, 'vue', new Set(['1']))).toEqual([]);
    expect(filterSkills(bank, '', ['1', '2', '3']).map((s) => s.id)).toEqual(['4']);
  });

  it('ranks better matches first', () => {
    const item = (id: string, name: string): SkillBankItem => ({
      id, canonical_name: name.toLowerCase(), display_name: name, aliases: [], category: null,
    });
    // exact match first, then "starts with", then "contains"
    const results = filterSkills([item('1', 'Django'), item('2', 'Gopher'), item('3', 'Go')], 'go').map((s) => s.id);
    expect(results).toEqual(['3', '2', '1']);
  });

  it('returns nothing when there is no match, and lists everything for an empty search', () => {
    expect(filterSkills(bank, 'cobol')).toEqual([]);
    expect(filterSkills(bank, '')).toHaveLength(4);
  });

  it('finds an exact match by name or alias only', () => {
    expect(findExactSkill(bank, 'Vue')?.id).toBe('1');
    expect(findExactSkill(bank, 'react')).toBeNull();
    expect(findExactSkill(bank, '')).toBeNull();
  });

  it('sorts the user skills by level, then name', () => {
    const us = (id: string, name: string, level: number | null): UserSkill => ({
      skill_id: id, level, years: null,
      skill: { id, canonical_name: name.toLowerCase(), display_name: name, aliases: [], category: null },
    });
    const sorted = sortUserSkills([us('a', 'Zed', 3), us('b', 'Alpha', 3), us('c', 'Mid', 5), us('d', 'None', null)]);
    expect(sorted.map((s) => s.skill_id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('validates years and level', () => {
    expect(yearsError('')).toBe('');
    expect(yearsError('2.5')).toBe('');
    expect(yearsError('2.55')).not.toBe('');
    expect(yearsError('-1')).not.toBe('');
    expect(yearsError('99')).not.toBe('');
    expect(yearsError('abc')).not.toBe('');
    expect(parseYears('3')).toBe(3);
    expect(parseYears('')).toBeNull();
    expect(levelError(null)).not.toBe('');
    expect(levelError(0)).not.toBe('');
    expect(levelError(5)).toBe('');
  });
});

describe('profile completeness shared by Home and Profile', () => {
  const profile = { full_name: 'A', headline: 'B', email: null, phone: null, location: 'X', summary: 'S' };

  it('reports personal info as complete only when all four checks pass', () => {
    expect(isPersonalInfoComplete(profile)).toBe(true);
    expect(isPersonalInfoComplete({ ...profile, summary: ' ' })).toBe(false);
    expect(isPersonalInfoComplete(null)).toBe(false);
  });

  it('counts each section once the user adds a row', () => {
    const none = { experiences: 0, education: 0, projects: 0, skills: 0 };
    expect(computeCompleteness(profile, none).percent).toBe(50);
    expect(computeCompleteness(profile, { ...none, skills: 1 }).percent).toBe(63);
    expect(computeCompleteness(profile, { experiences: 1, education: 1, projects: 1, skills: 1 }).percent).toBe(100);
  });
});

describe('friendlyDataError', () => {
  it('hides technical messages', () => {
    expect(friendlyDataError(new TypeError('Failed to fetch'))).toMatch(/internet/);
    expect(friendlyDataError({ code: '23505', message: 'duplicate key value' })).toMatch(/already/);
    expect(friendlyDataError(new Error('JWT expired'))).toMatch(/log in again/);
    expect(friendlyDataError(new Error('relation "x" does not exist'))).not.toMatch(/relation/);
  });
});
