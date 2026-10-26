import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

// QA review of "recruiter email + application email": edge cases that sit next to the
// developer's own specs. Tests marked it.fails describe a KNOWN BUG: they pass while the bug exists
// and turn red once it is fixed (then just change `it.fails` back to `it`).

vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('@/services/applications', () => ({
  listApplications: vi.fn(), getApplication: vi.fn(), updateApplication: vi.fn(), deleteApplication: vi.fn(),
  writeApplicationEmail: vi.fn(),
}));
vi.mock('@/services/documents', () => ({ downloadDocument: vi.fn() }));
vi.mock('@/services/feedback', () => ({ showToast: vi.fn(), confirmAction: vi.fn() }));
vi.mock('@/services/haptics', () => ({ tapHaptic: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

import * as appsSvc from '@/services/applications';
import { SENT_IT_FALLBACK_MS, useSentItBanner } from '@/composables/useSentItBanner';
import {
  EMAIL_ERROR, MAX_EMAIL_CHARS, firstFormProblem, isEmailAddress, validateOptionalEmail, validateTailorForm,
  type TailorForm,
} from '@/services/jobsLogic';
import {
  buildMailtoUrl, emailSendState, normalizeApplicationDetail, normalizeApplicationSummary,
  type ApplicationDetail, type ApplicationSummary, type WrittenEmail,
} from '@/services/trackerLogic';
import { useTrackerStore } from '@/stores/tracker';

const apps = vi.mocked(appsSvc);

// ---------------------------------------------------------------------------------------------
// Address rules: one table, the same cases are checked against the Python code in
// backend/tests/test_tailor.py + test_email_qa.py. If the two sides ever disagree, the user gets a
// "saved" form and a 422 from the server.
// ---------------------------------------------------------------------------------------------

/** An address of exactly `length` characters (254 to 256), built like long_address() in the backend tests. */
const longAddress = (length: number) =>
  `${'l'.repeat(64)}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(length - 197)}.com`;

describe('recruiter address: edge cases', () => {
  const valid = [
    'a@b.co', 'a.b@c-d.io', 'X@Y.ORG', 'a+b@c.com', "o'neil@acme.de", 'a@c.xn--p1ai', 'a_b@c.com',
    'jobs+it#1@globex.com', 'a%b@globex.com', 'a?b=c&d@globex.com', 'a/b@globex.com',
  ];
  const invalid = [
    'a@b', 'a b@c.com', ' a@b.com', 'a@b.com ', 'a@@b.com', '@b.com', 'a@', 'a@b.c', 'a@b.123',
    'a@b..com', '.a@b.com', 'a.@b.com', 'a@-b.com', 'a@b-.com', 'a@.b.com', 'a@b.com.',
    // other characters / formats
    'ä@b.com', 'a@büro.de', 'a@b.cöm', 'a＠b.com', 'a@b.com​', ' a@b.com', 'a@10.0.0.1', 'a@[1.2.3.4]',
    '"a b"@c.com', 'Jane <a@b.com>', '<a@b.com>', 'a@b.com;c@d.com', 'a@b.com,c@d.com', 'a@b.com (Jane)',
    // line breaks and control characters (header injection in a mailto link)
    'a@b.com\nBcc: x@y.com', 'a\r\n@b.com', 'a\t@b.com', 'a@b.com\x00', 'a\n@b.com', 'a@b\n.com',
  ];

  it.each(valid)('accepts %s', (a) => expect(isEmailAddress(a)).toBe(true));
  it.each(invalid)('rejects %j', (a) => expect(isEmailAddress(a)).toBe(false));

  it('limits: name part 64, whole address 254 (255 and 256 are rejected)', () => {
    expect(longAddress(254)).toHaveLength(254);
    expect(isEmailAddress(longAddress(254))).toBe(true);
    expect(isEmailAddress(longAddress(255))).toBe(false);
    expect(isEmailAddress(longAddress(256))).toBe(false);
    expect(isEmailAddress(`${'a'.repeat(64)}@b.com`)).toBe(true);
    expect(isEmailAddress(`${'a'.repeat(65)}@b.com`)).toBe(false);
    expect(isEmailAddress(`a@${'b'.repeat(63)}.com`)).toBe(true);
    expect(isEmailAddress(`a@${'b'.repeat(64)}.com`)).toBe(false);
    expect(MAX_EMAIL_CHARS).toBe(254);
  });

  it('trims before checking, so a pasted address with spaces or a tab around it is fine', () => {
    expect(validateOptionalEmail('  a@b.co \t')).toBe('');
    expect(validateOptionalEmail(longAddress(254))).toBe('');
    expect(validateOptionalEmail(longAddress(255))).toBe(EMAIL_ERROR);
    expect(validateOptionalEmail('a@b')).toBe(EMAIL_ERROR);
    expect(validateOptionalEmail('a b@c.com')).toBe(EMAIL_ERROR);
  });

  it('is fast on hostile input (no catastrophic backtracking)', () => {
    const started = performance.now();
    for (const bad of ['a'.repeat(100_000), `${'a.'.repeat(50_000)}@b.com`, `a@${'b-'.repeat(50_000)}.com`, '@'.repeat(100_000)]) {
      expect(isEmailAddress(bad)).toBe(false);
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('first problem on the Jobs form', () => {
  const ok: TailorForm = {
    jobUrl: '', jobTitle: 'Dev', company: 'Acme', recruiterEmail: '', text: 'x'.repeat(80), tab: 'saved',
    resumeId: 'r1', template: 'harvard', modelId: 'groq:x', writeEmail: true,
  };
  const problem = (over: Partial<TailorForm>) => firstFormProblem(validateTailorForm({ ...ok, ...over }));

  it('follows the order of the form from top to bottom', () => {
    const everythingWrong: Partial<TailorForm> = {
      jobUrl: 'nope', jobTitle: '', company: '', recruiterEmail: 'bad', text: '', resumeId: null, template: 'x', modelId: null,
    };
    expect(problem(everythingWrong)).toMatch(/http/); // link
    expect(problem({ ...everythingWrong, jobUrl: '' })).toMatch(/job title/);
    expect(problem({ ...everythingWrong, jobUrl: '', jobTitle: 'Dev' })).toMatch(/company/);
    expect(problem({ ...everythingWrong, jobUrl: '', jobTitle: 'Dev', company: 'Acme' })).toMatch(/recruiter email/);
    expect(problem({ ...everythingWrong, jobUrl: '', jobTitle: 'Dev', company: 'Acme', recruiterEmail: '' })).toMatch(/job description/);
    expect(problem({ ...everythingWrong, jobUrl: '', jobTitle: 'Dev', company: 'Acme', recruiterEmail: '', text: ok.text })).toMatch(/saved resume/);
    expect(problem({ ...ok, template: 'x', modelId: null })).toMatch(/template/);
    expect(problem({ ...ok, modelId: null })).toMatch(/AI model/);
    expect(problem({})).toBe('');
  });

  it('an invalid recruiter email alone blocks Go with its own hint, and an empty one never does', () => {
    expect(problem({ recruiterEmail: 'a@b' })).toBe('Please fix the recruiter email, or leave it empty.');
    expect(problem({ recruiterEmail: '   ' })).toBe('');
    expect(problem({ recruiterEmail: longAddress(255) })).toBe('Please fix the recruiter email, or leave it empty.');
  });
});

// ---------------------------------------------------------------------------------------------
// mailto link
// ---------------------------------------------------------------------------------------------

function parseMailto(url: string) {
  const m = /^mailto:([^?]*)(?:\?(.*))?$/s.exec(url);
  if (!m) throw new Error(`not a mailto link: ${url}`);
  const params = new Map<string, string>();
  for (const pair of (m[2] ?? '').split('&').filter(Boolean)) {
    const i = pair.indexOf('=');
    params.set(pair.slice(0, i), decodeURIComponent(pair.slice(i + 1)));
  }
  return { to: decodeURIComponent(m[1]), subject: params.get('subject'), body: params.get('body'), keys: [...params.keys()] };
}

describe('buildMailtoUrl: hostile and large input', () => {
  it('cannot be tricked into extra headers by the subject, the message or the address', () => {
    const url = buildMailtoUrl('a?cc=evil@x.com&bcc=x@y.com@globex.com', 'Hi\r\nBcc: evil@x.com', 'Hello&cc=evil@x.com\r\nBcc: evil@x.com');
    const parsed = parseMailto(url);
    expect(parsed.keys).toEqual(['subject', 'body']); // no "cc" / "bcc" parameter appeared
    expect(url.match(/\?/g)).toHaveLength(1);
    expect(url.match(/&/g)).toHaveLength(1);
    expect(parsed.subject).toBe('Hi Bcc: evil@x.com'); // the subject is one line
    expect(parsed.body).toBe('Hello&cc=evil@x.com\r\nBcc: evil@x.com'); // the text stays text
  });

  it('keeps a % in the address as text (it cannot become a hidden line break)', () => {
    const url = buildMailtoUrl('a%0Abcc@globex.com', 'S', 'B');
    expect(url.startsWith('mailto:a%250Abcc@globex.com?')).toBe(true);
    expect(parseMailto(url).to).toBe('a%0Abcc@globex.com');
  });

  it('round-trips the longest email the backend allows (3000 characters of body, 150 of subject)', () => {
    const body = `${'Grüße, José – 日本語 ✓ & 50% done?\n\n'.repeat(80)}`.slice(0, 3000);
    const subject = 'Bewerbung – Müller & Söhne? '.repeat(6).slice(0, 150).trim();
    const url = buildMailtoUrl('sam@globex.com', subject, body);
    const parsed = parseMailto(url);
    expect(parsed.subject).toBe(subject.replace(/\s+/g, ' '));
    expect(parsed.body).toBe(body.replace(/\n/g, '\r\n'));
    // Not an assertion about the app: some desktop mail clients cut mailto links near 2,000 characters.
    // Recorded here so the length is visible when the test output is read.
    expect(url.length).toBeGreaterThan(2000);
  });

  it('a normal 180-word email stays well below the 2,000 character limit of old mail clients', () => {
    const body = ('Dear Ms. Smith,\n\nI am writing to apply for the Backend Engineer role at Globex. '.repeat(1)
      + 'word '.repeat(150)).trim();
    expect(buildMailtoUrl('sam@globex.com', 'Application for Backend Engineer – Jane Doe', body).length).toBeLessThan(2000);
  });

  it('only a message with real text can be sent (spaces and line breaks are not a message)', () => {
    expect(emailSendState('sam@globex.com', 'S', ' \n\t ').href).toBeNull();
    expect(emailSendState('sam@globex.com', '', 'Hi').href).toBe('mailto:sam@globex.com?body=Hi'); // no subject is fine
    expect(emailSendState('sam@globex.com\n', 'S', 'Hi').href).toBe('mailto:sam@globex.com?subject=S&body=Hi');
    expect(emailSendState('a\n@b.com', 'S', 'Hi').href).toBeNull(); // a line break inside is never sent on
  });

  // Was a KNOWN GAP (Low), fixed: encodeURIComponent throws "URI malformed" for a lone surrogate, which would
  // break the computed value in ApplicationEmailPanel. buildMailtoUrl now returns null ("cannot build") instead.
  it('does not throw for a message with a lone surrogate', () => {
    expect(() => buildMailtoUrl('sam@globex.com', 'S', 'broken \uD83D end')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// tracker store: races around the email and the address
// ---------------------------------------------------------------------------------------------

const summary = (id: string, over: Record<string, unknown> = {}): ApplicationSummary => normalizeApplicationSummary({
  id, status: 'saved', created_at: '2026-03-12T10:00:00Z', updated_at: '2026-03-12T10:00:00Z',
  job: { id: `j-${id}`, title: `Job ${id}`, company: 'Acme' }, match: { score: 60, gaps_count: 1 },
  documents: [{ id: `r-${id}`, type: 'resume' }], ...over,
})!;

const detail = (id: string, over: Record<string, unknown> = {}): ApplicationDetail => normalizeApplicationDetail({
  id, status: 'saved', created_at: '2026-03-12T10:00:00Z', updated_at: '2026-03-12T10:00:00Z',
  job: { id: `j-${id}`, title: `Job ${id}`, company: 'Acme', raw_text: 'text', parsed: null },
  match: { score: 60, matched: [], gaps: [], warnings: [] }, documents: [{ id: `r-${id}`, type: 'resume' }],
  resume: { id: `r-${id}`, content: { header: { name: 'Ana' } } }, cover_letter: null, source_resume: null, ...over,
})!;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const written = (id: string, over: Partial<WrittenEmail> = {}): WrittenEmail => ({
  id, created_at: '2026-03-13T10:00:00Z', subject: `Subject ${id}`, body: `Body ${id}`, warnings: [], ...over,
});
const oldEmail = { id: 'e-old', created_at: '2026-03-12T10:00:00Z', subject: 'Old subject', body: 'Old body' };
const hangUntilAbort = () => (_id: string, _m: string | null, signal?: AbortSignal) =>
  new Promise<WrittenEmail>((_res, rej) => signal?.addEventListener('abort', () => rej(abortError())));

async function withDetail(over: Record<string, unknown> = {}) {
  const s = useTrackerStore();
  apps.getApplication.mockResolvedValueOnce(detail('a', over));
  await s.loadDetail('a');
  return s;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

afterEach(() => {
  useTrackerStore().reset();
  vi.useRealTimers();
});

describe('tracker store: email races', () => {
  it('cancel and write again: the late answer of the cancelled request is ignored, the new one is shown', async () => {
    const s = await withDetail({ email: oldEmail });
    const first = deferred<WrittenEmail>();
    const second = deferred<WrittenEmail>();
    apps.writeApplicationEmail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const p1 = s.writeEmail('a', null);
    s.cancelEmail('a');
    const p2 = s.writeEmail('a', null);
    expect(s.emailWriting.a).toBe(true);
    first.resolve(written('cancelled'));
    expect(await p1).toBe(false);
    expect(s.details.a.email?.id).toBe('e-old');
    expect(s.emailWriting.a).toBe(true); // the second request is still running
    second.resolve(written('second'));
    expect(await p2).toBe(true);
    expect(s.details.a.email?.id).toBe('second');
    expect(s.emailWriting.a).toBeUndefined();
  });

  it('a timeout after a cancel does not hit the new request', async () => {
    const s = await withDetail();
    vi.useFakeTimers();
    apps.writeApplicationEmail.mockImplementation(hangUntilAbort());
    const p1 = s.writeEmail('a', null);
    s.cancelEmail('a');
    await p1;
    const p2 = s.writeEmail('a', null);
    vi.advanceTimersByTime(60_000);
    expect(s.emailWriting.a).toBe(true); // the first timer was cleared by the cancel
    s.cancelEmail('a');
    expect(await p2).toBe(false);
  });

  it('deleting the application while the email is written drops the result', async () => {
    const s = await withDetail();
    apps.listApplications.mockResolvedValue([summary('a')]);
    await s.loadList();
    const answer = deferred<WrittenEmail>();
    apps.writeApplicationEmail.mockReturnValue(answer.promise);
    const p = s.writeEmail('a', null);
    s.forget('a');
    answer.resolve(written('late'));
    expect(await p).toBe(false);
    expect(s.emailWarnings.a).toBeUndefined();
    expect(s.emailWriting.a).toBeUndefined();
  });

  it('writing an email for an application that is not loaded does not throw', async () => {
    const s = useTrackerStore();
    apps.writeApplicationEmail.mockResolvedValue(written('e1'));
    await expect(s.writeEmail('ghost', null)).resolves.toBe(true);
    expect(s.details.ghost).toBeUndefined();
  });

  it('the address saved while an email is written is kept when the email arrives', async () => {
    const s = await withDetail({ recruiter_email: 'old@globex.com' });
    const email = deferred<WrittenEmail>();
    const save = deferred<ApplicationSummary | null>();
    apps.writeApplicationEmail.mockReturnValue(email.promise);
    apps.updateApplication.mockReturnValue(save.promise);
    const pe = s.writeEmail('a', null);
    const ps = s.patchApplication('a', { recruiter_email: 'new@globex.com' });
    email.resolve(written('e1'));
    await pe;
    expect(s.details.a.recruiter_email).toBe('new@globex.com'); // still shown (the save is running)
    save.resolve(summary('a', { recruiter_email: 'new@globex.com' }));
    await ps;
    expect(s.details.a.recruiter_email).toBe('new@globex.com');
    expect(s.details.a.email?.id).toBe('e1');
  });

  it('a timed-out request leaves the old email, shows one error, and allows a retry', async () => {
    const s = await withDetail({ email: oldEmail });
    vi.useFakeTimers();
    apps.writeApplicationEmail.mockImplementation(hangUntilAbort());
    const p = s.writeEmail('a', null);
    vi.advanceTimersByTime(120_000);
    expect(await p).toBe(false);
    expect(s.emailError.a).toMatch(/still here/);
    expect(s.details.a.email?.id).toBe('e-old');
    apps.writeApplicationEmail.mockResolvedValue(written('retry'));
    vi.useRealTimers();
    expect(await s.writeEmail('a', null)).toBe(true);
    expect(s.emailError.a).toBeUndefined();
  });
});

describe('tracker store: address saved while a refresh is on its way', () => {
  // Was a KNOWN BUG (Medium, rare timing; the same pattern also affected status, dates and notes), fixed:
  // loadDetail() only protected a change that was still being saved (`pending`). A refresh that was SENT before
  // the save and ANSWERED after it overwrote the confirmed new value with the old one. The store now notes when a
  // refresh starts and keeps the editable fields on screen if a save of that application started or ended since.
  it('a refresh that was sent before the save finished must not bring the old address back', async () => {
    // Order of events: (1) the detail is requested, the server reads the OLD address; (2) the user saves a new
    // address and the server confirms; (3) the answer of request (1) arrives. The screen should keep the NEW address.
    const s = await withDetail({ recruiter_email: 'old@globex.com' });
    const refresh = deferred<ApplicationDetail>();
    apps.getApplication.mockReturnValueOnce(refresh.promise);
    const pr = s.loadDetail('a');
    apps.updateApplication.mockResolvedValue(summary('a', { recruiter_email: 'new@globex.com' }));
    expect(await s.patchApplication('a', { recruiter_email: 'new@globex.com' })).toBe('');
    refresh.resolve(detail('a', { recruiter_email: 'old@globex.com' }));
    await pr;
    expect(s.details.a.recruiter_email).toBe('new@globex.com');
  });

  it('the same refresh while the save is still running keeps the typed address', async () => {
    const s = await withDetail({ recruiter_email: 'old@globex.com' });
    const save = deferred<ApplicationSummary | null>();
    apps.updateApplication.mockReturnValue(save.promise);
    const ps = s.patchApplication('a', { recruiter_email: 'new@globex.com' });
    apps.getApplication.mockResolvedValueOnce(detail('a', { recruiter_email: 'old@globex.com' }));
    await s.loadDetail('a');
    expect(s.details.a.recruiter_email).toBe('new@globex.com');
    save.resolve(summary('a', { recruiter_email: 'new@globex.com' }));
    await ps;
    expect(s.details.a.recruiter_email).toBe('new@globex.com');
  });
});

// ---------------------------------------------------------------------------------------------
// "Sent it?" banner
// ---------------------------------------------------------------------------------------------

describe('"Sent it?" banner: status changes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => 'visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a status that goes saved, applied, saved again does not bring the question back by itself', async () => {
    const status = ref('saved');
    const scope = effectScope();
    const banner = scope.run(() => useSentItBanner(() => status.value === 'saved'))!;
    banner.arm();
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS);
    expect(banner.visible.value).toBe(true);
    status.value = 'applied';
    await nextTick();
    expect(banner.visible.value).toBe(false);
    status.value = 'saved'; // for example after a failed save that was undone
    await nextTick();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS * 3);
    expect(banner.visible.value).toBe(false); // it needs a new tap on "Open in email app"
    scope.stop();
  });

  it('the status turning to applied before the user comes back means no question at all', async () => {
    const status = ref('saved');
    const scope = effectScope();
    const banner = scope.run(() => useSentItBanner(() => status.value === 'saved'))!;
    banner.arm();
    status.value = 'applied';
    await nextTick();
    vi.advanceTimersByTime(SENT_IT_FALLBACK_MS * 2);
    window.dispatchEvent(new Event('focus'));
    expect(banner.visible.value).toBe(false);
    scope.stop();
  });

  it('many quick taps on Open leave exactly one listener behind and one timer', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const scope = effectScope();
    const banner = scope.run(() => useSentItBanner(() => true))!;
    for (let i = 0; i < 5; i++) banner.arm();
    const added = add.mock.calls.filter(([e]) => e === 'focus').length;
    const removed = remove.mock.calls.filter(([e]) => e === 'focus').length;
    expect(added - removed).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
