<template>
  <article class="doc-sheet" aria-label="Resume preview">
    <p v-if="empty" class="doc-empty">The resume came back empty. Please start a new job and try again.</p>

    <template v-else>
      <header class="hv-head">
        <h2 v-if="resume.header.name" class="hv-name">{{ resume.header.name }}</h2>
        <p v-if="contact.length" class="hv-contact">
          <template v-for="(part, i) in contact" :key="i">
            <span v-if="i > 0" class="hv-sep" aria-hidden="true">&bull;</span>
            <span class="hv-part">{{ part }}</span>
          </template>
        </p>
      </header>

      <section v-if="resume.summary" class="hv-sec" aria-labelledby="hv-summary">
        <h3 id="hv-summary" class="hv-h">Summary</h3>
        <p class="hv-text">{{ resume.summary }}</p>
      </section>

      <section v-if="resume.education.length" class="hv-sec" aria-labelledby="hv-education">
        <h3 id="hv-education" class="hv-h">Education</h3>
        <div v-for="(e, i) in resume.education" :key="`e${i}`" class="hv-entry">
          <div v-if="e.school || e.location" class="hv-row">
            <span class="hv-strong">{{ e.school }}</span>
            <span v-if="e.location" class="hv-right">{{ e.location }}</span>
          </div>
          <div v-if="e.degree || e.dates" class="hv-row">
            <span class="hv-em">{{ e.degree }}</span>
            <span v-if="e.dates" class="hv-right hv-date">{{ e.dates }}</span>
          </div>
          <ul v-if="e.details.length" class="hv-bullets">
            <li v-for="(d, j) in e.details" :key="j">{{ d }}</li>
          </ul>
        </div>
      </section>

      <section v-if="resume.experience.length" class="hv-sec" aria-labelledby="hv-experience">
        <h3 id="hv-experience" class="hv-h">Experience</h3>
        <div v-for="(x, i) in resume.experience" :key="`x${i}`" class="hv-entry">
          <div v-if="x.organization || x.location" class="hv-row">
            <span class="hv-strong">{{ x.organization }}</span>
            <span v-if="x.location" class="hv-right">{{ x.location }}</span>
          </div>
          <div v-if="x.title || x.dates" class="hv-row">
            <span class="hv-em">{{ x.title }}</span>
            <span v-if="x.dates" class="hv-right hv-date">{{ x.dates }}</span>
          </div>
          <ul v-if="x.bullets.length" class="hv-bullets">
            <li v-for="(b, j) in x.bullets" :key="j">{{ b }}</li>
          </ul>
        </div>
      </section>

      <section v-if="resume.projects.length" class="hv-sec" aria-labelledby="hv-projects">
        <h3 id="hv-projects" class="hv-h">Projects</h3>
        <div v-for="(p, i) in resume.projects" :key="`p${i}`" class="hv-entry">
          <div v-if="p.name || p.dates" class="hv-row">
            <span class="hv-strong">{{ p.name }}</span>
            <span v-if="p.dates" class="hv-right hv-date">{{ p.dates }}</span>
          </div>
          <div v-if="p.role" class="hv-row"><span class="hv-em">{{ p.role }}</span></div>
          <ul v-if="p.bullets.length" class="hv-bullets">
            <li v-for="(b, j) in p.bullets" :key="j">{{ b }}</li>
          </ul>
        </div>
      </section>

      <section v-if="resume.skills.length" class="hv-sec" aria-labelledby="hv-skills">
        <h3 id="hv-skills" class="hv-h">Skills</h3>
        <p v-for="(g, i) in resume.skills" :key="`s${i}`" class="hv-skill">
          <span v-if="g.category" class="hv-strong">{{ g.category }}: </span>{{ g.items.join(', ') }}
        </p>
      </section>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { contactParts, resumeIsEmpty, type TailoredResume } from '@/services/jobsLogic';

// In-app preview of the "Harvard" resume layout: centred name, one contact line, small-caps section
// headings with a thin rule, place on the left and location/dates on the right, bullet lists.
// Read-only: it shows exactly what the backend wrote, nothing is added here.
const props = defineProps<{ resume: TailoredResume }>();

const contact = computed(() => contactParts(props.resume.header));
const empty = computed(() => resumeIsEmpty(props.resume));
</script>

<style scoped>
/* A sheet of paper in the theme colors. Serif type, like the printed Harvard template. */
.doc-sheet {
  padding: 22px 18px 24px;
  background: var(--ui-card-bg);
  color: var(--color-base-content);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  font-family: Georgia, 'Times New Roman', Times, serif;
  font-size: 0.875rem;
  line-height: 1.45;
  font-variant-numeric: lining-nums; /* Georgia's default old-style numbers look uneven in dates */
  overflow-wrap: anywhere;
}
.doc-empty { margin: 0; text-align: center; color: var(--ui-text-soft); font-family: inherit; }

.hv-head { text-align: center; }
.hv-name { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: 0.01em; line-height: 1.2; }
.hv-contact {
  margin: 6px 0 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 6px;
  font-size: 0.8rem;
  color: var(--ui-text-soft);
}
.hv-sep { opacity: 0.7; }

.hv-sec { margin-top: 16px; }
.hv-h {
  margin: 0 0 8px;
  padding-bottom: 2px;
  font-size: 1rem;
  font-weight: 700;
  font-variant: small-caps;
  letter-spacing: 0.06em;
  border-bottom: 1px solid color-mix(in oklab, var(--color-base-content) 40%, transparent);
}
.hv-text { margin: 0; }

.hv-entry + .hv-entry { margin-top: 10px; }
/* left part wraps inside its own column, so location and dates stay on the right of the same line */
.hv-row { display: flex; align-items: baseline; gap: 0 12px; }
.hv-row > :first-child { flex: 1 1 auto; min-width: 0; }
.hv-right { flex: 0 0 auto; max-width: 50%; margin-left: auto; text-align: right; }
.hv-date { white-space: nowrap; }
.hv-strong { font-weight: 700; }
.hv-em { font-style: italic; }

.hv-bullets { margin: 4px 0 0; padding-left: 18px; }
.hv-bullets li + li { margin-top: 2px; }
.hv-skill { margin: 0; }
.hv-skill + .hv-skill { margin-top: 3px; }
</style>
