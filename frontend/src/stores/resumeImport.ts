import { defineStore } from 'pinia';
import { useProfileStore } from '@/stores/profile';
import { friendlyDataError } from '@/services/errors';
import { confirmAction, showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import {
  buildReview, buildSavePlan, countsOfPlan, draftIsEmpty, partialMessage, reviewHasErrors, savedSummary,
  type ImportExisting, type PlanContext, type ReviewState,
} from '@/services/importLogic';
import { executePlan, loadImportContext } from '@/services/importSave';
import { friendlyImportError, isAbortError, uploadResume, type ImportError } from '@/services/resumeImport';
import type { SkillBankItem } from '@/services/profileLogic';

export type ImportStep = 'pick' | 'uploading' | 'error' | 'review' | 'done';

// The file itself and the cancel handle are kept outside the reactive state: they are never shown or saved.
let controller: AbortController | null = null;
let lastFile: File | null = null;
let lastModelId: string | null = null;
let runId = 0;

/**
 * "Import from resume" state. The draft lives ONLY in memory (never localStorage) and is wiped after
 * a successful save, after Discard, and on log out.
 */
export const useResumeImportStore = defineStore('resumeImport', {
  state: () => ({
    step: 'pick' as ImportStep,
    error: null as ImportError | null,
    review: null as ReviewState | null,
    /** JSON of the review as first built, to know whether the user changed anything. */
    snapshot: '',
    existing: null as ImportExisting | null,
    bank: [] as SkillBankItem[],
    contextStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    saving: false,
    saveError: '',
    /** After a successful save: the sentence shown on the done screen. */
    summary: '',
  }),

  getters: {
    dirty: (s): boolean => !!s.review && JSON.stringify(s.review) !== s.snapshot,
  },

  actions: {
    /** Sends the chosen file to the backend. The caller has already checked type and size. */
    async startImport(file: File, modelId: string | null = null) {
      this.cancelUpload();
      const myRun = ++runId;
      lastFile = file;
      lastModelId = modelId;
      controller = new AbortController();
      const signal = controller.signal;
      this.step = 'uploading';
      this.error = null;
      this.saveError = '';
      try {
        const draft = await uploadResume(file, signal, modelId);
        if (myRun !== runId) return; // cancelled or replaced while waiting
        if (draftIsEmpty(draft)) {
          this.error = {
            message: 'We could not find any profile details in that file. Please try another resume.',
            canRetry: false,
          };
          this.step = 'error';
          return;
        }
        const review = buildReview(draft);
        this.review = review;
        this.snapshot = JSON.stringify(review);
        this.step = 'review';
        lastFile = null; // the file is no longer needed
        void this.loadContext();
      } catch (e) {
        if (myRun !== runId || isAbortError(e)) return;
        this.error = friendlyImportError(e);
        this.step = 'error';
      } finally {
        if (myRun === runId) controller = null;
      }
    },

    /** Try the same file again after an error. */
    retryUpload() {
      if (lastFile) void this.startImport(lastFile, lastModelId);
      else this.step = 'pick';
    },

    /** Stops a running upload (Cancel button) and goes back to the file chooser. */
    cancelUpload() {
      if (controller) {
        runId += 1; // ignore whatever the old request may still return
        controller.abort();
        controller = null;
        if (this.step === 'uploading') this.step = 'pick';
      }
    },

    backToPick() {
      this.step = 'pick';
      this.error = null;
      lastFile = null;
    },

    /** Reads what the profile already holds (for duplicate checks and "already owned" skills). */
    async loadContext() {
      this.contextStatus = 'loading';
      try {
        const [ctx] = await Promise.all([loadImportContext(), useProfileStore().loadOverview()]);
        this.existing = ctx.existing;
        this.bank = ctx.bank;
        this.contextStatus = 'ready';
      } catch {
        this.contextStatus = 'error';
      }
    },

    planContext(): PlanContext {
      return { existing: this.existing, bank: this.bank, profile: useProfileStore().profile };
    },

    hasErrors(): boolean {
      return !!this.review && reviewHasErrors(this.review, this.planContext());
    },

    /** Writes everything that is ticked. Returns true when all of it was saved. */
    async save(): Promise<boolean> {
      const review = this.review;
      if (!review || this.saving || this.contextStatus !== 'ready') return false;
      this.saving = true;
      this.saveError = '';
      const profile = useProfileStore();
      try {
        const plan = buildSavePlan(review, this.planContext());
        const outcome = await executePlan(plan, undefined, this.existing?.ownedSkillIds ?? []);

        // Remember what worked, so "try again" never saves the same thing twice.
        for (const x of review.experiences) if (outcome.experienceKeys.includes(x.key)) x.saved = true;
        for (const x of review.education) if (outcome.educationKeys.includes(x.key)) x.saved = true;
        for (const x of review.projects) if (outcome.projectKeys.includes(x.key)) x.saved = true;
        if (this.existing) {
          this.existing.ownedSkillIds = [...this.existing.ownedSkillIds, ...outcome.skillsAdded.map((s) => s.id)];
        }
        for (const s of outcome.skillsAdded) {
          if (!this.bank.some((b) => b.id === s.id)) this.bank = [...this.bank, s];
        }

        await profile.loadOverview(); // the Home ring and the Profile tab update from here

        if (outcome.failed > 0) {
          this.saveError = outcome.saved === 0
            ? `${friendlyDataError(outcome.lastError)} Nothing was saved - try again.`
            : partialMessage(outcome.saved, outcome.total);
          showToast(this.saveError, 'error');
          return false;
        }
        void tapHaptic('medium');
        this.summary = savedSummary(countsOfPlan(plan));
        showToast('Your profile has been updated.');
        this.clearDraft();
        this.step = 'done';
        return true;
      } catch (e) {
        this.saveError = friendlyDataError(e);
        return false;
      } finally {
        this.saving = false;
      }
    },

    /** Throws the draft away. Asks first when the user changed something. */
    async discard(): Promise<boolean> {
      if (this.dirty) {
        const ok = await confirmAction(
          'Discard this import?',
          'Your changes to the imported details will be lost. Nothing has been saved to your profile.',
          'Discard',
        );
        if (!ok) return false;
      }
      this.reset();
      return true;
    },

    /** Forget the imported details but stay on the current step. */
    clearDraft() {
      this.review = null;
      this.snapshot = '';
      this.existing = null;
      this.bank = [];
      this.contextStatus = 'idle';
      lastFile = null;
    },

    /** Back to a clean start (after discard, when leaving the done screen, and on log out). */
    reset() {
      runId += 1;
      controller?.abort();
      controller = null;
      lastFile = null;
      this.$reset();
    },
  },
});
