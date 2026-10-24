<template>
  <FormModal
    :open="open"
    :title="item ? 'Edit education' : 'Add education'"
    :saving="saving"
    :error="error"
    :can-delete="!!item"
    delete-label="Delete this education"
    @close="emit('close')"
    @submit="submit"
    @delete="emit('delete')"
  >
    <ion-input
      v-model="school"
      class="field"
      :class="invalid(errors.school)"
      label="School / university"
      label-placement="floating"
      fill="outline"
      :maxlength="LIMITS.school"
      enterkeyhint="next"
      :error-text="errors.school"
    />
    <ion-input
      v-model="degree"
      class="field"
      :class="invalid(errors.degree)"
      label="Degree or program (optional)"
      label-placement="floating"
      fill="outline"
      :maxlength="LIMITS.degree"
      enterkeyhint="next"
      :error-text="errors.degree"
    />
    <ion-input
      v-model="honors"
      class="field"
      :class="invalid(errors.honors)"
      label="Honors (optional)"
      label-placement="floating"
      fill="outline"
      :maxlength="LIMITS.honors"
      enterkeyhint="next"
      :error-text="errors.honors"
    />

    <div class="years">
      <ion-input
        v-model="startYear"
        class="field"
        :class="invalid(errors.start)"
        type="number"
        inputmode="numeric"
        label="Start year"
        label-placement="floating"
        fill="outline"
        placeholder="2019"
        enterkeyhint="next"
        :error-text="errors.start"
      />
      <ion-input
        v-model="endYear"
        class="field"
        :class="invalid(errors.end)"
        type="number"
        inputmode="numeric"
        label="End year"
        label-placement="floating"
        fill="outline"
        placeholder="2023"
        enterkeyhint="done"
        :error-text="errors.end"
      />
    </div>
    <p class="hint">Leave the end year empty if you are still studying.</p>
  </FormModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonInput } from '@ionic/vue';
import FormModal from '@/components/FormModal.vue';
import type { EducationInput } from '@/services/profile';
import {
  LIMITS, requiredError, maxLengthError, yearError, yearRangeError, parseYear, toNull, trimText,
  type Education,
} from '@/services/profileLogic';

const props = defineProps<{ open: boolean; item: Education | null; saving: boolean; error: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', value: EducationInput): void;
  (e: 'delete'): void;
}>();

const school = ref('');
const degree = ref('');
const honors = ref('');
const startYear = ref<string | number>('');
const endYear = ref<string | number>('');
const submitted = ref(false);

watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  school.value = props.item?.school ?? '';
  degree.value = props.item?.degree ?? '';
  honors.value = props.item?.honors ?? '';
  startYear.value = props.item?.start_year ?? '';
  endYear.value = props.item?.end_year ?? '';
  submitted.value = false;
});

const errors = computed(() => {
  if (!submitted.value) return { school: '', degree: '', honors: '', start: '', end: '' };
  const start = yearError('Start year', startYear.value);
  const end = yearError('End year', endYear.value) || (!start ? yearRangeError(startYear.value, endYear.value) : '');
  return {
    school: requiredError('your school', school.value, LIMITS.school),
    degree: maxLengthError('the degree', degree.value, LIMITS.degree),
    honors: maxLengthError('the honors', honors.value, LIMITS.honors),
    start,
    end,
  };
});

const invalid = (msg: string) => (msg ? { 'ion-invalid': true, 'ion-touched': true } : {});

function submit() {
  submitted.value = true;
  if (Object.values(errors.value).some(Boolean)) return;
  emit('save', {
    school: trimText(school.value),
    degree: toNull(degree.value),
    honors: toNull(honors.value),
    start_year: parseYear(startYear.value),
    end_year: parseYear(endYear.value),
  });
}
</script>

<style scoped>
.field { margin-bottom: 16px; --border-radius: 12px; }
.years { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hint { margin: -4px 0 16px; font-size: 0.8rem; color: var(--ion-color-step-600); }
</style>
