<template>
  <SectionShell
    title="Experience"
    add-label="Add experience"
    :loading="crud.loading.value"
    :error="crud.error.value"
    :empty="crud.items.value.length === 0"
    :empty-icon="briefcaseOutline"
    empty-variant="experience"
    tone="secondary"
    blurb="Your jobs and internships"
    :count-text="countText"
    empty-title="No experience yet"
    empty-text="Add your jobs and internships. Only real experience goes into your resumes."
    @add="crud.openAdd"
    @retry="crud.load()"
    @refresh="crud.load(true)"
  >
    <ion-list ref="listRef" lines="none" class="ui-list">
      <TransitionGroup name="ui-list" tag="div" class="ui-list-inner">
        <ion-item-sliding v-for="x in crud.items.value" :key="x.id" class="ui-sliding">
          <ion-item button :detail="false" class="ui-entry" @click="crud.openEdit(x)">
            <IconChip slot="start" :icon="briefcaseOutline" tone="secondary" />
            <ion-label class="ion-text-wrap">
              <h3>{{ x.role }}</h3>
              <p class="ui-strong">{{ [x.company, x.location].filter(Boolean).join(' · ') }}</p>
              <p>
                {{ monthRangeLabel(x.start_date, x.end_date) }}
                <template v-if="x.bullets.length">
                  · {{ x.bullets.length }} bullet point{{ x.bullets.length === 1 ? '' : 's' }}
                </template>
              </p>
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
      <ExperienceFormModal
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
import { briefcaseOutline, trashOutline } from 'ionicons/icons';
import SectionShell from '@/components/SectionShell.vue';
import IconChip from '@/components/IconChip.vue';
import ExperienceFormModal from '@/components/ExperienceFormModal.vue';
import { useSectionCrud } from '@/composables/useSectionCrud';
import { listExperiences, saveExperience, deleteExperience, type ExperienceInput } from '@/services/profile';
import { monthRangeLabel, type Experience } from '@/services/profileLogic';

const listRef = ref<{ $el: HTMLIonListElement } | null>(null);

const crud = useSectionCrud<Experience, ExperienceInput>({
  noun: 'experience',
  loadError: 'We could not load your experience. Please try again.',
  fetch: listExperiences,
  save: (input, editing) => saveExperience(input, editing?.id),
  remove: (x) => deleteExperience(x.id),
  label: (x) => `${x.role} at ${x.company}`,
});

const countText = computed(() => {
  const n = crud.items.value.length;
  return n === 0 ? '' : `${n} ${n === 1 ? 'job' : 'jobs'}`;
});

async function remove(x: Experience) {
  await listRef.value?.$el.closeSlidingItems();
  crud.onDelete(x);
}

onMounted(() => crud.load());
</script>
