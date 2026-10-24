<template>
  <section class="import-card" :class="{ prominent }" aria-labelledby="import-card-title">
    <div class="row">
      <span class="icon" aria-hidden="true"><ion-icon :icon="documentAttachOutline" /></span>
      <div class="text">
        <h2 id="import-card-title">Import from resume</h2>
        <p class="sub">
          {{ prominent
            ? 'The quickest way to start: upload your PDF or DOCX and review what we find.'
            : 'Upload a resume to fill in missing details. You review everything first.' }}
        </p>
      </div>
    </div>
    <ion-button
      class="go pressable ui-btn"
      :fill="prominent ? 'solid' : 'outline'"
      expand="block"
      aria-label="Import your profile from a resume"
      @click="onClick"
    >
      <ion-icon slot="start" :icon="cloudUploadOutline" aria-hidden="true" />
      Choose a resume
    </ion-button>
  </section>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { cloudUploadOutline, documentAttachOutline } from 'ionicons/icons';
import { tapHaptic } from '@/services/haptics';

// prominent = bold gradient call to action (shown while the profile is not complete yet)
defineProps<{ prominent: boolean }>();
const emit = defineEmits<{ (e: 'press'): void }>();

function onClick() {
  tapHaptic();
  emit('press');
}
</script>

<style scoped>
.import-card {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  padding: 16px;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-card-bg);
  border: 1px solid var(--ui-line);
  box-shadow: var(--ui-shadow-sm);
}
.import-card.prominent {
  background: var(--ui-gradient-cta);
  color: var(--color-primary-content);
  border: 0;
  box-shadow: var(--ui-shadow-lg);
}
/* soft light circles behind the content */
.import-card.prominent::before,
.import-card.prominent::after {
  content: '';
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  background: color-mix(in oklab, var(--color-primary-content) 13%, transparent);
}
.import-card.prominent::before { width: 150px; height: 150px; right: -40px; top: -60px; }
.import-card.prominent::after { width: 90px; height: 90px; right: 50px; bottom: -50px; }

.row { display: flex; align-items: center; gap: 14px; }
.icon {
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: var(--ui-gradient-cta);
  color: var(--color-primary-content);
}
.prominent .icon {
  background: color-mix(in oklab, var(--color-primary-content) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-primary-content) 30%, transparent);
}
.icon ion-icon { font-size: 26px; }
.text { flex: 1; min-width: 0; }
h2 { margin: 0; font-size: 1.0625rem; font-weight: 750; letter-spacing: -0.01em; }
.sub { margin: 3px 0 0; font-size: 0.85rem; line-height: 1.4; color: var(--ui-text-soft); }
.prominent .sub { color: inherit; }

.go { margin: 14px 0 0; }
/* on the gradient, the button is a plain light pill so it stands out in every theme */
.prominent .go {
  --background: var(--color-base-100);
  --background-hover: var(--color-base-100);
  --background-activated: var(--color-base-100);
  --color: var(--color-base-content);
  --box-shadow: var(--ui-shadow-md);
}
</style>
