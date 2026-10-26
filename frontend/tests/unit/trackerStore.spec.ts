import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// The store talks to the backend only through these modules, so we replace them.
vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('@/services/applications', () => ({
  listApplications: vi.fn(), getApplication: vi.fn(), updateApplication: vi.fn(), deleteApplication: vi.fn(),
}));
vi.mock('@/services/documents', () => ({ downloadDocument: vi.fn() }));
vi.mock('@/services/feedback', () => ({ showToast: vi.fn(), confirmAction: vi.fn() }));
vi.mock('@/services/haptics', () => ({ tapHaptic: vi.fn() }));

import * as appsSvc from '@/services/applications';
import * as docsSvc from '@/services/documents';
import { confirmAction, showToast } from '@/services/feedback';
import { useTrackerStore } from '@/stores/tracker';
import {
  normalizeApplicationDetail, normalizeApplicationSummary, type ApplicationDetail, type ApplicationSummary,
} from '@/services/trackerLogic';

const apps = vi.mocked(appsSvc);
const docs = vi.mocked(docsSvc);

const summary = (id: string, over: Record<string, unknown> = {}): ApplicationSummary => normalizeApplicationSummary({
  id,
  status: 'saved',
  created_at: '2026-03-12T10:00:00Z',
  updated_at: '2026-03-12T10:00:00Z',
  job: { id: `j-${id}`, title: `Job ${id}`, company: 'Acme' },
  match: { score: 60, gaps_count: 1 },
  documents: [{ id: `r-${id}`, type: 'resume' }],
  ...over,
})!;

const detail = (id: string, over: Record<string, unknown> = {}): ApplicationDetail => normalizeApplicationDetail({
  id,
  status: 'saved',
  created_at: '2026-03-12T10:00:00Z',
  updated_at: '2026-03-12T10:00:00Z',
  job: { id: `j-${id}`, title: `Job ${id}`, company: 'Acme', raw_text: 'text', parsed: null },
  match: { score: 60, matched: ['Vue'], gaps: ['Go'], warnings: [] },
  documents: [{ id: `r-${id}`, type: 'resume' }],
  resume: { id: `r-${id}`, content: { header: { name: 'Ana' } } },
  cover_letter: null,
  source_resume: null,
  ...over,
})!;

/** A promise we can settle from the test. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function loaded(list: ApplicationSummary[]) {
  apps.listApplications.mockResolvedValue(list);
  const s = useTrackerStore();
  await s.loadList();
  return s;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

afterEach(() => {
  useTrackerStore().reset(); // clears the module-level undo data between tests
});

describe('tracker store: list', () => {
  it('loads (loading then ready)', async () => {
    apps.listApplications.mockResolvedValue([summary('a'), summary('b')]);
    const s = useTrackerStore();
    const p = s.loadList();
    expect(s.listStatus).toBe('loading');
    await p;
    expect(s.listStatus).toBe('ready');
    expect(s.items.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('an empty list is a normal ready state', async () => {
    const s = await loaded([]);
    expect(s.listStatus).toBe('ready');
    expect(s.visible).toEqual([]);
    expect(s.counts.all).toBe(0);
  });

  it('shows an error state when the first load fails, and recovers on retry', async () => {
    apps.listApplications.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const s = useTrackerStore();
    await s.loadList();
    expect(s.listStatus).toBe('error');
    expect(s.listError).toMatch(/internet connection/);
    apps.listApplications.mockResolvedValue([summary('a')]);
    await s.loadList();
    expect(s.listStatus).toBe('ready');
    expect(s.listError).toBe('');
  });

  it('keeps the visible rows when a refresh fails', async () => {
    const s = await loaded([summary('a')]);
    apps.listApplications.mockRejectedValueOnce(new Error('API 500: x'));
    await s.loadList();
    expect(s.listStatus).toBe('ready');
    expect(s.items).toHaveLength(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/server had a problem/), 'error');
  });

  it('ignores an older answer that arrives after a newer one', async () => {
    const first = deferred<ApplicationSummary[]>();
    apps.listApplications.mockReturnValueOnce(first.promise).mockResolvedValueOnce([summary('new')]);
    const s = useTrackerStore();
    const p1 = s.loadList();
    await s.loadList();
    first.resolve([summary('old')]);
    await p1;
    expect(s.items.map((a) => a.id)).toEqual(['new']);
  });
});

describe('tracker store: filter, search and sort', () => {
  it('counts, filters and sorts the rows', async () => {
    const s = await loaded([
      summary('a', { status: 'applied', match: { score: 30 }, created_at: '2026-03-01T00:00:00Z' }),
      summary('b', { status: 'saved', match: { score: 90 }, created_at: '2026-03-03T00:00:00Z' }),
      summary('c', { status: 'applied', match: { score: 70 }, created_at: '2026-03-02T00:00:00Z', job: { title: 'Data Analyst', company: 'Zeta' } }),
    ]);
    expect(s.counts).toMatchObject({ all: 3, saved: 1, applied: 2, offer: 0 });
    expect(s.visible.map((a) => a.id)).toEqual(['b', 'c', 'a']);
    s.setFilter('applied');
    expect(s.visible.map((a) => a.id)).toEqual(['c', 'a']);
    expect(s.isFiltered).toBe(true);
    s.setSort('score');
    expect(s.visible.map((a) => a.id)).toEqual(['c', 'a']);
    s.setQuery('zeta');
    expect(s.visible.map((a) => a.id)).toEqual(['c']);
    s.clearFilters();
    expect(s.filter).toBe('all');
    expect(s.query).toBe('');
    expect(s.isFiltered).toBe(false);
  });

  it('ignores unknown filters and sort keys', () => {
    const s = useTrackerStore();
    s.setFilter('archived');
    s.setSort('oldest');
    expect(s.filter).toBe('all');
    expect(s.sort).toBe('newest');
  });
});

describe('tracker store: status changes', () => {
  it('shows the new status at once and then takes the server row (with applied_at)', async () => {
    const s = await loaded([summary('a')]);
    const answer = deferred<ApplicationSummary | null>();
    apps.updateApplication.mockReturnValue(answer.promise);
    const p = s.changeStatus('a', 'applied');
    expect(s.items[0].status).toBe('applied');
    expect(s.saving.a).toBe(1);
    expect(apps.updateApplication).toHaveBeenCalledWith('a', { status: 'applied' });
    answer.resolve(summary('a', { status: 'applied', applied_at: '2026-03-14T09:00:00Z' }));
    expect(await p).toBe(true);
    expect(s.items[0].status).toBe('applied');
    expect(s.items[0].applied_at).toBe('2026-03-14T09:00:00Z');
    expect(s.saving.a).toBeUndefined();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('undoes the change and shows a message when saving fails', async () => {
    const s = await loaded([summary('a')]);
    apps.updateApplication.mockRejectedValue(new Error('API 500: x'));
    expect(await s.changeStatus('a', 'offer')).toBe(false);
    expect(s.items[0].status).toBe('saved');
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/server had a problem/), 'error');
  });

  it('does nothing when the status is the same', async () => {
    const s = await loaded([summary('a')]);
    expect(await s.changeStatus('a', 'saved')).toBe(true);
    expect(apps.updateApplication).not.toHaveBeenCalled();
  });

  it('a failed older change does not undo a newer one', async () => {
    const s = await loaded([summary('a')]);
    const first = deferred<ApplicationSummary | null>();
    const second = deferred<ApplicationSummary | null>();
    apps.updateApplication.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const p1 = s.changeStatus('a', 'applied');
    const p2 = s.changeStatus('a', 'interview');
    first.reject(new Error('API 500: x'));
    await p1;
    expect(s.items[0].status).toBe('interview');
    second.resolve(summary('a', { status: 'interview' }));
    await p2;
    expect(s.items[0].status).toBe('interview');
  });

  it('a failed newer change goes back to what the server confirmed', async () => {
    const s = await loaded([summary('a')]);
    const first = deferred<ApplicationSummary | null>();
    const second = deferred<ApplicationSummary | null>();
    apps.updateApplication.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const p1 = s.changeStatus('a', 'applied');
    const p2 = s.changeStatus('a', 'interview');
    first.resolve(summary('a', { status: 'applied' }));
    await p1;
    expect(s.items[0].status).toBe('interview'); // the newer change is still on screen
    second.reject(new Error('API 500: x'));
    await p2;
    expect(s.items[0].status).toBe('applied');
  });

  it('a list refresh during a save does not hide the change', async () => {
    const s = await loaded([summary('a')]);
    const answer = deferred<ApplicationSummary | null>();
    apps.updateApplication.mockReturnValue(answer.promise);
    const p = s.changeStatus('a', 'offer');
    apps.listApplications.mockResolvedValue([summary('a', { status: 'saved' })]);
    await s.loadList();
    expect(s.items[0].status).toBe('offer');
    answer.resolve(summary('a', { status: 'offer' }));
    await p;
    expect(s.items[0].status).toBe('offer');
  });
});

describe('tracker store: saving from the detail screen', () => {
  it('updates both the cached detail and the list row, and returns no message', async () => {
    const s = await loaded([summary('a')]);
    apps.getApplication.mockResolvedValue(detail('a'));
    await s.loadDetail('a');
    apps.updateApplication.mockResolvedValue(summary('a', { notes: 'Call Sam', follow_up_at: '2026-03-20T12:00:00Z' }));
    const message = await s.patchApplication('a', { notes: 'Call Sam', follow_up_at: '2026-03-20T12:00:00Z' });
    expect(message).toBe('');
    expect(s.details.a.notes).toBe('Call Sam');
    expect(s.details.a.follow_up_at).toBe('2026-03-20T12:00:00Z');
    expect(s.items[0].notes).toBe('Call Sam');
    expect(showToast).not.toHaveBeenCalled(); // the detail screen shows its own message
  });

  it('returns a friendly message and undoes the change on failure', async () => {
    const s = useTrackerStore();
    apps.getApplication.mockResolvedValue(detail('a', { notes: 'Old' }));
    await s.loadDetail('a');
    apps.updateApplication.mockRejectedValue(new Error('API 422: {"detail":"Notes can be at most 2000 characters."}'));
    const message = await s.patchApplication('a', { notes: 'New' });
    expect(message).toBe('Notes can be at most 2000 characters.');
    expect(s.details.a.notes).toBe('Old');
  });

  it('keeps the change when the answer cannot be read', async () => {
    const s = await loaded([summary('a')]);
    apps.updateApplication.mockResolvedValue(null);
    expect(await s.patchApplication('a', { status: 'ghosted' })).toBe('');
    expect(s.items[0].status).toBe('ghosted');
  });

  it('says so when the application is unknown', async () => {
    const s = useTrackerStore();
    expect(await s.patchApplication('nope', { status: 'offer' })).toMatch(/could not find/);
    expect(apps.updateApplication).not.toHaveBeenCalled();
  });
});

describe('tracker store: detail', () => {
  it('loads (loading then ready) and keeps the list row in step', async () => {
    const s = await loaded([summary('a', { status: 'saved' })]);
    apps.getApplication.mockResolvedValue(detail('a', { status: 'interview' }));
    const p = s.loadDetail('a');
    expect(s.detailStatus.a).toBe('loading');
    await p;
    expect(s.detailStatus.a).toBe('ready');
    expect(s.details.a.resume?.content.header.name).toBe('Ana');
    expect(s.items[0].status).toBe('interview');
  });

  it('marks a missing application as not found and drops it from the list', async () => {
    const s = await loaded([summary('a'), summary('b')]);
    apps.getApplication.mockRejectedValue(new Error('API 404: {"detail":"Not found"}'));
    await s.loadDetail('a');
    expect(s.detailStatus.a).toBe('notfound');
    expect(s.details.a).toBeUndefined();
    expect(s.items.map((x) => x.id)).toEqual(['b']);
  });

  it('shows an error state when the first load fails', async () => {
    const s = useTrackerStore();
    apps.getApplication.mockRejectedValue(new TypeError('Failed to fetch'));
    await s.loadDetail('a');
    expect(s.detailStatus.a).toBe('error');
    expect(s.detailError.a).toMatch(/internet connection/);
  });

  it('keeps the cached copy when a refresh fails', async () => {
    const s = useTrackerStore();
    apps.getApplication.mockResolvedValueOnce(detail('a'));
    await s.loadDetail('a');
    apps.getApplication.mockRejectedValueOnce(new Error('API 500: x'));
    const p = s.loadDetail('a');
    expect(s.detailStatus.a).toBe('ready'); // no skeleton while refreshing
    await p;
    expect(s.detailStatus.a).toBe('ready');
    expect(s.details.a).toBeTruthy();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});

describe('tracker store: delete', () => {
  it('does nothing when the user cancels', async () => {
    const s = await loaded([summary('a')]);
    vi.mocked(confirmAction).mockResolvedValue(false);
    expect(await s.removeApplication('a')).toBe(false);
    expect(apps.deleteApplication).not.toHaveBeenCalled();
    expect(s.items).toHaveLength(1);
  });

  it('deletes after confirmation; the open detail stays until its screen closes', async () => {
    const s = await loaded([summary('a'), summary('b')]);
    apps.getApplication.mockResolvedValue(detail('a'));
    await s.loadDetail('a');
    vi.mocked(confirmAction).mockResolvedValue(true);
    apps.deleteApplication.mockResolvedValue(undefined);
    expect(await s.removeApplication('a')).toBe(true);
    expect(apps.deleteApplication).toHaveBeenCalledWith('a');
    expect(s.items.map((x) => x.id)).toEqual(['b']);
    expect(s.detailStatus.a).toBe('deleted');
    expect(s.details.a).toBeTruthy();
    expect(s.deletingId).toBeNull();
    expect(showToast).toHaveBeenCalledWith('Application deleted.');
  });

  it('opening a deleted application again asks the server (no stale copy)', async () => {
    const s = await loaded([summary('a')]);
    apps.getApplication.mockResolvedValueOnce(detail('a'));
    await s.loadDetail('a');
    vi.mocked(confirmAction).mockResolvedValue(true);
    apps.deleteApplication.mockResolvedValue(undefined);
    await s.removeApplication('a');
    apps.getApplication.mockRejectedValueOnce(new Error('API 404: x'));
    const p = s.loadDetail('a');
    expect(s.detailStatus.a).toBe('loading');
    await p;
    expect(s.detailStatus.a).toBe('notfound');
  });

  it('keeps the row and tells the user when delete fails', async () => {
    const s = await loaded([summary('a')]);
    vi.mocked(confirmAction).mockResolvedValue(true);
    apps.deleteApplication.mockRejectedValue(new Error('API 500: x'));
    expect(await s.removeApplication('a')).toBe(false);
    expect(s.items).toHaveLength(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/server had a problem/), 'error');
    expect(s.deletingId).toBeNull();
  });

  it('treats "already gone" as deleted', async () => {
    const s = await loaded([summary('a')]);
    vi.mocked(confirmAction).mockResolvedValue(true);
    apps.deleteApplication.mockRejectedValue(new Error('API 404: x'));
    expect(await s.removeApplication('a')).toBe(true);
    expect(s.items).toEqual([]);
  });
});

describe('tracker store: downloads', () => {
  it('marks the button busy while the link is prepared, then confirms', async () => {
    const s = useTrackerStore();
    const answer = deferred<{ url: string; file_name: string; expires_in: number }>();
    docs.downloadDocument.mockReturnValue(answer.promise);
    const p = s.download('d1', 'pdf', 'resume');
    expect(s.isDownloading('d1', 'pdf')).toBe(true);
    expect(s.isDownloading('d1')).toBe(true);
    expect(s.isDownloading('d1', 'docx')).toBe(false);
    expect(await s.download('d1', 'pdf', 'resume')).toBe(false); // a second tap is ignored
    answer.resolve({ url: 'https://f.example.com/x', file_name: 'cv.pdf', expires_in: 60 });
    expect(await p).toBe(true);
    expect(docs.downloadDocument).toHaveBeenCalledTimes(1);
    expect(docs.downloadDocument).toHaveBeenCalledWith('d1', 'pdf', 'resume');
    expect(s.isDownloading('d1')).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Your download has started.');
  });

  it('shows a friendly message when the export fails', async () => {
    const s = useTrackerStore();
    docs.downloadDocument.mockRejectedValue(new Error('API 503: {"detail":"PDF export is not set up on the server."}'));
    expect(await s.download('d1', 'docx', 'cover_letter')).toBe(false);
    expect(showToast).toHaveBeenCalledWith('PDF export is not set up on the server.', 'error');
    expect(s.isDownloading('d1')).toBe(false);
  });
});

describe('tracker store: reset', () => {
  it('wipes everything (log out) and ignores answers that arrive later', async () => {
    const s = await loaded([summary('a')]);
    s.setFilter('applied');
    s.setQuery('x');
    const late = deferred<ApplicationSummary[]>();
    apps.listApplications.mockReturnValue(late.promise);
    const p = s.loadList();
    const lateDetail = deferred<ApplicationDetail>();
    apps.getApplication.mockReturnValue(lateDetail.promise);
    const pd = s.loadDetail('a');
    s.reset();
    late.resolve([summary('z')]);
    lateDetail.resolve(detail('a'));
    await p;
    await pd;
    expect(s.items).toEqual([]);
    expect(s.listStatus).toBe('idle');
    expect(s.details).toEqual({});
    expect(s.filter).toBe('all');
    expect(s.query).toBe('');
  });
});
