<template>
  <div
    class="pring"
    :class="{ celebrating }"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="target"
    :aria-label="label"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style="stop-color: var(--color-primary)" />
          <stop offset="100%" style="stop-color: var(--color-secondary)" />
        </linearGradient>
      </defs>
      <circle class="track" :cx="size / 2" :cy="size / 2" :r="radius" :stroke-width="stroke" fill="none" />
      <circle
        class="bar"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :stroke-width="stroke"
        fill="none"
        stroke-linecap="round"
        :stroke="`url(#${gradientId})`"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
      />
    </svg>
    <span class="value"><span class="num">{{ Math.round(shown) }}</span><span class="pct">%</span></span>

    <!-- A few small sparkles that pop out once, when the profile becomes complete. Decorative only. -->
    <span v-if="celebrating" class="sparks" aria-hidden="true">
      <i v-for="n in 8" :key="n" class="spark" :style="{ '--a': `${n * 45}deg`, '--d': `${(n % 3) * 60}ms` }" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCountUp } from '@/composables/useCountUp';
import { clampPercent, justReachedFull, prefersReducedMotion, ringDashOffset } from '@/services/motion';

let counter = 0;

const props = withDefaults(defineProps<{
  percent: number; // 0 to 100
  size?: number;
  stroke?: number;
  label?: string;
  /** Pop a few sparkles when the value reaches 100. */
  celebrate?: boolean;
}>(), { size: 88, stroke: 8, label: 'Progress', celebrate: true });

const gradientId = `ring-grad-${++counter}`;
const radius = computed(() => (props.size - props.stroke) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

const target = computed(() => Math.round(clampPercent(props.percent)));
// The ring and the number share one animated value, so they always move together:
// it starts at 0 and counts up when the screen appears (or glides when the value changes).
const shown = useCountUp(target);
const offset = computed(() => ringDashOffset(shown.value, circumference.value));

const celebrating = ref(false);
let stop: ReturnType<typeof setTimeout> | undefined;
watch(shown, (next, previous) => {
  if (!props.celebrate || prefersReducedMotion() || !justReachedFull(previous, next)) return;
  celebrating.value = true;
  clearTimeout(stop);
  stop = setTimeout(() => (celebrating.value = false), 1800);
});
</script>

<style scoped>
/* not called ".ring": Tailwind has a .ring utility that draws a box outline */
.pring { position: relative; flex: none; }
svg { transform: rotate(-90deg); display: block; overflow: visible; }
.track { stroke: color-mix(in oklab, var(--color-base-content) 12%, var(--color-base-100)); }
.bar { filter: drop-shadow(0 2px 6px color-mix(in oklab, var(--color-primary) 45%, transparent)); }
.value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: var(--color-base-content);
  line-height: 1;
}
.num { font-size: calc(v-bind(size) * 0.27px); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.pct { font-size: calc(v-bind(size) * 0.14px); font-weight: 700; margin-left: 1px; opacity: 0.7; align-self: center; }

.pring.celebrating { animation: ring-pulse 0.9s ease-out 2; }
@keyframes ring-pulse {
  0% { transform: scale(1); }
  35% { transform: scale(1.07); }
  100% { transform: scale(1); }
}

.sparks { position: absolute; inset: 0; pointer-events: none; }
.spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: var(--color-accent);
  opacity: 0;
  animation: spark-out 1.1s ease-out both;
  animation-delay: var(--d, 0ms);
}
.spark:nth-child(even) { background: var(--color-primary); width: 5px; height: 5px; }
@keyframes spark-out {
  0% { opacity: 0; transform: rotate(var(--a)) translateY(0) scale(0.4); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(v-bind(size) * -0.78px)) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .pring.celebrating { animation: none; }
}
</style>
