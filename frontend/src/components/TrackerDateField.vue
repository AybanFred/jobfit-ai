<template>
  <div class="date-field" role="group" :aria-labelledby="`${fieldId}-label`">
    <p :id="`${fieldId}-label`" class="df-label">{{ label }}</p>
    <div class="df-row">
      <!-- Ionic's date button shows today's date when nothing is set, so it is only shown once a date exists. -->
      <ion-datetime-button v-show="!!inputValue" :datetime="fieldId" :disabled="disabled" />
      <ion-button
        v-if="!inputValue"
        fill="outline"
        size="small"
        class="pressable add-btn"
        :disabled="disabled"
        @click="openPicker"
      >
        <ion-icon slot="start" :icon="calendarOutline" aria-hidden="true" />
        Add date
      </ion-button>
      <ion-button
        v-else
        fill="clear"
        size="small"
        class="pressable clear-btn"
        :aria-label="`Clear the ${label.toLowerCase()}`"
        :disabled="disabled"
        @click="emit('change', null)"
      >
        <ion-icon slot="icon-only" :icon="closeCircleOutline" aria-hidden="true" />
      </ion-button>
    </div>

    <ion-modal ref="modalRef" :keep-contents-mounted="true">
      <ion-datetime
        :id="fieldId"
        presentation="date"
        locale="en-GB"
        :format-options="FORMAT"
        :min="MIN"
        :max="max"
        :value="inputValue ?? undefined"
        :show-default-buttons="true"
        :show-clear-button="true"
        @ionChange="onChange($event.detail.value)"
      />
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton, IonDatetime, IonDatetimeButton, IonIcon, IonModal } from '@ionic/vue';
import { calendarOutline, closeCircleOutline } from 'ionicons/icons';
import { fromDateInput, toDateInput } from '@/services/trackerLogic';

// One optional date (Applied, Follow-up): Ionic's date button + calendar in a small modal, and a clear button.
// Emits the new timestamp (noon on the picked day, in the user's time zone) or null when cleared.
const props = withDefaults(defineProps<{
  /** Unique on the page (Ionic links the button to the calendar by this id). */
  fieldId: string;
  label: string;
  value: string | null;
  disabled?: boolean;
}>(), { disabled: false });
const emit = defineEmits<{ (e: 'change', value: string | null): void }>();

const FORMAT = { date: { day: 'numeric', month: 'short', year: 'numeric' } } as const;
const MIN = '2000-01-01';
const max = `${new Date().getFullYear() + 5}-12-31`;

const modalRef = ref<{ $el: HTMLIonModalElement } | null>(null);
const inputValue = computed(() => toDateInput(props.value));

function openPicker() {
  void modalRef.value?.$el.present();
}

function onChange(value: unknown) {
  const iso = fromDateInput(value);
  if (!iso) {
    // "Clear" inside the calendar: Ionic keeps the modal open, so close it here.
    void modalRef.value?.$el.dismiss();
    if (inputValue.value) emit('change', null);
    return;
  }
  if (toDateInput(iso) !== inputValue.value) emit('change', iso);
}
</script>

<style scoped>
.date-field { min-width: 0; }
.df-label { margin: 0 0 6px 2px; font-size: 0.85rem; font-weight: 600; color: var(--ui-text-soft); }
.df-row { display: flex; align-items: center; gap: 4px; min-height: 44px; }
.add-btn {
  margin: 0;
  min-height: 38px;
  --border-radius: 10px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
}
.clear-btn { margin: 0; min-width: 44px; min-height: 44px; --color: var(--ui-text-soft); }
/* the calendar: theme colours instead of Ionic's fixed light grey (else dark themes break) */
ion-datetime {
  --background: var(--color-base-100);
  --background-rgb: var(--ion-background-color-rgb);
  --title-color: var(--ui-text-soft);
  color: var(--color-base-content);
}
/* Ionic's date button uses a fixed grey; use the theme and keep the date on one line */
ion-datetime-button::part(native) {
  margin: 0;
  min-height: 38px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-line);
  background: var(--ui-soft);
  color: var(--color-base-content);
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
}
</style>
