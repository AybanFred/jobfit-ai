<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button class="back-btn" aria-label="Back to Tracker" @click="goBack">
            <ion-icon slot="icon-only" :icon="backIcon" aria-hidden="true" />
          </ion-button>
        </ion-buttons>
        <ion-title>Application</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="ui-page detail-page">
        <!-- Loading -->
        <div v-if="!detail && (status === 'loading' || !status)" class="skeletons" aria-busy="true" aria-label="Loading the application">
          <div class="ui-surface ui-card">
            <ion-skeleton-text :animated="!reduced" class="sk-line sk-title" />
            <ion-skeleton-text :animated="!reduced" class="sk-line w40" />
            <ion-skeleton-text :animated="!reduced" class="sk-line w60" />
          </div>
          <div class="ui-surface ui-card">
            <ion-skeleton-text :animated="!reduced" class="sk-field" />
            <ion-skeleton-text :animated="!reduced" class="sk-line w90" />
            <ion-skeleton-text :animated="!reduced" class="sk-field" />
          </div>
        </div>

        <!-- Not found -->
        <div v-else-if="!detail && status === 'notfound'" class="ui-surface ui-card-center fade-in-up">
          <EmptyState
            variant="generic"
            title="Application not found"
            text="It may have been deleted, or the link is no longer valid."
          >
            <ion-button fill="outline" class="pressable ui-btn" @click="goBack">Back to Tracker</ion-button>
          </EmptyState>
        </div>

        <!-- Error -->
        <div v-else-if="!detail" class="ui-surface ui-card-center fade-in-up">
          <p class="ui-error-text" role="alert">{{ store.detailError[id] || 'We could not load this application.' }}</p>
          <ion-button fill="outline" class="pressable ui-btn act-btn" @click="store.loadDetail(id)">Try again</ion-button>
        </div>

        <template v-else>
          <!-- 1. The job -->
          <section class="ui-surface ui-card head-card fade-in-up" aria-labelledby="job-title">
            <h1 id="job-title" class="ui-h1 small">{{ appTitle(detail) }}</h1>
            <p class="company">{{ appCompanyLine(detail) }}</p>
            <ul class="facts">
              <li v-if="formatDate(detail.created_at)">
                <ion-icon :icon="calendarOutline" aria-hidden="true" />
                <span>Saved {{ formatDate(detail.created_at) }}</span>
              </li>
              <li v-if="detail.source_resume">
                <ion-icon :icon="documentTextOutline" aria-hidden="true" />
                <span>From {{ detail.source_resume.file_name }}</span>
              </li>
              <li v-if="scoreText(detail.match?.score)">
                <ion-icon :icon="analyticsOutline" aria-hidden="true" />
                <span>{{ scoreText(detail.match?.score) }} match</span>
              </li>
            </ul>
            <ion-button
              v-if="detail.job.source_url"
              :href="detail.job.source_url"
              target="_blank"
              rel="noopener noreferrer"
              fill="outline"
              size="small"
              class="pressable ui-btn post-btn"
            >
              <ion-icon slot="start" :icon="openOutline" aria-hidden="true" />
              Open job post
            </ion-button>
          </section>

          <!-- 2. Progress: status, dates, notes -->
          <section class="ui-surface ui-card fade-in-up" style="--i: 1" aria-labelledby="progress-title">
            <div class="card-head">
              <h2 id="progress-title" class="ui-h2">Progress</h2>
              <p class="save-state" :class="`is-${saveState}`" aria-live="polite">
                <template v-if="isSaving">
                  <ion-spinner name="crescent" class="mini-spinner" aria-hidden="true" />
                  Saving…
                </template>
                <template v-else-if="saveState === 'saved'">
                  <ion-icon :icon="checkmarkCircle" aria-hidden="true" />
                  Saved
                </template>
              </p>
            </div>

            <div class="form">
              <ion-select
                class="field"
                label="Status"
                label-placement="stacked"
                fill="outline"
                interface="popover"
                :interface-options="{ cssClass: 'ui-popover' }"
                :value="detail.status"
                @ionChange="onStatus($event.detail.value)"
              >
                <ion-select-option v-for="s in STATUSES" :key="s" :value="s">{{ statusLabel(s) }}</ion-select-option>
              </ion-select>

              <div class="dates">
                <TrackerDateField
                  :field-id="`applied-${domId}`"
                  label="Applied date"
                  :value="detail.applied_at"
                  @change="save({ applied_at: $event })"
                />
                <TrackerDateField
                  :field-id="`follow-${domId}`"
                  label="Follow-up date"
                  :value="detail.follow_up_at"
                  @change="save({ follow_up_at: $event })"
                />
              </div>

              <div>
                <ion-textarea
                  class="field"
                  label="Notes"
                  label-placement="stacked"
                  fill="outline"
                  placeholder="Contacts, interview times, next steps…"
                  :auto-grow="true"
                  :rows="3"
                  :maxlength="MAX_NOTES_CHARS"
                  :counter="true"
                  :value="notesDraft"
                  @ionInput="notesDraft = String($event.detail.value ?? '')"
                />
                <div class="notes-actions">
                  <ion-button
                    size="small"
                    class="pressable ui-btn save-btn"
                    :disabled="!notesDirty || savingNotes"
                    @click="saveNotes"
                  >
                    Save notes
                  </ion-button>
                </div>
              </div>
            </div>

            <p v-if="saveState === 'error'" class="ui-error-text save-error" role="alert">{{ saveMessage }}</p>
          </section>

          <!-- 3. Documents, match and the job post -->
          <button
            v-if="warnings.length"
            type="button"
            class="ui-pill ui-tone-warning check-pill pressable fade-in-up"
            style="--i: 2"
            @click="tab = 'match'"
          >
            <ion-icon :icon="alertCircleOutline" aria-hidden="true" />
            Please check {{ warnings.length }} line{{ warnings.length === 1 ? '' : 's' }} in the Match tab
          </button>

          <ion-segment class="seg doc-seg fade-in-up" style="--i: 2" :value="tab" @ionChange="onTab($event.detail.value)">
            <ion-segment-button value="resume"><ion-label>Resume</ion-label></ion-segment-button>
            <ion-segment-button value="letter"><ion-label>Cover letter</ion-label></ion-segment-button>
            <ion-segment-button value="email"><ion-label>Email</ion-label></ion-segment-button>
            <ion-segment-button value="match"><ion-label>Match</ion-label></ion-segment-button>
            <ion-segment-button value="job"><ion-label>Job post</ion-label></ion-segment-button>
          </ion-segment>

          <div class="tab-body fade-in-up" style="--i: 3">
            <!-- Resume -->
            <template v-if="tab === 'resume'">
              <div v-if="resumeDocId" class="dl-row" role="group" aria-label="Download the resume">
                <ion-button
                  v-for="f in FORMATS"
                  :key="f"
                  fill="outline"
                  size="small"
                  class="pressable ui-btn dl-btn"
                  :disabled="store.isDownloading(resumeDocId, f)"
                  @click="download(resumeDocId, f, 'resume')"
                >
                  <ion-spinner v-if="store.isDownloading(resumeDocId, f)" slot="start" name="crescent" class="mini-spinner" />
                  <ion-icon v-else slot="start" :icon="downloadOutline" aria-hidden="true" />
                  Download {{ FORMAT_LABEL[f] }}
                </ion-button>
              </div>
              <!-- Only the Harvard layout exists so far; choose the preview by detail.resume.template when more are added. -->
              <HarvardResumePreview v-if="detail.resume" :resume="detail.resume.content" />
              <p v-else class="ui-surface ui-card none">No tailored resume was saved for this job.</p>
            </template>

            <!-- Cover letter -->
            <template v-else-if="tab === 'letter'">
              <div v-if="letterDocId" class="dl-row" role="group" aria-label="Download the cover letter">
                <ion-button
                  v-for="f in FORMATS"
                  :key="f"
                  fill="outline"
                  size="small"
                  class="pressable ui-btn dl-btn"
                  :disabled="store.isDownloading(letterDocId, f)"
                  @click="download(letterDocId, f, 'cover_letter')"
                >
                  <ion-spinner v-if="store.isDownloading(letterDocId, f)" slot="start" name="crescent" class="mini-spinner" />
                  <ion-icon v-else slot="start" :icon="downloadOutline" aria-hidden="true" />
                  Download {{ FORMAT_LABEL[f] }}
                </ion-button>
              </div>
              <CoverLetterPreview v-if="detail.cover_letter" :letter="detail.cover_letter.content" />
              <p v-else class="ui-surface ui-card none">No cover letter was saved for this job.</p>
            </template>

            <!-- Email -->
            <ApplicationEmailPanel
              v-else-if="tab === 'email'"
              :detail="detail"
              :model-id="jobs.modelId"
              :mark-applied="markApplied"
              :active="pageActive"
            />

            <!-- Match (email warnings are shown on the Email tab instead) -->
            <template v-else-if="tab === 'match'">
              <JobMatchSummary v-if="detail.match" :match="matchResultOf(detail.match)" :warnings="warnings" />
              <p v-else class="ui-surface ui-card none">No match details were saved for this job.</p>
            </template>

            <!-- Job post -->
            <template v-else>
              <section class="ui-surface ui-card" aria-label="Job post details">
                <JobDetails :job="detail.job.parsed" />
              </section>
              <ion-accordion-group v-if="detail.job.raw_text.trim()" class="ui-surface raw-group">
                <ion-accordion value="raw">
                  <ion-item slot="header" lines="none" class="raw-head">
                    <ion-label>Original job post text</ion-label>
                  </ion-item>
                  <div slot="content" class="raw-text">{{ detail.job.raw_text }}</div>
                </ion-accordion>
              </ion-accordion-group>
            </template>
          </div>

          <!-- 4. Delete -->
          <section class="danger" aria-label="Delete">
            <ion-button
              fill="outline"
              color="danger"
              expand="block"
              class="pressable ui-btn"
              :disabled="store.deletingId === id"
              @click="onDelete"
            >
              <ion-icon slot="start" :icon="trashOutline" aria-hidden="true" />
              Delete application
            </ion-button>
            <p class="fine">Removes the job, its resume, cover letter and email from your Tracker.</p>
          </section>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner, IonSelect,
  IonSelectOption, IonTextarea, IonSegment, IonSegmentButton, IonLabel, IonSkeletonText, IonRefresher,
  IonRefresherContent, IonAccordionGroup, IonAccordion, IonItem, onIonViewWillEnter, onIonViewWillLeave, useIonRouter,
} from '@ionic/vue';
import {
  alertCircleOutline, analyticsOutline, arrowBackSharp, calendarOutline, checkmarkCircle, chevronBack,
  documentTextOutline, downloadOutline, openOutline, trashOutline,
} from 'ionicons/icons';
import ApplicationEmailPanel from '@/components/ApplicationEmailPanel.vue';
import CoverLetterPreview from '@/components/CoverLetterPreview.vue';
import EmptyState from '@/components/EmptyState.vue';
import HarvardResumePreview from '@/components/HarvardResumePreview.vue';
import JobDetails from '@/components/JobDetails.vue';
import JobMatchSummary from '@/components/JobMatchSummary.vue';
import TrackerDateField from '@/components/TrackerDateField.vue';
import { tapHaptic } from '@/services/haptics';
import { prefersReducedMotion } from '@/services/motion';
import {
  FORMAT_LABEL, MAX_NOTES_CHARS, STATUSES, appCompanyLine, appTitle, cleanNotes, detailDocId, formatDate, isStatus,
  matchResultOf, matchWarningsOf, scoreText, statusLabel, type ApplicationPatch, type DocType, type ExportFormat,
} from '@/services/trackerLogic';
import { useJobsStore } from '@/stores/jobs';
import { useTrackerStore } from '@/stores/tracker';

type DetailTab = 'resume' | 'letter' | 'email' | 'match' | 'job';
const TABS: readonly DetailTab[] = ['resume', 'letter', 'email', 'match', 'job'];

// The route passes the application id as a prop (router: props: true).
const props = defineProps<{ id: string }>();

const store = useTrackerStore();
// The Email tab writes with the AI model chosen on the Jobs tab (null = the server's default).
const jobs = useJobsStore();
const ionRouter = useIonRouter();
const reduced = prefersReducedMotion();
const FORMATS: readonly ExportFormat[] = ['pdf', 'docx'];
// md (Android, web) and ios use different back arrows, like ion-back-button.
const backIcon = document.documentElement.getAttribute('mode') === 'ios' ? chevronBack : arrowBackSharp;
// Safe for element ids (Ionic links each date button to its calendar by id).
const domId = computed(() => props.id.replace(/[^a-zA-Z0-9_-]/g, '_'));

const detail = computed(() => store.details[props.id] ?? null);
const status = computed(() => store.detailStatus[props.id]);
// Match tab warnings only: lines about the email are shown (and counted) on the Email tab.
const warnings = computed(() => matchWarningsOf(detail.value?.match?.warnings ?? []));
const resumeDocId = computed(() => (detail.value ? detailDocId(detail.value, 'resume') : null));
const letterDocId = computed(() => (detail.value ? detailDocId(detail.value, 'cover_letter') : null));

const tab = ref<DetailTab>('resume');
function onTab(value: unknown) {
  if (TABS.includes(value as DetailTab)) tab.value = value as DetailTab;
}

/** False while another screen is in front (Ionic keeps this page in memory). */
const pageActive = ref(true);
const markApplied = () => save({ status: 'applied' });

// ----- saving (status, dates, notes) -----
type SaveState = 'idle' | 'saved' | 'error';
const saveState = ref<SaveState>('idle');
const saveMessage = ref('');
// Only this card's own saves (the Email tab saves the recruiter address with its own "Saving…" line).
const savesRunning = ref(0);
const isSaving = computed(() => savesRunning.value > 0);
let saveSeq = 0;
let savedTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(savedTimer));

async function save(patch: ApplicationPatch): Promise<boolean> {
  const seq = ++saveSeq;
  clearTimeout(savedTimer);
  saveState.value = 'idle';
  saveMessage.value = '';
  savesRunning.value += 1;
  let problem = '';
  try {
    problem = await store.patchApplication(props.id, patch);
  } finally {
    savesRunning.value -= 1;
  }
  if (problem) {
    // Always show a failure, even if another save started meanwhile (the change was undone).
    saveState.value = 'error';
    saveMessage.value = problem;
    return false;
  }
  if (seq === saveSeq) {
    saveState.value = 'saved';
    savedTimer = setTimeout(() => { if (saveState.value === 'saved') saveState.value = 'idle'; }, 2500);
  }
  return true;
}

function onStatus(value: unknown) {
  if (!isStatus(value) || value === detail.value?.status) return;
  void tapHaptic();
  void save({ status: value });
}

// Notes are saved with the button (not on every key press).
const notesDraft = ref('');
const savingNotes = ref(false);
const notesDirty = computed(() => cleanNotes(notesDraft.value) !== cleanNotes(detail.value?.notes ?? ''));
watch(() => detail.value?.notes, (now, before) => {
  // Take the saved notes unless the user is in the middle of editing them.
  if (before === undefined || cleanNotes(notesDraft.value) === cleanNotes(before ?? '')) notesDraft.value = now ?? '';
}, { immediate: true });

async function saveNotes() {
  void tapHaptic();
  savingNotes.value = true;
  try {
    await save({ notes: cleanNotes(notesDraft.value) });
  } finally {
    savingNotes.value = false;
  }
}

// ----- downloads, delete, navigation -----
function download(docId: string, format: ExportFormat, type: DocType) {
  void tapHaptic();
  void store.download(docId, format, type);
}

/** Back to the list: a real "back" when we came from it, else open the list (e.g. after a new job on the Jobs tab). */
function goBack() {
  void tapHaptic();
  const back = (window.history.state as { back?: unknown } | null)?.back;
  const fromList = typeof back === 'string' && back.replace(/[?#].*$/, '').replace(/\/+$/, '') === '/tabs/tracker';
  if (fromList) ionRouter.back();
  else ionRouter.navigate('/tabs/tracker', 'back', 'replace');
}

async function onDelete() {
  if (await store.removeApplication(props.id)) goBack();
}

async function onRefresh(event: CustomEvent) {
  await store.loadDetail(props.id);
  (event.target as HTMLIonRefresherElement).complete();
}

// Every time the screen is shown, (re)load it. A cached copy stays on screen meanwhile.
onIonViewWillEnter(() => {
  pageActive.value = true;
  void store.loadDetail(props.id);
});
onIonViewWillLeave(() => {
  pageActive.value = false;
});
</script>

<style scoped>
.detail-page { --ui-maxw: 760px; }
.back-btn { min-width: 44px; min-height: 44px; }
.ui-h1.small { font-size: 1.25rem; overflow-wrap: anywhere; }

/* loading */
.skeletons { display: flex; flex-direction: column; gap: 16px; }
.sk-line { height: 14px; margin: 0 0 10px; border-radius: 6px; }
.sk-title { height: 22px; width: 70%; }
.sk-field { height: 52px; width: 100%; margin: 0 0 12px; border-radius: 12px; }
.w40 { width: 40%; }
.w60 { width: 60%; }
.w90 { width: 90%; }
.act-btn { margin: 16px 0 0; }

/* header */
.company { margin: 4px 0 0; font-size: 0.95rem; font-weight: 550; color: var(--ui-text-soft); overflow-wrap: anywhere; }
.facts { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; }
.facts li { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--ui-text-soft); min-width: 0; }
.facts span { overflow-wrap: anywhere; }
.facts ion-icon { flex: none; font-size: 16px; color: var(--ui-accent-ink); }
.post-btn { margin: 14px 0 0; min-height: 40px; }

/* progress */
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.save-state { display: inline-flex; align-items: center; gap: 6px; margin: 0; min-height: 20px; font-size: 0.82rem; font-weight: 600; color: var(--ui-text-soft); }
.save-state.is-saved { color: color-mix(in oklab, var(--color-success) 40%, var(--color-base-content)); }
.save-state ion-icon { font-size: 18px; }
.mini-spinner { width: 16px; height: 16px; }
.form { display: flex; flex-direction: column; gap: 16px; }
.field { --border-radius: 12px; }
.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.notes-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.save-btn { margin: 0; min-height: 40px; }
.save-error { margin: 12px 0 0; }

/* documents */
.check-pill { align-self: flex-start; min-height: 36px; cursor: pointer; font: inherit; font-size: 0.82rem; font-weight: 650; }
.check-pill ion-icon { font-size: 16px; }
.seg { min-height: 44px; --background: var(--ui-soft); border-radius: 14px; }
.seg ion-segment-button { min-width: 0; --padding-start: 4px; --padding-end: 4px; }
.seg ion-label { white-space: normal; line-height: 1.2; font-size: 0.82rem; }
/* Five tabs on a phone: normal letter case so each word fits (Material's uppercase cut "Resume" in two).
   Long labels wrap between words only. */
.doc-seg ion-segment-button { text-transform: none; letter-spacing: 0; }
.doc-seg ion-label { overflow-wrap: normal; word-break: normal; }
.tab-body { display: flex; flex-direction: column; gap: 12px; }
.dl-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dl-btn { margin: 0; min-height: 40px; flex: 1 1 140px; max-width: 240px; }
.none { margin: 0; font-size: 0.9rem; color: var(--ui-text-soft); }

.raw-group { overflow: hidden; }
.raw-head { --background: transparent; --padding-start: 16px; font-weight: 600; }
.raw-text {
  padding: 4px 16px 16px;
  font-size: 0.88rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--color-base-content);
}

/* delete */
.danger { margin-top: 8px; }
.fine { margin: 8px 0 0; font-size: 0.8rem; text-align: center; color: var(--ui-text-soft); }
</style>
