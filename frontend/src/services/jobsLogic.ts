import { isFriendlyDetail } from './resumeImport';

// Pure helpers for the Jobs screen (no network, no Vue): form checks, cleaning backend answers,
// friendly errors and small display texts. Kept apart so they are easy to test.

export const MIN_JOB_CHARS = 50;
export const MAX_JOB_CHARS = 15000;
export const MAX_URL_CHARS = 500;
/** Job title and company (same limit as the backend). */
export const MAX_SHORT_CHARS = 200;
/** Recruiter email address (same limit as the backend and the database). */
export const MAX_EMAIL_CHARS = 254;
/** The screen gives up waiting after 3 minutes (the AI usually needs 30 to 120 seconds). */
export const TAILOR_TIMEOUT_MS = 180_000;

/** What the AI found in a job post. Text fields can be null when the post does not say. */
export interface ParsedJob {
  title: string | null;
  company: string | null;
  location: string | null;
  seniority: string | null;
  employment_type: string | null;
  summary: string | null;
  required_skills: string[];
  nice_to_have_skills: string[];
  responsibilities: string[];
}

/** A saved job as the backend returns it. */
export interface Job {
  id: string;
  title: string;
  company: string;
  source_url: string | null;
  parsed: ParsedJob | null;
  raw_text: string;
  created_at: string;
}

/** A resume file the user saved (POST /resumes, GET /resumes). */
export interface SavedResume {
  id: string;
  file_name: string;
  size_bytes: number;
  created_at: string;
}

/** Which resume the AI starts from: a file uploaded now, a saved file, or the Master Profile. */
export type ResumeTab = 'upload' | 'saved' | 'profile';

// ---------- Templates ----------

export interface ResumeTemplate {
  id: string;
  label: string;
  hint: string;
}

/** Resume layouts. Add a new entry here (and a preview component) to offer another template. */
export const TEMPLATES = [
  { id: 'harvard', label: 'Harvard', hint: 'Classic one-column layout. Easy to read for people and for ATS software.' },
] as const satisfies readonly ResumeTemplate[];

export type TemplateId = (typeof TEMPLATES)[number]['id'];
export const DEFAULT_TEMPLATE: TemplateId = 'harvard';
export const isTemplateId = (v: unknown): v is TemplateId => TEMPLATES.some((t) => t.id === v);
export const templateHint = (id: string): string => TEMPLATES.find((t) => t.id === id)?.hint ?? '';

// ---------- Input checks ----------

/** Friendly message when the pasted text cannot be sent, or '' when it is fine. */
export function validateJobText(text: string): string {
  const n = text.trim().length;
  if (n === 0) return 'Please paste the job description.';
  if (n < MIN_JOB_CHARS) return `That is a bit short. Please paste at least ${MIN_JOB_CHARS} characters (you have ${n}).`;
  if (text.length > MAX_JOB_CHARS) return `That is too long. The limit is ${MAX_JOB_CHARS.toLocaleString('en-US')} characters.`;
  return '';
}

/** "1,234 / 15,000" for the live counter under the box. */
export const charCountLabel = (text: string): string =>
  `${text.length.toLocaleString('en-US')} / ${MAX_JOB_CHARS.toLocaleString('en-US')}`;

/** The link as it will be sent: trimmed, scheme in lower case, or null when the box is empty. */
export function cleanJobUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  return u.replace(/^https?:/i, (scheme) => scheme.toLowerCase());
}

/** The job post link is optional. When given it must be a full http(s) link of at most 500 characters. */
export function validateJobUrl(url: string): string {
  const u = cleanJobUrl(url);
  if (!u) return '';
  if (u.length > MAX_URL_CHARS) return `That link is too long. The limit is ${MAX_URL_CHARS} characters.`;
  const message = 'Please enter the full link, starting with http:// or https://.';
  if (!/^https?:\/\/\S+$/.test(u)) return message;
  try {
    if (!new URL(u).hostname) return message;
  } catch {
    return message;
  }
  return '';
}

/** Job title and company are required: they name the entry in the Tracker and the cover letter. */
export function validateShortField(value: string, label: string): string {
  const v = value.trim();
  if (!v) return `Please enter the ${label}.`;
  if (v.length > MAX_SHORT_CHARS) return `That is too long. The limit is ${MAX_SHORT_CHARS} characters.`;
  return '';
}

// ---------- Email addresses (recruiter email on the Jobs form and in the Tracker) ----------

export const EMAIL_ERROR = 'Please enter a valid email address, like name@company.com.';
/** Shown under the disabled Go button when the recruiter email is the first problem. */
export const RECRUITER_EMAIL_HINT = 'Please fix the recruiter email, or leave it empty.';

// The same practical check as the backend (app/services/applications.py), so the server never says no:
// a plain ASCII name part without leading, trailing or double dots, valid domain labels and a real ending.
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const EMAIL_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const EMAIL_TLD = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;

/** The address as it is sent: trimmed, or null when the box is empty. */
export function cleanEmail(value: string | null | undefined): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  return v || null;
}

/** True for one address like "name@company.com" (no spaces, one @, a dot in the domain, at most 254 characters). */
export function isEmailAddress(value: string): boolean {
  if (!value || value.length > MAX_EMAIL_CHARS || value.split('@').length !== 2) return false;
  const [local, domain] = value.split('@');
  const labels = domain.split('.');
  return local.length <= 64 && EMAIL_LOCAL.test(local)
    && labels.length >= 2 && labels.every((l) => EMAIL_LABEL.test(l)) && EMAIL_TLD.test(labels[labels.length - 1]);
}

/** An optional email address: '' when empty or valid, else the friendly error. */
export function validateOptionalEmail(value: string | null | undefined): string {
  const v = cleanEmail(value);
  return !v || isEmailAddress(v) ? '' : EMAIL_ERROR;
}

/** Everything the form needs to send POST /tailor. `resumeId` is the resume of the chosen tab (null for profile). */
export interface TailorForm {
  jobUrl: string;
  jobTitle: string;
  company: string;
  /** Optional. Saved in the Tracker only; never sent to the AI. */
  recruiterEmail: string;
  text: string;
  tab: ResumeTab;
  resumeId: string | null;
  template: string;
  modelId: string | null;
  /** Also write a short application email. */
  writeEmail: boolean;
}

export interface TailorFormErrors {
  text: string;
  url: string;
  title: string;
  company: string;
  recruiterEmail: string;
  resume: string;
  template: string;
  model: string;
}

/** Problems with the form right now. Empty strings mean "fine". */
export function validateTailorForm(f: TailorForm): TailorFormErrors {
  let resume = '';
  if (f.tab === 'upload' && !f.resumeId) resume = 'Please upload your resume file.';
  if (f.tab === 'saved' && !f.resumeId) resume = 'Please choose one of your saved resumes, or upload one.';
  return {
    text: validateJobText(f.text),
    url: validateJobUrl(f.jobUrl),
    title: validateShortField(f.jobTitle, 'job title'),
    company: validateShortField(f.company, 'company'),
    recruiterEmail: validateOptionalEmail(f.recruiterEmail),
    resume,
    template: isTemplateId(f.template) ? '' : 'Please choose a template.',
    model: f.modelId ? '' : 'Please choose an AI model.',
  };
}

export const hasFormErrors = (e: TailorFormErrors): boolean =>
  !!(e.text || e.url || e.title || e.company || e.recruiterEmail || e.resume || e.template || e.model);

/** The first thing to fix, in the order of the form (shown under the disabled Go button). */
export const firstFormProblem = (e: TailorFormErrors): string =>
  e.url || e.title || e.company || (e.recruiterEmail ? RECRUITER_EMAIL_HINT : '')
  || e.text || e.resume || e.template || e.model;

export interface TailorRequest {
  job_text: string;
  source_url: string | null;
  job_title: string;
  company: string;
  recruiter_email: string | null;
  source: 'resume' | 'profile';
  resume_id: string | null;
  template: TemplateId;
  model_id: string | null;
  write_email: boolean;
}

/** Body of POST /tailor. Call it only when the form has no errors. */
export function buildTailorRequest(f: TailorForm): TailorRequest {
  const fromProfile = f.tab === 'profile';
  return {
    job_text: f.text.trim(),
    source_url: cleanJobUrl(f.jobUrl),
    job_title: f.jobTitle.trim(),
    company: f.company.trim(),
    recruiter_email: cleanEmail(f.recruiterEmail),
    source: fromProfile ? 'profile' : 'resume',
    resume_id: fromProfile ? null : f.resumeId,
    template: isTemplateId(f.template) ? f.template : DEFAULT_TEMPLATE,
    model_id: f.modelId,
    write_email: f.writeEmail !== false,
  };
}

// ---------- Cleaning what the backend sends ----------

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const text = (v: unknown): string => str(v) ?? '';
const asObject = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const objects = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[] : []);

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = typeof item === 'string' ? item.trim() : '';
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

/** Makes a parsed job safe to show even when a field is missing or has the wrong type. */
export function normalizeParsedJob(raw: unknown): ParsedJob {
  const r = asObject(raw);
  return {
    title: str(r.title),
    company: str(r.company),
    location: str(r.location),
    seniority: str(r.seniority),
    employment_type: str(r.employment_type),
    summary: str(r.summary),
    required_skills: strList(r.required_skills),
    nice_to_have_skills: strList(r.nice_to_have_skills),
    responsibilities: strList(r.responsibilities),
  };
}

/** Makes one saved job safe to show. Returns null when it has no id (it cannot be used). */
export function normalizeJob(raw: unknown): Job | null {
  const r = asObject(raw);
  if (typeof r.id !== 'string' && typeof r.id !== 'number') return null;
  return {
    id: String(r.id),
    title: typeof r.title === 'string' ? r.title : '',
    company: typeof r.company === 'string' ? r.company : '',
    source_url: str(r.source_url),
    parsed: r.parsed && typeof r.parsed === 'object' ? normalizeParsedJob(r.parsed) : null,
    raw_text: typeof r.raw_text === 'string' ? r.raw_text : '',
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
  };
}

export function normalizeJobList(raw: unknown): Job[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeJob).filter((j): j is Job => j !== null);
}

/** One saved resume, or null when it has no id. */
export function normalizeResume(raw: unknown): SavedResume | null {
  const r = asObject(raw);
  if (typeof r.id !== 'string' && typeof r.id !== 'number') return null;
  const size = Number(r.size_bytes);
  return {
    id: String(r.id),
    file_name: text(r.file_name),
    size_bytes: Number.isFinite(size) && size > 0 ? Math.round(size) : 0,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
  };
}

const timeOf = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
};

/** Saved resumes, newest first (rows without a readable date go last). */
export function normalizeResumeList(raw: unknown): SavedResume[] {
  if (!Array.isArray(raw)) return [];
  const list = raw.map(normalizeResume).filter((r): r is SavedResume => r !== null);
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => timeOf(b.r.created_at) - timeOf(a.r.created_at) || a.i - b.i)
    .map(({ r }) => r);
}

/** The resume to preselect: the current choice if it is still in the list, else the newest, else null. */
export const pickResumeId = (list: readonly SavedResume[], current: string | null): string | null =>
  (current && list.some((r) => r.id === current) ? current : list[0]?.id ?? null);

/** Start on "Saved" when the user has saved resumes, else on "Upload". */
export const defaultResumeTab = (list: readonly SavedResume[]): ResumeTab => (list.length ? 'saved' : 'upload');

// ---------- Tailored resume, cover letter and match (POST /tailor) ----------

export interface ResumeHeader {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface EducationEntry {
  school: string;
  location: string;
  degree: string;
  dates: string;
  details: string[];
}

export interface ExperienceEntry {
  organization: string;
  location: string;
  title: string;
  dates: string;
  bullets: string[];
}

export interface ProjectEntry {
  name: string;
  role: string;
  dates: string;
  bullets: string[];
}

export interface SkillGroup {
  category: string;
  items: string[];
}

/** The tailored resume. Missing text is '' and missing lists are [] so the preview never breaks. */
export interface TailoredResume {
  header: ResumeHeader;
  summary: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillGroup[];
}

export interface CoverLetter {
  recipient: string;
  company: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
  signature: string;
}

export interface MatchResult {
  /** 0 to 100, or null when the server sent no usable score. */
  score: number | null;
  matched: string[];
  gaps: string[];
}

/** The short application email: plain text, paragraphs separated by a blank line. */
export interface EmailDraft {
  subject: string;
  body: string;
}

export interface TailorResult {
  application_id: string;
  job: Job | null;
  template: string;
  model: string;
  resume: TailoredResume;
  cover_letter: CoverLetter;
  /** null when no email was asked for, or the AI wrote no usable one. */
  email: EmailDraft | null;
  match: MatchResult;
  warnings: string[];
}

export function normalizeTailoredResume(raw: unknown): TailoredResume {
  const r = asObject(raw);
  const h = asObject(r.header);
  return {
    header: {
      name: text(h.name),
      email: text(h.email),
      phone: text(h.phone),
      location: text(h.location),
      links: strList(h.links),
    },
    summary: text(r.summary),
    education: objects(r.education)
      .map((e) => ({
        school: text(e.school), location: text(e.location), degree: text(e.degree), dates: text(e.dates), details: strList(e.details),
      }))
      .filter((e) => e.school || e.degree || e.details.length),
    experience: objects(r.experience)
      .map((e) => ({
        organization: text(e.organization), location: text(e.location), title: text(e.title), dates: text(e.dates), bullets: strList(e.bullets),
      }))
      .filter((e) => e.organization || e.title || e.bullets.length),
    projects: objects(r.projects)
      .map((p) => ({ name: text(p.name), role: text(p.role), dates: text(p.dates), bullets: strList(p.bullets) }))
      .filter((p) => p.name || p.bullets.length),
    skills: objects(r.skills)
      .map((g) => ({ category: text(g.category), items: strList(g.items) }))
      .filter((g) => g.items.length),
  };
}

export function normalizeCoverLetter(raw: unknown): CoverLetter {
  const r = asObject(raw);
  return {
    recipient: text(r.recipient),
    company: text(r.company),
    greeting: text(r.greeting),
    paragraphs: Array.isArray(r.paragraphs) ? r.paragraphs.map(text).filter(Boolean) : [],
    closing: text(r.closing),
    signature: text(r.signature),
  };
}

/** The email subject: one line, inner spaces collapsed. */
export const cleanEmailSubject = (v: unknown): string =>
  (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** The email message: line breaks as "\n" (paragraphs stay apart), no blank lines at the start or end. */
export const cleanEmailBody = (v: unknown): string =>
  (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\s+$/g, '') : '');

/** The email from POST /tailor, or null when there is none (not an object, or no subject and no message). */
export function normalizeEmailDraft(raw: unknown): EmailDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const email = { subject: cleanEmailSubject(r.subject), body: cleanEmailBody(r.body) };
  return email.subject || email.body ? email : null;
}

/** A score from 0 to 100. A fraction such as 0.82 is read as 82. Anything unusable becomes null. */
export function normalizeScore(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const pct = n > 0 && n < 1 ? n * 100 : n;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

export function normalizeMatch(raw: unknown): MatchResult {
  const r = asObject(raw);
  return { score: normalizeScore(r.score), matched: strList(r.matched), gaps: strList(r.gaps) };
}

/** Makes the POST /tailor answer safe to show. Returns null only when it is not an object at all. */
export function normalizeTailorOut(raw: unknown): TailorResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    application_id: typeof r.application_id === 'string' || typeof r.application_id === 'number' ? String(r.application_id) : '',
    job: normalizeJob(r.job),
    template: text(r.template) || DEFAULT_TEMPLATE,
    model: text(r.model),
    resume: normalizeTailoredResume(r.resume),
    cover_letter: normalizeCoverLetter(r.cover_letter),
    email: normalizeEmailDraft(r.email),
    match: normalizeMatch(r.match),
    warnings: strList(r.warnings),
  };
}

export const resumeIsEmpty = (r: TailoredResume): boolean =>
  !r.header.name && !r.summary && !r.education.length && !r.experience.length && !r.projects.length && !r.skills.length;

export const letterIsEmpty = (l: CoverLetter): boolean => !l.greeting && !l.paragraphs.length;

/** The contact line under the name: location, phone, email, then links. */
export const contactParts = (h: ResumeHeader): string[] =>
  [h.location, h.phone, h.email, ...h.links].filter(Boolean);

/** Short label for the score. */
export function scoreLabel(score: number | null): string {
  if (score === null) return 'No score';
  if (score >= 75) return 'Strong match';
  if (score >= 50) return 'Good match';
  if (score >= 25) return 'Fair match';
  return 'Low match';
}

/** One sentence under the score, e.g. "Your resume shows 6 of the 8 skills this job asks for." */
export function matchSentence(m: MatchResult): string {
  const total = m.matched.length + m.gaps.length;
  if (total === 0) return 'We could not find skills to compare in this job post.';
  if (m.gaps.length === 0) return 'Your resume shows every skill this job asks for.';
  return `Your resume shows ${m.matched.length} of the ${total} skill${total === 1 ? '' : 's'} this job asks for.`;
}

// ---------- While the AI works ----------

export const TAILOR_STATUS_LINES = [
  'Reading the job post…',
  'Tailoring your resume…',
  'Writing your cover letter…',
] as const;
export const EMAIL_STATUS_LINE = 'Writing your application email…';
export const STATUS_LINE_MS = 5000;

/** The status lines for one Go: the email line is added only when an email is being written. */
export const statusLines = (withEmail = false): readonly string[] =>
  (withEmail ? [...TAILOR_STATUS_LINES, EMAIL_STATUS_LINE] : TAILOR_STATUS_LINES);

/** The status line to show after `elapsedMs` of waiting (they take turns every 5 seconds). */
export function statusLineAt(elapsedMs: number, withEmail = false): string {
  const lines = statusLines(withEmail);
  return lines[Math.floor(Math.max(0, elapsedMs) / STATUS_LINE_MS) % lines.length];
}

/** The toast after a successful Go. Points to the Email tab when an email was asked for but none came back. */
export function savedToTrackerMessage(askedForEmail: boolean, result: Pick<TailorResult, 'email'>): string {
  return askedForEmail && !result.email
    ? 'Saved to your Tracker. Open the Email tab to write the email.'
    : 'Saved to your Tracker';
}

// ---------- Showing saved items ----------

/** "Title" shown in lists; falls back so a row is never blank. */
export const jobTitle = (j: Pick<Job, 'title'>): string => j.title.trim() || 'Untitled job';
export const jobCompany = (j: Pick<Job, 'company'>): string => j.company.trim() || 'Company not set';

/** "12 Mar 2026" (the user's own language settings are not needed for this simple label). */
export function formatJobDate(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "my-cv.pdf - 12 Mar 2026" for the saved resume dropdown. */
export function resumeLabel(r: SavedResume): string {
  const date = formatJobDate(r.created_at);
  return `${r.file_name || 'Resume'}${date ? ` - ${date}` : ''}`;
}

/** "240 KB" or "1.2 MB"; '' when the size is unknown. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Small facts under the title in the details view, e.g. ["Berlin", "Senior", "Full-time"]. */
export function jobFacts(p: ParsedJob | null): string[] {
  if (!p) return [];
  return [p.location, p.seniority, p.employment_type].filter((x): x is string => !!x);
}

// ---------- Friendly errors ----------

export type JobAction = 'tailor' | 'upload' | 'resumes';

export interface JobError {
  message: string;
  /** True when trying the same thing again could work. */
  canRetry: boolean;
}

/**
 * Reads the status and a short readable detail from a failed call.
 * api() throws Error("API 422: {...}"); apiUpload() throws ApiError with `status` and `detail`.
 */
export function readApiError(e: unknown): { status: number; detail: string } | null {
  if (e && typeof e === 'object' && (e as { name?: unknown }).name === 'ApiError'
    && typeof (e as { status?: unknown }).status === 'number') {
    const { status, detail } = e as { status: number; detail?: unknown };
    return { status, detail: isFriendlyDetail(detail) ? detail.trim() : '' };
  }
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  const m = /^API (\d{3}):\s*([\s\S]*)$/.exec(msg);
  if (!m) return null;
  let detail = '';
  try {
    const body = JSON.parse(m[2]) as { detail?: unknown };
    if (typeof body?.detail === 'string') detail = body.detail;
  } catch {
    // body was not JSON: leave the detail empty
  }
  return { status: Number(m[1]), detail: isFriendlyDetail(detail) ? detail.trim() : '' };
}

const OFFLINE = 'We could not reach the server. Please check your internet connection and try again.';
export const TIMEOUT_MESSAGE = 'This is taking much longer than usual. Please try again, or choose another AI model.';

const VERB: Record<JobAction, string> = {
  tailor: 'tailor your resume for this job',
  upload: 'upload that resume',
  resumes: 'load your saved resumes',
};

const NOT_SET_UP: Record<JobAction, string> = {
  tailor: 'The AI writer is not set up yet on the server.',
  upload: 'Saving resumes is not set up yet on the server.',
  resumes: 'Saving resumes is not set up yet on the server.',
};

function notFound(action: JobAction, detail: string): JobError {
  if (action === 'tailor') {
    return { message: detail || 'We could not find that resume. Please choose another one or upload it again.', canRetry: false };
  }
  return { message: 'This is not available on the server yet. Please try again later.', canRetry: true };
}

function badInput(action: JobAction, detail: string): JobError {
  if (detail) return { message: detail, canRetry: false };
  if (action === 'upload') {
    return { message: 'We could not read text in that file. Please try a text-based PDF or a .docx file.', canRetry: false };
  }
  return { message: 'Some details are not valid. Please check them and try again.', canRetry: false };
}

/** Turns a failure into a short, kind sentence. Never shows raw error text. */
export function friendlyJobError(e: unknown, action: JobAction): JobError {
  const err = readApiError(e);
  if (err) {
    const { status, detail } = err;
    if (status === 401 || status === 403) return { message: 'Your session has ended. Please log in again.', canRetry: false };
    if (status === 404) return notFound(action, detail);
    if (status === 413) {
      const limit = action === 'upload'
        ? 'That file is too large. The limit is 5 MB.'
        : `That text is too long. The limit is ${MAX_JOB_CHARS.toLocaleString('en-US')} characters.`;
      return { message: detail || limit, canRetry: false };
    }
    if (status === 415) return { message: detail || 'Please choose a PDF or a Word (.docx) file.', canRetry: false };
    if (status === 422 || status === 400) return badInput(action, detail);
    if (status === 429) return { message: detail || 'Too many tries. Please wait a minute and try again.', canRetry: true };
    if (status === 503) return { message: detail || NOT_SET_UP[action], canRetry: true };
    if (status === 502) return { message: detail || 'The AI service had a problem. Please try again in a moment.', canRetry: true };
    if (status === 504) return { message: TIMEOUT_MESSAGE, canRetry: true };
    if (status >= 500) return { message: 'The server had a problem. Please try again in a moment.', canRetry: true };
    return { message: `We could not ${VERB[action]}. Please try again.`, canRetry: true };
  }
  if (e instanceof TypeError) return { message: OFFLINE, canRetry: true };
  return { message: `We could not ${VERB[action]}. Please try again.`, canRetry: true };
}
