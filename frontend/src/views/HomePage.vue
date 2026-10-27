<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>
          <span class="brand">
            <img class="brand-logo" src="/logo-mark.svg" alt="" width="28" height="28" />
            JobFit AI
          </span>
        </ion-title>
        <ion-buttons slot="end">
          <ThemePicker />
          <button type="button" class="me pressable" aria-label="Open your profile" @click="go('/tabs/profile', true)">
            <UserAvatar :name="displayName" :src="avatarUrl" size="xs" />
          </button>
          <ion-button aria-label="Log out" @click="logout">
            <ion-icon slot="icon-only" :icon="logOutOutline" aria-hidden="true" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="ui-page">
        <!-- Hero: greeting + profile completeness on a theme gradient -->
        <section class="hero-card fade-in-up" aria-labelledby="hero-title">
          <div class="hero-top">
            <button type="button" class="hero-avatar pressable" aria-label="Open your profile" @click="go('/tabs/profile', true)">
              <UserAvatar :name="displayName" :src="avatarUrl" size="lg" @error="onAvatarError" />
            </button>
            <div class="who">
              <h1 id="hero-title">{{ greeting }}<template v-if="firstName">, {{ firstName }}</template></h1>
              <p>Here is where your job hunt stands today.</p>
            </div>
          </div>

          <div class="frost" :class="{ done: !loading && !profileError && !countsError && !completeness.nextStep }">
            <template v-if="loading">
              <div class="progress-row">
                <ion-skeleton-text :animated="!reduced" class="sk-ring" />
                <div class="grow">
                  <ion-skeleton-text :animated="!reduced" class="sk-line w60" />
                  <ion-skeleton-text :animated="!reduced" class="sk-line w90" />
                </div>
              </div>
            </template>
            <template v-else-if="profileError || countsError">
              <h2 id="profile-title" class="ui-h2">Profile completeness</h2>
              <p class="ui-error-text" role="alert">{{ profileError || countsError }}</p>
            </template>
            <template v-else>
              <div class="progress-row">
                <ProgressRing :percent="completeness.percent" :size="92" :stroke="9" label="Profile completeness" />
                <div class="grow">
                  <h2 id="profile-title" class="ui-h2">Profile completeness</h2>
                  <p class="ui-muted ui-small">
                    {{ completeness.done }} of {{ completeness.total }} steps done
                  </p>
                  <p v-if="completeness.nextStep" class="next">Next: {{ completeness.nextStep }}</p>
                  <p v-else class="next">Your profile is complete. Nice work.</p>
                </div>
              </div>
              <ion-button
                v-if="completeness.nextStep"
                class="cta pressable ui-btn ui-btn-gradient"
                expand="block"
                @click="go('/tabs/profile', true)"
              >
                {{ completeness.done <= 1 ? 'Start your profile' : 'Continue your profile' }}
                <ion-icon slot="end" :icon="arrowForwardOutline" aria-hidden="true" />
              </ion-button>
            </template>
          </div>
        </section>

        <!-- Quick actions -->
        <section class="fade-in-up" style="--i: 1" aria-labelledby="quick-title">
          <h2 id="quick-title" class="ui-h2 section-title">Quick actions</h2>
          <div class="actions">
            <QuickActionCard
              :icon="documentTextOutline"
              tone="primary"
              title="Paste a job description"
              hint="Get a tailored resume"
              @press="go('/tabs/jobs')"
            />
            <QuickActionCard
              :icon="createOutline"
              tone="secondary"
              title="Edit profile"
              hint="Keep your details current"
              @press="go('/tabs/profile')"
            />
            <!-- Only while the profile is incomplete: a quick way to fill it from a resume. -->
            <div v-if="showImportAction" class="span-2">
              <QuickActionCard
                wide
                :icon="cloudUploadOutline"
                tone="accent"
                title="Import from resume"
                hint="Upload a PDF or DOCX and review what we find"
                @press="go('/tabs/profile/import')"
              />
            </div>
          </div>
        </section>

        <!-- Recent activity -->
        <section class="ui-surface ui-card fade-in-up" style="--i: 2" aria-labelledby="activity-title">
          <h2 id="activity-title" class="ui-h2">Recent activity</h2>

          <div v-if="loading" class="skeleton-list">
            <ion-skeleton-text v-for="n in 3" :key="n" :animated="!reduced" class="sk-line w90" />
          </div>
          <p v-else-if="activityError" class="ui-error-text" role="alert">{{ activityError }}</p>
          <EmptyState
            v-else-if="activity.length === 0"
            class="activity-empty"
            variant="activity"
            title="No activity yet"
            text="Things you do in the app, like adding a job, will show up here."
          />
          <ul v-else class="activity">
            <li v-for="item in activity" :key="item.id">
              <IconChip
                :icon="activityLook(item.action).icon"
                :tone="activityLook(item.action).tone"
                variant="soft"
                size="sm"
              />
              <span class="what">{{ describeAction(item.action) }}</span>
              <span class="when">{{ timeAgo(item.created_at) }}</span>
            </li>
          </ul>
        </section>

        <!-- System status -->
        <section class="ui-surface ui-card fade-in-up" style="--i: 3" aria-labelledby="status-title">
          <div class="status-head">
            <div>
              <h2 id="status-title" class="ui-h2">System status</h2>
              <p class="ui-muted ui-small">{{ statusSummary }}</p>
            </div>
            <ion-button
              fill="clear"
              size="small"
              class="retry pressable"
              :disabled="loading || apiStatus === 'checking'"
              aria-label="Retry system checks"
              @click="retry"
            >
              <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
              Retry
            </ion-button>
          </div>
          <ul class="status-list">
            <StatusRow label="Supabase login" :status="loginStatus" />
            <StatusRow label="Profile in database" :status="profileStatus" :detail="profileDetail" />
            <StatusRow label="FastAPI backend" :status="apiStatus" :detail="apiDetail" />
          </ul>
        </section>
      </div>
      <AppFooter />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  IonSkeletonText, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import {
  logOutOutline, documentTextOutline, createOutline, refreshOutline, cloudUploadOutline, arrowForwardOutline,
  personOutline, briefcaseOutline, folderOpenOutline, schoolOutline, buildOutline, documentAttachOutline,
  shieldCheckmarkOutline, flashOutline,
} from 'ionicons/icons';
import ThemePicker from '@/components/ThemePicker.vue';
import AppFooter from '@/components/AppFooter.vue';
import ProgressRing from '@/components/ProgressRing.vue';
import QuickActionCard from '@/components/QuickActionCard.vue';
import StatusRow, { type CheckStatus } from '@/components/StatusRow.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import IconChip, { type Tone } from '@/components/IconChip.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/api';
import { friendlyApiError } from '@/services/errors';
import { tapHaptic } from '@/services/haptics';
import { prefersReducedMotion } from '@/services/motion';
import { useProfileStore } from '@/stores/profile';
import { useAvatarStore } from '@/stores/avatar';
import { useResumeImportStore } from '@/stores/resumeImport';
import { useJobsStore } from '@/stores/jobs';
import { useTrackerStore } from '@/stores/tracker';
import { useIdentity } from '@/composables/useIdentity';
import {
  fetchRecentActivity, describeAction, timeAgo, activityKind, type ActivityItem, type ActivityKind,
} from '@/services/dashboard';

const auth = useAuthStore();
const profileStore = useProfileStore(); // shared with the Profile tab, so the ring always matches
const router = useRouter();
const reduced = prefersReducedMotion();
const { displayName, firstName, avatarUrl, onAvatarError } = useIdentity(true);

const loading = ref(true);
const activity = ref<ActivityItem[]>([]);

const profileError = computed(() => profileStore.profileError);
const countsError = computed(() => profileStore.countsError);
const activityError = ref('');

const profileStatus = ref<CheckStatus>('checking');
const profileDetail = ref('');
const apiStatus = ref<CheckStatus>('checking');
const apiDetail = ref('');

const loginStatus = computed<CheckStatus>(() => (auth.isLoggedIn ? 'ok' : 'failed'));

const statusSummary = computed(() => {
  const all = [loginStatus.value, profileStatus.value, apiStatus.value];
  if (all.includes('failed')) return 'Something needs attention.';
  if (all.includes('checking')) return 'Checking...';
  return 'Everything is working.';
});

const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
});

const completeness = computed(() => profileStore.completeness);
// Offer the resume import only once we know the profile is really incomplete (not while loading or on errors).
const showImportAction = computed(
  () => !loading.value && !profileError.value && !countsError.value && !!completeness.value.nextStep,
);

const LOOKS: Record<ActivityKind, { icon: string; tone: Tone }> = {
  profile: { icon: personOutline, tone: 'primary' },
  experience: { icon: briefcaseOutline, tone: 'secondary' },
  project: { icon: folderOpenOutline, tone: 'accent' },
  education: { icon: schoolOutline, tone: 'info' },
  skill: { icon: buildOutline, tone: 'success' },
  resume: { icon: documentAttachOutline, tone: 'warning' },
  job: { icon: documentTextOutline, tone: 'primary' },
  auth: { icon: shieldCheckmarkOutline, tone: 'info' },
  other: { icon: flashOutline, tone: 'secondary' },
};
const activityLook = (action: string) => LOOKS[activityKind(action)];

async function loadProfile() {
  profileStatus.value = 'checking';
  profileDetail.value = '';
  await profileStore.loadOverview();
  if (profileStore.profileError) {
    profileStatus.value = 'failed';
    profileDetail.value = 'We could not read your profile.';
  } else if (profileStore.profile) {
    profileStatus.value = 'ok';
  } else {
    profileStatus.value = 'failed';
    profileDetail.value = 'We could not find your profile yet.';
  }
}

async function loadActivity() {
  activityError.value = '';
  try {
    activity.value = await fetchRecentActivity();
  } catch {
    activityError.value = 'We could not load your recent activity.';
  }
}

async function checkApi() {
  apiStatus.value = 'checking';
  apiDetail.value = '';
  try {
    await api('/me');
    apiStatus.value = 'ok';
  } catch (e) {
    apiStatus.value = 'failed';
    apiDetail.value = friendlyApiError(e);
  }
}

async function loadAll() {
  loading.value = true;
  // The backend check runs on its own so a slow backend never blocks the rest of the page.
  const backend = checkApi();
  await Promise.all([loadProfile(), loadActivity()]);
  loading.value = false;
  await backend;
}

function retry() {
  tapHaptic();
  loadAll();
}

async function onRefresh(event: CustomEvent) {
  await loadAll();
  (event.target as HTMLIonRefresherElement).complete();
}

function go(path: string, haptic = false) {
  if (haptic) tapHaptic();
  router.push(path);
}

async function logout() {
  tapHaptic();
  await auth.signOut();
  profileStore.reset();
  useAvatarStore().reset(); // forget the profile photo and its link
  useResumeImportStore().reset(); // wipe any imported resume details from memory
  useJobsStore().reset(); // forget any job draft and saved resumes
  useTrackerStore().reset(); // forget applications, notes and documents
  router.replace('/login');
}

onMounted(loadAll);
</script>

<style scoped>
.brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; letter-spacing: -0.02em; }
.brand-logo { width: 28px; height: 28px; display: block; }
.me {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

/* ---------- Hero ---------- */
.hero-card {
  position: relative;
  overflow: hidden;
  padding: 18px 16px 16px;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-gradient);
  color: var(--color-primary-content);
  box-shadow: var(--ui-shadow-lg);
  isolation: isolate;
}
/* soft light blobs for depth, made from the same theme color */
.hero-card::before,
.hero-card::after {
  content: '';
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  background: color-mix(in oklab, var(--color-primary-content) 14%, transparent);
}
.hero-card::before { width: 180px; height: 180px; right: -50px; top: -70px; }
.hero-card::after { width: 120px; height: 120px; left: -40px; bottom: 40px; opacity: 0.6; }

.hero-top { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.hero-avatar {
  flex: none;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary-content) 55%, transparent);
}
.who { min-width: 0; }
.who h1 { margin: 0; font-size: 1.45rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; overflow-wrap: anywhere; }
.who p { margin: 4px 0 0; font-size: 0.9rem; }

/* the frosted panel keeps text on a plain surface, so contrast is the same in every theme */
.frost {
  padding: 14px;
  border-radius: var(--ui-radius-md);
  background: color-mix(in oklab, var(--color-base-100) 90%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  color: var(--color-base-content);
  box-shadow: var(--ui-shadow-md);
}
.progress-row { display: flex; align-items: center; gap: 16px; }
.grow { flex: 1; min-width: 0; }
.grow .ui-small { margin: 2px 0 0; }
.next { margin: 6px 0 0; font-size: 0.9rem; font-weight: 550; }
.cta { margin: 14px 0 0; }
.frost .ui-error-text { margin: 6px 0 0; }

/* ---------- Sections ---------- */
.section-title { margin-bottom: 10px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.span-2 { grid-column: 1 / -1; }

.activity { list-style: none; margin: 8px 0 0; padding: 0; }
.activity li {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  font-size: 0.95rem;
}
.activity li + li { border-top: 1px solid var(--ui-line); }
.what { flex: 1; min-width: 0; font-weight: 550; overflow-wrap: anywhere; }
.when { flex: none; font-size: 0.78rem; color: var(--ui-text-faint); }
.activity-empty { padding: 8px 0 4px; }

.status-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.status-head .ui-small { margin: 2px 0 0; }
.retry { margin: 0; min-height: 44px; }
.status-list { list-style: none; margin: 6px 0 0; padding: 0; }

.skeleton-list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.sk-ring { width: 92px; height: 92px; border-radius: 50%; margin: 0; flex: none; }
.sk-line { height: 14px; margin: 0 0 10px; border-radius: 6px; }
.w60 { width: 60%; }
.w90 { width: 90%; }
</style>
