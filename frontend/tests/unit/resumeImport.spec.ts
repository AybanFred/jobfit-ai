import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The real supabase client needs env variables; the upload helper only needs the session token.
vi.mock('@/services/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } },
}));

import { apiUpload, ApiError } from '@/services/api';
import {
  validateResumeFile, friendlyImportError, isFriendlyDetail, uploadResume, MAX_RESUME_BYTES,
} from '@/services/resumeImport';
import { executePlan, type Writers } from '@/services/importSave';
import type { SavePlan } from '@/services/importLogic';

describe('validateResumeFile', () => {
  it('accepts pdf and docx in any letter case', () => {
    expect(validateResumeFile({ name: 'CV.PDF', size: 1000 })).toBe('');
    expect(validateResumeFile({ name: 'my resume.docx', size: 1000 })).toBe('');
  });

  it('rejects other types with a friendly message', () => {
    expect(validateResumeFile({ name: 'photo.png', size: 1000 })).toMatch(/PDF or a Word/);
    expect(validateResumeFile({ name: 'resume', size: 1000 })).toMatch(/PDF or a Word/);
    expect(validateResumeFile({ name: 'old.doc', size: 1000 })).toMatch(/\.doc/);
  });

  it('rejects empty and too large files (5 MB limit)', () => {
    expect(validateResumeFile({ name: 'a.pdf', size: 0 })).toMatch(/empty/);
    expect(validateResumeFile({ name: 'a.pdf', size: MAX_RESUME_BYTES })).toBe('');
    expect(validateResumeFile({ name: 'a.pdf', size: MAX_RESUME_BYTES + 1 })).toMatch(/too large/);
  });

  it('asks for a file when there is none', () => {
    expect(validateResumeFile(null)).toMatch(/choose/);
  });
});

describe('friendlyImportError', () => {
  it('explains 503 clearly (AI not set up)', () => {
    const e = friendlyImportError(new ApiError(503, 'Anthropic key missing in settings.py'));
    expect(e.message).toBe('Resume import is not set up yet on the server.');
  });

  it('shows a friendly backend detail', () => {
    const e = friendlyImportError(new ApiError(422, 'This PDF looks scanned. Please upload a text-based file.'));
    expect(e.message).toBe('This PDF looks scanned. Please upload a text-based file.');
    expect(e.canRetry).toBe(false);
  });

  it('never shows stack traces or raw JSON', () => {
    const trace = 'Traceback (most recent call last):\n  File "x.py", line 3';
    expect(friendlyImportError(new ApiError(502, trace)).message).not.toMatch(/Traceback/);
    expect(friendlyImportError(new ApiError(400, '{"error": 1}')).message).not.toMatch(/\{/);
    expect(isFriendlyDetail('')).toBe(false);
    expect(isFriendlyDetail('x'.repeat(400))).toBe(false);
  });

  it('has a fallback for every status in the contract', () => {
    for (const s of [400, 401, 413, 415, 422, 429, 502, 503, 500]) {
      expect(friendlyImportError(new ApiError(s, '')).message.length).toBeGreaterThan(10);
    }
    expect(friendlyImportError(new ApiError(429, '')).canRetry).toBe(true);
    expect(friendlyImportError(new ApiError(401, '')).canRetry).toBe(false);
  });

  it('handles network failures', () => {
    const e = friendlyImportError(new TypeError('Failed to fetch'));
    expect(e.message).toMatch(/internet connection/);
    expect(e.canRetry).toBe(true);
  });
});

describe('apiUpload (mocked fetch)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends multipart form data with the token and WITHOUT a Content-Type header', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ skills: ['Go'] }) });
    const controller = new AbortController();
    const form = new FormData();
    form.append('file', new File(['x'], 'cv.pdf', { type: 'application/pdf' }));

    const res = await apiUpload<{ skills: string[] }>('/profile/import-resume', form, controller.signal);

    expect(res.skills).toEqual(['Go']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/profile/import-resume')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form);
    expect(init.signal).toBe(controller.signal);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('content-type');
  });

  it('throws an ApiError with the status and the backend detail', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 413, json: async () => ({ detail: 'File is too big.' }) });
    const err = await apiUpload('/x', new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.detail).toBe('File is too big.');
  });

  it('copes with an error body that is not JSON', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('bad json'); } });
    const err = await apiUpload('/x', new FormData()).catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.detail).toBe('');
  });

  it('uploadResume sends the file in a field called "file" and cleans the answer', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ personal: { full_name: ' Ana ' }, skills: ['Go', 7] }) });
    const draft = await uploadResume(new File(['x'], 'cv.docx'));
    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect((form.get('file') as File).name).toBe('cv.docx');
    expect(draft.personal.full_name).toBe('Ana');
    expect(draft.skills).toEqual(['Go']);
    expect(draft.experiences).toEqual([]);
  });
});

describe('executePlan (fake writers)', () => {
  const skill = (id: string, name: string) => ({ id, canonical_name: name.toLowerCase(), display_name: name, aliases: [], category: null });
  const plan: SavePlan = {
    personal: { full_name: 'Ana', headline: null, phone: null, location: null, summary: null, links: {} },
    experiences: [
      { key: 0, input: { role: 'Dev', company: 'A', location: null, start_date: null, end_date: null, bullets: [] } },
      { key: 2, input: { role: 'Dev', company: 'B', location: null, start_date: null, end_date: null, bullets: [] } },
    ],
    education: [{ key: 0, input: { school: 'MIT', degree: null, honors: null, start_year: null, end_year: null } }],
    projects: [
      { key: 0, input: { name: 'P0', description: null, tech_stack: [], link: null } },
      { key: 1, input: { name: 'P1', description: null, tech_stack: [], link: null } },
    ],
    skills: [skill('py', 'Python'), skill('js', 'JavaScript')],
    customNames: ['Rust'],
  };

  function writers(overrides: Partial<Writers> = {}): Writers & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      personal: async () => { calls.push('personal'); },
      experience: async (i) => { calls.push(`exp:${i.company}`); },
      education: async (i) => { calls.push(`edu:${i.school}`); },
      project: async (i) => { calls.push(`proj:${i.name}`); },
      addSkill: async (id) => { calls.push(`skill:${id}`); },
      createSkill: async (n) => skill('rust', n),
      ...overrides,
    };
  }

  it('saves everything and counts it', async () => {
    const w = writers();
    const out = await executePlan(plan, w);
    expect(out).toMatchObject({ total: 9, saved: 9, failed: 0 });
    expect(out.counts).toEqual({ personal: true, experiences: 2, education: 1, projects: 2, skills: 3 });
    expect(w.calls).toContain('skill:rust');
  });

  it('adds skills with no level or years (the writer only receives the id)', async () => {
    const w = writers();
    await executePlan(plan, w);
    expect(w.calls.filter((c) => c.startsWith('skill:'))).toEqual(['skill:py', 'skill:js', 'skill:rust']);
  });

  it('writes projects last-to-first so the first one ends up on top', async () => {
    const w = writers();
    await executePlan(plan, w);
    expect(w.calls.filter((c) => c.startsWith('proj:'))).toEqual(['proj:P1', 'proj:P0']);
  });

  it('keeps going after a failure and reports exactly what worked', async () => {
    const w = writers({
      experience: async (i) => { if (i.company === 'B') throw new Error('boom'); },
      addSkill: async (id) => { if (id === 'js') throw new Error('boom'); },
    });
    const out = await executePlan(plan, w);
    expect(out).toMatchObject({ total: 9, saved: 7, failed: 2 });
    expect(out.experienceKeys).toEqual([0]); // only the saved one, so retry will not duplicate it
    expect(out.skillsAdded.map((s) => s.id).sort()).toEqual(['py', 'rust']);
    expect(out.counts.experiences).toBe(1);
  });

  it('does not count a custom skill the user already owns', async () => {
    const w = writers();
    const out = await executePlan(plan, w, ['rust']);
    expect(out.failed).toBe(0);
    expect(out.counts.skills).toBe(2);
    expect(w.calls).not.toContain('skill:rust');
  });

  it('does nothing for an empty plan', async () => {
    const out = await executePlan({ personal: null, experiences: [], education: [], projects: [], skills: [], customNames: [] }, writers());
    expect(out).toMatchObject({ total: 0, saved: 0, failed: 0 });
  });
});
