<template>
  <li class="row">
    <div class="text">
      <span class="lbl">{{ label }}</span>
      <span v-if="detail && status === 'failed'" class="detail" role="alert">{{ detail }}</span>
    </div>

    <ion-skeleton-text
      v-if="status === 'checking'"
      :animated="!reduced"
      class="skel"
      aria-label="Checking"
    />
    <span v-else class="state" :class="status">
      <ion-icon :icon="status === 'ok' ? checkmarkCircle : alertCircle" aria-hidden="true" />
      {{ status === 'ok' ? 'OK' : 'Problem' }}
    </span>
  </li>
</template>

<script lang="ts">
export type CheckStatus = 'checking' | 'ok' | 'failed';
</script>

<script setup lang="ts">
import { IonSkeletonText, IonIcon } from '@ionic/vue';
import { checkmarkCircle, alertCircle } from 'ionicons/icons';
import { prefersReducedMotion } from '@/services/motion';

defineProps<{ label: string; status: CheckStatus; detail?: string }>();
const reduced = prefersReducedMotion();
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 6px 0;
  list-style: none;
}
.row + .row { border-top: 1px solid var(--ui-line); }
.text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lbl { font-size: 0.9rem; }
.detail { font-size: 0.8rem; color: var(--ui-error-ink); line-height: 1.3; }
.skel { width: 56px; height: 24px; margin: 0; border-radius: 999px; flex: none; }

/* soft pill: tinted background, readable text mixed from the same color */
.state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}
.state ion-icon { font-size: 16px; }
.state.ok {
  background: color-mix(in oklab, var(--color-success) 16%, var(--color-base-100));
  color: color-mix(in oklab, var(--color-success) 36%, var(--color-base-content));
}
.state.failed {
  background: color-mix(in oklab, var(--color-error) 16%, var(--color-base-100));
  color: var(--ui-error-ink);
}
</style>
