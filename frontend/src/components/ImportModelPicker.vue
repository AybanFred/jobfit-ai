<template>
  <section class="picker" aria-label="AI model">
    <!-- Loading -->
    <div v-if="loading" aria-busy="true" aria-label="Loading AI models">
      <ion-skeleton-text :animated="!reduced" class="sk" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state">
      <p class="error" role="alert">{{ error }}</p>
      <ion-button fill="outline" class="pressable act-btn" @click="load">Try again</ion-button>
    </div>

    <!-- Nothing is set up on the server -->
    <p v-else-if="!hasAvailableModel(models)" class="error" role="alert">
      No AI provider is set up on the server yet. Please try again later.
    </p>

    <!-- Choice -->
    <template v-else>
      <ion-select
        class="model-select"
        label="AI model"
        label-placement="stacked"
        fill="outline"
        interface="popover"
        :interface-options="{ cssClass: 'model-popover' }"
        :value="selected"
        @ionChange="onChange($event.detail.value)"
      >
        <ion-select-option v-for="m in models" :key="m.id" :value="m.id" :disabled="!m.available">
          {{ optionLabel(m) }}
        </ion-select-option>
      </ion-select>
      <p class="note">
        Your resume text is sent to the provider you choose (Groq, Google or OpenAI) to read it.
        Free plans of some providers may use submitted content to improve their products.
        Your file itself is not stored.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { IonButton, IonSelect, IonSelectOption, IonSkeletonText } from '@ionic/vue';
import { prefersReducedMotion } from '@/services/motion';
import {
  fetchAiModels, hasAvailableModel, isAvailableChoice, loadSavedModel, optionLabel, resolveInitialModel,
  saveModelChoice, type AiModel,
} from '@/services/aiModels';

// Tells the page which model is chosen (null = none) and whether uploading is allowed.
const emit = defineEmits<{ (e: 'change', modelId: string | null): void }>();
const reduced = prefersReducedMotion();

const models = ref<AiModel[]>([]);
const selected = ref<string | null>(null);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const list = await fetchAiModels();
    models.value = list.models;
    // The saved choice is only a preference: it is checked against the list we just received.
    selected.value = resolveInitialModel(list.models, list.default, loadSavedModel());
  } catch {
    models.value = [];
    selected.value = null;
    error.value = 'We could not load the AI models. Please check your connection and try again.';
  } finally {
    loading.value = false;
  }
}

function onChange(value: unknown) {
  if (typeof value !== 'string' || !isAvailableChoice(models.value, value)) return;
  selected.value = value;
  saveModelChoice(value);
}

watch(selected, (id) => emit('change', id), { immediate: true });
onMounted(load);
</script>

<style scoped>
.picker { margin: 0; }
.model-select { --border-radius: 12px; min-height: 56px; }
.note {
  margin: 8px 4px 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--ion-color-step-600);
}
.sk { height: 56px; width: 100%; margin: 0; border-radius: 12px; }
.state { text-align: center; }
.error { margin: 0; color: var(--ui-error-ink); font-size: 0.9rem; line-height: 1.4; }
.act-btn { margin: 10px 0 0; min-height: 44px; --border-radius: 12px; }
</style>
