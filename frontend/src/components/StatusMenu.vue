<template>
  <div class="status-menu" role="menu" :aria-label="title ? `Change status of ${title}` : 'Change status'">
    <p class="head">Change status</p>
    <button
      v-for="s in STATUSES"
      :key="s"
      type="button"
      role="menuitemradio"
      :aria-checked="s === current"
      class="item"
      :class="{ current: s === current }"
      @click="pick(s)"
    >
      <span class="dot" :class="`ion-color-${statusColor(s)}`" aria-hidden="true" />
      <span class="label">{{ statusLabel(s) }}</span>
      <ion-icon v-if="s === current" :icon="checkmark" class="check" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, popoverController } from '@ionic/vue';
import { checkmark } from 'ionicons/icons';
import { STATUSES, statusColor, statusLabel, type AppStatus } from '@/services/trackerLogic';

// The floating "Change status" menu that opens next to a status badge (see useTrackerActions).
// Picking a status closes the popover and hands the value back to whoever opened it.
defineProps<{ current: AppStatus; title?: string }>();

function pick(s: AppStatus) {
  void popoverController.dismiss(s, 'select');
}
</script>

<style scoped>
.status-menu { padding: 6px; }
.head {
  margin: 4px 10px 6px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-faint);
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-base-content);
  font: inherit;
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
}
@media (hover: hover) {
  .item:hover { background: var(--ui-soft); }
}
.item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.item.current { font-weight: 700; background: var(--ui-soft); }
.label { flex: 1; }
.check { font-size: 18px; color: var(--color-primary); }

/* same dot colours as StatusBadge */
.dot {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: color-mix(in oklab, var(--ion-color-base) 75%, var(--color-base-content));
}
.dot.ion-color-medium { background: var(--ui-text-faint); }
</style>
