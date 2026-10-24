<template>
  <SectionShell
    title="Education"
    add-label="Add education"
    :loading="crud.loading.value"
    :error="crud.error.value"
    :empty="crud.items.value.length === 0"
    :empty-icon="schoolOutline"
    empty-variant="education"
    tone="info"
    blurb="Where you studied and trained"
    :count-text="countText"
    empty-title="No education yet"
    empty-text="Add your school, degree or training so employers can see your background."
    @add="crud.openAdd"
    @retry="crud.load()"
    @refresh="crud.load(true)"
  >
    <ion-list ref="listRef" lines="none" class="ui-list">
      <TransitionGroup name="ui-list" tag="div" class="ui-list-inner">
        <ion-item-sliding v-for="x in crud.items.value" :key="x.id" class="ui-sliding">
          <ion-item button :detail="false" class="ui-entry" @click="crud.openEdit(x)">
            <IconChip slot="start" :icon="schoolOutline" tone="info" />
            <ion-label class="ion-text-wrap">
              <h3>{{ x.school }}</h3>
              <p v-if="x.degree" class="ui-strong">{{ x.degree }}</p>
              <p v-if="yearsLabel(x)">{{ yearsLabel(x) }}</p>
              <p v-if="x.honors">{{ x.honors }}</p>
            </ion-label>
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="remove(x)">
              <ion-icon slot="start" :icon="trashOutline" aria-hidden="true" />
              Delete
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </TransitionGroup>
    </ion-list>
    <p class="ui-tip">Swipe an entry left to delete it, or tap it to edit.</p>

    <template #modals>
      <EducationFormModal
        :open="crud.modalOpen.value"
        :item="crud.editing.value"
        :saving="crud.saving.value"
        :error="crud.formError.value"
        @close="crud.closeModal"
        @save="crud.onSave"
        @delete="crud.editing.value && crud.onDelete(crud.editing.value)"
      />
    </template>
  </SectionShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonList, IonItemSliding, IonItem, IonLabel, IonItemOptions, IonItemOption, IonIcon } from '@ionic/vue';
import { schoolOutline, trashOutline } from 'ionicons/icons';
import SectionShell from '@/components/SectionShell.vue';
import IconChip from '@/components/IconChip.vue';
import EducationFormModal from '@/components/EducationFormModal.vue';
import { useSectionCrud } from '@/composables/useSectionCrud';
import { listEducation, saveEducation, deleteEducation, type EducationInput } from '@/services/profile';
import type { Education } from '@/services/profileLogic';

const listRef = ref<{ $el: HTMLIonListElement } | null>(null);

const crud = useSectionCrud<Education, EducationInput>({
  noun: 'education',
  loadError: 'We could not load your education. Please try again.',
  fetch: listEducation,
  save: (input, editing) => saveEducation(input, editing?.id),
  remove: (x) => deleteEducation(x.id),
  label: (x) => x.school,
});

const countText = computed(() => {
  const n = crud.items.value.length;
  return n === 0 ? '' : `${n} ${n === 1 ? 'entry' : 'entries'}`;
});

function yearsLabel(x: Education): string {
  if (x.start_year && x.end_year) return `${x.start_year} – ${x.end_year}`;
  if (x.start_year) return `${x.start_year} – Present`;
  return x.end_year ? String(x.end_year) : '';
}

async function remove(x: Education) {
  await listRef.value?.$el.closeSlidingItems();
  crud.onDelete(x);
}

onMounted(() => crud.load());
</script>
