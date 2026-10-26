import { defineStore } from 'pinia';
import {
  deleteApplication, getApplication, listApplications, updateApplication, writeApplicationEmail,
} from '@/services/applications';
import { downloadDocument } from '@/services/documents';
import { confirmAction, showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import { isAbortError } from '@/services/resumeImport';
import {
  countByStatus, emailWarningsOf, friendlyEmailError, friendlyTrackerError, isNotFound, isSortKey, isStatusFilter,
  newestEmail, summaryOf, visibleApplications,
  type AppStatus, type ApplicationDetail, type ApplicationPatch, type ApplicationSummary, type DocType,
  type EditableFields, type ExportFormat, type SortKey, type StatusCounts, type StatusFilter,
} from '@/services/trackerLogic';

/** Writing an email usually takes 10 to 60 seconds; after 2 minutes the screen stops waiting. */
export const EMAIL_TIMEOUT_MS = 120_000;

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
/** Running "write the email" requests (cancel handle, time limit, run number) per application. */
const emailJobs = new Map<string, { controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
const emailRuns = new Map<string, number>();

function stopEmailRequest(id: string) {
  const job = emailJobs.get(id);
  if (!job) return;
  clearTimeout(job.timer);
  job.controller.abort();
  emailJobs.delete(id);
}

const editableOf = (a: Confirmed): Confirmed => ({
  status: a.status,
  applied_at: a.applied_at,
  follow_up_at: a.follow_up_at,
  notes: a.notes,
  recruiter_email: a.recruiter_email,
  updated_at: a.updated_at,
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

    /** Applications whose email the AI is writing right now. */
    emailWriting: {} as Record<string, boolean>,
    /** The last "could not write the email" message per application ('' or missing = none). */
    emailError: {} as Record<string, string>,
    /** Warnings that came with an email written on this device (newer than the saved match warnings). */
    emailWarnings: {} as Record<string, { emailId: string; warnings: string[] }>,
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
    /** The warnings for the email shown now: those that came with it from this device, else the saved ones. */
    emailWarningsFor(s) {
      return (id: string): string[] => {
        const d = s.details[id];
        if (!d?.email) return [];
        const fresh = s.emailWarnings[id];
        if (fresh && fresh.emailId === d.email.id) return fresh.warnings;
        return emailWarningsOf(d.match?.warnings ?? []);
      };
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
        // An email written while this answer was on its way is newer than the one in the answer: keep it.
        const email = newestEmail(this.details[id]?.email ?? null, d.email);
        const shown = { ...d, ...p, email };
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

    /**
     * Asks the AI for a (new) application email. The email on screen stays until the new one arrives, and
     * stays if this fails or is cancelled. Shows "Your email is ready" / "New version ready".
     * Resolves to true when a new email is shown; false when it failed (see emailError), was cancelled or is
     * already running.
     */
    async writeEmail(id: string, modelId: string | null): Promise<boolean> {
      if (!id || this.emailWriting[id]) return false;
      const mode = this.details[id]?.email ? 'regenerate' : 'first';
      const myRun = (emailRuns.get(id) ?? 0) + 1;
      emailRuns.set(id, myRun);
      const myEpoch = epoch;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, EMAIL_TIMEOUT_MS);
      emailJobs.set(id, { controller, timer });
      this.emailWriting[id] = true;
      delete this.emailError[id];
      try {
        const written = await writeApplicationEmail(id, modelId, controller.signal);
        if (myEpoch !== epoch || emailRuns.get(id) !== myRun) return false;
        const { warnings, ...email } = written;
        const d = this.details[id];
        if (d) this.details[id] = { ...d, email };
        this.emailWarnings[id] = { emailId: email.id, warnings };
        void tapHaptic('medium');
        void showToast(mode === 'first' ? 'Your email is ready' : 'New version ready');
        return true;
      } catch (e) {
        if (myEpoch !== epoch || emailRuns.get(id) !== myRun) return false;
        if (isAbortError(e) && !timedOut) return false; // cancelled: back to how it was, no message
        this.emailError[id] = friendlyEmailError(timedOut ? null : e, mode);
        return false;
      } finally {
        if (myEpoch === epoch && emailRuns.get(id) === myRun) {
          clearTimeout(timer);
          emailJobs.delete(id);
          delete this.emailWriting[id];
        }
      }
    },

    /** Cancel while the AI writes the email: the screen goes back to how it was. A late answer is ignored. */
    cancelEmail(id: string) {
      if (!this.emailWriting[id]) return;
      emailRuns.set(id, (emailRuns.get(id) ?? 0) + 1);
      stopEmailRequest(id);
      delete this.emailWriting[id];
    },

    clearEmailError(id: string) {
      delete this.emailError[id];
    },

    /** Asks first, then deletes the application (and its job, documents and files). True when it is gone. */
    async removeApplication(id: string): Promise<boolean> {
      if (this.deletingId) return false;
      const ok = await confirmAction(
        'Delete this application?',
        'The job, its tailored resume, cover letter and email will be removed. This cannot be undone.',
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
      this.cancelEmail(id);
      delete this.emailError[id];
      delete this.emailWarnings[id];
    },

    /** Forget everything (log out), so the next user never sees old data. */
    reset() {
      epoch += 1;
      listRun += 1;
      detailRuns.clear();
      patchRuns.clear();
      pending.clear();
      confirmed.clear();
      for (const id of [...emailJobs.keys()]) stopEmailRequest(id);
      emailRuns.clear();
      this.$reset();
    },
  },
});
