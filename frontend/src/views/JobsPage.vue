<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Jobs</ion-title></ion-toolbar>
    </ion-header>

    <ion-content ref="contentRef">
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="ui-page">
        <!-- 1. The form (kept mounted while hidden, so the AI model picker does not reload).
             After a successful Go the new application opens in the Tracker. -->
        <section v-show="store.phase === 'form'" class="ui-surface ui-card fade-in-up" aria-labelledby="tailor-title">
          <div class="head">
            <IconChip :icon="sparklesOutline" tone="primary" size="lg" />
            <div>
              <h1 id="tailor-title" class="ui-h1 small">Tailor your resume</h1>
              <p class="lead">Paste a job post. We write a resume and cover letter for it using only your real experience.</p>
            </div>
          </div>

          <div class="form">
            <!-- Job post link (optional) -->
            <div>
              <ion-input
                class="field"
                :class="invalid(!!urlError)"
                label="Job post link (optional)"
                label-placement="stacked"
                fill="outline"
                type="url"
                inputmode="url"
                autocomplete="url"
                placeholder="https://"
                :maxlength="MAX_URL_CHARS"
                helper-text="Saved to your Tracker so you can open the post later."
                :error-text="urlError"
                :value="store.jobUrl"
                @ionInput="store.setUrl(String($event.detail.value ?? ''))"
                @ionBlur="urlTouched = true"
              />
            </div>

            <!-- Job title + company (required: they name the Tracker entry and the cover letter) -->
            <div>
              <ion-input
                class="field"
                :class="invalid(!!titleError)"
                label="Job title"
                label-placement="stacked"
                fill="outline"
                autocapitalize="words"
                placeholder="e.g. Backend Engineer"
                :maxlength="MAX_SHORT_CHARS"
                :error-text="titleError"
                :value="store.jobTitle"
                @ionInput="store.setJobTitle(String($event.detail.value ?? ''))"
                @ionBlur="titleTouched = true"
              />
            </div>
            <div>
              <ion-input
                class="field"
                :class="invalid(!!companyError)"
                label="Company"
                label-placement="stacked"
                fill="outline"
                autocapitalize="words"
                autocomplete="organization"
                placeholder="e.g. Globex Inc"
                :maxlength="MAX_SHORT_CHARS"
                :error-text="companyError"
                :value="store.company"
                @ionInput="store.setCompany(String($event.detail.value ?? ''))"
                @ionBlur="companyTouched = true"
              />
            </div>

            <!-- Job description -->
            <div>
              <ion-textarea
                class="field"
                label="Job description"
                label-placement="stacked"
                fill="outline"
                placeholder="Paste the full job post here"
                :auto-grow="true"
                :rows="6"
                :maxlength="MAX_JOB_CHARS"
                :value="store.text"
                @ionInput="store.setText(String($event.detail.value ?? ''))"
              />
              <div class="counter-row">
                <p class="hint" :class="{ warn: tooShort }">{{ textHint }}</p>
                <p class="count" aria-live="polite">{{ charCountLabel(store.text) }}</p>
              </div>
            </div>

            <!-- Original resume -->
            <div role="group" aria-labelledby="resume-title">
              <p id="resume-title" class="group-title">Original resume</p>
              <ion-segment class="seg" :value="store.resumeTab" @ionChange="onTab($event.detail.value)">
                <ion-segment-button value="upload"><ion-label>Upload</ion-label></ion-segment-button>
                <ion-segment-button value="saved"><ion-label>Saved</ion-label></ion-segment-button>
                <ion-segment-button value="profile"><ion-label>Master Profile</ion-label></ion-segment-button>
              </ion-segment>

              <!-- Upload -->
              <div v-if="store.resumeTab === 'upload'" class="pane">
                <div v-if="store.uploading" class="file-row" aria-live="polite" aria-busy="true">
                  <div class="file-main">
                    <ion-icon :icon="documentTextOutline" class="file-icon" aria-hidden="true" />
                    <div class="file-text">
                      <p class="file-name">{{ store.uploadingName }}</p>
                      <p class="file-sub">Uploading…</p>
                    </div>
                    <ion-button fill="clear" size="small" class="pressable plain-btn" aria-label="Cancel the upload" @click="store.cancelUpload()">
                      Cancel
                    </ion-button>
                  </div>
                  <ion-progress-bar type="indeterminate" class="file-progress" />
                </div>

                <div v-else-if="store.uploaded" class="file-row">
                  <div class="file-main">
                    <ion-icon :icon="checkmarkCircle" class="file-icon ok" aria-hidden="true" />
                    <div class="file-text">
                      <p class="file-name">{{ store.uploaded.file_name }}</p>
                      <p class="file-sub">{{ uploadedSize ? `${uploadedSize} - ` : '' }}Saved to your resumes.</p>
                    </div>
                  </div>
                  <ion-button fill="clear" size="small" class="pressable plain-btn change-btn" @click="onChangeFile">
                    Choose a different file
                  </ion-button>
                </div>

                <ImportDropZone v-else @file="onFile" @many="onManyFiles" />
                <p v-if="store.uploadError" class="ui-error-text error" role="alert">{{ store.uploadError }}</p>
              </div>

              <!-- Saved -->
              <div v-else-if="store.resumeTab === 'saved'" class="pane">
                <div v-if="store.resumesStatus === 'loading' || store.resumesStatus === 'idle'" aria-busy="true" aria-label="Loading your saved resumes">
                  <ion-skeleton-text :animated="!reduced" class="sk-select" />
                </div>

                <div v-else-if="store.resumesStatus === 'error'" class="pane-state">
                  <p class="ui-error-text" role="alert">{{ store.resumesError }}</p>
                  <ion-button fill="outline" size="small" class="pressable plain-btn small-btn" @click="store.loadResumes()">Try again</ion-button>
                </div>

                <template v-else-if="!store.resumes.length">
                  <ion-select
                    class="field"
                    label="Saved resume"
                    label-placement="stacked"
                    fill="outline"
                    placeholder="No saved resumes yet"
                    :disabled="true"
                  />
                  <p class="note">You have no saved resumes yet. Upload one and it is saved here for next time.</p>
                  <ion-button fill="clear" size="small" class="pressable plain-btn small-btn" @click="onTab('upload')">Upload a resume</ion-button>
                </template>

                <template v-else>
                  <ion-select
                    class="field"
                    label="Saved resume"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    :interface-options="{ cssClass: 'ui-popover' }"
                    :value="store.resumeId"
                    @ionChange="store.setResume(String($event.detail.value ?? '') || null)"
                  >
                    <ion-select-option v-for="r in store.resumes" :key="r.id" :value="r.id">{{ resumeLabel(r) }}</ion-select-option>
                  </ion-select>
                  <p class="note">Your newest resume is chosen first.</p>
                </template>
              </div>

              <!-- Master Profile -->
              <p v-else class="pane profile-hint">
                <ion-icon :icon="personCircleOutline" aria-hidden="true" />
                <span>We use your Profile tab: experience, projects, education and skills.</span>
              </p>
            </div>

            <!-- Template -->
            <div>
              <ion-select
                class="field"
                label="Template"
                label-placement="stacked"
                fill="outline"
                interface="popover"
                :interface-options="{ cssClass: 'ui-popover' }"
                :value="store.template"
                @ionChange="store.setTemplate($event.detail.value)"
              >
                <ion-select-option v-for="t in TEMPLATES" :key="t.id" :value="t.id">{{ t.label }}</ion-select-option>
              </ion-select>
              <p class="note">{{ templateHint(store.template) }}</p>
            </div>

            <!-- AI model -->
            <ImportModelPicker :note="MODEL_NOTE" @change="store.setModel($event)" />
          </div>

          <!-- Error from the last Go (all inputs are kept) -->
          <div v-if="store.tailorError" ref="errorRef" class="error-box" role="alert">
            <ion-icon :icon="alertCircleOutline" aria-hidden="true" />
            <p>{{ store.tailorError.message }}</p>
          </div>

          <ion-button
            class="pressable ui-btn ui-btn-gradient go-btn"
            expand="block"
            size="large"
            :disabled="!store.canGo"
            @click="onGo"
          >
            <ion-icon slot="start" :icon="sparklesOutline" aria-hidden="true" />
            {{ store.tailorError?.canRetry ? 'Try again' : 'Go' }}
          </ion-button>
          <p v-if="!store.canGo && goHint" class="go-hint">{{ goHint }}</p>
        </section>

        <!-- 2. Working -->
        <section v-if="store.phase === 'working'" class="ui-surface ui-card-center fade-in-up" aria-busy="true">
          <div class="reading" aria-hidden="true"><ion-spinner name="crescent" class="big-spinner" /></div>
          <h2 class="ui-h2 status-line" aria-live="polite">
            <Transition name="status" mode="out-in"><span :key="statusLine">{{ statusLine }}</span></Transition>
          </h2>
          <p class="muted">This can take up to 2 minutes. Please keep this screen open.</p>
          <ion-button fill="outline" class="pressable ui-btn act-btn" aria-label="Cancel tailoring" @click="onCancel">
            Cancel
          </ion-button>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonSpinner, IonInput, IonTextarea,
  IonRefresher, IonRefresherContent, IonSkeletonText, IonSegment, IonSegmentButton, IonLabel, IonSelect,
  IonSelectOption, IonProgressBar, onIonViewWillEnter,
} from '@ionic/vue';
import {
  alertCircleOutline, checkmarkCircle, documentTextOutline, personCircleOutline, sparklesOutline,
} from 'ionicons/icons';
import IconChip from '@/components/IconChip.vue';
import ImportDropZone from '@/components/ImportDropZone.vue';
import ImportModelPicker from '@/components/ImportModelPicker.vue';
import { useJobsStore } from '@/stores/jobs';
import {
  MAX_JOB_CHARS, MAX_SHORT_CHARS, MAX_URL_CHARS, MIN_JOB_CHARS, TEMPLATES, charCountLabel, firstFormProblem, formatFileSize,
  resumeLabel, statusLineAt, templateHint, type ResumeTab,
} from '@/services/jobsLogic';
import { showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import { prefersReducedMotion } from '@/services/motion';

const store = useJobsStore();
const router = useRouter();
const reduced = prefersReducedMotion();

const MODEL_NOTE = 'The job text and your resume details are sent to the provider you choose (Groq, Google or OpenAI) '
  + 'to write the documents. Free plans of some providers may use submitted content to improve their products.';

const contentRef = ref<{ $el: HTMLIonContentElement } | null>(null);
const errorRef = ref<HTMLElement | null>(null);
const urlTouched = ref(false);
const titleTouched = ref(false);
const companyTouched = ref(false);

const tooShort = computed(() => store.text.trim().length > 0 && store.text.trim().length < MIN_JOB_CHARS);
const textHint = computed(() => (tooShort.value ? `Please paste at least ${MIN_JOB_CHARS} characters.` : ''));
// The link error shows after the user leaves the field (or presses Go), not while typing.
const urlError = computed(() => (urlTouched.value ? store.formErrors.url : ''));
const titleError = computed(() => (titleTouched.value ? store.formErrors.title : ''));
const companyError = computed(() => (companyTouched.value ? store.formErrors.company : ''));
const goHint = computed(() =>
  (store.uploading ? 'Please wait until your resume has uploaded.' : firstFormProblem(store.formErrors)));
const uploadedSize = computed(() => formatFileSize(store.uploaded?.size_bytes ?? 0));
const invalid = (bad: boolean) => (bad ? { 'ion-invalid': true, 'ion-touched': true } : {});

// Rotating status lines while the AI works.
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
const statusLine = computed(() => statusLineAt(now.value - store.workingSince));

function scrollToTop() {
  void contentRef.value?.$el?.scrollToTop?.(reduced ? 0 : 300);
}

watch(() => store.phase, async (phase, previous) => {
  clearInterval(ticker);
  if (phase === 'working') {
    now.value = Date.now();
    ticker = setInterval(() => { now.value = Date.now(); }, 1000);
  }
  if (previous === undefined) return;
  if (phase === 'working') {
    scrollToTop();
  } else if (store.tailorError) {
    await nextTick(); // bring the error (next to the Try again button) into view
    errorRef.value?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }
}, { immediate: true });
onBeforeUnmount(() => clearInterval(ticker));

function onTab(value: unknown) {
  if (value !== 'upload' && value !== 'saved' && value !== 'profile') return;
  tapHaptic();
  store.setTab(value as ResumeTab);
}

function onFile(file: File) {
  void store.uploadResume(file);
}

function onManyFiles() {
  store.uploadError = 'Please choose one file at a time.';
}

function onChangeFile() {
  tapHaptic();
  store.clearUploaded();
}

async function onGo() {
  tapHaptic();
  urlTouched.value = titleTouched.value = companyTouched.value = true;
  const result = await store.tailor();
  if (!result) return; // the error (if any) is shown above the button
  // The form is empty again for the next job.
  urlTouched.value = titleTouched.value = companyTouched.value = false;
  void showToast('Saved to your Tracker');
  // Open the new application, unless the user went to another screen while the AI was working.
  if (!router.currentRoute.value.path.startsWith('/tabs/jobs')) return;
  const id = result.application_id;
  router.push(id ? `/tabs/tracker/${encodeURIComponent(id)}` : '/tabs/tracker');
}

function onCancel() {
  tapHaptic();
  store.cancelTailor();
}

async function onRefresh(event: CustomEvent) {
  await store.loadResumes();
  (event.target as HTMLIonRefresherElement).complete();
}

// Every time the tab is shown, refresh the saved resumes (the old list stays on screen meanwhile).
onIonViewWillEnter(() => {
  void store.loadResumes();
});
</script>

<style scoped>
.head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px; }
.ui-h1.small { font-size: 1.2rem; }
.lead { margin: 6px 0 0; font-size: 0.93rem; line-height: 1.5; color: var(--ui-text-soft); }
.muted { margin: 6px 0 0; font-size: 0.9rem; line-height: 1.4; color: var(--ui-text-soft); }

/* form */
.form { display: flex; flex-direction: column; gap: 18px; }
.field { --border-radius: 12px; }
.counter-row { display: flex; justify-content: space-between; gap: 12px; margin: 6px 4px 0; }
.hint { margin: 0; font-size: 0.8rem; color: var(--ui-text-soft); }
.hint.warn { color: var(--ui-error-ink); }
.count { margin: 0 0 0 auto; font-size: 0.8rem; color: var(--ui-text-soft); font-variant-numeric: tabular-nums; }
.note { margin: 8px 4px 0; font-size: 0.8rem; line-height: 1.4; color: var(--ui-text-soft); }
.error { margin: 10px 0 0; }

.group-title { margin: 0 0 8px 4px; font-size: 0.9rem; font-weight: 650; }
.seg { min-height: 44px; --background: var(--ui-soft); border-radius: 14px; }
.seg ion-segment-button { min-width: 0; --padding-start: 4px; --padding-end: 4px; }
.seg ion-label { white-space: normal; line-height: 1.2; font-size: 0.85rem; }
.pane { margin-top: 12px; }
.pane-state { text-align: center; }
.small-btn { margin: 8px 0 0; min-height: 40px; --border-radius: 12px; }
/* small text buttons in normal letter case, like the rest of the app (Material mode makes them uppercase) */
.plain-btn { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: 0.875rem; }
.sk-select { height: 56px; width: 100%; margin: 0; border-radius: 12px; }

.file-row {
  padding: 12px 12px 10px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-soft);
}
.file-main { display: flex; align-items: center; gap: 10px; }
.file-icon { flex: none; font-size: 26px; color: var(--ui-accent-ink); }
.file-icon.ok { color: color-mix(in oklab, var(--color-success) 60%, var(--color-base-content)); }
.file-text { flex: 1; min-width: 0; }
.file-name { margin: 0; font-size: 0.93rem; font-weight: 600; overflow-wrap: anywhere; }
.file-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--ui-text-soft); }
.file-progress { margin-top: 10px; border-radius: 4px; }
.change-btn { margin: 6px 0 0; }

.profile-hint { display: flex; align-items: flex-start; gap: 8px; font-size: 0.9rem; line-height: 1.4; color: var(--ui-text-soft); }
.profile-hint ion-icon { flex: none; font-size: 20px; color: var(--ui-accent-ink); }

.error-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 18px 0 0;
  padding: 10px 12px;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-error-ink);
  background: color-mix(in oklab, var(--color-error) 10%, var(--color-base-100));
  border: 1px solid color-mix(in oklab, var(--color-error) 28%, transparent);
}
.error-box ion-icon { flex: none; font-size: 20px; margin-top: 1px; }
.error-box p { margin: 0; font-size: 0.9rem; line-height: 1.4; }
.go-btn { margin: 18px 0 0; min-height: 56px; font-size: 1.05rem; }
.go-hint { margin: 8px 4px 0; text-align: center; font-size: 0.82rem; line-height: 1.4; color: var(--ui-text-soft); }

/* working */
.reading {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--ui-gradient-soft);
}
.big-spinner { width: 36px; height: 36px; color: var(--color-primary); }
.status-line { min-height: 1.5em; }
.status-enter-active, .status-leave-active { transition: opacity 0.25s ease; }
.status-enter-from, .status-leave-to { opacity: 0; }
.act-btn { margin: 16px 0 0; }

@media (prefers-reduced-motion: reduce) {
  .status-enter-active, .status-leave-active { transition: none; }
}
</style>
