import { describe, it, expect, vi } from 'vitest';

// jobsLogic is pure, but it imports a helper from resumeImport, which pulls in the Supabase client.
vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import {
  DEFAULT_TEMPLATE, MAX_JOB_CHARS, MAX_URL_CHARS, MIN_JOB_CHARS, TAILOR_STATUS_LINES, TEMPLATES, TIMEOUT_MESSAGE,
  buildTailorRequest, charCountLabel, cleanJobUrl, contactParts, defaultResumeTab, firstFormProblem, formatFileSize,
  formatJobDate, friendlyJobError, hasFormErrors, isTemplateId, jobCompany, jobFacts, jobTitle, letterIsEmpty,
  matchSentence, normalizeCoverLetter, normalizeJob, normalizeJobList, normalizeParsedJob, normalizeResume,
  normalizeResumeList, normalizeScore, normalizeTailorOut, normalizeTailoredResume, pickResumeId, readApiError,
  resumeIsEmpty, resumeLabel, scoreLabel, statusLineAt, templateHint, validateJobText, validateJobUrl,
  validateTailorForm, type TailorForm,
} from '@/services/jobsLogic';

const TEXT = 'We are hiring a senior developer to build our web platform with Python and Vue.';

describe('validateJobText', () => {
  it('asks for text when empty or only spaces', () => {
    expect(validateJobText('')).toMatch(/paste/i);
    expect(validateJobText('     ')).toMatch(/paste/i);
  });

  it('rejects text under the minimum, counting trimmed characters', () => {
    expect(validateJobText('a'.repeat(MIN_JOB_CHARS - 1))).toMatch(/at least 50/);
    expect(validateJobText(`  ${'a'.repeat(MIN_JOB_CHARS - 1)}  `)).toMatch(/at least 50/);
  });

  it('accepts the minimum and the maximum, rejects above the maximum', () => {
    expect(validateJobText('a'.repeat(MIN_JOB_CHARS))).toBe('');
    expect(validateJobText('a'.repeat(MAX_JOB_CHARS))).toBe('');
    expect(validateJobText('a'.repeat(MAX_JOB_CHARS + 1))).toMatch(/too long/);
  });
});

describe('charCountLabel', () => {
  it('shows the count against the limit', () => {
    expect(charCountLabel('')).toBe('0 / 15,000');
    expect(charCountLabel('a'.repeat(1234))).toBe('1,234 / 15,000');
  });
});

describe('job post link', () => {
  it('is optional', () => {
    expect(validateJobUrl('')).toBe('');
    expect(validateJobUrl('   ')).toBe('');
    expect(cleanJobUrl('  ')).toBeNull();
  });

  it('accepts http and https links and trims them', () => {
    expect(validateJobUrl('https://jobs.example.com/123')).toBe('');
    expect(validateJobUrl('  http://example.com/a?b=c  ')).toBe('');
    expect(cleanJobUrl('  https://example.com/x ')).toBe('https://example.com/x');
  });

  it('writes the scheme in lower case so the server pattern accepts it', () => {
    expect(cleanJobUrl('HTTPS://Example.com/Job')).toBe('https://Example.com/Job');
    expect(validateJobUrl('HTTPS://example.com/job')).toBe('');
  });

  it('rejects other schemes, missing schemes and spaces', () => {
    for (const bad of ['example.com/job', 'ftp://example.com', 'javascript:alert(1)', 'https://', 'https://exa mple.com']) {
      expect(validateJobUrl(bad)).toMatch(/http/);
    }
  });

  it('limits the length to 500 characters', () => {
    const base = 'https://example.com/';
    expect(validateJobUrl(base + 'a'.repeat(MAX_URL_CHARS - base.length))).toBe('');
    expect(validateJobUrl(base + 'a'.repeat(MAX_URL_CHARS - base.length + 1))).toMatch(/too long/);
  });
});

describe('templates', () => {
  it('offers Harvard as the default and knows its ids', () => {
    expect(DEFAULT_TEMPLATE).toBe('harvard');
    expect(TEMPLATES.map((t) => t.id)).toContain('harvard');
    expect(isTemplateId('harvard')).toBe(true);
    expect(isTemplateId('fancy')).toBe(false);
    expect(templateHint('harvard')).toMatch(/one-column/);
    expect(templateHint('nope')).toBe('');
  });
});

describe('tailor form', () => {
  const ok: TailorForm = {
    jobUrl: '', jobTitle: 'Backend Engineer', company: 'Globex Inc',
    text: TEXT, tab: 'saved', resumeId: 'r1', template: 'harvard', modelId: 'groq:x',
  };

  it('accepts a complete form', () => {
    const e = validateTailorForm(ok);
    expect(hasFormErrors(e)).toBe(false);
    expect(firstFormProblem(e)).toBe('');
  });

  it('needs a resume on the Upload and Saved tabs, but not for Master Profile', () => {
    expect(validateTailorForm({ ...ok, tab: 'upload', resumeId: null }).resume).toMatch(/upload/);
    expect(validateTailorForm({ ...ok, tab: 'saved', resumeId: null }).resume).toMatch(/saved resumes/);
    expect(hasFormErrors(validateTailorForm({ ...ok, tab: 'profile', resumeId: null }))).toBe(false);
  });

  it('needs a model, a known template, valid text and a valid link', () => {
    expect(validateTailorForm({ ...ok, modelId: null }).model).toMatch(/AI model/);
    expect(validateTailorForm({ ...ok, template: 'other' }).template).toMatch(/template/);
    expect(validateTailorForm({ ...ok, text: 'short' }).text).toMatch(/short/);
    expect(validateTailorForm({ ...ok, jobUrl: 'not a link' }).url).toMatch(/http/);
  });

  it('needs a job title and a company of at most 200 characters', () => {
    expect(validateTailorForm({ ...ok, jobTitle: '   ' }).title).toMatch(/job title/);
    expect(validateTailorForm({ ...ok, company: '' }).company).toMatch(/company/);
    expect(validateTailorForm({ ...ok, jobTitle: 'x'.repeat(201) }).title).toMatch(/too long/);
    expect(validateTailorForm({ ...ok, company: 'x'.repeat(200) }).company).toBe('');
    expect(hasFormErrors(validateTailorForm({ ...ok, company: '' }))).toBe(true);
  });

  it('reports the first problem in the order of the form', () => {
    const e = validateTailorForm({ ...ok, text: '', jobUrl: 'bad', jobTitle: '', modelId: null });
    expect(firstFormProblem(e)).toMatch(/http/);
    expect(firstFormProblem(validateTailorForm({ ...ok, text: '', jobTitle: '', modelId: null }))).toMatch(/job title/);
    expect(firstFormProblem(validateTailorForm({ ...ok, text: '', company: '' }))).toMatch(/company/);
    expect(firstFormProblem(validateTailorForm({ ...ok, text: '', modelId: null }))).toMatch(/paste the job description/);
  });

  it('builds the request for a saved or uploaded resume', () => {
    expect(buildTailorRequest({
      ...ok, text: `  ${TEXT}  `, jobUrl: ' HTTPS://example.com/j ', jobTitle: ' Backend Engineer ', company: ' Globex Inc ',
    })).toEqual({
      job_text: TEXT,
      source_url: 'https://example.com/j',
      job_title: 'Backend Engineer',
      company: 'Globex Inc',
      source: 'resume',
      resume_id: 'r1',
      template: 'harvard',
      model_id: 'groq:x',
    });
    expect(buildTailorRequest({ ...ok, tab: 'upload', resumeId: 'up1' })).toMatchObject({ source: 'resume', resume_id: 'up1' });
  });

  it('builds the request for the Master Profile without a resume id and with a null link when empty', () => {
    expect(buildTailorRequest({ ...ok, tab: 'profile', resumeId: 'r1' })).toMatchObject({
      source: 'profile', resume_id: null, source_url: null,
    });
  });
});

describe('saved resumes', () => {
  it('cleans one resume and rejects rows without an id', () => {
    expect(normalizeResume({ id: 7, file_name: ' cv.pdf ', size_bytes: '2048', created_at: '2026-01-01T00:00:00Z' }))
      .toEqual({ id: '7', file_name: 'cv.pdf', size_bytes: 2048, created_at: '2026-01-01T00:00:00Z' });
    expect(normalizeResume({ file_name: 'x.pdf' })).toBeNull();
    expect(normalizeResume(null)).toBeNull();
    expect(normalizeResume({ id: 'a', size_bytes: -5 })).toMatchObject({ file_name: '', size_bytes: 0, created_at: '' });
  });

  it('sorts newest first, keeps rows without a date last, and survives garbage', () => {
    const list = normalizeResumeList([
      { id: 'old', created_at: '2026-01-01T00:00:00Z' },
      { id: 'nodate' },
      { id: 'new', created_at: '2026-05-01T00:00:00Z' },
      { nope: true },
    ]);
    expect(list.map((r) => r.id)).toEqual(['new', 'old', 'nodate']);
    expect(normalizeResumeList({ not: 'a list' })).toEqual([]);
  });

  it('keeps the current choice when it still exists, else picks the newest', () => {
    const list = normalizeResumeList([{ id: 'a', created_at: '2026-05-01' }, { id: 'b', created_at: '2026-01-01' }]);
    expect(pickResumeId(list, 'b')).toBe('b');
    expect(pickResumeId(list, 'gone')).toBe('a');
    expect(pickResumeId(list, null)).toBe('a');
    expect(pickResumeId([], 'a')).toBeNull();
  });

  it('starts on Saved when there are saved resumes, else on Upload', () => {
    expect(defaultResumeTab([])).toBe('upload');
    expect(defaultResumeTab(normalizeResumeList([{ id: 'a' }]))).toBe('saved');
  });

  it('labels a resume with its name and date, and formats sizes', () => {
    expect(resumeLabel({ id: 'a', file_name: 'cv.pdf', size_bytes: 1, created_at: '2026-03-12T10:00:00Z' })).toBe('cv.pdf - 12 Mar 2026');
    expect(resumeLabel({ id: 'a', file_name: '', size_bytes: 1, created_at: '' })).toBe('Resume');
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(300)).toBe('1 KB');
    expect(formatFileSize(240 * 1024)).toBe('240 KB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('normalizeTailorOut', () => {
  const full = {
    application_id: 'app1',
    job: { id: 'j1', title: 'Dev', company: 'Acme', raw_text: TEXT, created_at: '2026-03-12T10:00:00Z', parsed: null },
    template: 'harvard',
    model: 'groq:llama',
    resume: {
      header: { name: ' Ana Lee ', email: 'ana@example.com', phone: null, location: 'Berlin', links: ['github.com/ana', ''] },
      summary: null,
      education: [{ school: 'TU Berlin', location: 'Berlin', degree: 'BSc', dates: null, details: ['GPA 1.3'] }, { school: '' }],
      experience: [{ organization: 'Acme', location: null, title: 'Developer', dates: '2022 - Present', bullets: ['Built X', 'Built X', 7] }],
      projects: [{ name: 'App', role: null, dates: null, bullets: [] }, 'junk'],
      skills: [{ category: 'Languages', items: ['Python', 'Go'] }, { category: 'Empty', items: [] }],
    },
    cover_letter: {
      recipient: null, company: 'Acme', greeting: 'Dear Hiring Manager,', paragraphs: ['One.', '', 'Two.'],
      closing: 'Sincerely,', signature: 'Ana Lee',
    },
    match: { score: 72.4, matched: ['Python'], gaps: ['Kubernetes'] },
    warnings: ['Check the date in line 2.'],
  };

  it('returns null only when the answer is not an object', () => {
    expect(normalizeTailorOut(null)).toBeNull();
    expect(normalizeTailorOut('x')).toBeNull();
    expect(normalizeTailorOut([])).toBeNull();
    expect(normalizeTailorOut({})).not.toBeNull();
  });

  it('cleans a full answer: trims, drops blanks, duplicates and empty entries', () => {
    const r = normalizeTailorOut(full)!;
    expect(r.application_id).toBe('app1');
    expect(r.job?.id).toBe('j1');
    expect(r.resume.header).toEqual({ name: 'Ana Lee', email: 'ana@example.com', phone: '', location: 'Berlin', links: ['github.com/ana'] });
    expect(r.resume.summary).toBe('');
    expect(r.resume.education).toHaveLength(1);
    expect(r.resume.education[0].dates).toBe('');
    expect(r.resume.experience[0].bullets).toEqual(['Built X']);
    expect(r.resume.projects).toEqual([{ name: 'App', role: '', dates: '', bullets: [] }]);
    expect(r.resume.skills).toEqual([{ category: 'Languages', items: ['Python', 'Go'] }]);
    expect(r.cover_letter).toEqual({
      recipient: '', company: 'Acme', greeting: 'Dear Hiring Manager,', paragraphs: ['One.', 'Two.'],
      closing: 'Sincerely,', signature: 'Ana Lee',
    });
    expect(r.match).toEqual({ score: 72, matched: ['Python'], gaps: ['Kubernetes'] });
    expect(r.warnings).toEqual(['Check the date in line 2.']);
  });

  it('turns a missing everything into empty values that the screens can show', () => {
    const r = normalizeTailorOut({ resume: 5, cover_letter: null, match: 'x', warnings: 'no' })!;
    expect(r.application_id).toBe('');
    expect(r.job).toBeNull();
    expect(r.template).toBe('harvard');
    expect(resumeIsEmpty(r.resume)).toBe(true);
    expect(letterIsEmpty(r.cover_letter)).toBe(true);
    expect(r.match).toEqual({ score: null, matched: [], gaps: [] });
    expect(r.warnings).toEqual([]);
  });

  it('keeps a resume that only has a header name', () => {
    expect(resumeIsEmpty(normalizeTailoredResume({ header: { name: 'Ana' } }))).toBe(false);
    expect(letterIsEmpty(normalizeCoverLetter({ paragraphs: ['Hi'] }))).toBe(false);
  });

  it('builds the contact line in a fixed order and skips blanks', () => {
    const h = normalizeTailoredResume(full.resume).header;
    expect(contactParts(h)).toEqual(['Berlin', 'ana@example.com', 'github.com/ana']);
  });
});

describe('score', () => {
  it('normalizes scores to whole numbers from 0 to 100', () => {
    expect(normalizeScore(88)).toBe(88);
    expect(normalizeScore(0.82)).toBe(82);
    expect(normalizeScore('64')).toBe(64);
    expect(normalizeScore(140)).toBe(100);
    expect(normalizeScore(-3)).toBe(0);
    expect(normalizeScore(0)).toBe(0);
    for (const bad of [null, undefined, 'abc', '', NaN, Infinity, {}]) expect(normalizeScore(bad)).toBeNull();
  });

  it('labels the score', () => {
    expect(scoreLabel(null)).toBe('No score');
    expect(scoreLabel(90)).toBe('Strong match');
    expect(scoreLabel(60)).toBe('Good match');
    expect(scoreLabel(30)).toBe('Fair match');
    expect(scoreLabel(10)).toBe('Low match');
  });

  it('explains how many skills match', () => {
    expect(matchSentence({ score: 50, matched: ['A'], gaps: ['B'] })).toBe('Your resume shows 1 of the 2 skills this job asks for.');
    expect(matchSentence({ score: 100, matched: ['A'], gaps: [] })).toBe('Your resume shows every skill this job asks for.');
    expect(matchSentence({ score: 0, matched: [], gaps: ['B'] })).toBe('Your resume shows 0 of the 1 skill this job asks for.');
    expect(matchSentence({ score: null, matched: [], gaps: [] })).toMatch(/could not find skills/);
  });
});

describe('statusLineAt', () => {
  it('rotates the status lines every 5 seconds', () => {
    expect(statusLineAt(0)).toBe(TAILOR_STATUS_LINES[0]);
    expect(statusLineAt(4999)).toBe(TAILOR_STATUS_LINES[0]);
    expect(statusLineAt(5000)).toBe(TAILOR_STATUS_LINES[1]);
    expect(statusLineAt(10000)).toBe(TAILOR_STATUS_LINES[2]);
    expect(statusLineAt(15000)).toBe(TAILOR_STATUS_LINES[0]);
    expect(statusLineAt(-100)).toBe(TAILOR_STATUS_LINES[0]);
  });
});

describe('normalizeParsedJob', () => {
  it('survives garbage', () => {
    for (const bad of [null, undefined, 5, 'x', []]) {
      const p = normalizeParsedJob(bad);
      expect(p.title).toBeNull();
      expect(p.required_skills).toEqual([]);
      expect(p.responsibilities).toEqual([]);
    }
  });

  it('trims, drops blanks and non-strings, and removes duplicate list items', () => {
    const p = normalizeParsedJob({
      title: '  Nurse ',
      company: '',
      location: 5,
      required_skills: ['Python', ' python ', '', 3, 'SQL'],
      nice_to_have_skills: 'nope',
      responsibilities: ['Care for patients'],
    });
    expect(p.title).toBe('Nurse');
    expect(p.company).toBeNull();
    expect(p.location).toBeNull();
    expect(p.required_skills).toEqual(['Python', 'SQL']);
    expect(p.nice_to_have_skills).toEqual([]);
    expect(p.responsibilities).toEqual(['Care for patients']);
  });
});

describe('normalizeJob and normalizeJobList', () => {
  it('keeps a good job and cleans its parsed part', () => {
    const j = normalizeJob({
      id: 'j1', title: 'Dev', company: 'Acme', source_url: null, raw_text: 'text',
      created_at: '2026-03-12T10:00:00Z', parsed: { title: 'Dev', required_skills: ['Go'] },
    });
    expect(j?.id).toBe('j1');
    expect(j?.parsed?.required_skills).toEqual(['Go']);
    expect(j?.source_url).toBeNull();
  });

  it('allows a job without parsed data and with a null title or company', () => {
    const j = normalizeJob({ id: 'j2', title: null, company: null, parsed: null });
    expect(j?.parsed).toBeNull();
    expect(jobTitle(j!)).toBe('Untitled job');
    expect(jobCompany(j!)).toBe('Company not set');
  });

  it('rejects things without an id and tolerates a non-array list', () => {
    expect(normalizeJob({ title: 'x' })).toBeNull();
    expect(normalizeJob(null)).toBeNull();
    expect(normalizeJobList({ not: 'a list' })).toEqual([]);
    expect(normalizeJobList([{ id: 'a' }, { title: 'no id' }, { id: 'b' }]).map((j) => j.id)).toEqual(['a', 'b']);
  });
});

describe('display helpers', () => {
  it('never shows a blank title or company', () => {
    expect(jobTitle({ title: '  ' })).toBe('Untitled job');
    expect(jobCompany({ company: '' })).toBe('Company not set');
    expect(jobTitle({ title: 'Dev' })).toBe('Dev');
  });

  it('formats dates and survives bad ones', () => {
    expect(formatJobDate('2026-03-12T10:00:00Z')).toMatch(/12 Mar 2026/);
    expect(formatJobDate('')).toBe('');
    expect(formatJobDate('not a date')).toBe('');
  });

  it('lists the facts that exist', () => {
    expect(jobFacts(null)).toEqual([]);
    expect(jobFacts(normalizeParsedJob({ location: 'Berlin', employment_type: 'Full-time' }))).toEqual(['Berlin', 'Full-time']);
  });
});

describe('readApiError', () => {
  it('reads status and a friendly detail from api() errors', () => {
    expect(readApiError(new Error('API 422: {"detail":"Job text is too short."}'))).toEqual({ status: 422, detail: 'Job text is too short.' });
  });

  it('reads status and detail from apiUpload() errors (ApiError)', () => {
    const e = Object.assign(new Error('API 413'), { name: 'ApiError', status: 413, detail: 'That file is over 5 MB.' });
    expect(readApiError(e)).toEqual({ status: 413, detail: 'That file is over 5 MB.' });
    const ugly = Object.assign(new Error('API 500'), { name: 'ApiError', status: 500, detail: 'Traceback (most recent call last)' });
    expect(readApiError(ugly)).toEqual({ status: 500, detail: '' });
  });

  it('drops details that are not plain sentences', () => {
    expect(readApiError(new Error('API 500: {"detail":"Traceback (most recent call last)"}'))?.detail).toBe('');
    expect(readApiError(new Error('API 422: {"detail":[{"msg":"x"}]}'))?.detail).toBe('');
    expect(readApiError(new Error('API 500: <html>oops</html>'))).toEqual({ status: 500, detail: '' });
  });

  it('returns null for other errors', () => {
    expect(readApiError(new Error('boom'))).toBeNull();
    expect(readApiError(null)).toBeNull();
  });
});

describe('friendlyJobError', () => {
  const api = (s: number, body = '') => new Error(`API ${s}: ${body}`);
  const upload = (status: number, detail = '') => Object.assign(new Error(`API ${status}`), { name: 'ApiError', status, detail });

  it('explains session problems without retry', () => {
    expect(friendlyJobError(api(401), 'resumes')).toEqual({ message: 'Your session has ended. Please log in again.', canRetry: false });
  });

  it('uses the backend sentence for 422 when it is friendly, else a generic one', () => {
    expect(friendlyJobError(api(422, '{"detail":"That does not look like a job post."}'), 'tailor').message).toBe('That does not look like a job post.');
    expect(friendlyJobError(api(422, '{"detail":[{"msg":"x"}]}'), 'tailor').message).toMatch(/not valid/);
  });

  it('says the AI is not set up on 503 and allows retry on 429/502/504', () => {
    expect(friendlyJobError(api(503), 'tailor').message).toMatch(/AI writer is not set up/);
    expect(friendlyJobError(api(503, '{"detail":"Groq is not set up on the server."}'), 'tailor').message).toBe('Groq is not set up on the server.');
    expect(friendlyJobError(api(429), 'tailor').canRetry).toBe(true);
    expect(friendlyJobError(api(502), 'tailor').canRetry).toBe(true);
    expect(friendlyJobError(api(504), 'tailor')).toEqual({ message: TIMEOUT_MESSAGE, canRetry: true });
  });

  it('explains a missing resume when tailoring', () => {
    expect(friendlyJobError(api(404), 'tailor').message).toMatch(/could not find that resume/);
  });

  it('handles upload problems: size, type, unreadable file, not set up', () => {
    expect(friendlyJobError(upload(413), 'upload').message).toMatch(/5 MB/);
    expect(friendlyJobError(upload(415), 'upload').message).toMatch(/PDF or a Word/);
    expect(friendlyJobError(upload(422), 'upload').message).toMatch(/could not read text/);
    expect(friendlyJobError(upload(422, 'This PDF looks scanned.'), 'upload').message).toBe('This PDF looks scanned.');
    expect(friendlyJobError(upload(503), 'upload').message).toMatch(/Saving resumes is not set up/);
  });

  it('says a list is not available yet when its endpoint is missing', () => {
    expect(friendlyJobError(api(404), 'resumes').message).toMatch(/not available on the server yet/);
  });

  it('handles 5xx, offline and unknown errors without leaking raw text', () => {
    expect(friendlyJobError(api(500, 'secret stack'), 'tailor').message).not.toMatch(/secret/);
    expect(friendlyJobError(new TypeError('Failed to fetch'), 'upload').message).toMatch(/internet connection/);
    expect(friendlyJobError(new Error('weird'), 'resumes').message).toBe('We could not load your saved resumes. Please try again.');
  });
});
