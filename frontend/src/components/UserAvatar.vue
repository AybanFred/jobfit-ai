<template>
  <span
    class="ua"
    :class="`av-${tone}`"
    :style="{ '--s': `${px}px` }"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  >
    <!-- Always there underneath: shows while the photo loads, and if it cannot be loaded -->
    <span class="fallback">
      <template v-if="initials">{{ initials }}</template>
      <ion-icon v-else :icon="personOutline" />
    </span>
    <img
      v-if="src && !failed"
      :key="src"
      class="photo"
      :class="{ shown: loaded }"
      :src="src"
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
      @load="loaded = true"
      @error="onError"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IonIcon } from '@ionic/vue';
import { personOutline } from 'ionicons/icons';
import { initialsOf, toneIndex } from '@/services/avatarLogic';

const SIZES = { xs: 28, sm: 36, md: 48, lg: 64, xl: 96, xxl: 112 } as const;

// The user's photo, or their initials on a gradient picked from the name (same name = same colors).
const props = withDefaults(defineProps<{
  name?: string | null;
  src?: string | null;
  size?: keyof typeof SIZES | number;
  /** Accessible name. Leave empty when the name is written next to the avatar (decorative). */
  label?: string;
}>(), { name: '', src: null, size: 'md', label: '' });

const emit = defineEmits<{ (e: 'error'): void }>();

const px = computed(() => (typeof props.size === 'number' ? props.size : SIZES[props.size]));
const initials = computed(() => initialsOf(props.name));
const tone = computed(() => toneIndex(props.name));

const loaded = ref(false);
const failed = ref(false);
watch(() => props.src, () => { loaded.value = false; failed.value = false; });

function onError() {
  failed.value = true; // keep showing the initials
  emit('error');
}
</script>

<style scoped>
.ua {
  position: relative;
  flex: none;
  display: inline-block;
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  overflow: hidden;
  vertical-align: middle;
  /* the three gradients below are set per tone; --a is the main color and --a-content its text color */
  background: linear-gradient(145deg, var(--a), var(--b));
  color: var(--a-content);
}
.fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-weight: 750;
  font-size: calc(var(--s) * 0.38);
  letter-spacing: 0.02em;
  line-height: 1;
  user-select: none;
}
.fallback ion-icon { font-size: calc(var(--s) * 0.5); }

.photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.35s ease;
}
.photo.shown { opacity: 1; }

/* Six gradients, all from theme colors. The second color is a mix, so text on it stays readable. */
.av-0 { --a: var(--color-primary);   --a-content: var(--color-primary-content);   --b: color-mix(in oklab, var(--color-primary) 93%, var(--color-secondary)); }
.av-1 { --a: var(--color-secondary); --a-content: var(--color-secondary-content); --b: color-mix(in oklab, var(--color-secondary) 93%, var(--color-accent)); }
.av-2 { --a: var(--color-accent);    --a-content: var(--color-accent-content);    --b: color-mix(in oklab, var(--color-accent) 93%, var(--color-primary)); }
.av-3 { --a: var(--color-success);   --a-content: var(--color-success-content);   --b: color-mix(in oklab, var(--color-success) 93%, var(--color-info)); }
.av-4 { --a: var(--color-info);      --a-content: var(--color-info-content);      --b: color-mix(in oklab, var(--color-info) 93%, var(--color-secondary)); }
.av-5 { --a: var(--color-warning);   --a-content: var(--color-warning-content);   --b: color-mix(in oklab, var(--color-warning) 93%, var(--color-accent)); }

@media (prefers-reduced-motion: reduce) {
  .photo { transition: none; }
}
</style>
