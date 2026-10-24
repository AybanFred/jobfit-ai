<template>
  <div>
    <input
      ref="inputRef"
      class="hidden-input"
      type="file"
      :accept="RESUME_ACCEPT"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
    <button
      type="button"
      class="zone pressable"
      :class="{ dragging }"
      :disabled="disabled"
      aria-label="Choose your resume file (PDF or DOCX, up to 5 MB)"
      @click="open"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="icon" aria-hidden="true"><ion-icon :icon="cloudUploadOutline" /></span>
      <span class="title">Choose your resume</span>
      <span class="hint">Tap here to pick a file, or drop it here.<br />PDF or Word (.docx), up to 5 MB.</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonIcon } from '@ionic/vue';
import { cloudUploadOutline } from 'ionicons/icons';
import { tapHaptic } from '@/services/haptics';
import { RESUME_ACCEPT } from '@/services/resumeImport';

// `disabled` is used while the AI models load or when none is available.
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ (e: 'file', file: File): void; (e: 'many'): void }>();

const inputRef = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

function open() {
  if (props.disabled) return;
  tapHaptic();
  inputRef.value?.click();
}

function handle(files: FileList | null | undefined) {
  if (props.disabled || !files || files.length === 0) return;
  if (files.length > 1) { emit('many'); return; }
  emit('file', files[0] as File);
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  handle(input.files);
  input.value = ''; // so choosing the same file again still triggers a change
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  handle(event.dataTransfer?.files);
}
</script>

<style scoped>
.hidden-input { display: none; }
.zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 180px;
  justify-content: center;
  padding: 24px 16px;
  font: inherit;
  text-align: center;
  color: var(--color-base-content);
  background: var(--ui-gradient-soft);
  border: 2px dashed color-mix(in oklab, var(--color-primary) 45%, transparent);
  border-radius: var(--ui-radius-lg);
  cursor: pointer;
  transition: transform 0.2s var(--ui-ease), border-color 0.2s ease, box-shadow 0.2s ease;
}
.zone:hover:not(:disabled), .zone.dragging {
  border-color: var(--color-primary);
  box-shadow: var(--ui-shadow-md);
}
.zone.dragging { transform: scale(1.01); }
.zone:disabled { opacity: 0.5; cursor: not-allowed; }
.icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  background: var(--ui-gradient-cta);
  color: var(--color-primary-content);
  box-shadow: var(--ui-glow);
}
.icon ion-icon { font-size: 28px; }
.title { font-weight: 600; font-size: 1.05rem; }
.hint { font-size: 0.85rem; line-height: 1.4; color: var(--ui-text-soft); }
</style>
