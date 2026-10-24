<template>
  <button type="button" class="qa ui-surface ui-lift" :class="{ wide }" @click="onClick">
    <IconChip :icon="icon" :tone="tone" size="md" />
    <span class="text">
      <span class="title">{{ title }}</span>
      <span class="hint">{{ hint }}</span>
    </span>
    <ion-icon class="go" :icon="arrowForwardOutline" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { arrowForwardOutline } from 'ionicons/icons';
import IconChip, { type Tone } from '@/components/IconChip.vue';
import { tapHaptic } from '@/services/haptics';

withDefaults(defineProps<{
  icon: string;
  title: string;
  hint: string;
  tone?: Tone;
  /** Lay out as one wide row (icon left, text, arrow right) instead of a tall tile. */
  wide?: boolean;
}>(), { tone: 'primary', wide: false });
const emit = defineEmits<{ (e: 'press'): void }>();

function onClick() {
  tapHaptic();
  emit('press');
}
</script>

<style scoped>
.qa {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  min-height: 44px;
  width: 100%;
  padding: 14px;
  text-align: left;
  font: inherit;
  color: var(--color-base-content);
  cursor: pointer;
}
.text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.title { font-weight: 700; font-size: 0.95rem; line-height: 1.25; }
.hint { font-size: 0.8rem; color: var(--ui-text-soft); line-height: 1.35; }

/* small arrow that slides in on hover / focus */
.go {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 18px;
  color: var(--ui-text-faint);
  transition: transform 0.2s var(--ui-ease), color 0.2s ease;
}
.qa:hover .go, .qa:focus-visible .go { transform: translateX(3px); color: var(--color-primary); }

.qa.wide { flex-direction: row; align-items: center; padding: 14px 44px 14px 14px; }
.qa.wide .go { top: 50%; margin-top: -9px; }

@media (prefers-reduced-motion: reduce) {
  .go { transition: none; }
}
</style>
