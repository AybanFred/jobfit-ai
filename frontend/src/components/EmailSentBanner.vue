<template>
  <!-- Shown inside a role="status" region of the parent, so it is announced without taking focus. -->
  <div class="sent-banner ui-surface">
    <div class="sent-main">
      <ion-icon :icon="mailOutline" class="sent-icon" aria-hidden="true" />
      <div class="sent-copy">
        <p class="sent-text"><strong>Sent it?</strong> Mark this job as Applied to keep your Tracker up to date.</p>
        <p v-if="error" class="ui-error-text sent-error" role="alert">{{ error }}</p>
      </div>
    </div>
    <div class="sent-actions">
      <ion-button size="small" class="pressable ui-btn sent-btn mark-btn" :disabled="saving" @click="emit('mark')">
        <ion-spinner v-if="saving" slot="start" name="crescent" class="mini-spinner" aria-hidden="true" />
        {{ saving ? 'Saving…' : 'Mark as Applied' }}
      </ion-button>
      <ion-button
        fill="clear"
        size="small"
        class="pressable ui-btn plain-btn sent-btn"
        aria-label="Not yet, hide this message"
        :disabled="saving"
        @click="emit('dismiss')"
      >
        Not yet
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonSpinner } from '@ionic/vue';
import { mailOutline } from 'ionicons/icons';

// "Sent it?" after the user opened their email app: one tap marks the job as Applied.
defineProps<{ saving: boolean; error: string }>();
const emit = defineEmits<{ (e: 'mark'): void; (e: 'dismiss'): void }>();
</script>

<style scoped>
.sent-banner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: color-mix(in oklab, var(--color-primary) 8%, var(--color-base-100));
  border-color: color-mix(in oklab, var(--color-primary) 26%, transparent);
  box-shadow: none;
}
.sent-main { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.sent-icon { flex: none; font-size: 22px; margin-top: 1px; color: var(--ui-accent-ink); }
.sent-copy { min-width: 0; }
.sent-text { margin: 0; font-size: 0.9rem; line-height: 1.45; color: var(--color-base-content); }
.sent-error { margin: 6px 0 0; font-size: 0.85rem; }
.sent-actions { display: flex; gap: 8px; }
.sent-btn { margin: 0; min-height: 44px; flex: 1 1 0; --box-shadow: none; }
.plain-btn { text-transform: none; letter-spacing: 0; font-weight: 600; }
.mini-spinner { width: 16px; height: 16px; }

@media (min-width: 768px) {
  .sent-banner { flex-direction: row; align-items: center; gap: 14px; }
  .sent-main { flex: 1; align-items: center; }
  .sent-actions { flex: none; }
  .sent-btn { flex: none; }
}
</style>
