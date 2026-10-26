<template>
  <div class="email-text">
    <div class="text-head">
      <p :id="labelId" class="text-label">{{ label }}</p>
      <ion-button
        fill="clear"
        size="small"
        class="pressable plain-btn copy-btn"
        :aria-label="copyLabel"
        :disabled="!text"
        @click="onCopy"
      >
        <ion-icon slot="start" :icon="copied ? checkmarkOutline : copyOutline" aria-hidden="true" />
        {{ copied ? 'Copied' : 'Copy' }}
      </ion-button>
    </div>
    <!-- Read-only text (not an input): easy to read, and it can still be selected by hand. -->
    <div
      class="text-block"
      :class="{ multiline, single: !multiline, empty: !text }"
      role="group"
      :aria-labelledby="labelId"
    >{{ text || emptyText }}</div>
    <span class="ui-visually-hidden" role="status">{{ copied ? copiedMessage : '' }}</span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { checkmarkOutline, copyOutline } from 'ionicons/icons';
import { copyText } from '@/services/clipboard';
import { showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';

// One part of the application email (subject or message) with a Copy button.
const props = withDefaults(defineProps<{
  /** "Subject" or "Message". */
  label: string;
  text: string;
  /** Element id prefix (unique on the page). */
  fieldId: string;
  /** aria-label of the button, e.g. "Copy subject". */
  copyLabel: string;
  /** Read out after copying, e.g. "Subject copied". */
  copiedMessage: string;
  /** Message: keeps line breaks and normal weight. Subject: one bold line. */
  multiline?: boolean;
  /** Shown in the block when the text is empty. */
  emptyText?: string;
}>(), { multiline: false, emptyText: '' });

const labelId = `${props.fieldId}-label`;
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

async function onCopy() {
  if (!props.text) return;
  void tapHaptic();
  const ok = await copyText(props.text);
  if (!ok) {
    void showToast('Could not copy. Press and hold the text to select it.', 'error');
    return;
  }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => { copied.value = false; }, 2000);
}
</script>

<style scoped>
.email-text { min-width: 0; }
.text-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.text-label { margin: 0 0 0 2px; font-size: 0.9rem; font-weight: 650; }
.copy-btn { margin: 0; min-height: 44px; --padding-start: 10px; --padding-end: 10px; }
/* small text buttons in normal letter case (Material mode makes them uppercase) */
.plain-btn { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: 0.875rem; }
.text-block {
  padding: 12px;
  border-radius: 12px;
  background: var(--ui-soft);
  font-size: 0.95rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  color: var(--color-base-content);
}
.single { font-weight: 600; }
.multiline { white-space: pre-wrap; font-weight: 400; }
.empty { font-weight: 400; color: var(--ui-text-soft); }
</style>
