import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// The store talks to the backend only through these modules, so we replace them.
vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('@/services/resumes', () => ({ listResumes: vi.fn(), uploadResumeFile: vi.fn() }));
vi.mock('@/services/tailor', () => ({ tailorJob: vi.fn() }));
vi.mock('@/services/haptics', () => ({ tapHaptic: vi.fn() }));

import * as resumesSvc from '@/services/resumes';
import * as tailorSvc from '@/services/tailor';
import { ApiError } from '@/services/api';
import { useJobsStore } from '@/stores/jobs';
import {
  TAILOR_TIMEOUT_MS, TIMEOUT_MESSAGE, normalizeTailorOut, type SavedResume, type TailorResult,
} from '@/services/jobsLogic';

const resumes = vi.mocked(resumesSvc);
const tailor = vi.mocked(tailorSvc);

const TEXT = 'We are hiring a senior developer to build our web platform with Python and Vue.';
const resume = (id: string, created_at = '2026-03-12T10:00:00Z'): SavedResume => ({
  id, file_name: `${id}.pdf`, size_bytes: 1000, created_at,
});
const result = (jobId = 'new'): TailorResult => normalizeTailorOut({
  application_id: 'app1',
  job: { id: jobId, title: 'Lead Dev', company: 'Acme', raw_text: TEXT, created_at: '2026-03-12T10:00:00Z' },
  template: 'harvard',
  resume: { header: { name: 'Ana' } },
  cover_letter: { greeting: 'Dear team,', paragraphs: ['Hello.'] },
  match: { score: 80, matched: ['Python'], gaps: ['Go'] },
  warnings: [],
})!;
const pdf = (name = 'cv.pdf') => new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

/** A request that never answers by itself; it fails like fetch does when its signal is aborted. */
function hangUntilAbort<T>() {
  return (_arg: unknown, signal?: AbortSignal) => new Promise<T>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()));
  });
}

/** A store with a complete form: title, company, text, a saved resume chosen, and a model. */
async function readyStore() {
  resumes.listResumes.mockResolvedValue([resume('r1')]);
  const s = useJobsStore();
  await s.loadResumes();
  s.setJobTitle('Backend Engineer');
  s.setCompany('Globex Inc');
  s.setText(TEXT);
  s.setModel('groq:x');
  return s;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('jobs store: saved resumes', () => {
  it('preselects the newest resume and starts on the Saved tab', async () => {
    resumes.listResumes.mockResolvedValue([resume('new', '2026-05-01T00:00:00Z'), resume('old', '2026-01-01T00:00:00Z')]);
    const s = useJobsStore();
    const p = s.loadResumes();
    expect(s.resumesStatus).toBe('loading');
    await p;
    expect(s.resumesStatus).toBe('ready');
    expect(s.resumeId).toBe('new');
    expect(s.resumeTab).toBe('saved');
  });

  it('starts on the Upload tab when there are no saved resumes', async () => {
    resumes.listResumes.mockResolvedValue([]);
    const s = useJobsStore();
    await s.loadResumes();
    expect(s.resumeTab).toBe('upload');
    expect(s.resumeId).toBeNull();
  });

  it('does not switch the tab after the user chose one, and keeps a still-existing choice', async () => {
    resumes.listResumes.mockResolvedValue([resume('a'), resume('b', '2026-01-01T00:00:00Z')]);
    const s = useJobsStore();
    s.setTab('profile');
    await s.loadResumes();
    expect(s.resumeTab).toBe('profile');
    s.setResume('b');
    await s.loadResumes();
    expect(s.resumeId).toBe('b');
  });

  it('shows an error state when the first load fails, and recovers on retry', async () => {
    resumes.listResumes.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const s = useJobsStore();
    await s.loadResumes();
    expect(s.resumesStatus).toBe('error');
    expect(s.resumesError).toMatch(/internet connection/);
    resumes.listResumes.mockResolvedValue([resume('a')]);
    await s.loadResumes();
    expect(s.resumesStatus).toBe('ready');
    expect(s.resumesError).toBe('');
  });

  it('keeps the visible list when a refresh fails', async () => {
    const s = await readyStore();
    resumes.listResumes.mockRejectedValueOnce(new Error('API 500: x'));
    await s.loadResumes();
    expect(s.resumesStatus).toBe('ready');
    expect(s.resumes).toHaveLength(1);
  });
});

describe('jobs store: upload', () => {
  it('rejects a wrong file before sending anything', async () => {
    const s = useJobsStore();
    expect(await s.uploadResume(new File(['x'], 'photo.png'))).toBe(false);
    expect(s.uploadError).toMatch(/PDF or a Word/);
    expect(resumes.uploadResumeFile).not.toHaveBeenCalled();
  });

  it('uploads, adds the file to the saved list and uses it on the Upload tab', async () => {
    const s = await readyStore();
    s.setTab('upload');
    expect(s.effectiveResumeId).toBeNull();
    expect(s.canGo).toBe(false);
    resumes.uploadResumeFile.mockResolvedValue(resume('up1', '2026-06-01T00:00:00Z'));
    const p = s.uploadResume(pdf());
    expect(s.uploading).toBe(true);
    expect(s.uploadingName).toBe('cv.pdf');
    expect(await p).toBe(true);
    expect(s.uploading).toBe(false);
    expect(s.uploaded?.id).toBe('up1');
    expect(s.resumes.map((r) => r.id)).toEqual(['up1', 'r1']);
    expect(s.resumeId).toBe('up1');
    expect(s.effectiveResumeId).toBe('up1');
    expect(s.canGo).toBe(true);
  });

  it('shows a friendly message when the upload fails', async () => {
    const s = useJobsStore();
    resumes.uploadResumeFile.mockRejectedValue(new ApiError(413, ''));
    expect(await s.uploadResume(pdf())).toBe(false);
    expect(s.uploadError).toMatch(/5 MB/);
    expect(s.uploading).toBe(false);
    expect(s.uploaded).toBeNull();
  });

  it('cancel stops the upload and ignores a late answer', async () => {
    const s = useJobsStore();
    let resolve!: (r: SavedResume) => void;
    resumes.uploadResumeFile.mockReturnValue(new Promise((r) => { resolve = r; }));
    const p = s.uploadResume(pdf());
    s.cancelUpload();
    expect(s.uploading).toBe(false);
    resolve(resume('late'));
    expect(await p).toBe(false);
    expect(s.uploaded).toBeNull();
    expect(s.uploadError).toBe('');
  });

  it('loads the rest of the saved list when it had failed before', async () => {
    resumes.listResumes.mockRejectedValueOnce(new Error('API 500: x'));
    const s = useJobsStore();
    await s.loadResumes();
    resumes.uploadResumeFile.mockResolvedValue(resume('up1', '2026-06-01T00:00:00Z'));
    resumes.listResumes.mockResolvedValue([resume('r1')]); // this answer does not include the new file yet
    await s.uploadResume(pdf());
    await vi.waitFor(() => expect(s.resumesStatus).toBe('ready'));
    expect(s.resumes.map((r) => r.id)).toEqual(['up1', 'r1']);
    expect(s.resumeId).toBe('up1');
  });

  it('choosing a different file shows the file box again without losing the saved file', async () => {
    const s = useJobsStore();
    resumes.uploadResumeFile.mockResolvedValue(resume('up1'));
    await s.uploadResume(pdf());
    s.clearUploaded();
    expect(s.uploaded).toBeNull();
    expect(s.resumes.map((r) => r.id)).toEqual(['up1']);
  });
});

describe('jobs store: form', () => {
  it('Go is allowed only when the form is complete', async () => {
    const s = await readyStore();
    expect(s.canGo).toBe(true);
    s.setModel(null);
    expect(s.canGo).toBe(false);
    expect(s.formErrors.model).toMatch(/AI model/);
    s.setModel('groq:x');
    s.setUrl('not a link');
    expect(s.canGo).toBe(false);
    s.setUrl('https://jobs.example.com/1');
    expect(s.canGo).toBe(true);
    s.setText('short');
    expect(s.canGo).toBe(false);
  });

  it('Master Profile needs no resume', async () => {
    resumes.listResumes.mockResolvedValue([]);
    const s = useJobsStore();
    await s.loadResumes();
    s.setJobTitle('Backend Engineer');
    s.setCompany('Globex Inc');
    s.setText(TEXT);
    s.setModel('groq:x');
    expect(s.canGo).toBe(false); // Upload tab, nothing uploaded
    s.setTab('profile');
    expect(s.canGo).toBe(true);
  });

  it('Go waits while a resume is uploading', async () => {
    const s = await readyStore();
    resumes.uploadResumeFile.mockReturnValue(new Promise(() => {}));
    void s.uploadResume(pdf());
    expect(s.canGo).toBe(false);
  });

  it('writes the email by default', () => {
    const s = useJobsStore();
    expect(s.writeEmail).toBe(true);
    expect(s.form.writeEmail).toBe(true);
    expect(s.recruiterEmail).toBe('');
  });

  it('ignores unknown templates', () => {
    const s = useJobsStore();
    s.setTemplate('fancy');
    expect(s.template).toBe('harvard');
  });
});

describe('jobs store: Go', () => {
  it('sends the form, returns the result and clears the job for the next one', async () => {
    const s = await readyStore();
    s.setUrl(' https://jobs.example.com/1 ');
    tailor.tailorJob.mockResolvedValue(result('new'));
    const p = s.tailor();
    expect(s.phase).toBe('working');
    const out = await p;
    expect(out?.application_id).toBe('app1');
    expect(out?.match.score).toBe(80);
    expect(tailor.tailorJob).toHaveBeenCalledWith({
      job_text: TEXT,
      source_url: 'https://jobs.example.com/1',
      job_title: 'Backend Engineer',
      company: 'Globex Inc',
      recruiter_email: null,
      source: 'resume',
      resume_id: 'r1',
      template: 'harvard',
      model_id: 'groq:x',
      write_email: true,
    }, expect.any(AbortSignal));
    // back to an empty form; the resume, template and model choices stay
    expect(s.phase).toBe('form');
    expect(s.text).toBe('');
    expect(s.jobUrl).toBe('');
    expect(s.jobTitle).toBe('');
    expect(s.company).toBe('');
    expect(s.tailorError).toBeNull();
    expect(s.resumeTab).toBe('saved');
    expect(s.resumeId).toBe('r1');
    expect(s.template).toBe('harvard');
    expect(s.modelId).toBe('groq:x');
  });

  it('sends the recruiter email and the email choice, then clears only the address for the next job', async () => {
    const s = await readyStore();
    s.setRecruiterEmail('  sam@globex.com ');
    s.setWriteEmail(false);
    tailor.tailorJob.mockResolvedValue(result());
    expect(await s.tailor()).not.toBeNull();
    expect(tailor.tailorJob.mock.calls[0][0]).toMatchObject({ recruiter_email: 'sam@globex.com', write_email: false });
    expect(s.recruiterEmail).toBe('');
    expect(s.writeEmail).toBe(false); // kept, like the template and model
  });

  it('an invalid recruiter email blocks Go; an empty one is fine', async () => {
    const s = await readyStore();
    s.setRecruiterEmail('sam@globex');
    expect(s.formErrors.recruiterEmail).toMatch(/valid email address/);
    expect(s.canGo).toBe(false);
    expect(await s.tailor()).toBeNull();
    expect(tailor.tailorJob).not.toHaveBeenCalled();
    s.setRecruiterEmail('');
    expect(s.canGo).toBe(true);
  });

  it('keeps the recruiter email when Go fails', async () => {
    const s = await readyStore();
    s.setRecruiterEmail('sam@globex.com');
    tailor.tailorJob.mockRejectedValue(new Error('API 500: x'));
    expect(await s.tailor()).toBeNull();
    expect(s.recruiterEmail).toBe('sam@globex.com');
  });

  it('keeps an uploaded resume chosen after a successful Go', async () => {
    const s = await readyStore();
    resumes.uploadResumeFile.mockResolvedValue(resume('up1', '2026-06-01T00:00:00Z'));
    s.setTab('upload');
    await s.uploadResume(pdf());
    tailor.tailorJob.mockResolvedValue(result());
    expect(await s.tailor()).not.toBeNull();
    expect(s.resumeTab).toBe('upload');
    expect(s.uploaded?.id).toBe('up1');
    expect(s.effectiveResumeId).toBe('up1');
  });

  it('sends source "profile" without a resume id', async () => {
    const s = await readyStore();
    s.setTab('profile');
    tailor.tailorJob.mockResolvedValue(result());
    await s.tailor();
    expect(tailor.tailorJob.mock.calls[0][0]).toMatchObject({ source: 'profile', resume_id: null });
  });

  it('does nothing when the form is not complete', async () => {
    const s = useJobsStore();
    s.setText('short');
    expect(await s.tailor()).toBeNull();
    expect(tailor.tailorJob).not.toHaveBeenCalled();
    expect(s.phase).toBe('form');
  });

  it('shows a friendly error, goes back to the form and keeps every input', async () => {
    const s = await readyStore();
    s.setUrl('https://jobs.example.com/1');
    tailor.tailorJob.mockRejectedValue(new Error('API 503: {"detail":"Groq is not set up on the server."}'));
    expect(await s.tailor()).toBeNull();
    expect(s.phase).toBe('form');
    expect(s.tailorError).toEqual({ message: 'Groq is not set up on the server.', canRetry: true });
    expect(s.text).toBe(TEXT);
    expect(s.jobUrl).toBe('https://jobs.example.com/1');
    expect(s.resumeId).toBe('r1');
    // Try again sends the same thing and clears the old error
    tailor.tailorJob.mockResolvedValue(result());
    expect(await s.tailor()).not.toBeNull();
    expect(s.tailorError).toBeNull();
  });

  it('cancel goes back to the form and ignores a late answer', async () => {
    const s = await readyStore();
    let resolve!: (r: TailorResult) => void;
    tailor.tailorJob.mockReturnValue(new Promise((r) => { resolve = r; }));
    const run = s.tailor();
    expect(s.phase).toBe('working');
    s.cancelTailor();
    expect(s.phase).toBe('form');
    resolve(result());
    expect(await run).toBeNull();
    expect(s.phase).toBe('form');
    expect(s.tailorError).toBeNull();
    expect(s.text).toBe(TEXT);
  });

  it('cancel aborts the request', async () => {
    const s = await readyStore();
    tailor.tailorJob.mockImplementation(hangUntilAbort<TailorResult>());
    const run = s.tailor();
    const signal = tailor.tailorJob.mock.calls[0][1] as AbortSignal;
    s.cancelTailor();
    expect(signal.aborted).toBe(true);
    expect(await run).toBeNull();
    expect(s.tailorError).toBeNull();
  });

  it('ignores a second Go while one is running', async () => {
    const s = await readyStore();
    tailor.tailorJob.mockReturnValue(new Promise(() => {}));
    void s.tailor();
    expect(await s.tailor()).toBeNull();
    expect(tailor.tailorJob).toHaveBeenCalledTimes(1);
  });

  it('gives up after the time limit with a friendly message', async () => {
    const s = await readyStore();
    vi.useFakeTimers();
    tailor.tailorJob.mockImplementation(hangUntilAbort<TailorResult>());
    const run = s.tailor();
    vi.advanceTimersByTime(TAILOR_TIMEOUT_MS - 1);
    expect(s.phase).toBe('working');
    vi.advanceTimersByTime(1);
    expect(await run).toBeNull();
    expect(s.phase).toBe('form');
    expect(s.tailorError).toEqual({ message: TIMEOUT_MESSAGE, canRetry: true });
  });
});

describe('jobs store: reset', () => {
  it('wipes everything (log out) and ignores a request that answers later', async () => {
    const s = await readyStore();
    s.setWriteEmail(false);
    s.setRecruiterEmail('sam@globex.com');
    let resolve!: (r: TailorResult) => void;
    tailor.tailorJob.mockReturnValue(new Promise((r) => { resolve = r; }));
    const run = s.tailor();
    s.reset();
    resolve(result());
    expect(await run).toBeNull();
    expect(s.resumes).toEqual([]);
    expect(s.resumesStatus).toBe('idle');
    expect(s.resumeId).toBeNull();
    expect(s.phase).toBe('form');
    expect(s.text).toBe('');
    expect(s.modelId).toBeNull();
    expect(s.writeEmail).toBe(true);
    expect(s.recruiterEmail).toBe('');
  });
});
