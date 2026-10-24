<template>
  <FormModal
    :open="open"
    title="Add skill"
    :saving="saving"
    :error="error"
    :show-submit="!!chosen"
    submit-label="Add skill"
    @close="emit('close')"
    @submit="submit"
  >
    <!-- Step 1: find a skill -->
    <template v-if="!chosen">
      <ion-searchbar
        v-model="query"
        class="search"
        placeholder="Search skills, like Python or Vue"
        inputmode="search"
        enterkeyhint="search"
        :maxlength="LIMITS.skillName"
        aria-label="Search skills"
      />

      <div v-if="bankLoading" class="skeletons" aria-busy="true" aria-label="Loading skills">
        <ion-skeleton-text v-for="n in 4" :key="n" :animated="!reduced" class="sk-line" />
      </div>

      <div v-else-if="bankError" class="state">
        <p class="danger" role="alert">{{ bankError }}</p>
        <ion-button fill="outline" type="button" class="pressable" @click="emit('retry-bank')">Try again</ion-button>
      </div>

      <template v-else>
        <ul v-if="results.length" class="results" aria-label="Matching skills">
          <li v-for="s in results" :key="s.id">
            <button type="button" class="result pressable" @click="pick(s)">
              <span class="name">{{ s.display_name }}</span>
              <span v-if="s.category" class="cat">{{ s.category }}</span>
            </button>
          </li>
        </ul>

        <p v-else-if="exactOwned" class="note" role="status">
          "{{ exactOwned.display_name }}" is already in your skills.
        </p>
        <p v-else-if="!query.trim() && bank.length === 0" class="note">The skills list is empty.</p>
        <p v-else-if="!offerCustom" class="note" role="status">No skills found. Try a different word.</p>

        <button v-if="offerCustom" type="button" class="result custom pressable" @click="pickCustom">
          <ion-icon :icon="addCircleOutline" aria-hidden="true" />
          <span class="name">Add "{{ query.trim() }}" as a new skill</span>
        </button>
      </template>
    </template>

    <!-- Step 2: level and years -->
    <template v-else>
      <div class="chosen">
        <div class="grow">
          <p class="muted">Skill</p>
          <p class="chosen-name">{{ chosenName }}<span v-if="customName" class="pill">New</span></p>
        </div>
        <ion-button fill="clear" type="button" class="change" :disabled="saving" @click="backToSearch">Change</ion-button>
      </div>

      <LevelPicker v-model="level" :error="errors.level" />

      <ion-input
        v-model="years"
        class="field"
        :class="errors.years ? { 'ion-invalid': true, 'ion-touched': true } : {}"
        type="number"
        inputmode="decimal"
        step="0.5"
        min="0"
        label="Years of experience (optional)"
        label-placement="floating"
        fill="outline"
        enterkeyhint="done"
        :error-text="errors.years"
      />
    </template>
  </FormModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonSearchbar, IonInput, IonButton, IonIcon, IonSkeletonText } from '@ionic/vue';
import { addCircleOutline } from 'ionicons/icons';
import FormModal from '@/components/FormModal.vue';
import LevelPicker from '@/components/LevelPicker.vue';
import { prefersReducedMotion } from '@/services/motion';
import type { SkillFormInput } from '@/services/skills';
import {
  LIMITS, filterSkills, findExactSkill, levelError, yearsError, parseYears, trimText, type SkillBankItem,
} from '@/services/profileLogic';

const props = defineProps<{
  open: boolean;
  bank: SkillBankItem[];
  bankLoading: boolean;
  bankError: string;
  /** ids of skills the user already has (hidden from the results) */
  ownedIds: string[];
  saving: boolean;
  error: string;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'retry-bank'): void;
  (e: 'save', value: SkillFormInput): void;
}>();

const reduced = prefersReducedMotion();
const query = ref('');
const picked = ref<SkillBankItem | null>(null);
const customName = ref<string | null>(null);
const level = ref<number | null>(null);
const years = ref<string | number>('');
const submitted = ref(false);

watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  query.value = '';
  picked.value = null;
  customName.value = null;
  level.value = null;
  years.value = '';
  submitted.value = false;
});

const chosen = computed(() => !!picked.value || !!customName.value);
const chosenName = computed(() => picked.value?.display_name ?? customName.value ?? '');

const results = computed(() => filterSkills(props.bank, query.value, props.ownedIds));
const exact = computed(() => findExactSkill(props.bank, query.value));
const exactOwned = computed(() => (exact.value && props.ownedIds.includes(exact.value.id) ? exact.value : null));

// Offer a brand-new skill only when nothing in the bank matches the text exactly.
const offerCustom = computed(() => {
  const text = query.value.trim();
  return text.length >= 2 && text.length <= LIMITS.skillName && !exact.value;
});

const errors = computed(() => ({
  level: submitted.value ? levelError(level.value) : '',
  years: submitted.value ? yearsError(years.value) : '',
}));

function pick(skill: SkillBankItem) {
  picked.value = skill;
  customName.value = null;
}

function pickCustom() {
  customName.value = trimText(query.value);
  picked.value = null;
}

function backToSearch() {
  picked.value = null;
  customName.value = null;
}

function submit() {
  if (!chosen.value) return;
  submitted.value = true;
  if (errors.value.level || errors.value.years) return;
  emit('save', {
    skill: picked.value,
    customName: customName.value,
    level: level.value as number,
    years: parseYears(years.value),
  });
}
</script>

<style scoped>
.search { padding: 0; margin-bottom: 8px; --border-radius: 12px; }
.field { margin-bottom: 16px; --border-radius: 12px; }

.results { list-style: none; margin: 0; padding: 0; }
.result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 8px 4px;
  font: inherit;
  text-align: left;
  color: var(--ion-text-color);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--ion-color-step-100);
  cursor: pointer;
}
.result:hover { background: var(--ion-color-step-50); }
.result:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: -2px; }
.name { font-weight: 500; }
.cat { font-size: 0.8rem; color: var(--ion-color-step-600); }
.custom { justify-content: flex-start; color: var(--ui-accent-ink); border-bottom: 0; }
.custom ion-icon { font-size: 22px; flex: none; }

.note { margin: 12px 4px; color: var(--ion-color-step-600); font-size: 0.9rem; }
.state { text-align: center; padding: 16px 0; }
.danger { margin: 0 0 8px; color: var(--ui-error-ink); font-size: 0.9rem; }
.skeletons { display: flex; flex-direction: column; gap: 12px; padding: 8px 4px; }
.sk-line { height: 16px; margin: 0; border-radius: 6px; width: 70%; }

.chosen {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 8px 8px 8px 14px;
  border-radius: 12px;
  background: var(--ion-color-step-50);
  border: 1px solid var(--ion-color-step-100);
}
.grow { flex: 1; min-width: 0; }
.muted { margin: 0; font-size: 0.8rem; color: var(--ion-color-step-600); }
.chosen-name { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.pill {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 500;
  background: var(--ion-color-step-100);
  color: var(--ion-color-step-700);
}
.change { margin: 0; min-height: 44px; }
</style>
