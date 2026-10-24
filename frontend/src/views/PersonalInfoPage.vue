<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/profile" text="" />
        </ion-buttons>
        <ion-title>Personal info</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="ui-page">
        <header class="section-head fade-in-up">
          <IconChip :icon="createOutline" tone="primary" size="lg" />
          <p class="blurb">Your basics, shown at the top of every resume</p>
        </header>

        <!-- Loading -->
        <div v-if="loading" class="ui-surface ui-card" aria-busy="true" aria-label="Loading">
          <ion-skeleton-text v-for="n in 5" :key="n" :animated="!reduced" class="sk-field" />
        </div>

        <!-- Error -->
        <div v-else-if="store.profileError" class="ui-surface ui-card-center fade-in-up">
          <p class="ui-error-text" role="alert">{{ store.profileError }}</p>
          <ion-button fill="outline" class="pressable ui-btn retry" @click="load">Try again</ion-button>
        </div>

        <!-- Form -->
        <form v-else class="ui-surface ui-card fade-in-up" novalidate @submit.prevent="submit">
          <ion-input
            v-model="fullName"
            class="field"
            :class="invalid(errors.fullName)"
            label="Full name"
            label-placement="floating"
            fill="outline"
            autocomplete="name"
            :maxlength="LIMITS.fullName"
            enterkeyhint="next"
            :error-text="errors.fullName"
          />
          <ion-input
            v-model="headline"
            class="field"
            :class="invalid(errors.headline)"
            label="Headline (optional)"
            label-placement="floating"
            fill="outline"
            :maxlength="LIMITS.headline"
            enterkeyhint="next"
            helper-text="For example: Junior web developer"
            :error-text="errors.headline"
          />
          <ion-input
            v-model="phone"
            class="field"
            :class="invalid(errors.phone)"
            type="tel"
            inputmode="tel"
            label="Phone (optional)"
            label-placement="floating"
            fill="outline"
            autocomplete="tel"
            :maxlength="LIMITS.phone"
            enterkeyhint="next"
            :error-text="errors.phone"
          />
          <ion-input
            v-model="location"
            class="field"
            :class="invalid(errors.location)"
            label="Location (optional)"
            label-placement="floating"
            fill="outline"
            autocomplete="address-level2"
            :maxlength="LIMITS.location"
            enterkeyhint="next"
            helper-text="City and country"
            :error-text="errors.location"
          />

          <h2 class="group ui-h2">Links</h2>
          <ion-input
            v-model="github"
            class="field"
            :class="invalid(errors.github)"
            type="url"
            inputmode="url"
            label="GitHub (optional)"
            label-placement="floating"
            fill="outline"
            enterkeyhint="next"
            :error-text="errors.github"
          />
          <ion-input
            v-model="linkedin"
            class="field"
            :class="invalid(errors.linkedin)"
            type="url"
            inputmode="url"
            label="LinkedIn (optional)"
            label-placement="floating"
            fill="outline"
            enterkeyhint="next"
            :error-text="errors.linkedin"
          />
          <ion-input
            v-model="website"
            class="field"
            :class="invalid(errors.website)"
            type="url"
            inputmode="url"
            label="Website (optional)"
            label-placement="floating"
            fill="outline"
            enterkeyhint="next"
            :error-text="errors.website"
          />

          <h2 class="group ui-h2">Summary</h2>
          <ion-textarea
            v-model="summary"
            class="field"
            :class="invalid(errors.summary)"
            label="Short summary (optional)"
            label-placement="floating"
            fill="outline"
            :auto-grow="true"
            :rows="4"
            :maxlength="LIMITS.summary"
            :counter="true"
            helper-text="2 to 4 sentences about you. Only real facts."
            :error-text="errors.summary"
          />

          <p v-if="saveError" class="ui-error-text error" role="alert">{{ saveError }}</p>

          <ion-button class="save pressable ui-btn ui-btn-gradient" expand="block" type="submit" :disabled="saving">
            <ion-spinner v-if="saving" name="crescent" aria-label="Saving" />
            <span v-else>Save</span>
          </ion-button>
        </form>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonButton,
  IonInput, IonTextarea, IonSpinner, IonSkeletonText,
} from '@ionic/vue';
import { createOutline } from 'ionicons/icons';
import IconChip from '@/components/IconChip.vue';
import { useProfileStore } from '@/stores/profile';
import { friendlyDataError } from '@/services/errors';
import { showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import { prefersReducedMotion } from '@/services/motion';
import {
  LIMITS, requiredError, maxLengthError, phoneError, urlError, linksOf, buildLinks, toNull, trimText,
} from '@/services/profileLogic';

const store = useProfileStore();
const reduced = prefersReducedMotion();

const loading = ref(true);
const saving = ref(false);
const saveError = ref('');
const submitted = ref(false);

const fullName = ref('');
const headline = ref('');
const phone = ref('');
const location = ref('');
const github = ref('');
const linkedin = ref('');
const website = ref('');
const summary = ref('');

function fillFromStore() {
  const p = store.profile;
  fullName.value = p?.full_name ?? '';
  headline.value = p?.headline ?? '';
  phone.value = p?.phone ?? '';
  location.value = p?.location ?? '';
  const links = linksOf(p?.links);
  github.value = links.github;
  linkedin.value = links.linkedin;
  website.value = links.website;
  summary.value = p?.summary ?? '';
}

async function load() {
  loading.value = true;
  await store.loadOverview(); // always fetch fresh data before editing
  fillFromStore();
  loading.value = false;
}

const errors = computed(() => {
  if (!submitted.value) {
    return { fullName: '', headline: '', phone: '', location: '', github: '', linkedin: '', website: '', summary: '' };
  }
  return {
    fullName: requiredError('your full name', fullName.value, LIMITS.fullName),
    headline: maxLengthError('the headline', headline.value, LIMITS.headline),
    phone: phoneError(phone.value),
    location: maxLengthError('the location', location.value, LIMITS.location),
    github: urlError(github.value),
    linkedin: urlError(linkedin.value),
    website: urlError(website.value),
    summary: maxLengthError('the summary', summary.value, LIMITS.summary),
  };
});

const invalid = (msg: string) => (msg ? { 'ion-invalid': true, 'ion-touched': true } : {});

async function submit() {
  if (saving.value) return;
  submitted.value = true;
  saveError.value = '';
  if (Object.values(errors.value).some(Boolean)) return;

  saving.value = true;
  try {
    await store.savePersonal({
      full_name: trimText(fullName.value),
      headline: toNull(headline.value),
      phone: toNull(phone.value),
      location: toNull(location.value),
      summary: toNull(summary.value),
      links: buildLinks(store.profile?.links, {
        github: github.value, linkedin: linkedin.value, website: website.value,
      }),
    });
    tapHaptic('medium');
    showToast('Profile saved.');
  } catch (e) {
    saveError.value = friendlyDataError(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.section-head { display: flex; align-items: center; gap: 12px; padding: 2px 2px 0; }
.blurb { flex: 1; min-width: 0; margin: 0; font-size: 0.95rem; font-weight: 550; line-height: 1.35; color: var(--ui-text-soft); }
.field { margin-bottom: 16px; --border-radius: 14px; }
.group { margin: 8px 0 12px; }
.error { margin: 0 0 12px; }
.retry { margin: 12px 0 0; }
.save { margin: 8px 0 0; }
.sk-field { height: 48px; margin: 0 0 16px; border-radius: 14px; }
</style>
