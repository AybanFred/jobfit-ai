<template>
  <article class="doc-sheet" aria-label="Cover letter preview">
    <p v-if="empty" class="doc-empty">The cover letter came back empty. Please start a new job and try again.</p>

    <template v-else>
      <p v-if="letter.recipient || letter.company" class="cl-to">
        <span v-if="letter.recipient" class="cl-line">{{ letter.recipient }}</span>
        <span v-if="letter.company" class="cl-line">{{ letter.company }}</span>
      </p>
      <p v-if="letter.greeting" class="cl-greeting">{{ letter.greeting }}</p>
      <p v-for="(p, i) in letter.paragraphs" :key="i" class="cl-par">{{ p }}</p>
      <p v-if="letter.closing" class="cl-closing">{{ letter.closing }}</p>
      <p v-if="letter.signature" class="cl-signature">{{ letter.signature }}</p>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { letterIsEmpty, type CoverLetter } from '@/services/jobsLogic';

// In-app preview of the cover letter: recipient, greeting, paragraphs, closing and signature.
// Read-only: it shows exactly what the backend wrote.
const props = defineProps<{ letter: CoverLetter }>();

const empty = computed(() => letterIsEmpty(props.letter));
</script>

<style scoped>
.doc-sheet {
  padding: 22px 18px 24px;
  background: var(--ui-card-bg);
  color: var(--color-base-content);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  font-family: Georgia, 'Times New Roman', Times, serif;
  font-size: 0.9rem;
  line-height: 1.55;
  font-variant-numeric: lining-nums;
  overflow-wrap: anywhere;
}
.doc-empty { margin: 0; text-align: center; color: var(--ui-text-soft); }

.cl-to { margin: 0 0 16px; display: flex; flex-direction: column; }
.cl-greeting { margin: 0 0 12px; }
.cl-par { margin: 0 0 12px; }
.cl-closing { margin: 18px 0 0; }
.cl-signature { margin: 4px 0 0; font-weight: 700; }
</style>
