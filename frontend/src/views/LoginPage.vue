<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>JobFit AI</ion-title>
        <ion-buttons slot="end">
          <ThemePicker />
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <h2>{{ mode === 'login' ? 'Welcome back' : 'Create your account' }}</h2>
      <p class="muted">Paste a job post, get a tailored resume and cover letter.</p>

      <ion-segment v-model="mode">
        <ion-segment-button value="login"><ion-label>Log in</ion-label></ion-segment-button>
        <ion-segment-button value="signup"><ion-label>Sign up</ion-label></ion-segment-button>
      </ion-segment>

      <ion-list lines="full" class="form">
        <ion-item v-if="mode === 'signup'">
          <ion-input v-model="fullName" label="Full name" label-placement="stacked" />
        </ion-item>
        <ion-item>
          <ion-input v-model="email" type="email" label="Email" label-placement="stacked"
                     autocomplete="email" />
        </ion-item>
        <ion-item>
          <ion-input v-model="password" type="password" label="Password" label-placement="stacked"
                     autocomplete="current-password" />
        </ion-item>
      </ion-list>

      <ion-text color="danger" v-if="error"><p>{{ error }}</p></ion-text>
      <ion-text color="success" v-if="info"><p>{{ info }}</p></ion-text>

      <ion-button expand="block" :disabled="loading" @click="submit">
        <ion-spinner v-if="loading" name="crescent" />
        <span v-else>{{ mode === 'login' ? 'Log in' : 'Sign up' }}</span>
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonSegment, IonSegmentButton,
  IonLabel, IonList, IonItem, IonInput, IonButton, IonButtons, IonText, IonSpinner,
} from '@ionic/vue';
import ThemePicker from '@/components/ThemePicker.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const mode = ref<'login' | 'signup'>('login');
const fullName = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const info = ref('');

async function submit() {
  error.value = '';
  info.value = '';
  loading.value = true;
  try {
    if (mode.value === 'signup') {
      await auth.signUp(email.value, password.value, fullName.value);
      info.value = 'Account created. Check your email to confirm, then log in.';
      mode.value = 'login';
    } else {
      await auth.signIn(email.value, password.value);
      router.replace('/home');
    }
  } catch (e: any) {
    error.value = e.message ?? 'Something went wrong.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.muted { color: var(--ion-color-medium); margin-top: -8px; }
.form { margin: 16px 0; }
</style>
