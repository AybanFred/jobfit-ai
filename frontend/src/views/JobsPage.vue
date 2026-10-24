<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Jobs</ion-title></ion-toolbar>
    </ion-header>
    <ion-content>
      <ComingSoon
        :icon="briefcaseOutline"
        title="Paste a job description"
        description="Soon you will paste a job post here and get a tailored resume and cover letter."
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue';
import { briefcaseOutline } from 'ionicons/icons';
import ComingSoon from '@/components/ComingSoon.vue';
</script>
