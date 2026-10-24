import { describe, it, expect } from 'vitest';
import {
  normalizeDraft, draftIsEmpty, buildReview, missingExperience, missingEducation, missingProject,
  planPersonalMerge, personalErrors, personalFromProfile, buildPersonalInput,
  experienceKey, educationKey, projectKey, findDuplicateFlags, experienceFlags, educationFlags, projectFlags,
  matchSkills, normalizeSkillNames, canCreateSkill,
  validateExperience, validateEducation, validateProject, hasErrors,
  buildSavePlan, reviewHasErrors, countsOfPlan, totalOfCounts, describeCounts, savedSummary, partialMessage,
  type ImportExisting, type PersonalValues, type ReviewState,
} from '@/services/importLogic';
import { computeCompleteness } from '@/services/dashboard';
import { sortUserSkills, type SkillBankItem, type UserSkill } from '@/services/profileLogic';

const blankPersonal = (): PersonalValues => ({
  full_name: '', headline: '', phone: '', location: '', github: '', linkedin: '', website: '', summary: '',
});

const bank: SkillBankItem[] = [
  { id: 'js', canonical_name: 'javascript', display_name: 'JavaScript', aliases: ['js', 'ecmascript'], category: null },
  { id: 'vue', canonical_name: 'vue.js', display_name: 'Vue.js', aliases: ['vue', 'vuejs'], category: null },
  { id: 'py', canonical_name: 'python', display_name: 'Python', aliases: [], category: null },
];

const emptyExisting = (): ImportExisting => ({ experienceKeys: [], educationKeys: [], projectKeys: [], ownedSkillIds: [] });

describe('normalizeDraft', () => {
  it('keeps real values and turns everything else into null or empty lists', () => {
    const d = normalizeDraft({
      personal: { full_name: '  Ana Cruz ', headline: '', phone: 5 },
      experiences: [{ role: 'Dev', company: 'Acme', start_date: '2021-03', end_date: 'garbage', is_current: false, bullets: ['  a ', '', 7] }],
      education: [{ school: 'MIT', start_year: '2018', end_year: 20 }],
      projects: [{ name: 'X', tech_stack: ['Vue', ''] }],
      skills: ['Python', ' ', null],
    });
    expect(d.personal.full_name).toBe('Ana Cruz');
    expect(d.personal.headline).toBeNull();
    expect(d.personal.phone).toBeNull();
    expect(d.experiences[0]).toMatchObject({ start_date: '2021-03', end_date: null, is_current: false, bullets: ['a'] });
    expect(d.education[0]).toMatchObject({ start_year: 2018, end_year: null, degree: null });
    expect(d.projects[0]).toMatchObject({ link: null, tech_stack: ['Vue'] });
    expect(d.skills).toEqual(['Python']);
  });

  it('survives a completely wrong answer', () => {
    const d = normalizeDraft('nonsense');
    expect(draftIsEmpty(d)).toBe(true);
    expect(d.experiences).toEqual([]);
  });

  it('ignores the end date of a current job', () => {
    const d = normalizeDraft({ experiences: [{ role: 'a', company: 'b', end_date: '2023-01', is_current: true }] });
    expect(d.experiences[0]?.end_date).toBeNull();
  });
});

describe('review: required fields', () => {
  const draft = normalizeDraft({
    experiences: [
      { role: 'Dev', company: 'Acme', start_date: '2020-01', end_date: '2021-01' },
      { role: 'Dev', company: null },
    ],
    education: [{ school: 'MIT' }, { school: null, degree: 'BSc' }],
    projects: [{ name: 'App' }, { name: null, description: 'x' }],
  });
  const review = buildReview(draft);

  it('flags and unchecks items that miss a required field', () => {
    expect(review.experiences.map((x) => x.include)).toEqual([true, false]);
    expect(review.education.map((x) => x.include)).toEqual([true, false]);
    expect(review.projects.map((x) => x.include)).toEqual([true, false]);
    expect(missingExperience(review.experiences[1]!)).toEqual(['company']);
    expect(missingEducation(review.education[1]!)).toEqual(['school']);
    expect(missingProject(review.projects[1]!)).toEqual(['name']);
  });

  it('leaves what was not found blank instead of inventing it', () => {
    expect(review.experiences[1]?.company).toBe('');
    expect(review.experiences[0]?.location).toBe('');
    expect(review.personal.full_name).toBe('');
  });
});

describe('personal info merge', () => {
  const current: PersonalValues = { ...blankPersonal(), full_name: 'Ana Cruz', headline: 'Dev', github: 'https://github.com/ana' };

  it('fills only empty profile fields', () => {
    const imported = { ...blankPersonal(), phone: '+1 555 123 4567', location: 'Lisbon' };
    const plan = planPersonalMerge(current, imported);
    expect(plan.result.phone).toBe('+1 555 123 4567');
    expect(plan.result.location).toBe('Lisbon');
    expect(plan.changed.sort()).toEqual(['location', 'phone']);
    expect(plan.fields.find((f) => f.key === 'phone')?.status).toBe('fill');
  });

  it('keeps the current value by default when they differ', () => {
    const imported = { ...blankPersonal(), full_name: 'Ana M. Cruz', headline: 'Senior Dev' };
    const plan = planPersonalMerge(current, imported);
    expect(plan.result.full_name).toBe('Ana Cruz');
    expect(plan.result.headline).toBe('Dev');
    expect(plan.changed).toEqual([]);
    expect(plan.fields.find((f) => f.key === 'headline')?.status).toBe('conflict');
  });

  it('uses the imported value only when the user chooses it', () => {
    const imported = { ...blankPersonal(), headline: 'Senior Dev' };
    const plan = planPersonalMerge(current, imported, { headline: 'use' });
    expect(plan.result.headline).toBe('Senior Dev');
    expect(plan.changed).toEqual(['headline']);
  });

  it('never blanks a field when the resume had nothing', () => {
    const plan = planPersonalMerge(current, blankPersonal());
    expect(plan.result).toEqual(current);
    expect(plan.fields.find((f) => f.key === 'full_name')?.status).toBe('only-current');
    expect(plan.fields.find((f) => f.key === 'phone')?.status).toBe('missing');
  });

  it('treats the same link written differently as the same', () => {
    const imported = { ...blankPersonal(), github: 'github.com/ana/' };
    expect(planPersonalMerge(current, imported).fields.find((f) => f.key === 'github')?.status).toBe('same');
  });

  it('validates only what will be saved', () => {
    const imported = { ...blankPersonal(), website: 'not a url', headline: 'Senior Dev' };
    // website would fill an empty field: checked. headline conflicts and is kept: not checked.
    const plan = planPersonalMerge(current, { ...imported, headline: 'x'.repeat(500) });
    const errs = personalErrors(plan, { ...imported, headline: 'x'.repeat(500) });
    expect(errs.website).toBeTruthy();
    expect(errs.headline).toBeUndefined();
  });

  it('builds the profile input and keeps unrelated links', () => {
    const plan = planPersonalMerge(current, { ...blankPersonal(), linkedin: 'linkedin.com/in/ana' });
    const input = buildPersonalInput(plan, { github: 'https://github.com/ana', twitter: 'https://x.com/ana' });
    expect(input.links).toMatchObject({ github: 'https://github.com/ana', linkedin: 'https://linkedin.com/in/ana', twitter: 'https://x.com/ana' });
    expect(input.full_name).toBe('Ana Cruz');
    expect(input.phone).toBeNull();
  });

  it('reads the profile row into plain strings', () => {
    const v = personalFromProfile({
      full_name: ' Ana ', headline: null, email: null, phone: null, location: null, summary: null,
      links: { github: 'https://github.com/a' },
    });
    expect(v.full_name).toBe('Ana');
    expect(v.github).toBe('https://github.com/a');
    expect(v.headline).toBe('');
  });
});

describe('duplicate detection', () => {
  it('experience: same company + role + start month (any letter case or spacing)', () => {
    const existing = [experienceKey('Acme Inc', 'Web  Developer', '2021-03')];
    const items = [
      { company: 'acme inc', role: 'web developer', startMonth: '2021-03' },
      { company: 'Acme Inc', role: 'Web Developer', startMonth: '2022-01' }, // other start: new job
      { company: 'Other', role: 'Web Developer', startMonth: '2021-03' },
    ];
    const flags = findDuplicateFlags(items.map((x) => ({ key: experienceKey(x.company, x.role, x.startMonth), include: true })), existing);
    expect(flags).toEqual(['existing', null, null]);
  });

  it('education: school + degree', () => {
    const existing = [educationKey('MIT', 'BSc Computer Science')];
    const flags = findDuplicateFlags(
      [
        { key: educationKey(' mit ', 'bsc computer science'), include: true },
        { key: educationKey('MIT', 'MSc'), include: true },
        { key: educationKey('MIT', null), include: true },
      ],
      existing,
    );
    expect(flags).toEqual(['existing', null, null]);
  });

  it('project: same name', () => {
    expect(findDuplicateFlags([{ key: projectKey('My App'), include: true }], [projectKey('my  app')])).toEqual(['existing']);
  });

  it('flags a second identical item in the same import, but only if the first one is ticked', () => {
    const k = projectKey('App');
    expect(findDuplicateFlags([{ key: k, include: true }, { key: k, include: true }], [])).toEqual([null, 'batch']);
    expect(findDuplicateFlags([{ key: k, include: false }, { key: k, include: true }], [])).toEqual([null, null]);
  });

  it('items missing a required field are never flagged', () => {
    expect(findDuplicateFlags([{ key: null, include: false }], ['x'])).toEqual([null]);
  });

  it('an item that was already saved is not flagged again as existing', () => {
    const k = projectKey('App');
    expect(findDuplicateFlags([{ key: k, include: true, saved: true }], [k])).toEqual([null]);
  });

  it('works on review items', () => {
    const review = buildReview(normalizeDraft({
      experiences: [{ role: 'Dev', company: 'Acme', start_date: '2021-03', is_current: true }],
      education: [{ school: 'MIT', degree: 'BSc' }],
      projects: [{ name: 'App' }],
    }));
    const existing: ImportExisting = {
      ...emptyExisting(),
      experienceKeys: [experienceKey('Acme', 'Dev', '2021-03')],
      educationKeys: [educationKey('MIT', 'BSc')],
      projectKeys: [],
    };
    expect(experienceFlags(review.experiences, existing)).toEqual(['existing']);
    expect(educationFlags(review.education, existing)).toEqual(['existing']);
    expect(projectFlags(review.projects, existing)).toEqual([null]);
  });
});

describe('skill matching', () => {
  it('matches display name, canonical name and aliases, ignoring letter case', () => {
    const m = matchSkills(['javascript', 'VUEJS', 'Python', 'Rust'], bank);
    expect(m.matched.map((x) => x.skill.id)).toEqual(['js', 'vue', 'py']);
    expect(m.unmatched).toEqual(['Rust']);
  });

  it('counts two names for one skill once', () => {
    const m = matchSkills(['JS', 'JavaScript', 'ecmascript'], bank);
    expect(m.matched).toHaveLength(1);
    expect(m.unmatched).toEqual([]);
  });

  it('puts skills the user already has in a separate list', () => {
    const m = matchSkills(['Vue', 'Python'], bank, ['vue']);
    expect(m.owned.map((x) => x.skill.id)).toEqual(['vue']);
    expect(m.matched.map((x) => x.skill.id)).toEqual(['py']);
  });

  it('does not match on partial words', () => {
    expect(matchSkills(['Java'], bank).unmatched).toEqual(['Java']);
  });

  it('cleans and de-duplicates names', () => {
    expect(normalizeSkillNames([' Python ', 'python', '', 'Node  JS'])).toEqual(['Python', 'Node JS']);
  });

  it('only allows new skill names of 2 to 60 characters', () => {
    expect(canCreateSkill('R')).toBe(false);
    expect(canCreateSkill('Go')).toBe(true);
    expect(canCreateSkill('x'.repeat(61))).toBe(false);
  });
});

describe('validation uses the normal form rules', () => {
  it('experience: needs role, company and an end month unless current', () => {
    const r = buildReview(normalizeDraft({ experiences: [{ role: 'Dev', company: 'Acme', start_date: '2020-05' }] }));
    const x = r.experiences[0]!;
    expect(validateExperience(x).end).toMatch(/end month/);
    x.present = true;
    expect(hasErrors(validateExperience(x))).toBe(false);
    x.present = false; x.endMonth = '2019-01';
    expect(validateExperience(x).end).toMatch(/before the start/);
  });

  it('experience: a missing start date is allowed (left blank, never made up)', () => {
    const r = buildReview(normalizeDraft({ experiences: [{ role: 'Dev', company: 'Acme', end_date: '2021-01' }] }));
    expect(hasErrors(validateExperience(r.experiences[0]!))).toBe(false);
  });

  it('experience: limits bullet points', () => {
    const r = buildReview(normalizeDraft({ experiences: [{ role: 'Dev', company: 'Acme', is_current: true }] }));
    const x = r.experiences[0]!;
    x.bulletsText = Array.from({ length: 13 }, (_, i) => `b${i}`).join('\n');
    expect(validateExperience(x).bullets).toMatch(/12/);
  });

  it('education: needs a school and sensible years', () => {
    const r = buildReview(normalizeDraft({ education: [{ school: null, start_year: 2020, end_year: 2018 }] }));
    const x = r.education[0]!;
    expect(validateEducation(x).school).toMatch(/school/);
    expect(validateEducation(x).endYear).toMatch(/before/);
  });

  it('project: link must be a web address or empty', () => {
    const r = buildReview(normalizeDraft({ projects: [{ name: 'App', link: 'not a link' }] }));
    const x = r.projects[0]!;
    expect(validateProject(x).link).toBeTruthy();
    x.link = '';
    expect(hasErrors(validateProject(x))).toBe(false);
  });
});

describe('save plan', () => {
  const draft = normalizeDraft({
    personal: { full_name: 'Ana Cruz', phone: '+1 555 123 4567' },
    experiences: [
      { role: 'Dev', company: 'Acme', start_date: '2021-03', is_current: true, bullets: ['Built things'] },
      { role: 'Dev', company: 'Old Co', start_date: '2018-01', end_date: '2020-01' },
      { role: 'Intern', company: null },
    ],
    education: [{ school: 'MIT', degree: 'BSc' }],
    projects: [{ name: 'App', tech_stack: ['Vue', 'Vue', 'Node'], link: 'github.com/ana/app' }],
    skills: ['JavaScript', 'Python', 'Rust', 'Go'],
  });
  const profile = { full_name: null, headline: null, email: null, phone: null, location: null, summary: null, links: {} };

  function plan(review: ReviewState, existing: ImportExisting | null = emptyExisting()) {
    return buildSavePlan(review, { existing, bank, profile });
  }

  it('contains only ticked, valid, non-duplicate items', () => {
    const review = buildReview(draft);
    const p = plan(review, { ...emptyExisting(), experienceKeys: [experienceKey('Old Co', 'Dev', '2018-01')] });
    expect(p.experiences.map((x) => x.input.company)).toEqual(['Acme']); // Old Co is a duplicate, Intern is unticked
    expect(p.experiences[0]?.input).toMatchObject({ start_date: '2021-03-01', end_date: null, bullets: ['Built things'] });
    expect(p.education[0]?.input).toMatchObject({ school: 'MIT', degree: 'BSc', honors: null, start_year: null });
    expect(p.projects[0]?.input).toMatchObject({ tech_stack: ['Vue', 'Node'], link: 'https://github.com/ana/app' });
  });

  it('matched skills are added; unmatched only when ticked', () => {
    const review = buildReview(draft);
    expect(plan(review).skills.map((s) => s.id)).toEqual(['js', 'py']);
    expect(plan(review).customNames).toEqual([]);
    review.skills.customPicked = ['rust'];
    expect(plan(review).customNames).toEqual(['Rust']);
  });

  it('does not re-add skills the user already has', () => {
    const p = plan(buildReview(draft), { ...emptyExisting(), ownedSkillIds: ['js'] });
    expect(p.skills.map((s) => s.id)).toEqual(['py']);
  });

  it('skips unticked items and items already saved', () => {
    const review = buildReview(draft);
    review.experiences[0]!.include = false;
    review.projects[0]!.saved = true;
    const p = plan(review);
    expect(p.experiences.map((x) => x.input.company)).toEqual(['Old Co']);
    expect(p.projects).toEqual([]);
  });

  it('includes personal info only when something changes', () => {
    const review = buildReview(draft);
    expect(plan(review).personal).toMatchObject({ full_name: 'Ana Cruz', phone: '+1 555 123 4567' });
    const same = buildSavePlan(review, { existing: emptyExisting(), bank, profile: { ...profile, full_name: 'Ana Cruz', phone: '+1 555 123 4567' } });
    expect(same.personal).toBeNull();
  });

  it('reports errors only for what would be saved', () => {
    const review = buildReview(draft);
    const ctx = { existing: emptyExisting(), bank, profile };
    // "Old Co" has an end date so it is fine; break the Intern (unticked): no error expected
    review.experiences[2]!.bulletsText = Array.from({ length: 20 }, (_, i) => `b${i}`).join('\n');
    expect(reviewHasErrors(review, ctx)).toBe(false);
    review.experiences[2]!.include = true;
    review.experiences[2]!.company = 'Co';
    expect(reviewHasErrors(review, ctx)).toBe(true);
  });
});

describe('summary sentences', () => {
  it('counts and describes what is saved', () => {
    const c = { personal: false, experiences: 2, education: 1, projects: 0, skills: 8 };
    expect(describeCounts(c)).toBe('2 experiences, 1 education, 8 skills');
    expect(savedSummary(c)).toBe('Added 2 experiences, 1 education, 8 skills.');
  });

  it('uses singular words and mentions personal info', () => {
    const c = { personal: true, experiences: 1, education: 0, projects: 1, skills: 1 };
    expect(savedSummary(c)).toBe('Added 1 experience, 1 project, 1 skill. Personal info updated.');
    expect(describeCounts(c, true)).toBe('personal info, 1 experience, 1 project, 1 skill');
  });

  it('handles personal-only and empty results', () => {
    expect(savedSummary({ personal: true, experiences: 0, education: 0, projects: 0, skills: 0 })).toBe('Personal info updated.');
    expect(savedSummary({ personal: false, experiences: 0, education: 0, projects: 0, skills: 0 })).toBe('Nothing was added.');
  });

  it('counts the planned writes', () => {
    const review = buildReview(normalizeDraft({ education: [{ school: 'MIT' }], skills: ['Python', 'Go'] }));
    const p = buildSavePlan(review, { existing: emptyExisting(), bank, profile: null });
    review.skills.customPicked = ['Go'];
    const p2 = buildSavePlan(review, { existing: emptyExisting(), bank, profile: null });
    expect(totalOfCounts(countsOfPlan(p))).toBe(2);
    expect(totalOfCounts(countsOfPlan(p2))).toBe(3);
  });

  it('tells the truth about a partial save', () => {
    expect(partialMessage(4, 5)).toBe('Saved 4 of 5 items, 1 failed - try again.');
    expect(partialMessage(0, 1)).toBe('Saved 0 of 1 item, 1 failed - try again.');
  });
});

describe('skills without a level (imported from a resume)', () => {
  const noLevel: UserSkill = { skill_id: 'py', level: null, years: null, skill: bank[2]! };
  const expert: UserSkill = { skill_id: 'js', level: 5, years: 3, skill: bank[0]! };

  it('sorts skills with no level after those with a level', () => {
    expect(sortUserSkills([noLevel, expert]).map((s) => s.skill_id)).toEqual(['js', 'py']);
  });

  it('does not affect profile completeness (it counts skills, not levels)', () => {
    const c = computeCompleteness(null, { experiences: 0, education: 0, projects: 0, skills: 2 });
    expect(c.done).toBe(1);
  });
});
