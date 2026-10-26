<template>
  <div class="match">
    <!-- Score -->
    <section class="ui-surface ui-card score-card" aria-label="Match score">
      <ProgressRing v-if="match.score !== null" :percent="match.score" :size="92" :stroke="8" :celebrate="false" label="Match score" />
      <div class="score-text">
        <h3 class="ui-h2">{{ scoreLabel(match.score) }}</h3>
        <p class="muted">{{ matchSentence(match) }}</p>
      </div>
    </section>

    <!-- Matched skills -->
    <section class="ui-surface ui-card" aria-labelledby="matched-title">
      <h3 id="matched-title" class="ui-h3">Matched skills</h3>
      <ul v-if="match.matched.length" class="chips">
        <li v-for="s in match.matched" :key="s" class="ui-pill ui-tone-success">
          <ion-icon :icon="checkmarkOutline" aria-hidden="true" />{{ s }}
        </li>
      </ul>
      <p v-else-if="match.gaps.length" class="muted">None of the skills in the job post were found on your resume.</p>
      <p v-else class="muted">No skills to compare.</p>
    </section>

    <!-- Gaps -->
    <section class="ui-surface ui-card" aria-labelledby="gaps-title">
      <h3 id="gaps-title" class="ui-h3">Gaps</h3>
      <p class="muted explain">Skills the job asks for that your resume does not show — the AI did not add them.</p>
      <ul v-if="match.gaps.length" class="chips">
        <li v-for="s in match.gaps" :key="s" class="ui-pill ui-tone-warning">{{ s }}</li>
      </ul>
      <p v-else-if="match.matched.length" class="muted">No gaps found. Your resume shows every skill the job lists.</p>
      <p v-else class="muted">No skills to compare.</p>
    </section>

    <!-- Lines to check -->
    <section v-if="warnings.length" class="ui-surface ui-card warn-card ui-tone-warning" aria-labelledby="warn-title">
      <div class="warn-head">
        <ion-icon :icon="alertCircleOutline" class="warn-icon" aria-hidden="true" />
        <h3 id="warn-title" class="ui-h3">Please check these lines</h3>
      </div>
      <ul class="warn-list">
        <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { alertCircleOutline, checkmarkOutline } from 'ionicons/icons';
import ProgressRing from '@/components/ProgressRing.vue';
import { matchSentence, scoreLabel, type MatchResult } from '@/services/jobsLogic';

// The "Match" tab: score, skills found on the resume, gaps (never added by the AI) and lines to check.
defineProps<{ match: MatchResult; warnings: string[] }>();
</script>

<style scoped>
.match { display: flex; flex-direction: column; gap: 12px; }
.score-card { display: flex; align-items: center; gap: 16px; }
.score-text { min-width: 0; }
.muted { margin: 6px 0 0; font-size: 0.9rem; line-height: 1.45; color: var(--ui-text-soft); }
.explain { margin-bottom: 10px; }
.chips { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.chips ion-icon { font-size: 14px; }

.warn-card {
  background: var(--tone-tint);
  border-color: color-mix(in oklab, var(--tone) 30%, transparent);
}
.warn-head { display: flex; align-items: center; gap: 8px; }
.warn-icon { flex: none; font-size: 22px; color: var(--tone-ink); }
.warn-list { margin: 8px 0 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.5; }
.warn-list li + li { margin-top: 4px; }
</style>
