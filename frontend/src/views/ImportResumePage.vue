<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/profile" text="" />
        </ion-buttons>
        <ion-title>Import from resume</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content ref="contentRef">
      <div class="ui-page">
        <!-- 1. Choose a file -->
        <template v-if="store.step === 'pick'">
          <section class="ui-surface ui-card intro fade-in-up" aria-labelledby="intro-title">
            <IconChip :icon="sparklesOutline" tone="accent" size="lg" />
            <div>
              <h1 id="intro-title" class="ui-h1 small">Start with your resume</h1>
              <p class="lead">
                We read your resume and fill in what we can find. Anything we cannot find stays empty for you to complete.
                Your file is not stored.
              </p>
            </div>
          </section>
          <div class="fade-in-up" style="--i: 1">
            <ImportModelPicker class="model" @change="modelId = $event" />
            <ImportDropZone
              :disabled="!modelId"
              @file="onFile"
              @many="fileError = 'Please choose one file at a time.'"
            />
            <p v-if="fileError" class="ui-error-text error" role="alert">{{ fileError }}</p>
          </div>
          <p class="fine fade-in-up" style="--i: 2">
            You will review everything before it is saved. Nothing changes in your profile until you press "Save to profile".
          </p>
        </template>

        <!-- 2. Reading the file -->
        <section v-else-if="store.step === 'uploading'" class="ui-surface ui-card-center fade-in-up" aria-live="polite" aria-busy="true">
          <div class="reading" aria-hidden="true"><ion-spinner name="crescent" class="big-spinner" /></div>
          <h2 class="ui-h2">Reading your resume...</h2>
          <p class="muted">This can take up to a minute. Please keep this screen open.</p>
          <ion-button fill="outline" class="pressable ui-btn act-btn" aria-label="Cancel reading your resume" @click="store.cancelUpload()">
            Cancel
          </ion-button>
        </section>

        <!-- 3. Something went wrong -->
        <section v-else-if="store.step === 'error'" class="ui-surface ui-card-center fade-in-up">
          <div class="state-icon" aria-hidden="true"><ion-icon :icon="alertCircleOutline" /></div>
          <h2 class="ui-h2">We could not import that file</h2>
          <p class="ui-error-text error" role="alert">{{ store.error?.message }}</p>
          <ion-button v-if="store.error?.canRetry" class="pressable ui-btn act-btn" @click="store.retryUpload()">Try again</ion-button>
          <ion-button :fill="store.error?.canRetry ? 'clear' : 'solid'" class="pressable ui-btn act-btn" @click="store.backToPick()">
            Choose another file
          </ion-button>
        </section>

        <!-- 4. Review -->
        <template v-else-if="store.step === 'review' && store.review">
          <section class="ui-surface ui-card intro fade-in-up" aria-labelledby="review-title">
            <IconChip :icon="checkmarkDoneOutline" tone="success" size="lg" />
            <div>
              <h1 id="review-title" class="ui-h1 small">Review what we found</h1>
              <p class="lead">
                Check each section and fix anything that looks wrong. Untick what you do not want.
                Anything we could not find is left empty for you.
              </p>
            </div>
          </section>
          <ImportReview
            :review="store.review"
            :existing="store.existing"
            :bank="store.bank"
            :context-status="store.contextStatus"
            :profile="profileStore.profile"
            :show-errors="showErrors"
            @retry-context="store.loadContext()"
          />
        </template>

        <!-- 5. Done -->
        <section v-else-if="store.step === 'done'" class="ui-surface ui-card-center fade-in-up" aria-live="polite">
          <div class="state-icon ok" aria-hidden="true"><ion-icon :icon="checkmarkCircle" /></div>
          <h2 class="ui-h2">Your profile has been updated</h2>
          <p class="summary">{{ store.summary }}</p>
          <p v-if="store.summary.includes('skill')" class="muted">
            Skills were added without a level. You can set your level on the Skills screen.
          </p>
          <ion-button class="pressable ui-btn ui-btn-gradient act-btn" @click="goProfile">Go to Profile</ion-button>
        </section>
      </div>
    </ion-content>

    <!-- Save bar (review only) -->
    <ion-footer v-if="store.step === 'review' && store.review" class="ion-no-border">
      <div class="bar">
        <p v-if="store.saveError" class="ui-error-text error" role="alert">{{ store.saveError }}</p>
        <p v-else-if="showErrors && formHasErrors" class="ui-error-text error" role="alert">
          Please fix the highlighted fields, or untick those items.
        </p>
        <p v-else class="preview">{{ previewText }}</p>
        <div class="actions">
          <ion-button fill="clear" class="pressable discard" :disabled="store.saving" @click="store.discard()">
            Discard
          </ion-button>
          <ion-button class="pressable save ui-btn ui-btn-gradient" :disabled="!canSave" @click="onSave">
            <ion-spinner v-if="store.saving" name="crescent" aria-label="Saving" />
            <span v-else>Save to profile</span>
          </ion-button>
        </div>
      </div>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons, IonBackButton,
  IonButton, IonIcon, IonSpinner, onIonViewDidLeave,
} from '@ionic/vue';
import { alertCircleOutline, checkmarkCircle, checkmarkDoneOutline, sparklesOutline } from 'ionicons/icons';
import IconChip from '@/components/IconChip.vue';
import ImportDropZone from '@/components/ImportDropZone.vue';
import ImportModelPicker from '@/components/ImportModelPicker.vue';
import ImportReview from '@/components/ImportReview.vue';
import { useResumeImportStore } from '@/stores/resumeImport';
import { useProfileStore } from '@/stores/profile';
import { validateResumeFile } from '@/services/resumeImport';
import { buildSavePlan, countsOfPlan, describeCounts, totalOfCounts } from '@/services/importLogic';
import { showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import { prefersReducedMotion } from '@/services/motion';

const store = useResumeImportStore();
const profileStore = useProfileStore();
const router = useRouter();

const fileError = ref('');
const modelId = ref<string | null>(null); // chosen in the AI model dropdown; null = none usable, uploads stay disabled
const showErrors = ref(false);
const contentRef = ref<{ $el: HTMLElement } | null>(null);

function onFile(file: File) {
  if (!modelId.value) return;
  fileError.value = validateResumeFile(file); // type and size are checked before anything is uploaded
  if (fileError.value) return;
  showErrors.value = false;
  store.startImport(file, modelId.value);
}

const plan = computed(() =>
  store.review && store.contextStatus === 'ready' ? buildSavePlan(store.review, store.planContext()) : null,
);
const total = computed(() => (plan.value ? totalOfCounts(countsOfPlan(plan.value)) : 0));
const previewText = computed(() => {
  if (store.contextStatus !== 'ready') return 'Checking your current profile...';
  if (!plan.value || total.value === 0) return 'Nothing is ticked to save yet.';
  return `Will save: ${describeCounts(countsOfPlan(plan.value), true)}`;
});
const formHasErrors = computed(() => store.hasErrors());
const canSave = computed(() => !store.saving && store.contextStatus === 'ready' && total.value > 0);

async function onSave() {
  tapHaptic();
  showErrors.value = true;
  if (store.hasErrors()) {
    showToast('Please fix the highlighted fields first.', 'error');
    await nextTick();
    // Cards with errors open by themselves; bring the first problem into view.
    setTimeout(() => {
      const bad = contentRef.value?.$el?.querySelector('.ion-invalid');
      bad?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, 60);
    return;
  }
  await store.save();
}

function goProfile() {
  tapHaptic();
  store.reset();
  showErrors.value = false;
  router.replace('/tabs/profile');
}

// A new draft starts with a clean "no errors shown yet" state.
watch(() => store.step, (step) => {
  if (step === 'pick') { showErrors.value = false; fileError.value = ''; }
});

// Leaving the "done" screen by any route clears what is left in memory.
onIonViewDidLeave(() => {
  if (store.step === 'done') store.reset();
});
</script>

<style scoped>
.intro { display: flex; align-items: flex-start; gap: 14px; }
.ui-h1.small { font-size: 1.2rem; }
.lead { margin: 6px 0 0; font-size: 0.93rem; line-height: 1.5; color: var(--ui-text-soft); }
.fine { margin: 0; font-size: 0.85rem; line-height: 1.4; text-align: center; color: var(--ui-text-soft); }
.muted { margin: 6px 0 0; font-size: 0.9rem; line-height: 1.4; color: var(--ui-text-soft); }
.model { display: block; margin-bottom: 16px; }
.error { margin: 10px 0 0; }
.summary { margin: 8px 0 0; font-size: 1rem; font-weight: 550; line-height: 1.4; }
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
.state-icon { font-size: 52px; line-height: 1; margin-bottom: 8px; color: var(--ui-error-ink); }
.state-icon.ok { color: var(--color-success); }
.act-btn { margin: 16px 0 0; }

.bar {
  max-width: 560px;
  margin: 0 auto;
  padding: 8px 16px 8px;
  background: var(--ui-page-bg);
  border-top: 1px solid var(--ui-line);
}
.bar .error { margin: 0 0 4px; font-size: 0.85rem; }
.preview { margin: 0; font-size: 0.85rem; color: var(--ui-text-soft); }
.actions { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.discard { margin: 0; min-height: 48px; }
.save { flex: 1; margin: 0; }
</style>
