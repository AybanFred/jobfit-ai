<template>
  <span class="chip" :class="[`ui-tone-${tone}`, size, variant]" aria-hidden="true">
    <ion-icon :icon="icon" />
  </span>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';

export type Tone = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info';

// A rounded square with an icon, colored by one theme color ("tone"). Purely decorative.
withDefaults(defineProps<{
  icon: string;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  /** solid = bold gradient chip, soft = pale tint */
  variant?: 'solid' | 'soft';
}>(), { tone: 'primary', size: 'md', variant: 'solid' });
</script>

<style scoped>
.chip {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--s, 40px);
  height: var(--s, 40px);
  border-radius: calc(var(--s, 40px) * 0.32);
}
.chip.sm { --s: 32px; }
.chip.md { --s: 40px; }
.chip.lg { --s: 48px; }
.chip ion-icon { font-size: calc(var(--s, 40px) * 0.55); }

/* solid: the theme's own color pair (always readable), with a soft highlight and glow for depth */
.chip.solid {
  background: var(--tone);
  color: var(--tone-content);
  box-shadow:
    inset 0 1px 0 color-mix(in oklab, var(--tone-content) 32%, transparent),
    0 6px 14px -6px color-mix(in oklab, var(--tone) 70%, transparent);
}
.chip.soft {
  background: var(--tone-tint-strong);
  color: var(--tone-ink);
}
</style>
