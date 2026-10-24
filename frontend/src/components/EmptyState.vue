<template>
  <div class="empty-state">
    <svg class="art" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <!-- shared backdrop -->
      <ellipse class="ground" cx="80" cy="106" rx="42" ry="6" />
      <circle class="blob" cx="80" cy="60" r="48" />
      <path class="spark f-s" d="M130 30 l2.4 6.6 6.6 2.4 -6.6 2.4 -2.4 6.6 -2.4 -6.6 -6.6 -2.4 6.6 -2.4z" />
      <path class="spark spark-2 f-a" d="M28 78 l1.8 4.8 4.8 1.8 -4.8 1.8 -1.8 4.8 -1.8 -4.8 -4.8 -1.8 4.8 -1.8z" />
      <circle class="dot f-p" cx="34" cy="38" r="3" />
      <circle class="dot dot-2 f-a" cx="126" cy="84" r="2.5" />

      <g class="art-main">
        <!-- experience: briefcase -->
        <template v-if="variant === 'experience'">
          <path class="s-p" d="M66 50 v-7 a6 6 0 0 1 6-6 h16 a6 6 0 0 1 6 6 v7" fill="none" stroke-width="5" stroke-linecap="round" />
          <rect class="f-p" x="46" y="48" width="68" height="46" rx="9" />
          <rect class="f-soft" x="46" y="64" width="68" height="5" />
          <rect class="f-a" x="72" y="60" width="16" height="14" rx="4" />
        </template>

        <!-- projects: folder with a star -->
        <template v-else-if="variant === 'projects'">
          <path class="f-s-deep" d="M44 50 a7 7 0 0 1 7-7 h18 l8 9 h32 a7 7 0 0 1 7 7 v32 a7 7 0 0 1 -7 7 H51 a7 7 0 0 1 -7-7z" />
          <rect class="f-s" x="44" y="58" width="72" height="36" rx="8" />
          <path class="f-a" d="M80 66 l3.2 6.5 7.1 1 -5.2 5 1.3 7.1 -6.4 -3.4 -6.4 3.4 1.3 -7.1 -5.2 -5 7.1 -1z" />
        </template>

        <!-- education: graduation cap -->
        <template v-else-if="variant === 'education'">
          <path class="f-s" d="M58 64 v15 c0 7 44 7 44 0 v-15 l-22 10z" />
          <path class="f-p" d="M80 36 L124 55 L80 74 L36 55z" />
          <path class="s-a" d="M120 57 v22" fill="none" stroke-width="3.5" stroke-linecap="round" />
          <circle class="f-a" cx="120" cy="82" r="5" />
        </template>

        <!-- skills: lightning bolt in a badge -->
        <template v-else-if="variant === 'skills'">
          <circle class="f-p" cx="80" cy="64" r="34" />
          <circle class="f-soft" cx="80" cy="64" r="26" />
          <path class="f-a" d="M86 40 L65 69 h13 l-5 19 L96 58 H83z" />
        </template>

        <!-- activity: clock -->
        <template v-else-if="variant === 'activity'">
          <circle class="f-card s-p" cx="80" cy="62" r="32" stroke-width="6" />
          <path class="s-s" d="M80 62 V44 M80 62 L93 70" fill="none" stroke-width="5" stroke-linecap="round" />
          <circle class="f-a" cx="80" cy="62" r="4" />
        </template>

        <!-- generic: a card with lines -->
        <template v-else>
          <rect class="f-card s-p" x="46" y="38" width="68" height="56" rx="10" stroke-width="5" />
          <rect class="f-p" x="58" y="52" width="30" height="6" rx="3" />
          <rect class="f-soft" x="58" y="65" width="44" height="5" rx="2.5" />
          <rect class="f-soft" x="58" y="76" width="34" height="5" rx="2.5" />
        </template>
      </g>
    </svg>

    <h2 class="title">{{ title }}</h2>
    <p v-if="text" class="text">{{ text }}</p>
    <div v-if="$slots.default" class="action"><slot /></div>
  </div>
</template>

<script setup lang="ts">
export type EmptyVariant = 'experience' | 'projects' | 'education' | 'skills' | 'activity' | 'generic';

// A friendly "nothing here yet" block with a small inline illustration (theme colors only).
withDefaults(defineProps<{
  variant?: EmptyVariant;
  title: string;
  text?: string;
}>(), { variant: 'generic', text: '' });
</script>

<style scoped>
.empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; }
.art { width: 160px; height: 120px; margin-bottom: 8px; overflow: visible; }

.title { margin: 0; font-size: 1.125rem; font-weight: 750; letter-spacing: -0.01em; }
.text {
  margin: 6px 0 0;
  max-width: 32ch;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--ui-text-soft);
}
.action { margin-top: 16px; }

/* illustration colors */
.blob { fill: color-mix(in oklab, var(--color-primary) 12%, var(--color-base-100)); }
.ground { fill: color-mix(in oklab, var(--color-base-content) 10%, transparent); }
.f-p { fill: var(--color-primary); }
.f-s { fill: var(--color-secondary); }
.f-s-deep { fill: color-mix(in oklab, var(--color-secondary) 70%, var(--color-base-content)); }
.f-a { fill: var(--color-accent); }
.f-soft { fill: color-mix(in oklab, var(--color-base-100) 55%, transparent); }
.f-card { fill: var(--color-base-100); }
.s-p { stroke: var(--color-primary); }
.s-s { stroke: var(--color-secondary); }
.s-a { stroke: var(--color-accent); }

/* gentle life: the main picture floats, the sparkles twinkle */
.art-main { animation: bob 3.6s ease-in-out infinite; transform-origin: 80px 70px; }
.spark { animation: twinkle 2.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.spark-2 { animation-delay: 1.1s; }
.dot { animation: twinkle 3.4s ease-in-out infinite; }
.dot-2 { animation-delay: 0.7s; }
@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}
@media (prefers-reduced-motion: reduce) {
  .art-main, .spark, .dot { animation: none; }
}
</style>
