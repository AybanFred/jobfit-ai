<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Profile</ion-title></ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="ui-page">
        <!-- Loading -->
        <template v-if="showSkeleton">
          <div class="ui-surface skel-hero" aria-busy="true" aria-label="Loading your profile">
            <ion-skeleton-text :animated="!reduced" class="sk-banner" />
            <div class="sk-body">
              <ion-skeleton-text :animated="!reduced" class="sk-avatar" />
              <ion-skeleton-text :animated="!reduced" class="sk-line w60" />
              <ion-skeleton-text :animated="!reduced" class="sk-line w40" />
            </div>
          </div>
          <div class="ui-surface ui-card">
            <div class="head">
              <ion-skeleton-text :animated="!reduced" class="sk-ring" />
              <div class="grow">
                <ion-skeleton-text :animated="!reduced" class="sk-line w60" />
                <ion-skeleton-text :animated="!reduced" class="sk-line w90" />
              </div>
            </div>
          </div>
          <div class="ui-surface ui-card">
            <ion-skeleton-text v-for="n in 5" :key="n" :animated="!reduced" class="sk-row" />
          </div>
        </template>

        <!-- Error -->
        <div v-else-if="store.profileError && !store.profile" class="ui-surface ui-card-center fade-in-up">
          <p class="ui-error-text" role="alert">{{ store.profileError }}</p>
          <ion-button fill="outline" class="pressable ui-btn retry" @click="store.loadOverview()">Try again</ion-button>
        </div>

        <template v-else>
          <!-- Hero: banner, big avatar, name, headline, location, quick stats -->
          <section class="profile-hero ui-surface fade-in-up" aria-label="Your details">
            <div class="banner" aria-hidden="true" />
            <div class="hero-body">
              <AvatarChanger :size="104" />
              <h1 class="name" :class="{ placeholder: !store.profile?.full_name }">
                {{ store.profile?.full_name || 'Add your name' }}
              </h1>
              <p v-if="store.profile?.headline" class="headline">{{ store.profile.headline }}</p>
              <p v-if="store.profile?.location" class="loc ui-muted">
                <ion-icon :icon="locationOutline" aria-hidden="true" />{{ store.profile.location }}
              </p>

              <ul v-if="store.counts" class="pills" aria-label="Profile summary">
                <li class="ui-pill ui-tone-secondary">
                  <ion-icon :icon="briefcaseOutline" aria-hidden="true" />{{ plural(store.counts.experiences, 'job', 'jobs') }}
                </li>
                <li class="ui-pill ui-tone-accent">
                  <ion-icon :icon="folderOpenOutline" aria-hidden="true" />{{ plural(store.counts.projects, 'project', 'projects') }}
                </li>
                <li class="ui-pill ui-tone-success">
                  <ion-icon :icon="buildOutline" aria-hidden="true" />{{ plural(store.counts.skills, 'skill', 'skills') }}
                </li>
              </ul>
            </div>
          </section>

          <!-- Completeness -->
          <section class="ui-surface ui-card fade-in-up" style="--i: 1" aria-labelledby="complete-title">
            <p v-if="store.countsError" class="ui-error-text" role="alert">{{ store.countsError }}</p>
            <div v-else class="head">
              <ProgressRing :percent="completeness.percent" :size="80" :stroke="8" label="Profile completeness" />
              <div class="grow">
                <h2 id="complete-title" class="ui-h2">Profile completeness</h2>
                <p class="ui-muted ui-small">{{ completeness.done }} of {{ completeness.total }} steps done</p>
                <p v-if="completeness.nextStep" class="next">Next: {{ completeness.nextStep }}</p>
                <p v-else class="next">Your profile is complete. Nice work.</p>
              </div>
            </div>
          </section>

          <!-- Import from resume: a bold call to action until the profile is complete -->
          <div class="fade-in-up" style="--i: 2">
            <ImportResumeCard :prominent="completeness.percent < 100" @press="router.push('/tabs/profile/import')" />
          </div>

          <!-- Sections -->
          <section class="ui-surface list-card fade-in-up" style="--i: 3" aria-label="Profile sections">
            <ul class="rows">
              <li v-for="r in rows" :key="r.path">
                <button type="button" class="row pressable" @click="open(r.path)">
                  <IconChip :icon="r.icon" :tone="r.tone" size="lg" />
                  <span class="text">
                    <span class="title">{{ r.title }}</span>
                    <span class="sub">{{ r.sub }}</span>
                  </span>
                  <span v-if="r.count" class="count" :class="`ui-tone-${r.tone}`" aria-hidden="true">{{ r.count }}</span>
                  <ion-icon
                    v-if="r.done"
                    class="tick"
                    :icon="checkmarkCircle"
                    aria-label="Done"
                  />
                  <ion-icon class="chev" :icon="chevronForwardOutline" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonSkeletonText,
  IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import {
  locationOutline, chevronForwardOutline, checkmarkCircle, createOutline,
  briefcaseOutline, folderOpenOutline, schoolOutline, buildOutline,
} from 'ionicons/icons';
import ProgressRing from '@/components/ProgressRing.vue';
import ImportResumeCard from '@/components/ImportResumeCard.vue';
import AvatarChanger from '@/components/AvatarChanger.vue';
import IconChip, { type Tone } from '@/components/IconChip.vue';
import { useProfileStore } from '@/stores/profile';
import { useIdentity } from '@/composables/useIdentity';
import { isPersonalInfoComplete } from '@/services/dashboard';
import { tapHaptic } from '@/services/haptics';
import { prefersReducedMotion } from '@/services/motion';

const store = useProfileStore();
const router = useRouter();
const reduced = prefersReducedMotion();
useIdentity(true); // loads the profile photo and keeps its link fresh

const completeness = computed(() => store.completeness);
// Skeleton only on the very first load; later refreshes keep the screen steady.
const showSkeleton = computed(() => !store.loaded);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function countText(n: number | undefined, one: string, many: string): string {
  if (n === undefined) return '';
  if (n === 0) return 'Nothing added yet';
  return `${n} ${n === 1 ? one : many}`;
}

interface Row { path: string; title: string; icon: string; tone: Tone; done: boolean; sub: string; count: number }

const rows = computed<Row[]>(() => {
  const c = store.counts;
  const personalDone = isPersonalInfoComplete(store.profile);
  return [
    {
      path: 'personal', title: 'Personal info', icon: createOutline, tone: 'primary', done: personalDone, count: 0,
      sub: personalDone ? 'All set' : 'Name, headline, summary and contact',
    },
    { path: 'experience', title: 'Experience', icon: briefcaseOutline, tone: 'secondary', done: (c?.experiences ?? 0) > 0,
      count: c?.experiences ?? 0, sub: countText(c?.experiences, 'job', 'jobs') },
    { path: 'projects', title: 'Projects', icon: folderOpenOutline, tone: 'accent', done: (c?.projects ?? 0) > 0,
      count: c?.projects ?? 0, sub: countText(c?.projects, 'project', 'projects') },
    { path: 'education', title: 'Education', icon: schoolOutline, tone: 'info', done: (c?.education ?? 0) > 0,
      count: c?.education ?? 0, sub: countText(c?.education, 'entry', 'entries') },
    { path: 'skills', title: 'Skills', icon: buildOutline, tone: 'success', done: (c?.skills ?? 0) > 0,
      count: c?.skills ?? 0, sub: countText(c?.skills, 'skill', 'skills') },
  ];
});

function open(path: string) {
  tapHaptic();
  router.push(`/tabs/profile/${path}`);
}

async function onRefresh(event: CustomEvent) {
  await store.loadOverview();
  (event.target as HTMLIonRefresherElement).complete();
}

onMounted(() => {
  // Home usually loaded this already; load here too when the app was opened on this tab.
  if (!store.loaded) store.loadOverview();
});
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 16px; }
.grow { flex: 1; min-width: 0; }
.grow .ui-small { margin: 2px 0 0; }
.next { margin: 6px 0 0; font-size: 0.9rem; font-weight: 550; }
.retry { margin: 12px 0 0; }

/* ---------- Hero ---------- */
.profile-hero { overflow: hidden; border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-md); }
.banner {
  height: 96px;
  background:
    radial-gradient(circle at 85% 20%, color-mix(in oklab, var(--color-primary-content) 22%, transparent) 0 46px, transparent 47px),
    radial-gradient(circle at 12% 95%, color-mix(in oklab, var(--color-primary-content) 16%, transparent) 0 40px, transparent 41px),
    var(--ui-gradient);
}
.hero-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0 16px 18px;
}
.hero-body :deep(.changer) { margin-top: -54px; } /* avatar overlaps the banner */
.name { margin: 12px 0 0; font-size: 1.4rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; overflow-wrap: anywhere; }
.name.placeholder { color: var(--ui-text-faint); }
.headline { margin: 4px 0 0; font-size: 0.95rem; font-weight: 550; overflow-wrap: anywhere; }
.loc { margin: 6px 0 0; display: flex; align-items: center; gap: 4px; font-size: 0.85rem; }
.loc ion-icon { font-size: 16px; }
.pills { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.pills .ui-pill ion-icon { font-size: 15px; }

/* ---------- Section rows ---------- */
.list-card { padding: 6px 8px; }
.rows { list-style: none; margin: 0; padding: 0; }
.rows li + li { border-top: 1px solid var(--ui-line); }
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 68px;
  padding: 8px 6px;
  font: inherit;
  text-align: left;
  color: var(--color-base-content);
  background: transparent;
  border: 0;
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
}
.row:hover { background: var(--ui-soft); }
.text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.title { font-weight: 700; font-size: 0.97rem; }
.sub { font-size: 0.8rem; color: var(--ui-text-soft); }
.count {
  flex: none;
  min-width: 26px;
  padding: 2px 8px;
  border-radius: 999px;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 750;
  background: var(--tone-tint-strong);
  color: var(--tone-ink);
}
.tick { font-size: 22px; color: var(--color-success); flex: none; }
.chev { font-size: 18px; color: var(--ui-text-faint); flex: none; transition: transform 0.2s var(--ui-ease); }
.row:hover .chev { transform: translateX(3px); }

/* ---------- Skeleton ---------- */
.skel-hero { overflow: hidden; border-radius: var(--ui-radius-lg); }
.sk-banner { height: 96px; margin: 0; border-radius: 0; }
.sk-body { display: flex; flex-direction: column; align-items: center; padding: 0 16px 18px; gap: 6px; }
.sk-avatar { width: 104px; height: 104px; border-radius: 50%; margin: -54px 0 8px; }
.sk-ring { width: 80px; height: 80px; border-radius: 50%; margin: 0; flex: none; }
.sk-line { height: 14px; margin: 0 0 10px; border-radius: 6px; }
.sk-body .sk-line { margin: 0; }
.sk-row { height: 44px; margin: 14px 0; border-radius: 12px; }
.w40 { width: 40%; }
.w60 { width: 60%; }
.w90 { width: 90%; }

@media (prefers-reduced-motion: reduce) {
  .chev { transition: none; }
}
</style>
