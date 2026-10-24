<template>
  <FormModal
    :open="open"
    :title="item ? 'Edit project' : 'Add project'"
    :saving="saving"
    :error="error"
    :can-delete="!!item"
    delete-label="Delete this project"
    @close="emit('close')"
    @submit="submit"
    @delete="emit('delete')"
  >
    <ion-input
      v-model="name"
      class="field"
      :class="invalid(errors.name)"
      label="Project name"
      label-placement="floating"
      fill="outline"
      :maxlength="LIMITS.projectName"
      enterkeyhint="next"
      :error-text="errors.name"
    />

    <ion-textarea
      v-model="description"
      class="field"
      :class="invalid(errors.description)"
      label="What it does (optional)"
      label-placement="floating"
      fill="outline"
      :auto-grow="true"
      :rows="3"
      :maxlength="LIMITS.projectDescription"
      :counter="true"
      :error-text="errors.description"
    />

    <!-- Tech stack chips -->
    <section class="tech" aria-labelledby="tech-title">
      <h3 id="tech-title">Tech stack (optional)</h3>
      <div v-if="tech.length" class="chips">
        <ion-chip v-for="t in tech" :key="t" class="chip">
          <ion-label>{{ t }}</ion-label>
          <button type="button" class="chip-x" :aria-label="`Remove ${t}`" @click="removeTech(t)">
            <ion-icon :icon="closeCircle" aria-hidden="true" />
          </button>
        </ion-chip>
      </div>
      <ion-input
        :value="techDraft"
        class="field"
        label="Add a technology"
        label-placement="floating"
        fill="outline"
        :maxlength="LIMITS.tech"
        enterkeyhint="done"
        :disabled="tech.length >= LIMITS.techCount"
        @ionInput="onTechInput"
        @keydown.enter.prevent="commitTech"
        @ionBlur="commitTech"
      />
      <p class="hint">Type a name, then press Enter or a comma to add it. Tap the x on a chip to remove it.</p>
    </section>

    <ion-input
      v-model="link"
      class="field"
      :class="invalid(errors.link)"
      type="url"
      inputmode="url"
      label="Link (optional)"
      label-placement="floating"
      fill="outline"
      autocomplete="url"
      enterkeyhint="done"
      :error-text="errors.link"
    />
  </FormModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonInput, IonTextarea, IonChip, IonLabel, IonIcon } from '@ionic/vue';
import { closeCircle } from 'ionicons/icons';
import FormModal from '@/components/FormModal.vue';
import type { ProjectInput } from '@/services/profile';
import {
  LIMITS, requiredError, maxLengthError, urlError, normalizeUrl, addTags, toNull, trimText, type Project,
} from '@/services/profileLogic';

const props = defineProps<{ open: boolean; item: Project | null; saving: boolean; error: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', value: ProjectInput): void;
  (e: 'delete'): void;
}>();

const name = ref('');
const description = ref('');
const tech = ref<string[]>([]);
const techDraft = ref('');
const link = ref('');
const submitted = ref(false);

watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  name.value = props.item?.name ?? '';
  description.value = props.item?.description ?? '';
  tech.value = [...(props.item?.tech_stack ?? [])];
  techDraft.value = '';
  link.value = props.item?.link ?? '';
  submitted.value = false;
});

const errors = computed(() => {
  if (!submitted.value) return { name: '', description: '', link: '' };
  return {
    name: requiredError('the project name', name.value, LIMITS.projectName),
    description: maxLengthError('the description', description.value, LIMITS.projectDescription),
    link: urlError(link.value),
  };
});

const invalid = (msg: string) => (msg ? { 'ion-invalid': true, 'ion-touched': true } : {});

function commitTech() {
  if (trimText(techDraft.value)) tech.value = addTags(tech.value, techDraft.value);
  techDraft.value = '';
}

// A comma (also what mobile keyboards send) adds what was typed so far.
function onTechInput(event: CustomEvent) {
  const value = String(event.detail.value ?? '');
  if (value.includes(',')) {
    tech.value = addTags(tech.value, value);
    techDraft.value = '';
    (event.target as HTMLIonInputElement).value = '';
  } else {
    techDraft.value = value;
  }
}

const removeTech = (t: string) => (tech.value = tech.value.filter((x) => x !== t));

function submit() {
  commitTech();
  submitted.value = true;
  if (Object.values(errors.value).some(Boolean)) return;
  emit('save', {
    name: trimText(name.value),
    description: toNull(description.value),
    tech_stack: tech.value,
    link: toNull(normalizeUrl(link.value)),
  });
}
</script>

<style scoped>
.field { margin-bottom: 16px; --border-radius: 12px; }
.tech { margin-bottom: 4px; }
h3 { margin: 0 0 8px; font-size: 0.95rem; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; margin: 0 -4px 8px; }
.chip { min-height: 36px; }
.chip-x {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  margin: -8px -10px -8px 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.chip-x ion-icon { font-size: 20px; }
.chip-x:focus-visible { outline: 2px solid var(--ion-color-primary); border-radius: 50%; }
.hint { margin: -8px 0 16px; font-size: 0.8rem; color: var(--ion-color-step-600); line-height: 1.4; }
</style>
