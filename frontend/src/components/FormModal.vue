<template>
  <ion-modal
    :is-open="open"
    :backdrop-dismiss="!saving"
    :can-dismiss="!saving"
    :breakpoints="sheet ? [0, 0.7, 1] : undefined"
    :initial-breakpoint="sheet ? 0.7 : undefined"
    @didDismiss="emit('close')"
  >
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button class="top-btn" :disabled="saving" @click="emit('close')">Cancel</ion-button>
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <form class="form" novalidate @submit.prevent="emit('submit')">
        <slot />

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <!-- keeps "press Enter to save" working; the visible Save button lives in the footer -->
        <button v-if="showSubmit" type="submit" class="enter-submit" tabindex="-1" aria-hidden="true" :disabled="saving || submitDisabled" />

        <ion-button
          v-if="canDelete"
          class="remove pressable"
          expand="block"
          fill="clear"
          color="danger"
          type="button"
          :disabled="saving"
          @click="emit('delete')"
        >
          {{ deleteLabel }}
        </ion-button>
      </form>
    </ion-content>

    <ion-footer v-if="showSubmit" class="ion-no-border">
      <div class="bar-foot">
        <ion-button
          class="save pressable ui-btn ui-btn-gradient"
          expand="block"
          type="button"
          :disabled="saving || submitDisabled"
          @click="emit('submit')"
        >
          <ion-spinner v-if="saving" name="crescent" aria-label="Saving" />
          <span v-else>{{ submitLabel }}</span>
        </ion-button>
      </div>
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons, IonButton, IonSpinner,
} from '@ionic/vue';

withDefaults(defineProps<{
  open: boolean;
  title: string;
  saving?: boolean;
  error?: string;
  submitLabel?: string;
  /** Show a Delete button (only when editing something that already exists). */
  canDelete?: boolean;
  deleteLabel?: string;
  /** A short bottom sheet instead of a full-screen modal. */
  sheet?: boolean;
  /** Hide the Save button (for steps that have nothing to save yet). */
  showSubmit?: boolean;
  /** Greys out the Save button without showing the saving spinner (e.g. nothing to save yet). */
  submitDisabled?: boolean;
}>(), {
  saving: false, error: '', submitLabel: 'Save', canDelete: false, deleteLabel: 'Delete', sheet: false, showSubmit: true,
  submitDisabled: false,
});

const emit = defineEmits<{ (e: 'close'): void; (e: 'submit'): void; (e: 'delete'): void }>();
</script>

<style scoped>
.form { max-width: 560px; margin: 0 auto; }
.top-btn { min-height: 44px; }
.error {
  margin: 0 0 12px;
  color: var(--ui-error-ink);
  font-size: 0.9rem;
  line-height: 1.4;
}
.enter-submit { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; padding: 0; }
.bar-foot {
  max-width: 560px;
  margin: 0 auto;
  padding: 10px 16px calc(var(--ion-safe-area-bottom, 0px) + 10px);
  background: var(--ion-background-color);
  border-top: 1px solid var(--ui-line);
  box-shadow: 0 -12px 24px -16px color-mix(in oklab, var(--color-base-content) 30%, transparent);
}
.save { margin: 0; min-height: 52px; --border-radius: 16px; font-size: 1.02rem; }
.save[disabled] { opacity: 0.45; --box-shadow: none; }
.remove { margin: 8px 0 0; min-height: 44px; }
</style>
