<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Tracker</ion-title></ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="ui-page tracker-page" :class="{ wide }">
        <!-- Loading -->
        <div v-if="loading" class="ui-surface skeletons" aria-busy="true" aria-label="Loading your applications">
          <div v-for="n in 4" :key="n" class="sk-row">
            <div class="sk-text">
              <ion-skeleton-text :animated="!reduced" class="sk-line w60" />
              <ion-skeleton-text :animated="!reduced" class="sk-line w40" />
            </div>
            <ion-skeleton-text :animated="!reduced" class="sk-pill" />
          </div>
        </div>

        <!-- Error -->
        <div v-else-if="store.listStatus === 'error'" class="ui-surface ui-card-center fade-in-up">
          <p class="ui-error-text" role="alert">{{ store.listError }}</p>
          <ion-button fill="outline" class="pressable ui-btn act-btn" @click="store.loadList()">Try again</ion-button>
        </div>

        <!-- Empty -->
        <div v-else-if="!store.items.length" class="ui-surface ui-card-center fade-in-up">
          <EmptyState
            variant="experience"
            title="No applications yet"
            text="Tailor a resume on the Jobs tab. Each job is saved here with its resume, cover letter and status."
          >
            <ion-button class="pressable ui-btn ui-btn-gradient" @click="goJobs">
              <ion-icon slot="start" :icon="sparklesOutline" aria-hidden="true" />
              Tailor your first job
            </ion-button>
          </EmptyState>
        </div>

        <template v-else>
          <!-- Status chips (also the filter) -->
          <div class="filters fade-in-up" role="group" aria-label="Filter by status">
            <button
              v-for="f in FILTERS"
              :key="f"
              type="button"
              class="fchip pressable"
              :class="[chipColor(f), { on: store.filter === f }]"
              :aria-pressed="store.filter === f"
              @click="onFilter(f)"
            >
              <span>{{ filterLabel(f) }}</span>
              <span class="fcount">{{ store.counts[f] }}</span>
            </button>
          </div>

          <!-- Search + sort -->
          <div class="tools fade-in-up" style="--i: 1">
            <ion-searchbar
              class="search"
              :placeholder="wide ? 'Search title or company' : 'Search jobs'"
              aria-label="Search by job title or company"
              :value="store.query"
              :debounce="150"
              :animated="false"
              @ionInput="store.setQuery(String($event.detail.value ?? ''))"
            />
            <ion-select
              class="sort"
              aria-label="Sort by"
              fill="outline"
              interface="popover"
              :interface-options="{ cssClass: 'ui-popover' }"
              :value="store.sort"
              :selected-text="wide ? undefined : sortShort"
              @ionChange="store.setSort($event.detail.value)"
            >
              <ion-icon slot="start" :icon="swapVerticalOutline" class="sort-icon" aria-hidden="true" />
              <ion-select-option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</ion-select-option>
            </ion-select>
          </div>

          <!-- Nothing matches the filter or search -->
          <div v-if="!store.visible.length" class="ui-surface ui-card-center">
            <EmptyState variant="generic" title="No matching applications" :text="filteredEmptyText">
              <ion-button fill="outline" class="pressable ui-btn" @click="store.clearFilters()">Show all applications</ion-button>
            </EmptyState>
          </div>

          <!-- Wide screens: a table -->
          <div v-else-if="wide" class="ui-surface table-wrap fade-in-up" style="--i: 2">
            <table class="apps">
              <caption class="visually-hidden">Your applications</caption>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="num">Match</th>
                  <th scope="col">Date</th>
                  <th scope="col">Documents</th>
                  <th scope="col" class="link-col"><span class="visually-hidden">Job post</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in store.visible" :key="a.id" class="app-row" @click="open(a.id)">
                  <td class="c-job">
                    <button type="button" class="job-btn" @click.stop="open(a.id)">{{ appTitle(a) }}</button>
                    <span class="sub">{{ appCompanyLine(a) }}</span>
                  </td>
                  <td>
                    <StatusBadge :status="a.status" interactive :busy="!!store.saving[a.id]" @click.stop="pickStatus(a)" />
                  </td>
                  <td class="num">
                    <span v-if="scoreText(a.match?.score)" class="score">{{ scoreText(a.match?.score) }}</span>
                    <span v-else class="dim" aria-label="No score">–</span>
                  </td>
                  <td class="c-date">
                    <span class="kind">{{ appDate(a).kind }}</span>
                    <span>{{ appDate(a).date || '–' }}</span>
                  </td>
                  <td class="c-docs">
                    <div class="docs">
                      <button
                        v-for="d in rowDocs(a)"
                        :key="d.id"
                        type="button"
                        class="doc-btn pressable"
                        :disabled="store.isDownloading(d.id)"
                        :aria-label="`Download the ${DOC_LABEL[d.type].toLowerCase()} for ${appTitle(a)}`"
                        @click.stop="pickDownload(a, d.id, d.type)"
                      >
                        <ion-spinner v-if="store.isDownloading(d.id)" name="crescent" class="doc-spin" aria-hidden="true" />
                        <ion-icon v-else :icon="downloadOutline" aria-hidden="true" />
                        {{ DOC_LABEL[d.type] }}
                      </button>
                      <span v-if="!rowDocs(a).length" class="dim">No files</span>
                    </div>
                  </td>
                  <td class="link-col">
                    <a
                      v-if="a.job.source_url"
                      class="post-link pressable"
                      :href="a.job.source_url"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="`Open the job post for ${appTitle(a)} (opens in a new tab)`"
                      :title="'Open job post'"
                      @click.stop
                    >
                      <ion-icon :icon="openOutline" aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Phones: compact rows -->
          <ul v-else class="ui-surface rows fade-in-up" style="--i: 2">
            <li v-for="a in store.visible" :key="a.id" class="mrow">
              <button type="button" class="mrow-main" @click="open(a.id)">
                <span class="m-title">{{ appTitle(a) }}</span>
                <span class="m-sub">{{ appCompanyLine(a) }}</span>
                <span class="m-meta">
                  {{ appDateLabel(a) }}<template v-if="scoreText(a.match?.score)"> · {{ scoreText(a.match?.score) }} match</template>
                </span>
              </button>
              <StatusBadge
                class="m-status"
                :status="a.status"
                interactive
                :busy="!!store.saving[a.id]"
                @click="pickStatus(a)"
              />
            </li>
          </ul>

          <p v-if="store.visible.length" class="ui-tip">
            {{ wide ? 'Tap a status to change it. Tap a row to see everything.' : 'Tap a status to change it. Tap a job for its documents.' }}
          </p>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonSpinner, IonSearchbar, IonSelect,
  IonSelectOption, IonSkeletonText, IonRefresher, IonRefresherContent, onIonViewWillEnter,
} from '@ionic/vue';
import { downloadOutline, openOutline, sparklesOutline, swapVerticalOutline } from 'ionicons/icons';
import EmptyState from '@/components/EmptyState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { useMediaQuery } from '@/composables/useMediaQuery';
import { useTrackerActions } from '@/composables/useTrackerActions';
import { tapHaptic } from '@/services/haptics';
import { prefersReducedMotion } from '@/services/motion';
import {
  DOC_LABEL, FILTERS, SORTS, appCompanyLine, appDate, appDateLabel, appTitle, docOf, filterLabel, scoreText,
  statusColor, type ApplicationSummary, type DocRef, type StatusFilter,
} from '@/services/trackerLogic';
import { useTrackerStore } from '@/stores/tracker';

const store = useTrackerStore();
const router = useRouter();
const reduced = prefersReducedMotion();
const wide = useMediaQuery('(min-width: 768px)');
const { pickStatus, pickDownload } = useTrackerActions();

const loading = computed(() => store.listStatus === 'idle' || store.listStatus === 'loading');

const filteredEmptyText = computed(() => {
  const q = store.query.trim();
  const where = store.filter === 'all' ? '' : ` with the status "${filterLabel(store.filter)}"`;
  return q ? `No job${where} matches "${q}".` : `You have no applications${where} yet.`;
});

// Phones show a short name in the sort box so the search box keeps its room (the menu shows full names).
const sortShort = computed(() => ({ newest: 'Newest', score: 'Score', company: 'A–Z' })[store.sort]);

const chipColor = (f: StatusFilter) => `ion-color-${f === 'all' ? 'primary' : statusColor(f)}`;

/** The resume and cover letter of a row (newest of each), in that order. */
function rowDocs(a: ApplicationSummary): DocRef[] {
  return [docOf(a.documents, 'resume'), docOf(a.documents, 'cover_letter')].filter((d): d is DocRef => d !== null);
}

function onFilter(f: StatusFilter) {
  void tapHaptic();
  store.setFilter(store.filter === f && f !== 'all' ? 'all' : f); // tapping the chosen chip again shows all
}

function open(id: string) {
  void tapHaptic();
  router.push(`/tabs/tracker/${encodeURIComponent(id)}`);
}

function goJobs() {
  void tapHaptic();
  router.push('/tabs/jobs');
}

async function onRefresh(event: CustomEvent) {
  await store.loadList();
  (event.target as HTMLIonRefresherElement).complete();
}

// Every time the tab is shown, refresh the list (the old rows stay on screen meanwhile).
onIonViewWillEnter(() => {
  void store.loadList();
});
</script>

<style scoped>
/* wider page for the table; phones keep the normal width */
.tracker-page.wide { --ui-maxw: 1120px; }
.act-btn { margin: 16px 0 0; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* loading */
.skeletons { padding: 4px 16px; }
.sk-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; }
.sk-row + .sk-row { border-top: 1px solid var(--ui-line); }
.sk-text { flex: 1; min-width: 0; }
.sk-line { height: 14px; margin: 5px 0; border-radius: 6px; }
.sk-pill { flex: none; width: 84px; height: 28px; margin: 0; border-radius: 999px; }
.w60 { width: 60%; }
.w40 { width: 40%; }

/* status chips */
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--ui-line);
  background: var(--ui-card-bg);
  color: var(--color-base-content);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.fcount {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  background: var(--ui-soft);
  color: var(--ui-text-soft);
}
.fchip.on {
  color: color-mix(in oklab, var(--ion-color-base) 30%, var(--color-base-content));
  background: color-mix(in oklab, var(--ion-color-base) 16%, var(--color-base-100));
  border-color: color-mix(in oklab, var(--ion-color-base) 55%, transparent);
}
.fchip.on .fcount { background: var(--ion-color-base); color: var(--ion-color-contrast); }
/* "Saved" (Ionic medium = the theme's neutral, can be almost black): a plain grey that shows in every theme */
.fchip.on.ion-color-medium {
  color: var(--color-base-content);
  background: var(--ui-soft);
  border-color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
}
@media (hover: hover) {
  .fchip:not(.on):hover { background: var(--ui-soft); }
}

/* search + sort */
.tools { display: flex; align-items: center; gap: 8px; }
.search {
  flex: 1;
  min-width: 0;
  padding: 0;
  --background: var(--ui-card-bg);
  --border-radius: 12px;
  --box-shadow: inset 0 0 0 1px var(--ui-line);
  --icon-color: var(--ui-text-soft);
  --placeholder-color: var(--ui-text-soft);
  --placeholder-opacity: 1;
  min-height: 44px;
}
.sort {
  flex: none;
  width: 124px;
  min-height: 44px;
  --border-radius: 12px;
  --border-color: var(--ui-line);
  --background: var(--ui-card-bg);
  --padding-start: 10px;
  --padding-end: 8px;
  font-size: 0.88rem;
  font-weight: 600;
}
.sort-icon { font-size: 18px; margin-right: 6px; color: var(--ui-text-soft); }
.wide .sort { width: 168px; }

/* phones: compact rows */
.rows { list-style: none; margin: 0; padding: 0; overflow: hidden; }
.mrow { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; padding-right: 12px; }
.mrow + .mrow { border-top: 1px solid var(--ui-line); }
.mrow-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 12px 0 12px 16px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.mrow-main:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: -2px; border-radius: 8px; }
.mrow:has(.mrow-main:active) { background: var(--ui-soft); }
.m-title { font-size: 0.98rem; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.m-sub { font-size: 0.85rem; color: var(--ui-text-soft); overflow-wrap: anywhere; }
.m-meta { margin-top: 2px; font-size: 0.78rem; color: var(--ui-text-faint); font-variant-numeric: tabular-nums; }
.m-status { margin-top: 12px; }

/* wide: table */
.table-wrap { padding: 0; }
.apps {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.9rem;
}
.apps th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 12px;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-soft);
  background: var(--ui-soft);
  border-bottom: 1px solid var(--ui-line);
  white-space: nowrap;
}
.apps th:first-child { border-top-left-radius: var(--ui-radius-md); }
.apps th:last-child { border-top-right-radius: var(--ui-radius-md); }
/* covers the hairline gaps the browser can leave between header cells */
.apps th:not(:last-child) { box-shadow: 1px 0 0 var(--ui-soft); }
.apps td { padding: 12px; vertical-align: middle; border-bottom: 1px solid var(--ui-line); }
.apps tbody tr:last-child td { border-bottom: 0; }
.app-row { cursor: pointer; }
@media (hover: hover) {
  .app-row:hover td { background: color-mix(in oklab, var(--color-base-content) 3%, var(--ui-card-bg)); }
}
.num { text-align: right; }
th.num { text-align: right; }
.c-job { min-width: 200px; }
.job-btn {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-base-content);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 650;
  line-height: 1.3;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.job-btn:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; border-radius: 4px; }
.sub { display: block; margin-top: 2px; font-size: 0.83rem; color: var(--ui-text-soft); overflow-wrap: anywhere; }
.score { font-weight: 700; font-variant-numeric: tabular-nums; }
.dim { color: var(--ui-text-faint); }
.c-date { white-space: nowrap; font-variant-numeric: tabular-nums; }
.kind { display: block; font-size: 0.75rem; color: var(--ui-text-soft); }
.c-docs { white-space: nowrap; }
.docs { display: flex; gap: 6px; }
.doc-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid var(--ui-line);
  background: var(--ui-card-bg);
  color: var(--ui-accent-ink);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
}
.doc-btn ion-icon { font-size: 15px; }
.doc-btn:disabled { opacity: 0.7; cursor: progress; }
@media (hover: hover) {
  .doc-btn:not(:disabled):hover { background: var(--ui-soft); }
}
.doc-spin { width: 14px; height: 14px; }
.link-col { width: 44px; padding-left: 0; padding-right: 8px; text-align: center; }
.post-link {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--ui-accent-ink);
  font-size: 18px;
}
@media (hover: hover) {
  .post-link:hover { background: var(--ui-soft); }
}
</style>
