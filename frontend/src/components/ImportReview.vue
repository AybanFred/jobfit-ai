<template>
  <div class="review">
    <!-- Could not check the current profile: duplicates cannot be detected, so saving waits -->
    <div v-if="contextStatus === 'error'" class="rv-card state" role="alert">
      <p class="error">We could not check what is already in your profile, so saving is paused. Please try again.</p>
      <ion-button fill="outline" class="pressable act-btn" @click="emit('retry-context')">Try again</ion-button>
    </div>
    <p v-else-if="contextStatus !== 'ready'" class="checking" role="status">
      <ion-spinner name="dots" aria-hidden="true" /> Checking your current profile...
    </p>

    <ImportPersonalReview :review="review" :profile="profile" :show-errors="showErrors" />

    <!-- Experience -->
    <section class="rv-card" aria-labelledby="imp-exp-title">
      <div class="head">
        <h2 id="imp-exp-title">Experience</h2>
        <span class="count">{{ review.experiences.length }} found</span>
      </div>
      <p v-if="!review.experiences.length" class="empty">Not found - you can add jobs yourself on the Experience screen.</p>
      <div class="items">
        <ImportItemCard
          v-for="(x, i) in review.experiences"
          :key="x.key"
          @update:checked="x.include = $event"
          :title="x.role"
          placeholder="Role not found"
          :subtitle="[x.company, monthRangeLabel(monthToDate(x.startMonth), x.present ? null : monthToDate(x.endMonth))].filter(Boolean).join(' · ')"
          :disabled="exFlags[i] !== null || x.saved"
          :checked="x.include && !x.saved && exFlags[i] === null"
          :flags="itemFlags(missingExperience(x), exFlags[i], x.saved, extraExperienceFlag(x))"
          :start-open="missingExperience(x).length > 0"
          :has-error="itemBad(x, exFlags[i], validateExperience)"
        >
          <ion-input v-model="x.role" class="field" :class="invalid(exErr(x).role)" label="Role / job title"
            label-placement="floating" fill="outline" :maxlength="LIMITS.role"
            :helper-text="x.role.trim() ? '' : NOT_FOUND" :error-text="exErr(x).role" />
          <ion-input v-model="x.company" class="field" :class="invalid(exErr(x).company)" label="Company"
            label-placement="floating" fill="outline" :maxlength="LIMITS.company"
            :helper-text="x.company.trim() ? '' : NOT_FOUND" :error-text="exErr(x).company" />
          <ion-input v-model="x.location" class="field" :class="invalid(exErr(x).location)" label="Location (optional)"
            label-placement="floating" fill="outline" :maxlength="LIMITS.location" :error-text="exErr(x).location" />
          <ion-input v-model="x.startMonth" class="field" :class="invalid(exErr(x).start)" type="month" label="Start month"
            label-placement="stacked" placeholder="YYYY-MM" fill="outline"
            :helper-text="x.startMonth ? '' : NOT_FOUND" :error-text="exErr(x).start" />
          <ion-toggle class="row-toggle" :checked="x.present" @ionChange="onPresent(x, !!$event.detail.checked)">
            I currently work here
          </ion-toggle>
          <ion-input v-if="!x.present" v-model="x.endMonth" class="field" :class="invalid(exErr(x).end)" type="month"
            label="End month" label-placement="stacked" placeholder="YYYY-MM" fill="outline"
            :helper-text="x.endMonth ? '' : NOT_FOUND" :error-text="exErr(x).end" />
          <ion-textarea v-model="x.bulletsText" class="field" :class="invalid(exErr(x).bullets)"
            label="Bullet points (one per line)" label-placement="floating" fill="outline" :auto-grow="true" :rows="4"
            :error-text="exErr(x).bullets" :helper-text="x.bulletsText.trim() ? '' : 'None found - add real achievements yourself'" />
        </ImportItemCard>
      </div>
    </section>

    <!-- Education -->
    <section class="rv-card" aria-labelledby="imp-edu-title">
      <div class="head">
        <h2 id="imp-edu-title">Education</h2>
        <span class="count">{{ review.education.length }} found</span>
      </div>
      <p v-if="!review.education.length" class="empty">Not found - you can add education yourself on the Education screen.</p>
      <div class="items">
        <ImportItemCard
          v-for="(x, i) in review.education"
          :key="x.key"
          @update:checked="x.include = $event"
          :title="x.school"
          placeholder="School not found"
          :subtitle="[x.degree, [x.startYear, x.endYear].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')"
          :disabled="edFlags[i] !== null || x.saved"
          :checked="x.include && !x.saved && edFlags[i] === null"
          :flags="itemFlags(missingEducation(x), edFlags[i], x.saved)"
          :start-open="missingEducation(x).length > 0"
          :has-error="itemBad(x, edFlags[i], validateEducation)"
        >
          <ion-input v-model="x.school" class="field" :class="invalid(edErr(x).school)" label="School"
            label-placement="floating" fill="outline" :maxlength="LIMITS.school"
            :helper-text="x.school.trim() ? '' : NOT_FOUND" :error-text="edErr(x).school" />
          <ion-input v-model="x.degree" class="field" :class="invalid(edErr(x).degree)" label="Degree (optional)"
            label-placement="floating" fill="outline" :maxlength="LIMITS.degree" :error-text="edErr(x).degree" />
          <ion-input v-model="x.honors" class="field" :class="invalid(edErr(x).honors)" label="Honors (optional)"
            label-placement="floating" fill="outline" :maxlength="LIMITS.honors" :error-text="edErr(x).honors" />
          <ion-input v-model="x.startYear" class="field" :class="invalid(edErr(x).startYear)" type="number" inputmode="numeric"
            label="Start year (optional)" label-placement="floating" fill="outline" :error-text="edErr(x).startYear" />
          <ion-input v-model="x.endYear" class="field" :class="invalid(edErr(x).endYear)" type="number" inputmode="numeric"
            label="End year (optional)" label-placement="floating" fill="outline" :error-text="edErr(x).endYear" />
        </ImportItemCard>
      </div>
    </section>

    <!-- Projects -->
    <section class="rv-card" aria-labelledby="imp-proj-title">
      <div class="head">
        <h2 id="imp-proj-title">Projects</h2>
        <span class="count">{{ review.projects.length }} found</span>
      </div>
      <p v-if="!review.projects.length" class="empty">Not found - you can add projects yourself on the Projects screen.</p>
      <div class="items">
        <ImportItemCard
          v-for="(x, i) in review.projects"
          :key="x.key"
          @update:checked="x.include = $event"
          :title="x.name"
          placeholder="Project name not found"
          :subtitle="x.techText"
          :disabled="prFlags[i] !== null || x.saved"
          :checked="x.include && !x.saved && prFlags[i] === null"
          :flags="itemFlags(missingProject(x), prFlags[i], x.saved)"
          :start-open="missingProject(x).length > 0"
          :has-error="itemBad(x, prFlags[i], validateProject)"
        >
          <ion-input v-model="x.name" class="field" :class="invalid(prErr(x).name)" label="Project name"
            label-placement="floating" fill="outline" :maxlength="LIMITS.projectName"
            :helper-text="x.name.trim() ? '' : NOT_FOUND" :error-text="prErr(x).name" />
          <ion-textarea v-model="x.description" class="field" :class="invalid(prErr(x).description)"
            label="Description (optional)" label-placement="floating" fill="outline" :auto-grow="true" :rows="3"
            :maxlength="LIMITS.projectDescription" :counter="true" :error-text="prErr(x).description" />
          <ion-input v-model="x.techText" class="field" :class="invalid(prErr(x).tech)"
            label="Technologies (separate with commas)" label-placement="floating" fill="outline"
            :error-text="prErr(x).tech" />
          <ion-input v-model="x.link" class="field" :class="invalid(prErr(x).link)" type="url" inputmode="url"
            label="Link (optional)" label-placement="floating" fill="outline" :error-text="prErr(x).link" />
        </ImportItemCard>
      </div>
    </section>

    <ImportSkillsReview
      :review="review"
      :bank="bank"
      :owned-ids="existing?.ownedSkillIds ?? []"
      :status="contextStatus"
      @retry="emit('retry-context')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonButton, IonInput, IonSpinner, IonTextarea, IonToggle } from '@ionic/vue';
import ImportItemCard, { type ItemFlag } from '@/components/ImportItemCard.vue';
import ImportPersonalReview from '@/components/ImportPersonalReview.vue';
import ImportSkillsReview from '@/components/ImportSkillsReview.vue';
import {
  LIMITS, monthRangeLabel, monthToDate, trimText, type SkillBankItem,
} from '@/services/profileLogic';
import {
  educationFlags, experienceFlags, projectFlags, hasErrors, missingEducation, missingExperience, missingProject,
  validateEducation, validateExperience, validateProject,
  type DupFlag, type ImportExisting, type ReviewEducation, type ReviewExperience, type ReviewProject, type ReviewState,
} from '@/services/importLogic';
import type { ProfileRow } from '@/services/dashboard';

// `review` is the live draft kept in the import store; the inputs below edit it directly.
const props = defineProps<{
  review: ReviewState;
  existing: ImportExisting | null;
  bank: SkillBankItem[];
  contextStatus: 'idle' | 'loading' | 'ready' | 'error';
  profile: ProfileRow | null;
  showErrors: boolean;
}>();
const emit = defineEmits<{ (e: 'retry-context'): void }>();

const NOT_FOUND = 'Not found - add it yourself';

const exFlags = computed(() => experienceFlags(props.review.experiences, props.existing));
const edFlags = computed(() => educationFlags(props.review.education, props.existing));
const prFlags = computed(() => projectFlags(props.review.projects, props.existing));

const invalid = (msg?: string) => (msg ? { 'ion-invalid': true, 'ion-touched': true } : {});

// Errors are shown only after the user pressed Save once, and only for the fields they can fix.
const none = { role: '', company: '', location: '', start: '', end: '', bullets: '', school: '', degree: '', honors: '', startYear: '', endYear: '', name: '', description: '', tech: '', link: '' };
const exErr = (x: ReviewExperience) => (props.showErrors ? validateExperience(x) : none);
const edErr = (x: ReviewEducation) => (props.showErrors ? validateEducation(x) : none);
const prErr = (x: ReviewProject) => (props.showErrors ? validateProject(x) : none);

/** True when a ticked item has a field error (after the first Save press), so its card opens by itself. */
function itemBad<T extends { include: boolean; saved: boolean }>(
  x: T, flag: DupFlag | undefined, validate: (x: T) => Record<string, string>,
): boolean {
  return props.showErrors && x.include && !x.saved && !flag && hasErrors(validate(x));
}

function onPresent(x: ReviewExperience, present: boolean) {
  x.present = present;
  if (present) x.endMonth = '';
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function itemFlags(missing: string[], dup: DupFlag, saved: boolean, extra: ItemFlag | null = null): ItemFlag[] {
  const flags: ItemFlag[] = [];
  if (saved) flags.push({ text: 'Saved to your profile', kind: 'info' });
  else if (dup === 'existing') flags.push({ text: 'Already in your profile', kind: 'info' });
  else if (dup === 'batch') flags.push({ text: 'Same as another item you are importing', kind: 'info' });
  if (missing.length) flags.push({ text: `${capital(missing.join(' and '))} not found - add it yourself`, kind: 'warn' });
  if (extra && !saved) flags.push(extra);
  return flags;
}

function extraExperienceFlag(x: ReviewExperience): ItemFlag | null {
  if (missingExperience(x).length) return null;
  return !x.present && !trimText(x.endMonth)
    ? { text: 'End date not found - add it, or mark this as your current job', kind: 'warn' }
    : null;
}
</script>

<style scoped>
.review { display: flex; flex-direction: column; gap: 16px; }
.rv-card {
  padding: 16px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-card-bg);
  border: 1px solid var(--ui-line);
  box-shadow: var(--ui-shadow-sm);
}
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.count { font-size: 0.8rem; color: var(--ion-color-step-600); }
p { margin: 0; }
.empty { font-size: 0.9rem; color: var(--ion-color-step-600); }
.items { display: flex; flex-direction: column; gap: 10px; }
.field { margin-bottom: 16px; --border-radius: 12px; }
.row-toggle { display: block; min-height: 44px; margin-bottom: 16px; }
.state { text-align: center; }
.error { color: var(--ion-color-danger); font-size: 0.9rem; }
.act-btn { margin: 12px 0 0; min-height: 44px; --border-radius: 12px; }
.checking {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--ion-color-step-600);
}
</style>
