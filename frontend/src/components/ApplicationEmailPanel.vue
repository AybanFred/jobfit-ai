<template>
  <div class="email-panel">
    <!-- Read out when the AI starts writing (the busy block below appears at the same moment). -->
    <p class="ui-visually-hidden" aria-live="polite">{{ writing ? 'Writing your email…' : '' }}</p>

    <!-- 1. Lines to check (only the email ones; they are not counted on the Match tab) -->
    <section
      v-if="email && !writing && warnings.length"
      class="ui-surface ui-card warn-card ui-tone-warning"
      :aria-labelledby="`${uid}-warn`"
    >
      <div class="warn-head">
        <ion-icon :icon="alertCircleOutline" class="warn-icon" aria-hidden="true" />
        <h2 :id="`${uid}-warn`" ref="warnRef" class="ui-h3 focus-target" tabindex="-1">Please check these lines</h2>
      </div>
      <p class="warn-intro">Check these before you send. You can change the text in your email app.</p>
      <ul class="warn-list">
        <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
      </ul>
    </section>

    <!-- 2. The email -->
    <section class="ui-surface ui-card" :aria-labelledby="`${uid}-title`">
      <h2 :id="`${uid}-title`" ref="titleRef" class="ui-h2 email-title focus-target" tabindex="-1">Application email</h2>

      <!-- To: saved when the user leaves the field -->
      <div>
        <ion-input
          class="field"
          :class="invalid(!!toError)"
          label="To (recruiter email)"
          label-placement="stacked"
          fill="outline"
          type="email"
          inputmode="email"
          autocapitalize="off"
          autocomplete="off"
          :spellcheck="false"
          placeholder="recruiter@company.com"
          :maxlength="MAX_EMAIL_CHARS"
          helper-text="Optional. If empty, you choose the recipient in your email app."
          :error-text="toError"
          :value="toDraft"
          @ionInput="toDraft = String($event.detail.value ?? '')"
          @ionBlur="onToBlur"
        />
        <p v-if="toSaveError" class="ui-error-text addr-error" role="alert">{{ toSaveError }}</p>
        <p v-else class="save-state" :class="`is-${toState}`" aria-live="polite">
          <template v-if="toState === 'saving'">
            <ion-spinner name="crescent" class="mini-spinner" aria-hidden="true" />
            Saving…
          </template>
          <template v-else-if="toState === 'saved'">
            <ion-icon :icon="checkmarkCircle" aria-hidden="true" />
            Saved
          </template>
        </p>
      </div>

      <!-- Writing failed (the previous email, if any, is still shown below) -->
      <div v-if="writeError && !writing" class="error-box" role="alert">
        <ion-icon :icon="alertCircleOutline" aria-hidden="true" />
        <p>{{ writeError }}</p>
      </div>

      <!-- Writing -->
      <div v-if="writing" class="writing" aria-busy="true">
        <ion-spinner name="crescent" class="writing-spinner" aria-hidden="true" />
        <p class="writing-title">Writing your email…</p>
        <p class="muted">This can take up to a minute. Please keep this screen open.</p>
        <ion-button fill="outline" class="pressable ui-btn cancel-btn" aria-label="Cancel writing the email" @click="onCancel">
          Cancel
        </ion-button>
      </div>

      <!-- No email yet -->
      <div v-else-if="!email" class="no-email">
        <h3 class="ui-h3">No email yet</h3>
        <p class="muted">Write a short email to send with your resume and cover letter. It uses only your real experience.</p>
        <ion-button class="pressable ui-btn write-btn" @click="onWrite">
          <ion-icon slot="start" :icon="sparklesOutline" aria-hidden="true" />
          {{ writeError ? 'Try again' : 'Write email' }}
        </ion-button>
        <p class="fine">Uses the AI model you chose on the Jobs tab.</p>
      </div>

      <!-- Subject and message -->
      <template v-else>
        <div class="texts">
          <EmailTextBlock
            label="Subject"
            :field-id="`${uid}-subject`"
            :text="email.subject"
            copy-label="Copy subject"
            copied-message="Subject copied"
            empty-text="No subject"
          />
          <EmailTextBlock
            label="Message"
            :field-id="`${uid}-message`"
            :text="email.body"
            copy-label="Copy message"
            copied-message="Message copied"
            empty-text="The email came back empty. Please write a new version."
            multiline
          />
        </div>
        <div class="regen-row">
          <ion-button
            fill="clear"
            size="small"
            class="pressable plain-btn regen-btn"
            aria-label="Write a new version of the email"
            @click="onRegenerate"
          >
            <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
            Write a new version
          </ion-button>
        </div>
      </template>
    </section>

    <template v-if="email && !writing">
      <!-- 3. Attach the documents (the email app cannot attach them for the user) -->
      <section v-if="resumeDocId || letterDocId" class="ui-surface ui-card" :aria-labelledby="`${uid}-attach`">
        <h2 :id="`${uid}-attach`" class="ui-h3">Attach your resume and cover letter</h2>
        <p class="muted attach-help">Your email app cannot attach files for you. Download them first, then attach them when the email opens.</p>
        <div class="attach-groups">
          <div v-for="g in attachGroups" :key="g.type" class="attach-group">
            <p class="group-label" aria-hidden="true">{{ g.label }}</p>
            <div class="dl-row" role="group" :aria-label="`Download the ${g.label.toLowerCase()}`">
              <ion-button
                v-for="f in FORMATS"
                :key="f"
                fill="outline"
                size="small"
                class="pressable ui-btn dl-btn"
                :disabled="store.isDownloading(g.docId, f)"
                @click="download(g.docId, f, g.type)"
              >
                <ion-spinner v-if="store.isDownloading(g.docId, f)" slot="start" name="crescent" class="mini-spinner" />
                <ion-icon v-else slot="start" :icon="downloadOutline" aria-hidden="true" />
                Download {{ FORMAT_LABEL[f] }}
              </ion-button>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. Open the email app (a real mailto: link; the user checks it and presses send) -->
      <div class="open-area">
        <ion-button
          expand="block"
          size="large"
          class="pressable ui-btn ui-btn-gradient open-btn"
          :href="send.href ?? undefined"
          :disabled="!send.href"
          @click="onOpen"
        >
          <ion-icon slot="start" :icon="mailOutline" aria-hidden="true" />
          Open in email app
        </ion-button>
        <!-- Read right after the button (aria-describedby would not reach into ion-button's shadow DOM). -->
        <div class="open-hint">
          <p v-for="h in send.hints" :key="h">{{ h }}</p>
        </div>

        <!-- 5. "Sent it?" after coming back from the email app. A live region, so it never takes focus. -->
        <div role="status">
          <EmailSentBanner v-if="banner.visible.value" :saving="marking" :error="markError" @mark="onMark" @dismiss="onNotYet" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IonButton, IonIcon, IonInput, IonSpinner } from '@ionic/vue';
import {
  alertCircleOutline, checkmarkCircle, downloadOutline, mailOutline, refreshOutline, sparklesOutline,
} from 'ionicons/icons';
import EmailSentBanner from '@/components/EmailSentBanner.vue';
import EmailTextBlock from '@/components/EmailTextBlock.vue';
import { useSentItBanner } from '@/composables/useSentItBanner';
import { confirmAction, showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import { MAX_EMAIL_CHARS, cleanEmail } from '@/services/jobsLogic';
import {
  FORMAT_LABEL, detailDocId, emailSendState, validateRecruiterEmail,
  type ApplicationDetail, type DocType, type ExportFormat,
} from '@/services/trackerLogic';
import { useTrackerStore } from '@/stores/tracker';

// The "Email" tab of an application: recruiter address, the AI-written email (copy, new version),
// downloads to attach, "Open in email app" (mailto) and the "Sent it?" question afterwards.
const props = withDefaults(defineProps<{
  detail: ApplicationDetail;
  /** The AI model chosen on the Jobs tab (null = the server's default). */
  modelId: string | null;
  /** Sets the status to Applied (the page's own save). Resolves to true when saved. */
  markApplied: () => Promise<boolean>;
  /** False while the page is not in front (Ionic keeps it in memory). */
  active?: boolean;
}>(), { active: true });

const store = useTrackerStore();
const FORMATS: readonly ExportFormat[] = ['pdf', 'docx'];
const SAVE_FAILED = 'We could not save the address. Please try again.';
const MARK_FAILED = 'We could not update the status. Please try again.';

const id = computed(() => props.detail.id);
// Safe for element ids.
const uid = computed(() => `email-${props.detail.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
const email = computed(() => props.detail.email);
const writing = computed(() => !!store.emailWriting[id.value]);
const writeError = computed(() => store.emailError[id.value] || '');
const warnings = computed(() => store.emailWarningsFor(id.value));
const resumeDocId = computed(() => detailDocId(props.detail, 'resume'));
const letterDocId = computed(() => detailDocId(props.detail, 'cover_letter'));
const attachGroups = computed(() => {
  const groups: { type: DocType; label: string; docId: string }[] = [];
  if (resumeDocId.value) groups.push({ type: 'resume', label: 'Resume', docId: resumeDocId.value });
  if (letterDocId.value) groups.push({ type: 'cover_letter', label: 'Cover letter', docId: letterDocId.value });
  return groups;
});
const invalid = (bad: boolean) => (bad ? { 'ion-invalid': true, 'ion-touched': true } : {});

let alive = true;
onBeforeUnmount(() => { alive = false; });

// ----- To (recruiter email) -----
type ToState = 'idle' | 'saving' | 'saved';
const toDraft = ref(props.detail.recruiter_email ?? '');
/** The address last confirmed by the server for this field. The draft is "edited" while it differs. */
let lastSaved = props.detail.recruiter_email ?? '';
const toTouched = ref(false);
const toState = ref<ToState>('idle');
const toSaveError = ref('');
let toSeq = 0;
let toTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(toTimer));

const same = (a: string | null, b: string | null) => (cleanEmail(a) ?? '') === (cleanEmail(b) ?? '');
const toError = computed(() => (toTouched.value ? validateRecruiterEmail(toDraft.value) : ''));

// Take a new address from the server (refresh) unless the user has an edited or unsaved address in the box.
// Changes shown at once while saving, and undone after a failed save, are skipped too: the typed text stays.
watch(() => props.detail.recruiter_email, (now) => {
  if (!same(toDraft.value, lastSaved)) return;
  toDraft.value = now ?? '';
  lastSaved = now ?? '';
});

function onToBlur() {
  toTouched.value = true;
  const value = cleanEmail(toDraft.value);
  toDraft.value = value ?? '';
  if (validateRecruiterEmail(toDraft.value)) return; // the error shows under the field; nothing is saved
  if (same(value, lastSaved)) {
    toSaveError.value = '';
    return;
  }
  void saveTo(value);
}

async function saveTo(value: string | null) {
  const seq = ++toSeq;
  clearTimeout(toTimer);
  toSaveError.value = '';
  toState.value = 'saving';
  const problem = await store.patchApplication(id.value, { recruiter_email: value });
  if (seq !== toSeq || !alive) return; // a newer save decides what is shown
  if (problem) {
    toState.value = 'idle';
    toSaveError.value = SAVE_FAILED; // the typed address stays in the box; leaving the field again retries
    return;
  }
  lastSaved = value ?? '';
  toState.value = 'saved';
  toTimer = setTimeout(() => { if (toState.value === 'saved') toState.value = 'idle'; }, 2500);
}

// ----- Writing the email -----
const titleRef = ref<HTMLElement | null>(null);
const warnRef = ref<HTMLElement | null>(null);

/** After a new email: focus the "Please check these lines" heading when it has warnings, else the title. */
async function focusNewEmail() {
  if (!alive || !props.active) return;
  await nextTick();
  (warnings.value.length && warnRef.value ? warnRef.value : titleRef.value)?.focus();
}

async function write() {
  banner.hide();
  if (await store.writeEmail(id.value, props.modelId)) void focusNewEmail();
}

function onWrite() {
  void tapHaptic();
  void write();
}

async function onRegenerate() {
  void tapHaptic();
  const ok = await confirmAction(
    'Write a new version?',
    'This replaces the email you see now. Your resume and cover letter stay the same.',
    'Replace email',
  );
  if (ok) void write();
}

function onCancel() {
  void tapHaptic();
  store.cancelEmail(id.value);
}

function download(docId: string, format: ExportFormat, type: DocType) {
  void tapHaptic();
  void store.download(docId, format, type);
}

// ----- Open in email app + "Sent it?" -----
const send = computed(() => emailSendState(toDraft.value, email.value?.subject ?? '', email.value?.body ?? ''));
const marking = ref(false);
const markError = ref('');
// While "Mark as Applied" saves, the status is already shown as Applied: keep the banner until it is done.
const banner = useSentItBanner(() => props.detail.status === 'saved' || marking.value);

function onOpen() {
  if (!send.value.href) return;
  void tapHaptic();
  markError.value = '';
  banner.arm();
}

async function onMark() {
  if (marking.value) return;
  void tapHaptic();
  marking.value = true;
  markError.value = '';
  let ok = false;
  try {
    ok = await props.markApplied();
  } finally {
    marking.value = false;
  }
  if (!alive) return;
  if (ok) {
    banner.hide();
    void showToast('Marked as Applied');
  } else {
    markError.value = MARK_FAILED;
  }
}

function onNotYet() {
  void tapHaptic();
  banner.hide();
}

// Leaving the page (Ionic keeps it in memory) hides the question; it is never remembered.
watch(() => props.active, (on) => { if (!on) banner.hide(); });

// Another application in the same component: start fresh.
watch(id, () => {
  banner.hide();
  markError.value = '';
  toSeq += 1;
  clearTimeout(toTimer);
  toState.value = 'idle';
  toSaveError.value = '';
  toTouched.value = false;
  toDraft.value = props.detail.recruiter_email ?? '';
  lastSaved = toDraft.value;
});
</script>

<style scoped>
.email-panel { display: flex; flex-direction: column; gap: 12px; }
.email-title { margin-bottom: 14px; }
/* Headings focused by the app after a new email (tabindex -1): no ring, they are not buttons. */
.focus-target:focus, .focus-target:focus-visible { outline: none; }
.field { --border-radius: 12px; }
.muted { margin: 6px 0 0; font-size: 0.9rem; line-height: 1.45; color: var(--ui-text-soft); }
.fine { margin: 10px 0 0; font-size: 0.8rem; line-height: 1.4; color: var(--ui-text-soft); }
.mini-spinner { width: 16px; height: 16px; }
/* small text buttons in normal letter case (Material mode makes them uppercase) */
.plain-btn { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: 0.875rem; }

/* To */
.save-state {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 4px 0;
  min-height: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ui-text-soft);
}
.save-state.is-saved { color: color-mix(in oklab, var(--color-success) 40%, var(--color-base-content)); }
.save-state ion-icon { font-size: 18px; }
.addr-error { margin: 6px 4px 0; font-size: 0.85rem; }

/* warnings (same look as the Match tab) */
.warn-card {
  background: var(--tone-tint);
  border-color: color-mix(in oklab, var(--tone) 30%, transparent);
}
.warn-head { display: flex; align-items: center; gap: 8px; }
.warn-icon { flex: none; font-size: 22px; color: var(--tone-ink); }
.warn-intro { margin: 6px 0 0; font-size: 0.88rem; line-height: 1.45; }
.warn-list { margin: 8px 0 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.5; }
.warn-list li + li { margin-top: 4px; }

/* error */
.error-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-error-ink);
  background: color-mix(in oklab, var(--color-error) 10%, var(--color-base-100));
  border: 1px solid color-mix(in oklab, var(--color-error) 28%, transparent);
}
.error-box ion-icon { flex: none; font-size: 20px; margin-top: 1px; }
.error-box p { margin: 0; font-size: 0.9rem; line-height: 1.4; }

/* writing */
.writing { text-align: center; padding: 20px 8px 4px; }
.writing-spinner { width: 32px; height: 32px; color: var(--color-primary); }
.writing-title { margin: 10px 0 0; font-size: 1rem; font-weight: 650; }
.cancel-btn { margin: 14px 0 0; min-height: 44px; }

/* no email yet */
.no-email { text-align: center; padding: 18px 8px 4px; }
.no-email .muted { max-width: 46ch; margin-left: auto; margin-right: auto; }
.write-btn { margin: 14px 0 0; min-height: 48px; }

/* subject and message */
.texts { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
.regen-row { display: flex; justify-content: flex-end; margin-top: 6px; }
.regen-btn { margin: 0; min-height: 44px; }

/* attach */
.attach-help { margin-bottom: 4px; }
.attach-groups { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.attach-group { min-width: 0; }
.group-label { margin: 0 0 6px 2px; font-size: 0.8rem; font-weight: 650; color: var(--ui-text-soft); }
.dl-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dl-btn { margin: 0; min-height: 40px; flex: 1 1 130px; max-width: 240px; }

/* open + sent it? */
.open-area { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.open-btn { margin: 0; min-height: 56px; font-size: 1.05rem; }
.open-hint p { margin: 0 4px; text-align: center; font-size: 0.82rem; line-height: 1.4; color: var(--ui-text-soft); }
.open-hint p + p { margin-top: 2px; }

@media (min-width: 768px) {
  .attach-groups { flex-direction: row; gap: 20px; }
  .attach-group { flex: 1 1 0; }
  .open-btn { width: 100%; max-width: 360px; align-self: center; }
}
</style>
