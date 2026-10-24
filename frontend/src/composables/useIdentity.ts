import { computed, onMounted } from 'vue';
import { onIonViewWillEnter } from '@ionic/vue';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useAvatarStore } from '@/stores/avatar';

let listening = false;

/**
 * "Who is the user" for screens that show them: display name, first name and the profile photo link.
 * Also loads the photo (once) and keeps its signed link fresh.
 * Pass `isPage: true` from a page component so the photo link is also checked each time the tab opens
 * (Ionic page hooks do not run in child components).
 */
export function useIdentity(isPage = false) {
  const auth = useAuthStore();
  const profile = useProfileStore();
  const avatar = useAvatarStore();

  // Name from the profile; if it is missing, fall back to the sign-up name, then to nothing.
  const displayName = computed(
    () => (profile.profile?.full_name || (auth.user?.user_metadata?.full_name as string | undefined) || '').trim(),
  );
  const firstName = computed(() => displayName.value.split(/\s+/)[0] ?? '');
  const avatarUrl = computed(() => avatar.url);

  onMounted(() => {
    void avatar.ensureLoaded();
    // When the app comes back to the front, renew the photo link if it expired meanwhile.
    if (!listening && typeof document !== 'undefined') {
      listening = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void useAvatarStore().ensureFresh();
      });
    }
  });
  if (isPage) onIonViewWillEnter(() => void avatar.ensureFresh());

  return { displayName, firstName, avatarUrl, onAvatarError: () => void avatar.onImageError() };
}
