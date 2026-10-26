<template>
  <button
    v-if="interactive"
    type="button"
    class="status-badge pressable"
    :class="colorClass"
    :aria-label="`Status: ${label}. Change status`"
    :aria-busy="busy || undefined"
    @click="emit('click', $event)"
  >
    <span class="dot" aria-hidden="true" />
    <span class="text">{{ label }}</span>
    <ion-icon :icon="chevronDownOutline" class="caret" aria-hidden="true" />
  </button>
  <span v-else class="status-badge" :class="colorClass">
    <span class="dot" aria-hidden="true" />
    <span class="text">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { chevronDownOutline } from 'ionicons/icons';
import { statusColor, statusLabel, type AppStatus } from '@/services/trackerLogic';

// A small coloured badge for an application status. With `interactive` it is a button that opens
// the status menu. Colours come from Ionic colour names (ion-color-* classes), so every theme works.
const props = withDefaults(defineProps<{ status: AppStatus; interactive?: boolean; busy?: boolean }>(), {
  interactive: false,
  busy: false,
});
const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>();

const label = computed(() => statusLabel(props.status));
// Ionic's global "ion-color-primary" (etc.) class gives us --ion-color-base for the active theme.
const colorClass = computed(() => [`ion-color-${statusColor(props.status)}`, { busy: props.busy }]);
</script>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 3px 10px;
  border-radius: 999px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
  /* tinted background, readable text: the same mix as .ui-pill */
  color: color-mix(in oklab, var(--ion-color-base) 30%, var(--color-base-content));
  background: color-mix(in oklab, var(--ion-color-base) 14%, var(--color-base-100));
  border: 1px solid color-mix(in oklab, var(--ion-color-base) 30%, transparent);
}
button.status-badge { cursor: pointer; }
/* clicks always land on the button itself, so the status menu lines up with the whole badge */
button.status-badge > * { pointer-events: none; }
/* a comfortable tap target without making the badge look bigger */
button.status-badge { position: relative; }
button.status-badge::after { content: ''; position: absolute; inset: -7px -4px; }
@media (hover: hover) {
  button.status-badge:hover { background: color-mix(in oklab, var(--ion-color-base) 22%, var(--color-base-100)); }
}
.dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  /* a little of the text colour, so the dot also shows on dark themes */
  background: color-mix(in oklab, var(--ion-color-base) 75%, var(--color-base-content));
}
/* "Saved" uses Ionic's medium (= the theme's neutral), which can be almost black: keep it a plain grey */
.status-badge.ion-color-medium {
  color: var(--ui-text-soft);
  background: var(--ui-soft);
  border-color: color-mix(in oklab, var(--color-base-content) 22%, transparent);
}
.status-badge.ion-color-medium .dot { background: var(--ui-text-faint); }
@media (hover: hover) {
  button.status-badge.ion-color-medium:hover { background: color-mix(in oklab, var(--color-base-content) 12%, var(--color-base-100)); }
}
.caret { font-size: 13px; margin-right: -2px; opacity: 0.8; }
.busy { opacity: 0.7; }
</style>
