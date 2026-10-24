<template>
  <section class="rv-card" aria-labelledby="imp-skills-title">
    <div class="head">
      <h2 id="imp-skills-title">Skills</h2>
      <span class="count">{{ review.skills.names.length }} found</span>
    </div>

    <!-- Nothing in the resume -->
    <p v-if="review.skills.names.length === 0" class="empty">Not found - you can add skills yourself on the Skills screen.</p>

    <!-- Loading the skills bank -->
    <div v-else-if="status === 'loading' || status === 'idle'" aria-busy="true" aria-label="Checking your skills">
      <ion-skeleton-text v-for="n in 3" :key="n" :animated="!reduced" class="sk" />
    </div>

    <!-- Could not load -->
    <div v-else-if="status === 'error'" class="state">
      <p class="error" role="alert">We could not check your skills against our skill bank. Please try again.</p>
      <ion-button fill="outline" class="pressable act-btn" @click="emit('retry')">Try again</ion-button>
    </div>

    <template v-else>
      <!-- In the bank -->
      <template v-if="matches.matched.length">
        <p class="note">These will be added without a level. You can set your level for each one later.</p>
        <ul class="chips" aria-label="Skills to add">
          <li v-for="m in matches.matched" :key="m.skill.id" class="chip">
            <span>{{ m.skill.display_name }}</span>
            <button type="button" class="x" :aria-label="`Remove ${m.skill.display_name}`" @click="removeMatched(m.skill.id)">
              <ion-icon :icon="closeOutline" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </template>

      <!-- Already owned -->
      <p v-if="matches.owned.length" class="owned">
        Already in your profile: {{ matches.owned.map((m) => m.skill.display_name).join(', ') }}
      </p>

      <!-- Not in the bank -->
      <template v-if="matches.unmatched.length">
        <h3>Not in our skill bank yet</h3>
        <p class="note">Tick a skill to add it as a new skill. Nothing is added unless you tick it.</p>
        <ul class="unmatched">
          <li v-for="name in matches.unmatched" :key="name" class="row">
            <ion-checkbox
              :checked="isPicked(name)"
              :disabled="!canCreateSkill(name)"
              :aria-label="`Add ${name} as a new skill`"
              class="cb"
              @ionChange="setPicked(name, !!$event.detail.checked)"
            >
              {{ name }}
            </ion-checkbox>
            <span v-if="!canCreateSkill(name)" class="why">Name must be 2 to {{ LIMITS.skillName }} characters</span>
          </li>
        </ul>
      </template>

      <p v-if="!matches.matched.length && !matches.unmatched.length && matches.owned.length" class="empty">
        Every skill we found is already in your profile.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonButton, IonCheckbox, IonIcon, IonSkeletonText } from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';
import { prefersReducedMotion } from '@/services/motion';
import { LIMITS, findExactSkill, type SkillBankItem } from '@/services/profileLogic';
import { canCreateSkill, matchSkills, type ReviewState } from '@/services/importLogic';

const props = defineProps<{
  review: ReviewState;
  bank: SkillBankItem[];
  ownedIds: string[];
  status: 'idle' | 'loading' | 'ready' | 'error';
}>();
const emit = defineEmits<{ (e: 'retry'): void }>();
const reduced = prefersReducedMotion();

const matches = computed(() => matchSkills(props.review.skills.names, props.bank, props.ownedIds));

const key = (s: string) => s.trim().toLowerCase();
const isPicked = (name: string) => props.review.skills.customPicked.some((n) => key(n) === key(name));

function setPicked(name: string, on: boolean) {
  const rest = props.review.skills.customPicked.filter((n) => key(n) !== key(name));
  props.review.skills.customPicked = on ? [...rest, name] : rest;
}

/** Remove the chip, including other spellings of the same skill (for example "JS" and "JavaScript"). */
function removeMatched(skillId: string) {
  props.review.skills.names = props.review.skills.names.filter((n) => findExactSkill(props.bank, n)?.id !== skillId);
}
</script>

<style scoped>
.rv-card {
  padding: 16px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-card-bg);
  border: 1px solid var(--ui-line);
  box-shadow: var(--ui-shadow-sm);
}
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
h2 { margin: 0; font-size: 1rem; font-weight: 600; }
h3 { margin: 16px 0 0; font-size: 0.95rem; font-weight: 600; }
.count { font-size: 0.8rem; color: var(--ion-color-step-600); }
p { margin: 0; }
.note { margin: 6px 0 10px; font-size: 0.85rem; line-height: 1.4; color: var(--ion-color-step-600); }
.empty { margin-top: 8px; font-size: 0.9rem; color: var(--ion-color-step-600); }
.owned { margin-top: 12px; font-size: 0.85rem; line-height: 1.4; color: var(--ion-color-step-600); }
.error { color: var(--ui-error-ink); font-size: 0.9rem; }
.state { text-align: center; padding: 8px 0; }
.act-btn { margin: 12px 0 0; min-height: 44px; --border-radius: 12px; }
.sk { height: 16px; width: 70%; margin: 12px 0; border-radius: 6px; }

.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 44px;
  padding: 0 4px 0 14px;
  font-size: 0.9rem;
  border-radius: 999px;
  background: var(--ion-color-step-100);
  border: 1px solid var(--ion-color-step-150);
}
.x {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 0;
  color: var(--ion-color-step-700);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}
.x:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: -2px; }
.x ion-icon { font-size: 18px; }

.unmatched { list-style: none; margin: 0; padding: 0; }
.row { min-height: 44px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.cb { min-height: 44px; }
.why { font-size: 0.8rem; color: var(--ion-color-step-600); }
</style>
