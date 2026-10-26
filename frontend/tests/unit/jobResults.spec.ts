import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import HarvardResumePreview from '@/components/HarvardResumePreview.vue';
import CoverLetterPreview from '@/components/CoverLetterPreview.vue';
import JobMatchSummary from '@/components/JobMatchSummary.vue';
import { normalizeCoverLetter, normalizeMatch, normalizeTailoredResume } from '@/services/jobsLogic';

const resume = normalizeTailoredResume({
  header: { name: 'Ana Lee', email: 'ana@example.com', phone: '+49 123', location: 'Berlin', links: ['github.com/ana'] },
  education: [{ school: 'TU Berlin', location: 'Berlin', degree: 'BSc Computer Science', dates: '2018 - 2021', details: ['Thesis on search'] }],
  experience: [{ organization: 'Acme', location: 'Remote', title: 'Developer', dates: '2022 - Present', bullets: ['Built the billing API'] }],
  projects: [{ name: 'JobFit', role: 'Author', dates: '2026', bullets: ['Vue app'] }],
  skills: [{ category: 'Languages', items: ['Python', 'TypeScript'] }],
});

describe('HarvardResumePreview', () => {
  it('shows the name, contact line and sections in Harvard order', () => {
    const w = mount(HarvardResumePreview, { props: { resume } });
    expect(w.find('.hv-name').text()).toBe('Ana Lee');
    expect(w.find('.hv-contact').text()).toContain('Berlin');
    expect(w.find('.hv-contact').text()).toContain('ana@example.com');
    expect(w.findAll('.hv-h').map((h) => h.text())).toEqual(['Education', 'Experience', 'Projects', 'Skills']);
    expect(w.text()).toContain('Built the billing API');
    expect(w.text()).toContain('2022 - Present');
    expect(w.find('.hv-skill').text()).toBe('Languages: Python, TypeScript');
  });

  it('hides empty sections and shows a message when everything is empty', () => {
    const only = mount(HarvardResumePreview, { props: { resume: normalizeTailoredResume({ header: { name: 'Ana' }, skills: [{ items: ['Go'] }] }) } });
    expect(only.findAll('.hv-h').map((h) => h.text())).toEqual(['Skills']);
    expect(only.find('.hv-contact').exists()).toBe(false);
    const empty = mount(HarvardResumePreview, { props: { resume: normalizeTailoredResume(null) } });
    expect(empty.text()).toMatch(/came back empty/);
  });
});

describe('CoverLetterPreview', () => {
  it('shows greeting, paragraphs, closing and signature in order', () => {
    const letter = normalizeCoverLetter({
      company: 'Acme', greeting: 'Dear Hiring Manager,', paragraphs: ['First.', 'Second.'], closing: 'Sincerely,', signature: 'Ana Lee',
    });
    const w = mount(CoverLetterPreview, { props: { letter } });
    expect(w.findAll('p').map((p) => p.text())).toEqual(['Acme', 'Dear Hiring Manager,', 'First.', 'Second.', 'Sincerely,', 'Ana Lee']);
  });

  it('shows a message when the letter is empty', () => {
    const w = mount(CoverLetterPreview, { props: { letter: normalizeCoverLetter({}) } });
    expect(w.text()).toMatch(/came back empty/);
  });
});

describe('JobMatchSummary', () => {
  const stubs = { ProgressRing: { template: '<div class="ring-stub" />' }, IonIcon: true };

  it('shows the score, matched skills, gaps with the explanation, and warnings', () => {
    const w = mount(JobMatchSummary, {
      props: { match: normalizeMatch({ score: 80, matched: ['Python'], gaps: ['Kubernetes'] }), warnings: ['Check line 2.'] },
      global: { stubs },
    });
    expect(w.find('.ring-stub').exists()).toBe(true);
    expect(w.text()).toContain('Strong match');
    expect(w.text()).toContain('Python');
    expect(w.text()).toContain('Kubernetes');
    expect(w.text()).toContain('the AI did not add them');
    expect(w.text()).toContain('Please check these lines');
    expect(w.text()).toContain('Check line 2.');
  });

  it('hides the ring without a score and the warnings box without warnings', () => {
    const w = mount(JobMatchSummary, {
      props: { match: normalizeMatch({ matched: ['Python'] }), warnings: [] },
      global: { stubs },
    });
    expect(w.find('.ring-stub').exists()).toBe(false);
    expect(w.text()).toContain('No score');
    expect(w.text()).toContain('No gaps found');
    expect(w.text()).not.toContain('Please check these lines');
  });
});
