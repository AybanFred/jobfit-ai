import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';

/** On a computer the email app may open without the page losing focus: show the question after this long. */
export const SENT_IT_FALLBACK_MS = 4000;

export interface SentItBanner {
  /** Show the "Sent it?" banner now. */
  visible: Ref<boolean>;
  /** Call when "Open in email app" is tapped: the banner appears when the user comes back. Tapping again re-arms it. */
  arm: () => void;
  /** Hide it (Not yet, Mark as Applied, tab change, leaving the page). */
  hide: () => void;
}

/**
 * The "Sent it?" question after the user opened their email app.
 * It appears only after "Open in email app" was tapped AND the page is back in front (the tab becomes
 * visible again, the window gets focus back, or the phone app resumes), with a short fallback timer for
 * computers. It only appears while `canShow()` is true (status "saved") and hides as soon as that changes.
 * It never hides by itself otherwise, and it is not remembered (state lives in the component).
 */
export function useSentItBanner(canShow: () => boolean, fallbackMs = SENT_IT_FALLBACK_MS): SentItBanner {
  const visible = ref(false);
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resumeHandle: PluginListenerHandle | null = null;
  let listening = false;

  const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  function reveal() {
    if (!armed || pageHidden()) return; // still in the email app: wait until the page is visible again
    disarm();
    if (canShow()) visible.value = true;
  }

  const onVisibility = () => { if (!pageHidden()) reveal(); };

  function listen() {
    if (listening) return;
    listening = true;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', reveal);
    if (Capacitor.isNativePlatform()) {
      // The phone app coming back to the front. Optional: the web events above usually fire too.
      App.addListener('resume', reveal)
        .then((handle) => {
          if (listening) resumeHandle = handle;
          else void handle.remove();
        })
        .catch(() => { /* the App plugin is missing: the web events are enough */ });
    }
  }

  function unlisten() {
    if (!listening) return;
    listening = false;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', reveal);
    void resumeHandle?.remove();
    resumeHandle = null;
  }

  function disarm() {
    armed = false;
    clearTimeout(timer);
    timer = undefined;
    unlisten();
  }

  function arm() {
    disarm();
    visible.value = false;
    armed = true;
    listen();
    timer = setTimeout(reveal, fallbackMs);
  }

  function hide() {
    disarm();
    visible.value = false;
  }

  watch(canShow, (ok) => { if (!ok) hide(); });
  if (getCurrentScope()) onScopeDispose(hide);

  return { visible, arm, hide };
}
