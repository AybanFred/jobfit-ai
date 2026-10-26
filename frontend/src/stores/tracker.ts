import { defineStore } from 'pinia';
import {
  deleteApplication, getApplication, listApplications, updateApplication,
} from '@/services/applications';
import { downloadDocument } from '@/services/documents';
import { confirmAction, showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import {
  countByStatus, friendlyTrackerError, isNotFound, isSortKey, isStatusFilter, summaryOf, visibleApplications,
  type AppStatus, type ApplicationDetail, type ApplicationPatch, type ApplicationSummary, type DocType,
  type EditableFields, type ExportFormat, type SortKey, type StatusCounts, type StatusFilter,
} from '@/services/trackerLogic';

export type ListStatus = 'idle' | 'loading' | 'ready' | 'error';
/** 'deleted' = removed on this device; the detail stays in memory only so the closing screen does not go blank. */
export type DetailStatus = 'loading' | 'ready' | 'error' | 'notfound' | 'deleted';

type Confirmed = EditableFields & { updated_at: string };

// Request counters and undo data live outside the reactive state: they are never shown.
/** Goes up on log out, so answers that arrive later are ignored. */
let epoch = 0;
let listRun = 0;
const detailRuns = new Map<string, number>();
const patchRuns = new Map<string, number>();
/** Changes shown on screen that the server has not confirmed yet, per application. */
const pending = new Map<string, ApplicationPatch>();
/** The last values the server confirmed, per application (used to undo a change that failed). */
const confirmed = new Map<string, Confirmed>();

const editableOf = (a: Confirmed): Confirmed => ({
  status: a.status, applied_at: a.applied_at, follow_up_at: a.follow_up_at, notes: a.notes, updated_at: a.updated_at,
});

/**
 * Tracker state: the list of applications (with filter, search and sort), a cache of opened
 * applications, status/date/notes changes shown at once and undone if the server says no,
 * deletes and downloads. Everything is in memory only and is wiped on log out.
 */
export const useTrackerStore = defineStore('tracker', {
  state: () => ({
    items: [] as ApplicationSummary[],
    listStatus: 'idle' as ListStatus,
    listError: '',

    filter: 'all' as StatusFilter,
    query: '',
    sort: 'newest' as SortKey,

    details: {} as Record<string, ApplicationDetail>,
    detailStatus: {} as Record<string, DetailStatus>,
    detailError: {} as Record<string, string>,

    /** How many saves are running per application (for "Saving…"). */
    saving: {} as Record<string, number>,
    /** Id of the application being deleted right now. */
    deletingId: null as string | null,
    /** Downloads being prepared, keyed "docId:format". */
    downloading: {} as Record<string, boolean>,
  }),

  getters: {
    counts(s): StatusCounts {
      return countByStatus(s.items);
    },
    /** The rows to show: filtered by status chip and search, then sorted. */
    visible(s): ApplicationSummary[] {
      return visibleApplications(s.items, s.filter, s.query, s.sort);
    },
    isFiltered(s): boolean {
      return s.filter !== 'all' || !!s.query.trim();
    },
    /** True while a download of this document (any format, or the given one) is being prepared. */
    isDownloading(s) {
      return (docId: string, format?: ExportFormat): boolean => (format
        ? !!s.downloading[`${docId}:${format}`]
        : Object.keys(s.downloading).some((k) => k.startsWith(`${docId}:`)));
    },
  },

  actions: {
    setFilter(f: unknown) { if (isStatusFilter(f)) this.filter = f; },
    setQuery(q: string) { this.query = q; },
    setSort(s: unknown) { if (isSortKey(s)) this.sort = s; },
    clearFilters() {
      this.filter = 'all';
      this.query = '';
    },

    /** Loads (or reloads) the list. A reload keeps the old rows on screen while it waits. */
    async loadList() {
      const myRun = ++listRun;
      if (this.listStatus !== 'ready') this.listStatus = 'loading';
      this.listError = '';
      try {
        const list = await listApplications();
        if (myRun !== listRun) return;
        this.items = list.map((a) => this.withPending(a));
        this.listStatus = 'ready';
      } catch (e) {
        if (myRun !== listRun) return;
        this.listError = friendlyTrackerError(e, 'list');
        // A failed refresh keeps the rows that are already on screen and only shows a message.
        if (this.listStatus === 'ready') void showToast(this.listError, 'error');
        else this.listStatus = 'error';
      }
    },

    /** Loads one application. A cached one stays on screen while it refreshes. */
    async loadDetail(id: string) {
      if (!id) return;
      const myRun = (detailRuns.get(id) ?? 0) + 1;
      detailRuns.set(id, myRun);
      const myEpoch = epoch;
      if (this.detailStatus[id] === 'deleted') delete this.details[id];
      const cached = !!this.details[id];
      if (!cached) this.detailStatus[id] = 'loading';
      this.detailError[id] = '';
      try {
        const d = await getApplication(id);
        if (myEpoch !== epoch || detailRuns.get(id) !== myRun) return;
        const p = pending.get(id);
        if (!p) confirmed.set(id, editableOf(d));
        const shown = p ? { ...d, ...p } : d;
        this.details[id] = shown;
        this.detailStatus[id] = 'ready';
        // Keep the list row in step with what the detail shows.
        const i = this.items.findIndex((a) => a.id === id);
        if (i >= 0) this.items[i] = summaryOf(shown);
      } catch (e) {
        if (myEpoch !== epoch || detailRuns.get(id) !== myRun) return;
        if (isNotFound(e)) {
          delete this.details[id];
          this.detailStatus[id] = 'notfound';
          this.items = this.items.filter((a) => a.id !== id);
          return;
        }
        const message = friendlyTrackerError(e, 'detail');
        this.detailError[id] = message;
        if (cached) {
          this.detailStatus[id] = 'ready';
          void showToast(message, 'error');
        } else {
          this.detailStatus[id] = 'error';
        }
      }
    },

    /**
     * Saves status, dates or notes. The change shows at once; if the server says no, it is undone.
     * Returns '' when saved, else a friendly message (no toast here, the screen decides how to show it).
     */
    async patchApplication(id: string, patch: ApplicationPatch): Promise<string> {
      const now = this.currentFields(id);
      if (!now) return 'We could not find this application. It may have been deleted.';
      if (!confirmed.has(id)) confirmed.set(id, now);
      const myRun = (patchRuns.get(id) ?? 0) + 1;
      patchRuns.set(id, myRun);
      const myEpoch = epoch;
      pending.set(id, { ...pending.get(id), ...patch });
      this.applyFields(id, patch);
      this.saving[id] = (this.saving[id] ?? 0) + 1;
      try {
        const updated = await updateApplication(id, patch);
        if (myEpoch !== epoch) return '';
        const server: Confirmed = updated ? editableOf(updated) : { ...(confirmed.get(id) ?? now), ...patch };
        confirmed.set(id, server);
        if (patchRuns.get(id) !== myRun) return ''; // a newer change is on screen; it decides what stays
        pending.delete(id);
        const i = this.items.findIndex((a) => a.id === id);
        if (i >= 0 && updated) this.items[i] = updated;
        this.applyFields(id, server);
        return '';
      } catch (e) {
        if (myEpoch !== epoch) return '';
        const message = friendlyTrackerError(e, 'save');
        if (patchRuns.get(id) === myRun) {
          pending.delete(id);
          this.applyFields(id, confirmed.get(id) ?? now); // undo: back to what the server has
        }
        return message;
      } finally {
        if (myEpoch === epoch) {
          const left = (this.saving[id] ?? 1) - 1;
          if (left > 0) this.saving[id] = left;
          else delete this.saving[id];
        }
      }
    },

    /** Status change from the list: shown at once, undone with a message if it fails. */
    async changeStatus(id: string, status: AppStatus): Promise<boolean> {
      if (this.currentFields(id)?.status === status) return true;
      void tapHaptic();
      const problem = await this.patchApplication(id, { status });
      if (problem) void showToast(problem, 'error');
      return !problem;
    },

    /** Asks first, then deletes the application (and its job, documents and files). True when it is gone. */
    async removeApplication(id: string): Promise<boolean> {
      if (this.deletingId) return false;
      const ok = await confirmAction(
        'Delete this application?',
        'The job, its tailored resume and cover letter will be removed. This cannot be undone.',
      );
      if (!ok) return false;
      const myEpoch = epoch;
      this.deletingId = id;
      try {
        await deleteApplication(id);
        if (myEpoch === epoch) this.forget(id);
        void showToast('Application deleted.');
        return true;
      } catch (e) {
        if (myEpoch !== epoch) return false;
        if (isNotFound(e)) {
          this.forget(id);
          void showToast('That application was already deleted.');
          return true;
        }
        void showToast(friendlyTrackerError(e, 'delete'), 'error');
        return false;
      } finally {
        if (myEpoch === epoch) this.deletingId = null;
      }
    },

    /** Asks the server for a PDF/DOCX link and starts the download. True when it started. */
    async download(docId: string, format: ExportFormat, type: DocType): Promise<boolean> {
      const key = `${docId}:${format}`;
      if (this.downloading[key]) return false;
      const myEpoch = epoch;
      this.downloading[key] = true;
      try {
        await downloadDocument(docId, format, type);
        if (myEpoch !== epoch) return false;
        void showToast('Your download has started.');
        return true;
      } catch (e) {
        if (myEpoch === epoch) void showToast(friendlyTrackerError(e, 'download'), 'error');
        return false;
      } finally {
        if (myEpoch === epoch) delete this.downloading[key];
      }
    },

    // ----- helpers -----

    /** The editable fields as shown now (list row or opened detail). */
    currentFields(id: string): Confirmed | null {
      const row = this.items.find((a) => a.id === id) ?? this.details[id];
      return row ? editableOf(row) : null;
    },

    /** Writes fields into the list row and the cached detail. */
    applyFields(id: string, fields: Partial<Confirmed>) {
      const i = this.items.findIndex((a) => a.id === id);
      if (i >= 0) this.items[i] = { ...this.items[i], ...fields };
      const d = this.details[id];
      if (d) this.details[id] = { ...d, ...fields };
    },

    /** A row from the server with any unsaved change on top (so a refresh never hides a change in progress). */
    withPending(a: ApplicationSummary): ApplicationSummary {
      const p = pending.get(a.id);
      if (!p) {
        confirmed.set(a.id, editableOf(a));
        return a;
      }
      if (!confirmed.has(a.id)) confirmed.set(a.id, editableOf(a));
      return { ...a, ...p };
    },

    /** Drops a deleted application from the list. Its detail stays until the screen has closed. */
    forget(id: string) {
      this.items = this.items.filter((a) => a.id !== id);
      if (this.details[id]) this.detailStatus[id] = 'deleted';
      else delete this.detailStatus[id];
      pending.delete(id);
      confirmed.delete(id);
    },

    /** Forget everything (log out), so the next user never sees old data. */
    reset() {
      epoch += 1;
      listRun += 1;
      detailRuns.clear();
      patchRuns.clear();
      pending.clear();
      confirmed.clear();
      this.$reset();
    },
  },
});
