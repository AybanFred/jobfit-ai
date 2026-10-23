<template>
  <ion-button aria-label="Change theme" @click="open = true">
    <ion-icon slot="icon-only" :icon="colorPaletteOutline" />
  </ion-button>

  <ion-modal :is-open="open" :initial-breakpoint="0.6" :breakpoints="[0, 0.6, 1]" @didDismiss="open = false">
    <ion-header>
      <ion-toolbar>
        <ion-title>Choose a theme</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="open = false">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-radio-group :value="theme.theme" @ionChange="onChange">
        <ion-list lines="full">
          <ion-item v-for="name in THEMES" :key="name">
            <ion-radio :value="name" label-placement="end" justify="start">
              <span class="name">{{ name }}</span>
            </ion-radio>
          </ion-item>
        </ion-list>
      </ion-radio-group>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  IonButton, IonButtons, IonIcon, IonModal, IonHeader, IonToolbar, IonTitle, IonContent,
  IonRadioGroup, IonRadio, IonList, IonItem,
} from '@ionic/vue';
import { colorPaletteOutline } from 'ionicons/icons';
import { THEMES, useThemeStore, type ThemeName } from '@/stores/theme';

const theme = useThemeStore();
const open = ref(false);

function onChange(event: CustomEvent<{ value: ThemeName }>) {
  theme.set(event.detail.value);
}
</script>

<style scoped>
.name { text-transform: capitalize; }
</style>
