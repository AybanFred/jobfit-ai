<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/profile" text="" />
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons v-if="addLabel" slot="end">
          <ion-button
            class="add-btn"
            :aria-label="addLabel"
            :disabled="loading || !!error"
            @click="emit('add')"
          >
            <ion-icon slot="icon-only" :icon="addOutline" aria-hidden="true" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="ui-page">
        <!-- Friendly header: colored icon, one line about the section, and how many entries there are -->
        <header v-if="blurb" class="section-head fade-in-up">
          <IconChip :icon="emptyIcon" :tone="tone" size="lg" />
          <p class="blurb">{{ blurb }}</p>
          <span v-if="countText && !loading && !error" class="ui-pill" :class="`ui-tone-${tone}`">{{ countText }}</span>
        </header>

        <!-- Loading -->
        <div v-if="loading" class="skeletons" aria-busy="true" aria-label="Loading">
          <div v-for="n in 3" :key="n" class="ui-surface ui-card">
            <ion-skeleton-text :animated="!reduced" class="sk-line w60" />
            <ion-skeleton-text :animated="!reduced" class="sk-line w90" />
            <ion-skeleton-text :animated="!reduced" class="sk-line w40" />
          </div>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="ui-surface ui-card-center fade-in-up">
          <p class="ui-error-text" role="alert">{{ error }}</p>
          <ion-button fill="outline" class="pressable ui-btn retry" @click="emit('retry')">Try again</ion-button>
        </div>

        <!-- Empty -->
        <div v-else-if="empty" class="ui-surface ui-card-center fade-in-up">
          <EmptyState :variant="emptyVariant" :title="emptyTitle" :text="emptyText">
            <ion-button v-if="addLabel" class="pressable ui-btn ui-btn-gradient" @click="emit('add')">
              <ion-icon slot="start" :icon="addOutline" aria-hidden="true" />
              {{ addLabel }}
            </ion-button>
          </EmptyState>
        </div>

        <!-- Content -->
        <div v-else class="fade-in-up">
          <slot />
        </div>
      </div>
    </ion-content>

    <!-- Add/edit sheets live here so this component keeps a single root (needed by Ionic page transitions). -->
    <slot name="modals" />
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon,
  IonBackButton, IonSkeletonText, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import { addOutline } from 'ionicons/icons';
import IconChip, { type Tone } from '@/components/IconChip.vue';
import EmptyState, { type EmptyVariant } from '@/components/EmptyState.vue';
import { prefersReducedMotion } from '@/services/motion';

withDefaults(defineProps<{
  title: string;
  loading: boolean;
  error: string;
  empty: boolean;
  /** Icon of the header chip (and the fallback picture for older callers). */
  emptyIcon: string;
  emptyTitle: string;
  emptyText: string;
  /** Accessible name and text of the add button, e.g. "Add experience". Leave out for no add button. */
  addLabel?: string;
  /** Which small illustration the empty state shows. */
  emptyVariant?: EmptyVariant;
  /** One friendly line under the toolbar, e.g. "Your jobs and internships". Leave out for no header. */
  blurb?: string;
  /** Theme color of this section. */
  tone?: Tone;
  /** Small pill in the header, e.g. "3 jobs". */
  countText?: string;
}>(), { emptyVariant: 'generic', blurb: '', tone: 'primary', countText: '' });

const emit = defineEmits<{ (e: 'add'): void; (e: 'retry'): void; (e: 'refresh'): void }>();
const reduced = prefersReducedMotion();

async function onRefresh(event: CustomEvent) {
  emit('refresh');
  // Give the screen a moment to start loading, then close the pull-to-refresh spinner.
  setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 600);
}
</script>

<style scoped>
.add-btn { min-width: 44px; min-height: 44px; }

.section-head { display: flex; align-items: center; gap: 12px; padding: 2px 2px 0; }
.blurb { flex: 1; min-width: 0; margin: 0; font-size: 0.95rem; font-weight: 550; line-height: 1.35; color: var(--ui-text-soft); }

.skeletons { display: flex; flex-direction: column; gap: 12px; }
.sk-line { height: 14px; margin: 0 0 10px; border-radius: 6px; }
.sk-line:last-child { margin-bottom: 0; }
.w40 { width: 40%; }
.w60 { width: 60%; }
.w90 { width: 90%; }

.retry { margin: 14px 0 0; }
</style>
