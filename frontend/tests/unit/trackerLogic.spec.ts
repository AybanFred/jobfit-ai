import { describe, expect, it, vi } from 'vitest';

// trackerLogic is pure, but jobsLogic imports a helper from resumeImport, which pulls in the Supabase client.
vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import {
  FILTERS, MAX_NOTES_CHARS, STATUSES, appCompany, appCompanyLine, appDate, appDateLabel, appTitle, cleanNotes,
  countByStatus, detailDocId, docOf, fallbackFileName, filterApplications, filterLabel, formatDate,
  friendlyTrackerError, fromDateInput, isNotFound, isSortKey, isStatus, isStatusFilter, matchResultOf, matchesQuery,
  normalizeApplicationDetail, normalizeApplicationList, normalizeApplicationSummary, normalizeDocRef, normalizeExport,
  normalizeStatus, safeLink, scoreText, sortApplications, statusColor, statusLabel, summaryOf, toDateInput,
  visibleApplications, type ApplicationSummary,
} from '@/services/trackerLogic';

const row = (over: Record<string, unknown> = {}, job: Record<string, unknown> = {}) => normalizeApplicationSummary({
  id: 'a1',
  status: 'saved',
  applied_at: null,
  follow_up_at: null,
  notes: null,
  created_at: '2026-03-12T10:00:00Z',
  updated_at: '2026-03-12T10:00:00Z',
  job: { id: 'j1', title: 'Frontend Developer', company: 'Acme', source_url: null, location: 'Berlin', created_at: '2026-03-12T10:00:00Z', ...job },
  match: { score: 70, gaps_count: 2 },
  documents: [],
  ...over,
})!;

describe('status names and colours', () => {
  it('has six statuses in order with Ionic colour names', () => {
    expect(STATUSES).toEqual(['saved', 'applied', 'interview', 'offer', 'rejected', 'ghosted']);
    expect(STATUSES.map(statusColor)).toEqual(['medium', 'primary', 'tertiary', 'success', 'danger', 'warning']);
    expect(STATUSES.map(statusLabel)).toEqual(['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Ghosted']);
  });

  it('has an "All" filter first and checks values', () => {
    expect(FILTERS[0]).toBe('all');
    expect(filterLabel('all')).toBe('All');
    expect(filterLabel('offer')).toBe('Offer');
    expect(isStatus('interview')).toBe(true);
    expect(isStatus('all')).toBe(false);
    expect(isStatusFilter('all')).toBe(true);
    expect(isStatusFilter('nope')).toBe(false);
    expect(isSortKey('score')).toBe(true);
    expect(isSortKey('oldest')).toBe(false);
  });

  it('reads unknown or oddly written statuses safely', () => {
    expect(normalizeStatus(' Applied ')).toBe('applied');
    expect(normalizeStatus('archived')).toBe('saved');
    expect(normalizeStatus(3)).toBe('saved');
  });
});

describe('safeLink', () => {
  it('keeps only real web links', () => {
    expect(safeLink(' https://jobs.example.com/1 ')).toBe('https://jobs.example.com/1');
    expect(safeLink('http://x.io')).toBe('http://x.io');
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('ftp://x.io')).toBeNull();
    expect(safeLink('https://')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});

describe('normalizeApplicationSummary', () => {
  it('keeps a good row', () => {
    const a = row({
      status: 'interview',
      applied_at: '2026-03-14T09:00:00Z',
      notes: 'Call Sam',
      documents: [{ id: 'd1', type: 'resume', template: 'harvard', created_at: '2026-03-12T10:00:00Z' }],
    }, { source_url: 'https://jobs.example.com/1' });
    expect(a.id).toBe('a1');
    expect(a.status).toBe('interview');
    expect(a.applied_at).toBe('2026-03-14T09:00:00Z');
    expect(a.notes).toBe('Call Sam');
    expect(a.job.source_url).toBe('https://jobs.example.com/1');
    expect(a.job.location).toBe('Berlin');
    expect(a.match).toEqual({ score: 70, gaps_count: 2 });
    expect(a.documents).toEqual([{ id: 'd1', type: 'resume', template: 'harvard', created_at: '2026-03-12T10:00:00Z' }]);
  });

  it('cleans missing and wrong values', () => {
    const a = normalizeApplicationSummary({
      id: 7,
      status: 'weird',
      applied_at: 'not a date',
      notes: '   ',
      job: { title: null, company: 3, source_url: 'javascript:alert(1)', location: '' },
      match: { score: 0.82, gaps_count: 'x', gaps: ['Go', 'Rust'] },
      documents: [{ id: 'd1', type: 'photo' }, { type: 'resume' }, { id: 'd2', type: 'cover_letter' }, 'junk'],
    })!;
    expect(a.id).toBe('7');
    expect(a.status).toBe('saved');
    expect(a.applied_at).toBeNull();
    expect(a.notes).toBeNull();
    expect(a.job).toMatchObject({ id: '', title: '', company: '', source_url: null, location: null });
    expect(a.match).toEqual({ score: 82, gaps_count: 2 });
    expect(a.documents.map((d) => d.id)).toEqual(['d2']);
  });

  it('allows a row without a match or job, and rejects a row without an id', () => {
    const a = normalizeApplicationSummary({ id: 'x', match: null })!;
    expect(a.match).toBeNull();
    expect(appTitle(a)).toBe('Untitled job');
    expect(appCompany(a)).toBe('Company not set');
    expect(normalizeApplicationSummary({ status: 'saved' })).toBeNull();
    expect(normalizeApplicationSummary(null)).toBeNull();
  });

  it('reads document references strictly', () => {
    expect(normalizeDocRef({ id: 'd', type: 'resume' })).toEqual({ id: 'd', type: 'resume', template: null, created_at: '' });
    expect(normalizeDocRef({ id: 'd', type: 'letter' })).toBeNull();
  });
});

describe('normalizeApplicationList', () => {
  it('drops rows without an id and duplicates, and tolerates a non-list', () => {
    expect(normalizeApplicationList({ not: 'a list' })).toEqual([]);
    const list = normalizeApplicationList([{ id: 'a' }, { title: 'no id' }, { id: 'b' }, { id: 'a' }]);
    expect(list.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('normalizeApplicationDetail', () => {
  const raw = {
    id: 'a1',
    status: 'applied',
    applied_at: '2026-03-14T09:00:00Z',
    follow_up_at: '2026-03-21T12:00:00Z',
    notes: 'Recruiter: Sam',
    created_at: '2026-03-12T10:00:00Z',
    updated_at: '2026-03-14T09:00:00Z',
    job: {
      id: 'j1', title: 'Dev', company: 'Acme', source_url: 'https://jobs.example.com/1', location: 'Remote',
      created_at: '2026-03-12T10:00:00Z', raw_text: 'Full post text', parsed: { title: 'Dev', required_skills: ['Vue', 'vue', 'Go'] },
    },
    match: { score: 78, matched: ['Vue'], gaps: ['Go'], warnings: ['Check the 12% number.'] },
    documents: [
      { id: 'r1', type: 'resume', created_at: '2026-03-12T10:00:00Z' },
      { id: 'c1', type: 'cover_letter', created_at: '2026-03-12T10:00:00Z' },
    ],
    resume: { id: 'r1', template: 'harvard', created_at: '2026-03-12T10:00:00Z', content: { header: { name: 'Ana' } } },
    cover_letter: { id: 'c1', template: null, created_at: '2026-03-12T10:00:00Z', content: { greeting: 'Dear team,', paragraphs: ['Hi.', 7] } },
    source_resume: { id: 's1', file_name: 'cv.pdf' },
  };

  it('keeps everything the detail screen shows', () => {
    const d = normalizeApplicationDetail(raw)!;
    expect(d.status).toBe('applied');
    expect(d.job.raw_text).toBe('Full post text');
    expect(d.job.parsed?.required_skills).toEqual(['Vue', 'Go']);
    expect(d.match).toEqual({ score: 78, gaps_count: 1, matched: ['Vue'], gaps: ['Go'], warnings: ['Check the 12% number.'] });
    expect(d.resume?.content.header.name).toBe('Ana');
    expect(d.resume?.template).toBe('harvard');
    expect(d.cover_letter?.content.paragraphs).toEqual(['Hi.']);
    expect(d.source_resume).toEqual({ id: 's1', file_name: 'cv.pdf' });
    expect(matchResultOf(d.match!)).toEqual({ score: 78, matched: ['Vue'], gaps: ['Go'] });
  });

  it('copes with missing parts', () => {
    const d = normalizeApplicationDetail({ id: 'a2', job: { parsed: 'x' }, match: null, resume: { content: {} }, source_resume: {} })!;
    expect(d.job.parsed).toBeNull();
    expect(d.job.raw_text).toBe('');
    expect(d.match).toBeNull();
    expect(d.resume).toBeNull(); // no id
    expect(d.cover_letter).toBeNull();
    expect(d.source_resume).toBeNull();
    expect(normalizeApplicationDetail([])).toBeNull();
  });

  it('gives the list row for a detail', () => {
    const d = normalizeApplicationDetail(raw)!;
    const s = summaryOf(d);
    expect(s).toEqual(normalizeApplicationSummary({ ...raw, match: { score: 78, gaps_count: 1 } }));
  });

  it('finds the document to download', () => {
    const d = normalizeApplicationDetail(raw)!;
    expect(detailDocId(d, 'resume')).toBe('r1');
    const noContent = normalizeApplicationDetail({ ...raw, resume: null, cover_letter: null })!;
    expect(detailDocId(noContent, 'cover_letter')).toBe('c1');
    expect(detailDocId(normalizeApplicationDetail({ id: 'z' })!, 'resume')).toBeNull();
  });
});

describe('docOf', () => {
  it('picks the newest document of a type', () => {
    const docs = [
      { id: 'old', type: 'resume' as const, template: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'new', type: 'resume' as const, template: null, created_at: '2026-05-01T00:00:00Z' },
      { id: 'cl', type: 'cover_letter' as const, template: null, created_at: '2026-02-01T00:00:00Z' },
    ];
    expect(docOf(docs, 'resume')?.id).toBe('new');
    expect(docOf(docs, 'cover_letter')?.id).toBe('cl');
    expect(docOf([], 'resume')).toBeNull();
  });
});

describe('counting, search, filter and sort', () => {
  const list: ApplicationSummary[] = [
    row({ id: 'a', status: 'applied', created_at: '2026-03-01T00:00:00Z', match: { score: 40 } }, { title: 'Backend Engineer', company: 'Zeta' }),
    row({ id: 'b', status: 'saved', created_at: '2026-03-05T00:00:00Z', match: null }, { title: 'Frontend Developer', company: 'acme' }),
    row({ id: 'c', status: 'applied', created_at: '2026-03-03T00:00:00Z', match: { score: 90 } }, { title: 'Data Analyst', company: '' }),
    row({ id: 'd', status: 'offer', created_at: '2026-03-02T00:00:00Z', match: { score: 90 } }, { title: 'Vue Developer', company: 'Beta' }),
  ];

  it('counts every status and the total', () => {
    expect(countByStatus(list)).toEqual({ all: 4, saved: 1, applied: 2, interview: 0, offer: 1, rejected: 0, ghosted: 0 });
    expect(countByStatus([]).all).toBe(0);
  });

  it('searches title and company, any case, all words', () => {
    expect(matchesQuery(list[1], 'ACME')).toBe(true);
    expect(matchesQuery(list[1], 'frontend acme')).toBe(true);
    expect(matchesQuery(list[1], 'frontend zeta')).toBe(false);
    expect(matchesQuery(list[1], '   ')).toBe(true);
    expect(filterApplications(list, 'all', 'developer').map((a) => a.id)).toEqual(['b', 'd']);
    expect(filterApplications(list, 'applied', '').map((a) => a.id)).toEqual(['a', 'c']);
    expect(filterApplications(list, 'applied', 'data').map((a) => a.id)).toEqual(['c']);
  });

  it('sorts by newest first', () => {
    expect(sortApplications(list, 'newest').map((a) => a.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('sorts by match score, ties newest first, no score last', () => {
    expect(sortApplications(list, 'score').map((a) => a.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('sorts by company A–Z ignoring case, blank company last', () => {
    expect(sortApplications(list, 'company').map((a) => a.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('does not change the original list', () => {
    const ids = list.map((a) => a.id);
    sortApplications(list, 'company');
    expect(list.map((a) => a.id)).toEqual(ids);
  });

  it('filters and sorts together', () => {
    expect(visibleApplications(list, 'applied', '', 'score').map((a) => a.id)).toEqual(['c', 'a']);
  });
});

describe('showing values', () => {
  it('builds the company line and score text', () => {
    expect(appCompanyLine(row())).toBe('Acme · Berlin');
    expect(appCompanyLine(row({}, { location: null, company: '' }))).toBe('Company not set');
    expect(scoreText(78)).toBe('78%');
    expect(scoreText(0)).toBe('0%');
    expect(scoreText(null)).toBe('');
    expect(scoreText(undefined)).toBe('');
  });

  it('formats dates and survives bad ones', () => {
    expect(formatDate('2026-03-12T10:00:00Z')).toMatch(/12 Mar 2026/);
    expect(formatDate('2026-03-12')).toBe('12 Mar 2026'); // a plain day is that day everywhere
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate('soon')).toBe('');
  });

  it('shows the applied date when there is one, else the saved date', () => {
    expect(appDate({ applied_at: '2026-03-14', created_at: '2026-03-12' })).toEqual({ kind: 'Applied', date: '14 Mar 2026' });
    expect(appDateLabel({ applied_at: null, created_at: '2026-03-12' })).toBe('Saved 12 Mar 2026');
    expect(appDateLabel({ applied_at: null, created_at: '' })).toBe('');
  });
});

describe('date fields', () => {
  it('turns a saved timestamp into the calendar day and back (noon, local time)', () => {
    const iso = fromDateInput('2026-03-12')!;
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(12);
    expect(toDateInput(iso)).toBe('2026-03-12');
  });

  it('accepts ion-datetime values with a time part or in a list', () => {
    expect(toDateInput(fromDateInput('2026-11-02T08:15:00'))).toBe('2026-11-02');
    expect(toDateInput(fromDateInput(['2026-01-31']))).toBe('2026-01-31');
  });

  it('treats empty or bad input as "no date"', () => {
    expect(fromDateInput(undefined)).toBeNull();
    expect(fromDateInput('')).toBeNull();
    expect(fromDateInput('12/03/2026')).toBeNull();
    expect(toDateInput(null)).toBeNull();
    expect(toDateInput('nope')).toBeNull();
    expect(toDateInput('2026-03-12')).toBe('2026-03-12');
  });
});

describe('notes', () => {
  it('trims, empties to null and keeps the limit', () => {
    expect(cleanNotes('  Call Sam  ')).toBe('Call Sam');
    expect(cleanNotes('   ')).toBeNull();
    expect(cleanNotes('x'.repeat(MAX_NOTES_CHARS + 10))).toHaveLength(MAX_NOTES_CHARS);
  });
});

describe('normalizeExport', () => {
  it('keeps a usable link and a safe file name', () => {
    expect(normalizeExport({ url: 'https://files.example.com/a?token=1', file_name: 'Ana/Lee: CV.pdf', expires_in: 60 }, 'resume.pdf'))
      .toEqual({ url: 'https://files.example.com/a?token=1', file_name: 'Ana-Lee- CV.pdf', expires_in: 60 });
  });

  it('uses a fallback name and rejects answers without a web link', () => {
    expect(normalizeExport({ url: 'https://f.example.com/x' }, fallbackFileName('cover_letter', 'docx'))?.file_name).toBe('cover-letter.docx');
    expect(fallbackFileName('resume', 'pdf')).toBe('resume.pdf');
    expect(normalizeExport({ url: 'javascript:alert(1)' }, 'x.pdf')).toBeNull();
    expect(normalizeExport(null, 'x.pdf')).toBeNull();
  });
});

describe('friendlyTrackerError', () => {
  const api = (s: number, body = '') => new Error(`API ${s}: ${body}`);

  it('explains session problems', () => {
    expect(friendlyTrackerError(api(401), 'list')).toBe('Your session has ended. Please log in again.');
  });

  it('explains "not found" for each action', () => {
    expect(friendlyTrackerError(api(404), 'list')).toMatch(/not available on the server yet/);
    expect(friendlyTrackerError(api(404), 'detail')).toMatch(/could not find this application/);
    expect(friendlyTrackerError(api(404), 'delete')).toBe('That application was already deleted.');
    expect(friendlyTrackerError(api(404), 'download')).toMatch(/could not find that document/);
    expect(isNotFound(api(404))).toBe(true);
    expect(isNotFound(api(500))).toBe(false);
  });

  it('uses a friendly backend sentence for 422 and 503', () => {
    expect(friendlyTrackerError(api(422, '{"detail":"Notes can be at most 2000 characters."}'), 'save')).toBe('Notes can be at most 2000 characters.');
    expect(friendlyTrackerError(api(422, '{"detail":[{"msg":"x"}]}'), 'save')).toMatch(/not valid/);
    expect(friendlyTrackerError(api(503), 'download')).toMatch(/Downloads are not set up/);
    expect(friendlyTrackerError(api(503, '{"detail":"PDF export is not set up on the server."}'), 'download')).toBe('PDF export is not set up on the server.');
  });

  it('never leaks raw text and handles offline and unknown errors', () => {
    expect(friendlyTrackerError(api(500, 'secret stack'), 'save')).not.toMatch(/secret/);
    expect(friendlyTrackerError(new TypeError('Failed to fetch'), 'list')).toMatch(/internet connection/);
    expect(friendlyTrackerError(new Error('weird'), 'save')).toBe('We could not save your changes. Please try again.');
    expect(friendlyTrackerError(api(418), 'delete')).toBe('We could not delete this application. Please try again.');
  });
});
