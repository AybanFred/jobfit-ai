import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * True while a CSS media query matches, e.g. useMediaQuery('(min-width: 768px)').
 * Updates when the window is resized or the phone is turned. False where matchMedia is missing (tests).
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  const matches = ref(mql?.matches ?? false);
  const onChange = (e: MediaQueryListEvent) => { matches.value = e.matches; };
  onMounted(() => {
    if (!mql) return;
    matches.value = mql.matches;
    mql.addEventListener('change', onChange);
  });
  onBeforeUnmount(() => mql?.removeEventListener('change', onChange));
  return matches;
}
