<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>JobFit AI</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="logout">Log out</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <h2>Hi{{ name ? `, ${name}` : '' }} 👋</h2>
      <p>Phase 1 connection check:</p>

      <ion-list lines="full">
        <ion-item>
          <ion-label>Supabase login</ion-label>
          <ion-badge slot="end" color="success">OK</ion-badge>
        </ion-item>
        <ion-item>
          <ion-label>Profile row in database</ion-label>
          <ion-badge slot="end" :color="profileOk ? 'success' : 'medium'">
            {{ profileOk ? 'OK' : 'Checking…' }}
          </ion-badge>
        </ion-item>
        <ion-item>
          <ion-label>FastAPI backend</ion-label>
          <ion-badge slot="end" :color="apiStatus === 'OK' ? 'success' : apiStatus === 'Failed' ? 'danger' : 'medium'">
            {{ apiStatus }}
          </ion-badge>
        </ion-item>
      </ion-list>

      <ion-text color="danger" v-if="apiError"><p class="small">{{ apiError }}</p></ion-text>

      <ion-button expand="block" fill="outline" @click="runChecks">Run checks again</ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonList, IonItem, IonLabel, IonBadge, IonText,
} from '@ionic/vue';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/services/supabase';
import { api } from '@/services/api';

const auth = useAuthStore();
const router = useRouter();

const name = ref('');
const profileOk = ref(false);
const apiStatus = ref('Checking…');
const apiError = ref('');

async function runChecks() {
  // 1) Read own profile directly from Supabase (tests Row Level Security)
  const { data } = await supabase.from('profiles').select('full_name').maybeSingle();
  profileOk.value = !!data;
  name.value = data?.full_name ?? '';

  // 2) Call the protected FastAPI route (tests token verification)
  apiStatus.value = 'Checking…';
  apiError.value = '';
  try {
    await api('/me');
    apiStatus.value = 'OK';
  } catch (e: any) {
    apiStatus.value = 'Failed';
    apiError.value = e.message;
  }
}

async function logout() {
  await auth.signOut();
  router.replace('/login');
}

onMounted(runChecks);
</script>

<style scoped>
.small { font-size: 0.85rem; }
</style>
