<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom" class="floating-bar">
        <ion-tab-button v-for="t in tabs" :key="t.tab" :tab="t.tab" :href="t.href" @click="tapHaptic()">
          <ion-icon :icon="isActive(t.href) ? t.filled : t.outline" aria-hidden="true" />
          <ion-label>{{ t.label }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { IonPage, IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/vue';
import {
  home, homeOutline, person, personOutline, briefcase, briefcaseOutline, list, listOutline,
} from 'ionicons/icons';
import { tapHaptic } from '@/services/haptics';

const route = useRoute();

const tabs = [
  { tab: 'home', href: '/tabs/home', label: 'Home', outline: homeOutline, filled: home },
  { tab: 'profile', href: '/tabs/profile', label: 'Profile', outline: personOutline, filled: person },
  { tab: 'jobs', href: '/tabs/jobs', label: 'Jobs', outline: briefcaseOutline, filled: briefcase },
  { tab: 'tracker', href: '/tabs/tracker', label: 'Tracker', outline: listOutline, filled: list },
];

// The Profile tab stays highlighted on its sub-screens (/tabs/profile/skills, ...).
const isActive = (href: string) => route.path === href || route.path.startsWith(`${href}/`);
</script>

<style scoped>
/* A floating, rounded bar. It still is a normal ion-tab-bar, so tabs, links and keyboard keep working. */
ion-tab-bar.floating-bar {
  --background: var(--ui-card-bg);
  --border: 0;
  --color: var(--ui-text-soft);
  --color-selected: var(--ui-accent-ink);
  align-self: center;
  width: calc(100% - 28px);
  max-width: 480px;
  height: auto;
  margin: 0 0 calc(var(--ion-safe-area-bottom, 0px) + 10px);
  padding: 6px;
  border-radius: 26px;
  border: 1px solid var(--ui-line);
  box-shadow: var(--ui-shadow-lg);
  contain: none;
  overflow: visible;
}

ion-tab-button {
  position: relative;
  min-height: 52px; /* comfortable tap target */
  border-radius: 20px;
  --padding-top: 0;
  --padding-bottom: 0;
  --ripple-color: var(--color-primary);
  transition: color 0.2s ease;
}
ion-tab-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -3px;
}

/* the active "pill" behind the icon and label */
ion-tab-button::part(native) {
  border-radius: 20px;
  background: transparent;
  transition: background-color 0.25s var(--ui-ease);
}
ion-tab-button.tab-selected::part(native) {
  background: color-mix(in oklab, var(--color-primary) 14%, transparent);
}

ion-tab-button ion-icon {
  font-size: 22px;
  transition: transform 0.3s var(--ui-ease);
}
ion-tab-button.tab-selected ion-icon { transform: translateY(-1px) scale(1.12); }

ion-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}
ion-tab-button.tab-selected ion-label { font-weight: 750; }

/* small dot under the label of the active tab, grows in */
ion-tab-button::after {
  content: '';
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 50%;
  background: var(--ui-accent-ink);
  transform: scale(0);
  transition: transform 0.3s var(--ui-ease);
}
ion-tab-button.tab-selected::after { transform: scale(1); }

@media (prefers-reduced-motion: reduce) {
  ion-tab-button, ion-tab-button ion-icon, ion-tab-button::after, ion-tab-button::part(native) { transition: none; }
  ion-tab-button.tab-selected ion-icon { transform: none; }
}
</style>
