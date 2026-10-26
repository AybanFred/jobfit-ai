<template>
  <div class="details">
    <p v-if="facts.length" class="facts">{{ facts.join(' - ') }}</p>
    <p v-if="job?.summary" class="summary">{{ job.summary }}</p>

    <section v-if="job?.required_skills.length" class="block" aria-label="Required skills">
      <h3 class="ui-h3">Required skills</h3>
      <ul class="pills">
        <li v-for="s in job.required_skills" :key="s" class="ui-pill ui-tone-primary">{{ s }}</li>
      </ul>
    </section>

    <section v-if="job?.nice_to_have_skills.length" class="block" aria-label="Nice to have skills">
      <h3 class="ui-h3">Nice to have</h3>
      <ul class="pills">
        <li v-for="s in job.nice_to_have_skills" :key="s" class="ui-pill ui-tone-secondary">{{ s }}</li>
      </ul>
    </section>

    <section v-if="job?.responsibilities.length" class="block" aria-label="Responsibilities">
      <h3 class="ui-h3">Responsibilities</h3>
      <ul class="bullets">
        <li v-for="r in job.responsibilities" :key="r">{{ r }}</li>
      </ul>
    </section>

    <p v-if="empty" class="none">We could not find more details in this job post.</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { jobFacts, type ParsedJob } from '@/services/jobsLogic';

// Read-only view of what the AI found in a job post (the "Job post" tab of a Tracker application).
const props = defineProps<{ job: ParsedJob | null }>();

const facts = computed(() => jobFacts(props.job));
const empty = computed(() => {
  const j = props.job;
  return !j || (!facts.value.length && !j.summary && !j.required_skills.length
    && !j.nice_to_have_skills.length && !j.responsibilities.length);
});
</script>

<style scoped>
.details { display: flex; flex-direction: column; gap: 14px; }
.facts { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--ui-text-soft); }
.summary { margin: 0; font-size: 0.93rem; line-height: 1.5; }
.block { display: flex; flex-direction: column; gap: 8px; }
.pills { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.bullets { margin: 0; padding-left: 18px; font-size: 0.9rem; line-height: 1.5; }
.bullets li + li { margin-top: 4px; }
.none { margin: 0; font-size: 0.9rem; color: var(--ui-text-soft); }
</style>
