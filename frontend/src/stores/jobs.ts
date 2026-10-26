import { defineStore } from 'pinia';
import { tapHaptic } from '@/services/haptics';
import { listResumes, uploadResumeFile } from '@/services/resumes';
import { tailorJob } from '@/services/tailor';
import {
  DEFAULT_TEMPLATE, TAILOR_TIMEOUT_MS, TIMEOUT_MESSAGE, buildTailorRequest, defaultResumeTab, friendlyJobError,
  hasFormErrors, isTemplateId, pickResumeId, validateTailorForm,
  type JobError, type ResumeTab, type SavedResume, type TailorForm, type TailorFormErrors,
  type TailorResult, type TemplateId,
} from '@/services/jobsLogic';
import { isAbortError, validateResumeFile } from '@/services/resumeImport';

export type ListStatus = 'idle' | 'loading' | 'ready' | 'error';
/** form = filling in, working = waiting for the AI. The result opens in the Tracker. */
export type JobsPhase = 'form' | 'working';

// Cancel handles and run counters live outside the reactive state: they are never shown or saved.
let tailorController: AbortController | null = null;
let tailorTimer: ReturnType<typeof setTimeout> | null = null;
let tailorRun = 0;
let uploadController: AbortController | null = null;
let uploadRun = 0;
let resumesRun = 0;

function stopTailorRequest() {
  if (tailorTimer) clearTimeout(tailorTimer);
  tailorTimer = null;
  tailorController?.abort();
  tailorController = null;
}

/**
 * Jobs screen state: the form (link, job text, resume choice, template, AI model), the saved resumes
 * and the running "Go" request. The finished job is shown in the Tracker. Everything is in memory only
 * and is wiped on log out.
 */
export const useJobsStore = defineStore('jobs', {
  state: () => ({
    // --- form ---
    jobUrl: '',
    /** The pasted job description (kept when something fails, so nothing is lost). */
    text: '',
    resumeTab: 'saved' as ResumeTab,
    /** True once the user picked a tab, so loading the list does not switch it any more. */
    tabTouched: false,
    /** The saved resume picked in the "Saved" dropdown. */
    resumeId: null as string | null,
    template: DEFAULT_TEMPLATE as TemplateId,
    /** Chosen in the AI model dropdown; null = none usable yet. */
    modelId: null as string | null,

    // --- saved resumes ---
    resumes: [] as SavedResume[],
    resumesStatus: 'idle' as ListStatus,
    resumesError: '',

    // --- upload (the "Upload" tab) ---
    uploading: false,
    uploadingName: '',
    uploadError: '',
    /** The file uploaded on the "Upload" tab; it is the resume used while that tab is chosen. */
    uploaded: null as SavedResume | null,

    // --- Go ---
    phase: 'form' as JobsPhase,
    /** When the current Go started (for the rotating status lines). */
    workingSince: 0,
    tailorError: null as JobError | null,
  }),

  getters: {
    /** The resume the AI will use for the chosen tab (null for Master Profile or when nothing is chosen). */
    effectiveResumeId(s): string | null {
      if (s.resumeTab === 'upload') return s.uploaded?.id ?? null;
      if (s.resumeTab === 'saved') return s.resumeId && s.resumes.some((r) => r.id === s.resumeId) ? s.resumeId : null;
      return null;
    },
    form(): TailorForm {
      return {
        jobUrl: this.jobUrl,
        text: this.text,
        tab: this.resumeTab,
        resumeId: this.effectiveResumeId,
        template: this.template,
        modelId: this.modelId,
      };
    },
    formErrors(): TailorFormErrors {
      return validateTailorForm(this.form);
    },
    /** The Go button may be pressed. */
    canGo(): boolean {
      return this.phase === 'form' && !this.uploading && !hasFormErrors(this.formErrors);
    },
  },

  actions: {
    setText(value: string) { this.text = value; },
    setUrl(value: string) { this.jobUrl = value; },
    setModel(id: string | null) { this.modelId = id; },
    setResume(id: string | null) { this.resumeId = id; },
    setTemplate(id: unknown) { if (isTemplateId(id)) this.template = id; },
    setTab(tab: ResumeTab) {
      this.resumeTab = tab;
      this.tabTouched = true;
    },

    /** Loads (or reloads) the saved resumes and preselects the newest one. A reload keeps the old list meanwhile. */
    async loadResumes() {
      const myRun = ++resumesRun;
      if (this.resumesStatus !== 'ready') this.resumesStatus = 'loading';
      this.resumesError = '';
      try {
        let list = await listResumes();
        if (myRun !== resumesRun) return;
        // A file uploaded a moment ago may be missing from an answer that left the server earlier.
        const up = this.uploaded;
        if (up && !list.some((r) => r.id === up.id)) list = [up, ...list];
        this.resumes = list;
        this.resumesStatus = 'ready';
        this.resumeId = pickResumeId(list, this.resumeId);
        if (!this.tabTouched) this.resumeTab = defaultResumeTab(list);
      } catch (e) {
        if (myRun !== resumesRun) return;
        this.resumesError = friendlyJobError(e, 'resumes').message;
        // A failed refresh keeps the list that is already on screen.
        if (!(this.resumesStatus === 'ready' && this.resumes.length)) this.resumesStatus = 'error';
      }
    },

    /** Checks and uploads a file from the "Upload" tab. On success it becomes the chosen resume. */
    async uploadResume(file: File): Promise<boolean> {
      const problem = validateResumeFile(file); // type and size are checked before anything is sent
      if (problem) {
        this.uploadError = problem;
        return false;
      }
      this.cancelUpload();
      const myRun = ++uploadRun;
      uploadController = new AbortController();
      const signal = uploadController.signal;
      this.uploading = true;
      this.uploadingName = file.name;
      this.uploadError = '';
      this.tabTouched = true;
      try {
        const saved = await uploadResumeFile(file, signal);
        if (myRun !== uploadRun) return false;
        this.uploaded = saved;
        this.resumes = [saved, ...this.resumes.filter((r) => r.id !== saved.id)];
        this.resumeId = saved.id;
        if (this.resumesStatus !== 'ready') void this.loadResumes(); // fetch the rest of the list too
        void tapHaptic();
        return true;
      } catch (e) {
        if (myRun !== uploadRun || isAbortError(e)) return false;
        this.uploadError = friendlyJobError(e, 'upload').message;
        return false;
      } finally {
        if (myRun === uploadRun) {
          this.uploading = false;
          uploadController = null;
        }
      }
    },

    /** Stops a running upload. (The server may still keep the file; it then shows up under "Saved".) */
    cancelUpload() {
      if (uploadController) {
        uploadRun += 1;
        uploadController.abort();
        uploadController = null;
      }
      this.uploading = false;
    },

    /** "Choose a different file": shows the file box again. The saved file is not deleted. */
    clearUploaded() {
      this.uploaded = null;
      this.uploadError = '';
    },

    /**
     * The Go button: asks the AI for a tailored resume and cover letter (the backend saves them to the Tracker).
     * On success the job link and text are cleared (resume, template and model stay) and the result is returned;
     * otherwise null, with every input kept.
     */
    async tailor(): Promise<TailorResult | null> {
      if (!this.canGo) return null;
      stopTailorRequest();
      const myRun = ++tailorRun;
      const controller = new AbortController();
      tailorController = controller;
      let timedOut = false;
      tailorTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, TAILOR_TIMEOUT_MS);
      const request = buildTailorRequest(this.form);
      this.phase = 'working';
      this.workingSince = Date.now();
      this.tailorError = null;
      try {
        const result = await tailorJob(request, controller.signal);
        if (myRun !== tailorRun) return null; // cancelled or replaced while waiting
        this.jobUrl = '';
        this.text = '';
        this.phase = 'form';
        void tapHaptic('medium');
        return result;
      } catch (e) {
        if (myRun !== tailorRun) return null;
        this.tailorError = timedOut
          ? { message: TIMEOUT_MESSAGE, canRetry: true }
          : isAbortError(e) ? null : friendlyJobError(e, 'tailor');
        this.phase = 'form'; // every input is kept, so "Try again" sends the same thing
        return null;
      } finally {
        if (myRun === tailorRun) {
          if (tailorTimer) clearTimeout(tailorTimer);
          tailorTimer = null;
          tailorController = null;
        }
      }
    },

    /** Cancel while the AI works: back to the form with everything kept. A late answer is ignored. */
    cancelTailor() {
      if (tailorController) {
        tailorRun += 1;
        stopTailorRequest();
      }
      if (this.phase === 'working') this.phase = 'form';
    },

    /** Forget everything (log out), so the next user never sees old data. */
    reset() {
      tailorRun += 1;
      stopTailorRequest();
      uploadRun += 1;
      uploadController?.abort();
      uploadController = null;
      resumesRun += 1;
      this.$reset();
    },
  },
});
