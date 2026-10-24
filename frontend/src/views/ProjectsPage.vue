<template>
  <SectionShell
    title="Projects"
    add-label="Add project"
    :loading="crud.loading.value"
    :error="crud.error.value"
    :empty="crud.items.value.length === 0"
    :empty-icon="folderOpenOutline"
    empty-variant="projects"
    tone="accent"
    blurb="Things you built that show your skills"
    :count-text="countText"
    empty-title="No projects yet"
    empty-text="Add projects you built. They show your skills in action."
    @add="crud.openAdd"
    @retry="crud.load()"
    @refresh="crud.load(true)"
  >
    <ion-list ref="listRef" lines="none" class="ui-list">
      <TransitionGroup name="ui-list" tag="div" class="ui-list-inner">
        <ion-item-sliding v-for="x in crud.items.value" :key="x.id" class="ui-sliding">
          <ion-item button :detail="false" class="ui-entry" @click="crud.openEdit(x)">
            <IconChip slot="start" :icon="folderOpenOutline" tone="accent" />
            <ion-label class="ion-text-wrap">
              <h3>{{ x.name }}</h3>
              <p v-if="x.description" class="ui-strong desc">{{ x.description }}</p>
              <p v-if="x.tech_stack.length">{{ x.tech_stack.join(' · ') }}</p>
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
    <p class="ui-tip">Swipe a project left to delete it, or tap it to edit.</p>

    <template #modals>
      <ProjectFormModal
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
import { folderOpenOutline, trashOutline } from 'ionicons/icons';
import SectionShell from '@/components/SectionShell.vue';
import IconChip from '@/components/IconChip.vue';
import ProjectFormModal from '@/components/ProjectFormModal.vue';
import { useSectionCrud } from '@/composables/useSectionCrud';
import { listProjects, saveProject, deleteProject, type ProjectInput } from '@/services/profile';
import type { Project } from '@/services/profileLogic';

const listRef = ref<{ $el: HTMLIonListElement } | null>(null);

const crud = useSectionCrud<Project, ProjectInput>({
  noun: 'project',
  loadError: 'We could not load your projects. Please try again.',
  fetch: listProjects,
  save: (input, editing) => saveProject(input, editing?.id),
  remove: (x) => deleteProject(x.id),
  label: (x) => x.name,
});

const countText = computed(() => {
  const n = crud.items.value.length;
  return n === 0 ? '' : `${n} ${n === 1 ? 'project' : 'projects'}`;
});

async function remove(x: Project) {
  await listRef.value?.$el.closeSlidingItems();
  crud.onDelete(x);
}

onMounted(() => crud.load());
</script>

<style scoped>
.desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
