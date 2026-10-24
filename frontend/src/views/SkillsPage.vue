<template>
  <SectionShell
    title="Skills"
    add-label="Add skill"
    :loading="crud.loading.value"
    :error="crud.error.value"
    :empty="crud.items.value.length === 0"
    :empty-icon="buildOutline"
    empty-variant="skills"
    tone="success"
    blurb="What you can really do, with your level"
    :count-text="countText"
    empty-title="No skills yet"
    empty-text="Add the skills you really have, with your level. Missing skills are never made up."
    @add="onAdd"
    @retry="crud.load()"
    @refresh="crud.load(true)"
  >
    <ion-list ref="listRef" lines="none" class="ui-list">
      <TransitionGroup name="ui-list" tag="div" class="ui-list-inner">
        <ion-item-sliding v-for="x in crud.items.value" :key="x.skill_id" class="ui-sliding">
          <ion-item button :detail="false" class="ui-entry skill" @click="crud.openEdit(x)">
            <ion-label>
              <h3>{{ x.skill.display_name }}</h3>
              <p v-if="detail(x)">{{ detail(x) }}</p>
            </ion-label>
            <!-- Level as five small bars that fill with the theme gradient -->
            <span v-if="x.level" slot="end" class="bars" aria-hidden="true">
              <span v-for="n in 5" :key="n" class="bar" :class="{ on: n <= (x.level ?? 0) }" />
            </span>
            <!-- Skills added by "Import from resume" have no level yet: invite the user to set one. -->
            <span v-else slot="end" class="set-level">Set level</span>
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="remove(x)">
              <ion-icon slot="start" :icon="trashOutline" aria-hidden="true" />
              Remove
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </TransitionGroup>
    </ion-list>
    <p class="ui-tip">Tap a skill to change its level or years. Swipe left to remove it.</p>

    <template #modals>
      <SkillAddModal
        :open="crud.modalOpen.value && !crud.editing.value"
        :bank="bank"
        :bank-loading="bankLoading"
        :bank-error="bankError"
        :owned-ids="ownedIds"
        :saving="crud.saving.value"
        :error="crud.formError.value"
        @close="crud.closeModal"
        @retry-bank="loadBank"
        @save="crud.onSave"
      />
      <SkillEditModal
        :open="crud.modalOpen.value && !!crud.editing.value"
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
import { buildOutline, trashOutline } from 'ionicons/icons';
import SectionShell from '@/components/SectionShell.vue';
import SkillAddModal from '@/components/SkillAddModal.vue';
import SkillEditModal from '@/components/SkillEditModal.vue';
import { useSectionCrud } from '@/composables/useSectionCrud';
import { friendlyApiError, friendlyDataError } from '@/services/errors';
import {
  listSkillBank, listUserSkills, addUserSkill, updateUserSkill, removeUserSkill, createCustomSkill,
  CustomSkillError, type SkillFormInput,
} from '@/services/skills';
import { levelLabel, type SkillBankItem, type UserSkill } from '@/services/profileLogic';

const listRef = ref<{ $el: HTMLIonListElement } | null>(null);

// The shared skills bank is loaded the first time the user opens "Add skill".
const bank = ref<SkillBankItem[]>([]);
const bankLoading = ref(false);
const bankLoaded = ref(false);
const bankError = ref('');

async function loadBank() {
  bankLoading.value = true;
  bankError.value = '';
  try {
    bank.value = await listSkillBank();
    bankLoaded.value = true;
  } catch {
    bankError.value = 'We could not load the skills list. Please try again.';
  } finally {
    bankLoading.value = false;
  }
}

const crud = useSectionCrud<UserSkill, SkillFormInput>({
  noun: 'skill',
  loadError: 'We could not load your skills. Please try again.',
  fetch: listUserSkills,
  removeVerb: 'Remove',
  label: (x) => x.skill.display_name,
  remove: (x) => removeUserSkill(x.skill_id),
  async save(input, editing) {
    if (editing) {
      await updateUserSkill(editing.skill_id, input.level, input.years);
      return;
    }
    let skill = input.skill;
    if (!skill && input.customName) {
      try {
        // The backend creates the skill in the shared bank (the app is not allowed to).
        skill = await createCustomSkill(input.customName);
      } catch (e) {
        throw new CustomSkillError(e);
      }
      const created = skill;
      if (!bank.value.some((b) => b.id === created.id)) bank.value = [...bank.value, created];
    }
    if (!skill) return;
    await addUserSkill(skill.id, input.level, input.years);
  },
  saveError: (e) =>
    e instanceof CustomSkillError
      ? `We could not create the new skill. ${friendlyApiError(e.original)} You can also pick a skill from the list.`
      : friendlyDataError(e),
});

const ownedIds = computed(() => crud.items.value.map((x) => x.skill_id));

const countText = computed(() => {
  const n = crud.items.value.length;
  return n === 0 ? '' : `${n} ${n === 1 ? 'skill' : 'skills'}`;
});

function onAdd() {
  crud.openAdd();
  if (!bankLoaded.value && !bankLoading.value) loadBank();
}

function detail(x: UserSkill): string {
  const parts: string[] = [];
  if (x.level) parts.push(`Level ${x.level}: ${levelLabel(x.level)}`);
  if (x.years !== null && x.years !== undefined) {
    parts.push(`${x.years} year${x.years === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

async function remove(x: UserSkill) {
  await listRef.value?.$el.closeSlidingItems();
  crud.onDelete(x);
}

onMounted(() => crud.load());
</script>

<style scoped>
.ui-entry.skill { --min-height: 64px; --padding-start: 16px; }
.ui-entry.skill h3 { margin: 0; }

/* five small bars; the filled ones use the theme gradient */
.bars { display: flex; gap: 4px; align-items: flex-end; height: 22px; }
.bar {
  width: 6px;
  border-radius: 3px;
  background: color-mix(in oklab, var(--color-base-content) 14%, var(--color-base-100));
}
.bar:nth-child(1) { height: 8px; }
.bar:nth-child(2) { height: 11px; }
.bar:nth-child(3) { height: 14px; }
.bar:nth-child(4) { height: 18px; }
.bar:nth-child(5) { height: 22px; }
.bar.on { background: linear-gradient(180deg, var(--color-secondary), var(--color-primary)); }

.set-level {
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ui-accent-ink);
  background: color-mix(in oklab, var(--color-primary) 12%, var(--color-base-100));
  border: 1px dashed color-mix(in oklab, var(--color-primary) 55%, transparent);
}
</style>
