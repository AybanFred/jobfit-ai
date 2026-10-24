<template>
  <section class="rv-card" aria-labelledby="imp-personal-title">
    <div class="head">
      <h2 id="imp-personal-title">Personal info</h2>
      <span class="count">{{ foundCount }} found</span>
    </div>
    <p class="note">Empty fields in your profile are filled in. Where your profile already has something different, your current value is kept unless you choose the imported one.</p>

    <div v-for="f in plan.fields" :key="f.key" class="field-block">
      <ion-textarea
        v-if="f.key === 'summary'"
        v-model="review.personal[f.key]"
        class="field"
        :class="invalid(errors[f.key])"
        :label="PERSONAL_LABELS[f.key]"
        label-placement="floating"
        fill="outline"
        :auto-grow="true"
        :rows="4"
        :maxlength="MAXLEN[f.key]"
        :counter="true"
        :error-text="errors[f.key]"
        :helper-text="helper(f.status)"
      />
      <ion-input
        v-else
        v-model="review.personal[f.key]"
        class="field"
        :class="invalid(errors[f.key])"
        :label="PERSONAL_LABELS[f.key]"
        label-placement="floating"
        fill="outline"
        :maxlength="MAXLEN[f.key]"
        :type="f.key === 'phone' ? 'tel' : isLink(f.key) ? 'url' : 'text'"
        :error-text="errors[f.key]"
        :helper-text="helper(f.status)"
      />

      <div v-if="f.status === 'conflict'" class="conflict">
        <p class="current">Your profile has: <strong>{{ current[f.key] }}</strong></p>
        <div class="choice" role="radiogroup" :aria-label="`${PERSONAL_LABELS[f.key]}: which value to keep`">
          <button
            type="button"
            role="radio"
            class="opt pressable"
            :class="{ on: choiceOf(f.key) === 'keep' }"
            :aria-checked="choiceOf(f.key) === 'keep'"
            @click="choose(f.key, 'keep')"
          >
            Keep current
          </button>
          <button
            type="button"
            role="radio"
            class="opt pressable"
            :class="{ on: choiceOf(f.key) === 'use' }"
            :aria-checked="choiceOf(f.key) === 'use'"
            @click="choose(f.key, 'use')"
          >
            Use imported
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonInput, IonTextarea } from '@ionic/vue';
import { tapHaptic } from '@/services/haptics';
import { LIMITS } from '@/services/profileLogic';
import {
  PERSONAL_LABELS, planPersonalMerge, personalErrors, personalFromProfile,
  type Choice, type PersonalKey, type PersonalStatus, type ReviewState,
} from '@/services/importLogic';
import type { ProfileRow } from '@/services/dashboard';

// `review` is the live draft kept in the import store; the inputs edit it directly.
const props = defineProps<{ review: ReviewState; profile: ProfileRow | null; showErrors: boolean }>();

const MAXLEN: Record<PersonalKey, number> = {
  full_name: LIMITS.fullName, headline: LIMITS.headline, phone: LIMITS.phone, location: LIMITS.location,
  github: LIMITS.url, linkedin: LIMITS.url, website: LIMITS.url, summary: LIMITS.summary,
};
const isLink = (k: PersonalKey) => k === 'github' || k === 'linkedin' || k === 'website';

const current = computed(() => personalFromProfile(props.profile));
const plan = computed(() => planPersonalMerge(current.value, props.review.personal, props.review.choices));
const errors = computed(() => (props.showErrors ? personalErrors(plan.value, props.review.personal) : {}) as Partial<Record<PersonalKey, string>>);
const foundCount = computed(() => plan.value.fields.filter((f) => f.status !== 'missing' && f.status !== 'only-current').length);

const invalid = (msg?: string) => (msg ? { 'ion-invalid': true, 'ion-touched': true } : {});
const choiceOf = (k: PersonalKey): Choice => props.review.choices[k] ?? 'keep';

function choose(k: PersonalKey, c: Choice) {
  tapHaptic();
  props.review.choices[k] = c;
}

function helper(status: PersonalStatus): string {
  switch (status) {
    case 'missing': return 'Not found - add it yourself';
    case 'only-current': return 'Not found in the resume - your current value stays';
    case 'fill': return 'Will be added to your profile';
    case 'same': return 'Already the same in your profile';
    default: return '';
  }
}
</script>

<style scoped>
.rv-card {
  padding: 16px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-card-bg);
  border: 1px solid var(--ui-line);
  box-shadow: var(--ui-shadow-sm);
}
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.count { font-size: 0.8rem; color: var(--ion-color-step-600); }
.note { margin: 6px 0 16px; font-size: 0.85rem; line-height: 1.4; color: var(--ion-color-step-600); }
.field-block { margin-bottom: 16px; }
.field { --border-radius: 12px; }
.conflict { margin-top: 8px; }
.current { margin: 0 0 8px; font-size: 0.85rem; color: var(--ion-color-step-700); overflow-wrap: anywhere; }
.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.opt {
  min-height: 44px;
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--ion-text-color);
  background: var(--ion-color-step-50);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 12px;
  cursor: pointer;
}
.opt.on {
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}
</style>
