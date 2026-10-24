<template>
  <FormModal
    :open="open"
    :title="item ? 'Edit experience' : 'Add experience'"
    :saving="saving"
    :error="error"
    :can-delete="!!item"
    delete-label="Delete this experience"
    @close="emit('close')"
    @submit="submit"
    @delete="emit('delete')"
  >
    <ion-input
      v-model="role"
      class="field"
      :class="invalid(errors.role)"
      label="Role / job title"
      label-placement="floating"
      fill="outline"
      :maxlength="LIMITS.role"
      enterkeyhint="next"
      :error-text="errors.role"
    />
    <ion-input
      v-model="company"
      class="field"
      :class="invalid(errors.company)"
      label="Company"
      label-placement="floating"
      fill="outline"
      :maxlength="LIMITS.company"
      enterkeyhint="next"
      :error-text="errors.company"
    />
    <ion-input
      v-model="location"
      class="field"
      :class="invalid(errors.location)"
      label="Location (optional)"
      label-placement="floating"
      fill="outline"
      :maxlength="LIMITS.location"
      enterkeyhint="next"
      :error-text="errors.location"
    />

    <ion-input
      v-model="startMonth"
      class="field"
      :class="invalid(errors.start)"
      type="month"
      label="Start month"
      label-placement="stacked"
      placeholder="YYYY-MM"
      fill="outline"
      :error-text="errors.start"
    />

    <ion-toggle :checked="present" class="row-toggle" @ionChange="onPresentChange">I currently work here</ion-toggle>

    <ion-input
      v-if="!present"
      v-model="endMonth"
      class="field"
      :class="invalid(errors.end)"
      type="month"
      label="End month"
      label-placement="stacked"
      placeholder="YYYY-MM"
      fill="outline"
      :error-text="errors.end"
    />

    <!-- Bullet points -->
    <section class="bullets" aria-labelledby="bullets-title">
      <h3 id="bullets-title">Bullet points</h3>
      <p class="hint">Describe what you really did. Short sentences with real numbers work best.</p>

      <div v-for="(b, i) in bullets" :key="b.id" class="bullet">
        <ion-textarea
          v-model="b.text"
          :aria-label="`Bullet point ${i + 1}`"
          fill="outline"
          :auto-grow="true"
          :rows="2"
          :maxlength="LIMITS.bullet"
          :counter="true"
          placeholder="For example: Built a reporting dashboard used by 40 staff"
        />
        <div class="bullet-actions">
          <ion-button fill="clear" size="small" type="button" class="icon-btn" :disabled="i === 0"
            :aria-label="`Move bullet point ${i + 1} up`" @click="move(i, i - 1)">
            <ion-icon slot="icon-only" :icon="arrowUpOutline" aria-hidden="true" />
          </ion-button>
          <ion-button fill="clear" size="small" type="button" class="icon-btn" :disabled="i === bullets.length - 1"
            :aria-label="`Move bullet point ${i + 1} down`" @click="move(i, i + 1)">
            <ion-icon slot="icon-only" :icon="arrowDownOutline" aria-hidden="true" />
          </ion-button>
          <ion-button fill="clear" size="small" color="danger" type="button" class="icon-btn"
            :aria-label="`Remove bullet point ${i + 1}`" @click="removeBullet(i)">
            <ion-icon slot="icon-only" :icon="trashOutline" aria-hidden="true" />
          </ion-button>
        </div>
      </div>

      <ion-button
        fill="outline"
        size="default"
        type="button"
        class="add-bullet pressable"
        :disabled="bullets.length >= LIMITS.bullets"
        @click="addBullet"
      >
        <ion-icon slot="start" :icon="addOutline" aria-hidden="true" />
        Add bullet point
      </ion-button>
    </section>
  </FormModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonInput, IonTextarea, IonToggle, IonButton, IonIcon } from '@ionic/vue';
import { addOutline, arrowUpOutline, arrowDownOutline, trashOutline } from 'ionicons/icons';
import FormModal from '@/components/FormModal.vue';
import type { ExperienceInput } from '@/services/profile';
import {
  LIMITS, requiredError, maxLengthError, monthRangeError, monthToDate, dateToMonth,
  moveItem, cleanBullets, toNull, trimText, type Experience,
} from '@/services/profileLogic';

const props = defineProps<{ open: boolean; item: Experience | null; saving: boolean; error: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', value: ExperienceInput): void;
  (e: 'delete'): void;
}>();

const role = ref('');
const company = ref('');
const location = ref('');
const startMonth = ref('');
const endMonth = ref('');
const present = ref(false);
const bullets = ref<Array<{ id: number; text: string }>>([]);
const submitted = ref(false);
let nextId = 1;

// Start fresh (or fill from the item being edited) every time the sheet opens.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  const it = props.item;
  role.value = it?.role ?? '';
  company.value = it?.company ?? '';
  location.value = it?.location ?? '';
  startMonth.value = dateToMonth(it?.start_date);
  endMonth.value = dateToMonth(it?.end_date);
  present.value = it ? it.end_date === null : false;
  bullets.value = (it?.bullets ?? []).map((text) => ({ id: nextId++, text }));
  submitted.value = false;
});

const errors = computed(() => {
  if (!submitted.value) return { role: '', company: '', location: '', start: '', end: '' };
  const months = monthRangeError(startMonth.value, endMonth.value, present.value);
  return {
    role: requiredError('your role', role.value, LIMITS.role),
    company: requiredError('the company', company.value, LIMITS.company),
    location: maxLengthError('the location', location.value, LIMITS.location),
    start: months.start,
    end: months.end,
  };
});

const invalid = (msg: string) => (msg ? { 'ion-invalid': true, 'ion-touched': true } : {});

function onPresentChange(event: CustomEvent) {
  present.value = !!event.detail.checked;
  if (present.value) endMonth.value = '';
}

const addBullet = () => bullets.value.push({ id: nextId++, text: '' });
const removeBullet = (i: number) => bullets.value.splice(i, 1);
const move = (from: number, to: number) => (bullets.value = moveItem(bullets.value, from, to));

function submit() {
  submitted.value = true;
  if (Object.values(errors.value).some(Boolean)) return;
  emit('save', {
    role: trimText(role.value),
    company: trimText(company.value),
    location: toNull(location.value),
    start_date: monthToDate(startMonth.value),
    end_date: present.value ? null : monthToDate(endMonth.value),
    bullets: cleanBullets(bullets.value.map((b) => b.text)),
  });
}
</script>

<style scoped>
.field { margin-bottom: 16px; --border-radius: 12px; }
.row-toggle { display: block; min-height: 44px; margin-bottom: 16px; }
.bullets { margin: 8px 0 16px; }
h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.hint { margin: 4px 0 12px; font-size: 0.85rem; color: var(--ion-color-step-600); line-height: 1.4; }
.bullet { margin-bottom: 12px; }
.bullet-actions { display: flex; justify-content: flex-end; gap: 4px; }
.icon-btn { margin: 0; min-width: 44px; min-height: 44px; }
.add-bullet { --border-radius: 12px; min-height: 44px; margin: 0; }
</style>
