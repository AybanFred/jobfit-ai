<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Tracker</ion-title></ion-toolbar>
    </ion-header>
    <ion-content>
      <ComingSoon
        :icon="listOutline"
        title="Application tracker"
        description="Soon you will follow every application, from saved to offer, in one place."
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue';
import { listOutline } from 'ionicons/icons';
import ComingSoon from '@/components/ComingSoon.vue';
</script>
