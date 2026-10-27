<template>
  <ion-page>
    <ion-content :fullscreen="true" class="login-content">
      <!-- Soft color blobs behind the card (CSS only, purely decorative) -->
      <div class="backdrop" aria-hidden="true"><i class="blob b1" /><i class="blob b2" /><i class="blob b3" /></div>

      <div class="theme-corner">
        <ThemePicker />
      </div>

      <main class="wrap">
        <div class="login-card fade-in-up">
          <header class="brand">
            <img class="logo" src="/logo-mark.svg" alt="" width="64" height="64" />
            <h1>VantixFit AI</h1>
            <p class="tagline">Paste a job post, get a tailored resume and cover letter.</p>
          </header>

          <ion-segment v-model="mode" class="segment" @ionChange="onModeChange">
            <ion-segment-button value="login"><ion-label>Log in</ion-label></ion-segment-button>
            <ion-segment-button value="signup"><ion-label>Sign up</ion-label></ion-segment-button>
          </ion-segment>

          <form novalidate @submit.prevent="submit">
            <ion-input
              v-if="mode === 'signup'"
              v-model="fullName"
              class="field"
              label="Full name (optional)"
              label-placement="floating"
              fill="outline"
              autocomplete="name"
              enterkeyhint="next"
            />

            <ion-input
              v-model="email"
              class="field"
              :class="{ 'ion-invalid': !!emailError, 'ion-touched': !!emailError }"
              type="email"
              inputmode="email"
              label="Email"
              label-placement="floating"
              fill="outline"
              autocomplete="email"
              enterkeyhint="next"
              :error-text="emailError"
              @ionBlur="touched.email = true"
            />

            <ion-input
              v-model="password"
              class="field"
              :class="{ 'ion-invalid': !!passwordError, 'ion-touched': !!passwordError }"
              type="password"
              label="Password"
              label-placement="floating"
              fill="outline"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              enterkeyhint="go"
              :error-text="passwordError"
              @ionBlur="touched.password = true"
            >
              <!-- Ionic's own toggle: keeps focus in the field and swaps the eye icon for us -->
              <ion-input-password-toggle slot="end" />
            </ion-input>

            <p v-if="error" class="message danger" role="alert">{{ error }}</p>
            <p v-if="info" class="message success" role="status">{{ info }}</p>

            <ion-button
              class="submit pressable ui-btn ui-btn-gradient"
              expand="block"
              type="submit"
              :disabled="loading"
              @click="tapHaptic('medium')"
            >
              <ion-spinner v-if="loading" name="crescent" aria-label="Please wait" />
              <span v-else>{{ mode === 'login' ? 'Log in' : 'Create account' }}</span>
            </ion-button>
          </form>

          <!-- Google login works in the browser only for now (the Android app comes later) -->
          <template v-if="!isNative">
            <div class="or" role="separator"><span>or</span></div>
            <ion-button
              class="google pressable"
              expand="block"
              fill="outline"
              :disabled="loading || googleLoading"
              @click="googleSignIn"
            >
              <ion-spinner v-if="googleLoading" name="crescent" aria-label="Opening Google" />
              <template v-else>
                <svg class="g-logo" slot="start" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.2 6.9-17.6z"/>
                  <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/>
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
                </svg>
                Continue with Google
              </template>
            </ion-button>
          </template>
          <AppFooter />
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonContent, IonSegment, IonSegmentButton, IonLabel, IonInput, IonInputPasswordToggle,
  IonButton, IonSpinner,
} from '@ionic/vue';
import ThemePicker from '@/components/ThemePicker.vue';
import AppFooter from '@/components/AppFooter.vue';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/stores/auth';
import { friendlyAuthError } from '@/services/errors';
import { tapHaptic } from '@/services/haptics';

const auth = useAuthStore();
const router = useRouter();

const mode = ref<'login' | 'signup'>('login');
const fullName = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const googleLoading = ref(false);
const isNative = Capacitor.isNativePlatform();
const error = ref('');
const info = ref('');
const touched = reactive({ email: false, password: false });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Messages appear after the user leaves a field (or presses the button), not while typing.
const emailError = computed(() => {
  if (!touched.email) return '';
  if (!email.value.trim()) return 'Please enter your email.';
  if (!EMAIL_PATTERN.test(email.value.trim())) return 'That does not look like an email address.';
  return '';
});

const passwordError = computed(() => {
  if (!touched.password) return '';
  if (!password.value) return 'Please enter your password.';
  if (mode.value === 'signup' && password.value.length < 6) return 'Use at least 6 characters.';
  return '';
});

function onModeChange() {
  error.value = '';
  info.value = '';
  touched.email = false;
  touched.password = false;
}

async function googleSignIn() {
  if (loading.value || googleLoading.value) return;
  error.value = '';
  info.value = '';
  googleLoading.value = true;
  tapHaptic('medium');
  try {
    await auth.signInWithGoogle(); // the page leaves for Google, so we only get here on an error
  } catch (e) {
    error.value = friendlyAuthError(e);
    googleLoading.value = false;
  }
}

async function submit() {
  if (loading.value || googleLoading.value) return; // ignore a second press while we are already working
  error.value = '';
  info.value = '';
  touched.email = true;
  touched.password = true;
  if (emailError.value || passwordError.value) return;

  loading.value = true;
  try {
    if (mode.value === 'signup') {
      await auth.signUp(email.value.trim(), password.value, fullName.value);
      mode.value = 'login';
      password.value = '';
      touched.email = false;
      touched.password = false;
      info.value = 'Account created. Check your email to confirm, then log in.';
    } else {
      await auth.signIn(email.value.trim(), password.value);
      router.replace('/tabs/home');
    }
  } catch (e) {
    error.value = friendlyAuthError(e);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-content { --background: var(--color-base-100); }

/* ---------- Backdrop ---------- */
.backdrop { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.blob {
  position: absolute;
  display: block;
  border-radius: 50%;
  filter: blur(56px);
  opacity: 0.55;
  animation: drift 14s ease-in-out infinite alternate;
}
.b1 { width: 300px; height: 300px; left: -90px; top: -80px; background: var(--color-primary); }
.b2 { width: 260px; height: 260px; right: -90px; top: 28%; background: var(--color-secondary); animation-delay: -5s; }
.b3 { width: 280px; height: 280px; left: 12%; bottom: -120px; background: var(--color-accent); animation-delay: -9s; opacity: 0.4; }
@keyframes drift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(22px, 30px, 0) scale(1.12); }
}

.theme-corner {
  position: absolute;
  top: calc(var(--ion-safe-area-top, 0px) + 4px);
  right: 4px;
  z-index: 2;
}
.wrap {
  position: relative;
  z-index: 1;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  box-sizing: border-box;
}

/* ---------- Card ---------- */
.login-card {
  width: 100%;
  max-width: 400px;
  padding: 28px 20px 24px;
  border-radius: var(--ui-radius-xl);
  background: color-mix(in oklab, var(--color-base-100) 84%, transparent);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  backdrop-filter: blur(18px) saturate(1.2);
  border: 1px solid color-mix(in oklab, var(--color-base-content) 12%, transparent);
  box-shadow: var(--ui-shadow-lg);
  box-sizing: border-box;
}
.brand { text-align: center; margin-bottom: 22px; }
.logo {
  display: block;
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  filter: drop-shadow(0 8px 14px color-mix(in oklab, var(--color-primary) 40%, transparent));
  animation: logo-in 0.7s var(--ui-ease) both 0.1s;
}
@keyframes logo-in {
  from { opacity: 0; transform: translateY(10px) scale(0.7) rotate(-8deg); }
  60% { transform: translateY(0) scale(1.06) rotate(2deg); }
  to { opacity: 1; transform: none; }
}
h1 { margin: 0; font-size: 1.7rem; font-weight: 800; letter-spacing: -0.03em; }
.tagline { margin: 6px 0 0; color: var(--ui-text-soft); font-size: 0.92rem; line-height: 1.45; }

.segment { margin-bottom: 20px; min-height: 44px; --background: var(--ui-soft); border-radius: 14px; }
.field { margin-bottom: 16px; --border-radius: 14px; }

.message { margin: 0 0 12px; font-size: 0.9rem; line-height: 1.4; }
.message.danger { color: var(--ui-error-ink); }
.message.success { color: color-mix(in oklab, var(--color-success) 42%, var(--color-base-content)); }

.submit { margin: 4px 0 0; }

.or { display: flex; align-items: center; gap: 12px; margin: 18px 0 14px; color: var(--ui-text-faint); font-size: 0.85rem; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--ui-line); }
.google { margin: 0; min-height: 48px; --border-radius: 14px; --color: var(--color-base-content); --border-color: var(--ui-line); text-transform: none; font-weight: 700; letter-spacing: 0; }
.g-logo { margin-right: 10px; }

@media (prefers-reduced-motion: reduce) {
  .blob, .logo { animation: none; }
}
</style>
