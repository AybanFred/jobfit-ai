<template>
  <ion-button aria-label="Change theme" @click="openPopover">
    <ion-icon slot="icon-only" :icon="colorPaletteOutline" />
  </ion-button>

  <ion-popover
    class="theme-popover"
    :is-open="open"
    :event="clickEvent"
    side="bottom"
    alignment="end"
    :arrow="false"
    @didDismiss="open = false"
  >
    <ion-content class="ion-padding-horizontal ion-padding-top">
      <div class="head">
        <h2>Appearance</h2>
        <p>Tap a theme to try it. It saves automatically.</p>
      </div>

      <ion-segment :value="mode" @ionChange="onMode" class="mode">
        <ion-segment-button value="light"><ion-label>Light</ion-label></ion-segment-button>
        <ion-segment-button value="dark"><ion-label>Dark</ion-label></ion-segment-button>
        <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
      </ion-segment>

      <div class="grid" role="radiogroup" aria-label="Theme">
        <button
          v-for="(name, i) in visible"
          :key="name"
          type="button"
          role="radio"
          :aria-checked="theme.theme === name"
          :data-theme="name"
          class="swatch pressable fade-in-up"
          :class="{ selected: theme.theme === name }"
          :style="{ '--i': Math.min(i, 8) }"
          @click="choose(name)"
        >
          <span class="dots" aria-hidden="true">
            <i class="dot primary" /><i class="dot secondary" /><i class="dot accent" />
          </span>
          <span class="lbl">{{ name }}</span>
          <ion-icon v-if="theme.theme === name" :icon="checkmarkCircle" class="check" aria-hidden="true" />
        </button>
      </div>
    </ion-content>
  </ion-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  IonButton, IonIcon, IonPopover, IonContent, IonSegment, IonSegmentButton, IonLabel,
} from '@ionic/vue';
import { colorPaletteOutline, checkmarkCircle } from 'ionicons/icons';
import { THEMES, useThemeStore, type ThemeName } from '@/stores/theme';
import { tapHaptic } from '@/services/haptics';

// daisyUI themes that have a dark background
const DARK: readonly string[] = [
  'dark', 'synthwave', 'halloween', 'forest', 'black', 'luxury', 'dracula', 'business',
  'night', 'coffee', 'dim', 'sunset', 'abyss',
];

type Mode = 'light' | 'dark' | 'all';

const theme = useThemeStore();
const open = ref(false);
const clickEvent = ref<Event | undefined>(undefined);
const mode = ref<Mode>('light');

// when the panel opens, start on the group of the theme that is active now
watch(open, (isOpen) => {
  if (isOpen) mode.value = DARK.includes(theme.theme) ? 'dark' : 'light';
});

const visible = computed(() =>
  THEMES.filter((t) => mode.value === 'all' || (mode.value === 'dark') === DARK.includes(t)),
);

function openPopover(event: Event) {
  clickEvent.value = event; // the popover floats next to the button that was tapped
  open.value = true;
}

function onMode(event: CustomEvent<{ value?: string | number }>) {
  const value = event.detail.value;
  if (value === 'light' || value === 'dark' || value === 'all') mode.value = value;
}

function choose(name: ThemeName) {
  theme.set(name);
  tapHaptic();
}
</script>

<style scoped>
.theme-popover {
  --width: min(320px, calc(100vw - 24px));
  --max-height: min(480px, 75vh);
  --border-radius: 16px;
  --box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.head { margin-bottom: 12px; }
.head h2 { margin: 0; font-size: 1.1rem; font-weight: 700; }
.head p { margin: 2px 0 0; font-size: 0.875rem; color: var(--ion-color-step-600); }

.mode { margin-bottom: 16px; }

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding-bottom: 16px;
}

/* Each card sets its own data-theme, so it shows that theme's real colors. */
.swatch {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 44px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: var(--color-base-content);
  background: var(--color-base-100);
  border: 1.5px solid color-mix(in oklab, var(--color-base-content) 15%, transparent);
  border-radius: 14px;
}
.swatch.selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-primary) 35%, transparent);
}

.dots { display: flex; gap: 6px; }
.dot { width: 18px; height: 18px; border-radius: 50%; }
.dot.primary { background: var(--color-primary); }
.dot.secondary { background: var(--color-secondary); }
.dot.accent { background: var(--color-accent); }

.lbl { font-size: 0.9rem; font-weight: 600; text-transform: capitalize; }

.check {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 20px;
  color: var(--color-primary);
}
</style>
