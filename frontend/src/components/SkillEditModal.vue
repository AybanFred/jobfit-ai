<template>
  <FormModal
    :open="open"
    :title="item ? item.skill.display_name : 'Edit skill'"
    sheet
    :saving="saving"
    :error="error"
    can-delete
    delete-label="Remove this skill"
    @close="emit('close')"
    @submit="submit"
    @delete="emit('delete')"
  >
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
  </FormModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonInput } from '@ionic/vue';
import FormModal from '@/components/FormModal.vue';
import LevelPicker from '@/components/LevelPicker.vue';
import type { SkillFormInput } from '@/services/skills';
import { levelError, yearsError, parseYears, type UserSkill } from '@/services/profileLogic';

const props = defineProps<{ open: boolean; item: UserSkill | null; saving: boolean; error: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', value: SkillFormInput): void;
  (e: 'delete'): void;
}>();

const level = ref<number | null>(null);
const years = ref<string | number>('');
const submitted = ref(false);

watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  level.value = props.item?.level ?? null;
  years.value = props.item?.years ?? '';
  submitted.value = false;
});

const errors = computed(() => ({
  level: submitted.value ? levelError(level.value) : '',
  years: submitted.value ? yearsError(years.value) : '',
}));

function submit() {
  submitted.value = true;
  if (!props.item || errors.value.level || errors.value.years) return;
  emit('save', {
    skill: props.item.skill,
    customName: null,
    level: level.value as number,
    years: parseYears(years.value),
  });
}
</script>

<style scoped>
.field { margin-bottom: 16px; --border-radius: 12px; }
</style>
