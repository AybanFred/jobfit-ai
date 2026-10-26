import {
  normalizeCoverLetter, normalizeParsedJob, normalizeScore, normalizeTailoredResume, readApiError,
  type CoverLetter, type MatchResult, type ParsedJob, type TailoredResume,
} from './jobsLogic';

// Pure helpers for the Tracker (no network, no Vue): cleaning backend answers, filtering, sorting,
// counting, status names and colours, dates and friendly errors. Kept apart so they are easy to test.

// ---------- Status ----------

export const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected', 'ghosted'] as const;
export type AppStatus = (typeof STATUSES)[number];
/** The filter chips: one per status plus "All". */
export type StatusFilter = AppStatus | 'all';
export const isStatus = (v: unknown): v is AppStatus => (STATUSES as readonly unknown[]).includes(v);
export const isStatusFilter = (v: unknown): v is StatusFilter => v === 'all' || isStatus(v);

/** Ionic colour names (they follow the active theme), never fixed colours. */
export type StatusColor = 'medium' | 'primary' | 'tertiary' | 'success' | 'danger' | 'warning';

const LOOK: Record<AppStatus, { label: string; color: StatusColor }> = {
  saved: { label: 'Saved', color: 'medium' },
  applied: { label: 'Applied', color: 'primary' },
  interview: { label: 'Interview', color: 'tertiary' },
  offer: { label: 'Offer', color: 'success' },
  rejected: { label: 'Rejected', color: 'danger' },
  ghosted: { label: 'Ghosted', color: 'warning' },
};

export const statusLabel = (s: AppStatus): string => LOOK[s].label;
export const statusColor = (s: AppStatus): StatusColor => LOOK[s].color;
export const filterLabel = (f: StatusFilter): string => (f === 'all' ? 'All' : statusLabel(f));
export const FILTERS: readonly StatusFilter[] = ['all', ...STATUSES];

// ---------- Shapes ----------

export type DocType = 'resume' | 'cover_letter';
export type ExportFormat = 'pdf' | 'docx';

export interface DocRef {
  id: string;
  type: DocType;
  template: string | null;
  created_at: string;
}

export interface AppJob {
  id: string;
  title: string;
  company: string;
  source_url: string | null;
  location: string | null;
  created_at: string;
}

/** The fields the user can change (PATCH /applications/{id}). */
export interface EditableFields {
  status: AppStatus;
  applied_at: string | null;
  follow_up_at: string | null;
  notes: string | null;
}

export interface ApplicationSummary extends EditableFields {
  id: string;
  created_at: string;
  updated_at: string;
  job: AppJob;
  /** null when the job was never matched. `score` is 0..100 or null. */
  match: { score: number | null; gaps_count: number } | null;
  documents: DocRef[];
}

export interface StoredDoc<T> {
  id: string;
  template: string | null;
  created_at: string;
  content: T;
}

export interface AppMatchDetail {
  score: number | null;
  gaps_count: number;
  matched: string[];
  gaps: string[];
  warnings: string[];
}

export interface ApplicationDetail extends Omit<ApplicationSummary, 'job' | 'match'> {
  job: AppJob & { parsed: ParsedJob | null; raw_text: string };
  match: AppMatchDetail | null;
  resume: StoredDoc<TailoredResume> | null;
  cover_letter: StoredDoc<CoverLetter> | null;
  source_resume: { id: string; file_name: string } | null;
}

export type ApplicationPatch = Partial<EditableFields>;

// ---------- Cleaning what the backend sends ----------

const asObject = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const idOf = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
const textOr = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** A date string the browser can read, else null. */
const dateOrNull = (v: unknown): string | null => {
  const s = strOrNull(v);
  return s && !Number.isNaN(parseDate(s)) ? s : null;
};

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = typeof item === 'string' ? item.trim() : '';
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

function count(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

/** Only real web links are kept (a bad link must never become a clickable "javascript:" link). */
export function safeLink(v: unknown): string | null {
  const s = strOrNull(v);
  if (!s || !/^https?:\/\/\S+$/i.test(s)) return null;
  try {
    return new URL(s).hostname ? s : null;
  } catch {
    return null;
  }
}

export function normalizeStatus(v: unknown): AppStatus {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return isStatus(s) ? s : 'saved';
}

function normalizeAppJob(raw: unknown): AppJob {
  const r = asObject(raw);
  return {
    id: idOf(r.id) ?? '',
    title: textOr(r.title),
    company: textOr(r.company),
    source_url: safeLink(r.source_url),
    location: strOrNull(r.location),
    created_at: textOr(r.created_at),
  };
}

export function normalizeDocRef(raw: unknown): DocRef | null {
  const r = asObject(raw);
  const id = idOf(r.id);
  if (!id || (r.type !== 'resume' && r.type !== 'cover_letter')) return null;
  return { id, type: r.type, template: strOrNull(r.template), created_at: textOr(r.created_at) };
}

function normalizeDocRefs(raw: unknown): DocRef[] {
  return Array.isArray(raw) ? raw.map(normalizeDocRef).filter((d): d is DocRef => d !== null) : [];
}

function summaryFields(r: Record<string, unknown>, id: string): Omit<ApplicationSummary, 'job' | 'match'> {
  return {
    id,
    status: normalizeStatus(r.status),
    applied_at: dateOrNull(r.applied_at),
    follow_up_at: dateOrNull(r.follow_up_at),
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes : null,
    created_at: textOr(r.created_at),
    updated_at: textOr(r.updated_at),
    documents: normalizeDocRefs(r.documents),
  };
}

/** One row of the list. Returns null when it has no id (it could not be opened or changed). */
export function normalizeApplicationSummary(raw: unknown): ApplicationSummary | null {
  const r = asObject(raw);
  const id = idOf(r.id);
  if (!id) return null;
  const m = isObject(r.match) ? r.match : null;
  return {
    ...summaryFields(r, id),
    job: normalizeAppJob(r.job),
    match: m ? { score: normalizeScore(m.score), gaps_count: count(m.gaps_count, strList(m.gaps).length) } : null,
  };
}

export function normalizeApplicationList(raw: unknown): ApplicationSummary[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ApplicationSummary[] = [];
  for (const item of raw) {
    const a = normalizeApplicationSummary(item);
    if (a && !seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

function storedDoc<T>(raw: unknown, clean: (content: unknown) => T): StoredDoc<T> | null {
  const r = asObject(raw);
  const id = idOf(r.id);
  if (!id) return null;
  return { id, template: strOrNull(r.template), created_at: textOr(r.created_at), content: clean(r.content) };
}

/** The full application. Returns null when it has no id. */
export function normalizeApplicationDetail(raw: unknown): ApplicationDetail | null {
  const r = asObject(raw);
  const id = idOf(r.id);
  if (!id) return null;
  const j = asObject(r.job);
  const m = isObject(r.match) ? r.match : null;
  const gaps = m ? strList(m.gaps) : [];
  const src = asObject(r.source_resume);
  const srcId = idOf(src.id);
  return {
    ...summaryFields(r, id),
    job: {
      ...normalizeAppJob(j),
      parsed: isObject(j.parsed) ? normalizeParsedJob(j.parsed) : null,
      raw_text: typeof j.raw_text === 'string' ? j.raw_text : '',
    },
    match: m
      ? {
        score: normalizeScore(m.score),
        gaps_count: count(m.gaps_count, gaps.length),
        matched: strList(m.matched),
        gaps,
        warnings: strList(m.warnings),
      }
      : null,
    resume: storedDoc(r.resume, normalizeTailoredResume),
    cover_letter: storedDoc(r.cover_letter, normalizeCoverLetter),
    source_resume: srcId ? { id: srcId, file_name: textOr(src.file_name) || 'Resume' } : null,
  };
}

/** The part of a detail that the list shows (used to keep the list in step with the detail screen). */
export function summaryOf(d: ApplicationDetail): ApplicationSummary {
  return {
    id: d.id,
    status: d.status,
    applied_at: d.applied_at,
    follow_up_at: d.follow_up_at,
    notes: d.notes,
    created_at: d.created_at,
    updated_at: d.updated_at,
    job: {
      id: d.job.id, title: d.job.title, company: d.job.company, source_url: d.job.source_url,
      location: d.job.location, created_at: d.job.created_at,
    },
    match: d.match ? { score: d.match.score, gaps_count: d.match.gaps_count } : null,
    documents: d.documents,
  };
}

/** What JobMatchSummary needs. */
export const matchResultOf = (m: AppMatchDetail): MatchResult => ({ score: m.score, matched: m.matched, gaps: m.gaps });

/** The newest document of a type ("resume" or "cover_letter"), or null. */
export function docOf(documents: readonly DocRef[], type: DocType): DocRef | null {
  let best: DocRef | null = null;
  for (const d of documents) {
    if (d.type !== type) continue;
    if (!best || parseDate(d.created_at) > parseDate(best.created_at)) best = d;
  }
  return best;
}

/** The document id to download for the detail screen: the shown document, else the newest in the list. */
export function detailDocId(d: ApplicationDetail, type: DocType): string | null {
  const shown = type === 'resume' ? d.resume : d.cover_letter;
  return shown?.id ?? docOf(d.documents, type)?.id ?? null;
}

// ---------- Filtering, sorting and counting ----------

export type SortKey = 'newest' | 'score' | 'company';
export const SORTS: readonly { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'score', label: 'Match score' },
  { id: 'company', label: 'Company A–Z' },
];
export const isSortKey = (v: unknown): v is SortKey => SORTS.some((s) => s.id === v);

export type StatusCounts = Record<StatusFilter, number>;

export function countByStatus(list: readonly ApplicationSummary[]): StatusCounts {
  const counts = { all: list.length } as StatusCounts;
  for (const s of STATUSES) counts[s] = 0;
  for (const a of list) counts[a.status] += 1;
  return counts;
}

/** Search in the job title and company, ignoring case and extra spaces. */
export function matchesQuery(a: ApplicationSummary, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${a.job.title} ${a.job.company}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function filterApplications(
  list: readonly ApplicationSummary[],
  status: StatusFilter,
  query: string,
): ApplicationSummary[] {
  return list.filter((a) => (status === 'all' || a.status === status) && matchesQuery(a, query));
}

const compareText = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** A new sorted list. Newest = date saved, newest first. Rows without a score or company go last. */
export function sortApplications(list: readonly ApplicationSummary[], sort: SortKey): ApplicationSummary[] {
  const newest = (a: ApplicationSummary, b: ApplicationSummary) => timeOf(b.created_at) - timeOf(a.created_at);
  const rows = list.map((a, i) => ({ a, i }));
  rows.sort((x, y) => {
    const a = x.a;
    const b = y.a;
    let d = 0;
    if (sort === 'score') {
      const sa = a.match?.score ?? null;
      const sb = b.match?.score ?? null;
      if (sa === null || sb === null) d = sa === sb ? 0 : sa === null ? 1 : -1;
      else d = sb - sa;
    } else if (sort === 'company') {
      const ca = a.job.company.trim();
      const cb = b.job.company.trim();
      if (!ca || !cb) d = ca === cb ? 0 : !ca ? 1 : -1;
      else d = compareText(ca, cb) || compareText(a.job.title, b.job.title);
    }
    return d || newest(a, b) || x.i - y.i;
  });
  return rows.map((r) => r.a);
}

export const visibleApplications = (
  list: readonly ApplicationSummary[],
  status: StatusFilter,
  query: string,
  sort: SortKey,
): ApplicationSummary[] => sortApplications(filterApplications(list, status, query), sort);

// ---------- Showing values ----------

export const appTitle = (a: { job: Pick<AppJob, 'title'> }): string => a.job.title.trim() || 'Untitled job';
export const appCompany = (a: { job: Pick<AppJob, 'company'> }): string => a.job.company.trim() || 'Company not set';
/** "Acme · Berlin" (the location only when known). */
export const appCompanyLine = (a: { job: Pick<AppJob, 'company' | 'location'> }): string =>
  [appCompany(a), a.job.location].filter(Boolean).join(' · ');

/** "78%" or "" when there is no score. */
export const scoreText = (score: number | null | undefined): string =>
  (typeof score === 'number' ? `${score}%` : '');

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milliseconds for an ISO date or timestamp. A plain "2026-03-12" is read as that day here (not in UTC). */
function parseDate(iso: string): number {
  const m = DATE_ONLY.exec(iso.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return iso ? new Date(iso).getTime() : NaN;
}

const timeOf = (iso: string): number => {
  const t = parseDate(iso);
  return Number.isNaN(t) ? -Infinity : t;
};

/** "12 Mar 2026", or '' when the date is missing or unreadable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = parseDate(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The date column: when the user applied, else when the job was saved. */
export function appDate(a: Pick<ApplicationSummary, 'applied_at' | 'created_at'>): { kind: 'Applied' | 'Saved'; date: string } {
  const applied = formatDate(a.applied_at);
  return applied ? { kind: 'Applied', date: applied } : { kind: 'Saved', date: formatDate(a.created_at) };
}

/** "Applied 12 Mar 2026" / "Saved 10 Mar 2026" ('' when there is no readable date). */
export function appDateLabel(a: Pick<ApplicationSummary, 'applied_at' | 'created_at'>): string {
  const { kind, date } = appDate(a);
  return date ? `${kind} ${date}` : '';
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** For ion-datetime: the saved timestamp as "YYYY-MM-DD" in the user's own time zone, or null. */
export function toDateInput(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = parseDate(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * From ion-datetime ("2026-03-12" or "2026-03-12T09:30:00") to the timestamp we save.
 * Noon on that day in the user's time zone, so the date stays the same wherever it is shown.
 */
export function fromDateInput(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const MAX_NOTES_CHARS = 2000;

/** What PATCH sends for the notes box: trimmed, or null when empty. */
export function cleanNotes(text: string): string | null {
  const t = text.trim();
  return t ? t.slice(0, MAX_NOTES_CHARS) : null;
}

export const DOC_LABEL: Record<DocType, string> = { resume: 'Resume', cover_letter: 'Cover letter' };
export const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', docx: 'DOCX' };

// ---------- Downloads ----------

export interface ExportedFile {
  url: string;
  file_name: string;
  expires_in: number;
}

/** The POST /documents/{id}/export answer, or null when it has no usable link. */
export function normalizeExport(raw: unknown, fallbackName: string): ExportedFile | null {
  const r = asObject(raw);
  const url = safeLink(r.url);
  if (!url) return null;
  const name = textOr(r.file_name).replace(/[\\/:*?"<>|]+/g, '-');
  return { url, file_name: name || fallbackName, expires_in: count(r.expires_in, 0) };
}

/** "resume.pdf" / "cover-letter.docx" when the server sends no file name. */
export const fallbackFileName = (type: DocType, format: ExportFormat): string =>
  `${type === 'resume' ? 'resume' : 'cover-letter'}.${format}`;

// ---------- Friendly errors ----------

export type TrackerAction = 'list' | 'detail' | 'save' | 'delete' | 'download';

const VERB: Record<TrackerAction, string> = {
  list: 'load your applications',
  detail: 'load this application',
  save: 'save your changes',
  delete: 'delete this application',
  download: 'prepare the download',
};

const OFFLINE = 'We could not reach the server. Please check your internet connection and try again.';

/** Turns a failure into a short, kind sentence. Never shows raw error text. */
export function friendlyTrackerError(e: unknown, action: TrackerAction): string {
  const err = readApiError(e);
  if (err) {
    const { status, detail } = err;
    if (status === 401 || status === 403) return 'Your session has ended. Please log in again.';
    if (status === 404) {
      if (action === 'list') return 'The Tracker is not available on the server yet. Please try again later.';
      if (action === 'delete') return 'That application was already deleted.';
      if (action === 'download') return detail || 'We could not find that document. It may have been deleted.';
      return 'We could not find this application. It may have been deleted.';
    }
    if (status === 422 || status === 400) return detail || 'Some details are not valid. Please check them and try again.';
    if (status === 429) return detail || 'Too many tries. Please wait a minute and try again.';
    if (status === 503) {
      if (detail) return detail;
      return action === 'download' ? 'Downloads are not set up yet on the server.' : 'This is not set up yet on the server.';
    }
    if (status >= 500) return 'The server had a problem. Please try again in a moment.';
    return `We could not ${VERB[action]}. Please try again.`;
  }
  if (e instanceof TypeError) return OFFLINE;
  return `We could not ${VERB[action]}. Please try again.`;
}

/** True when the error means "this application does not exist (any more)". */
export const isNotFound = (e: unknown): boolean => readApiError(e)?.status === 404;
