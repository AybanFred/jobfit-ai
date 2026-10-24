import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { countUpValue, prefersReducedMotion } from '@/services/motion';

/**
 * A number that counts from 0 up to `target` when the screen appears, and glides to new targets later.
 * With "reduce motion" switched on it simply shows the target at once.
 * Returns the live (decimal) value: round it for text, use it as is for drawing.
 */
export function useCountUp(target: Ref<number>, durationMs = 900) {
  const value = ref(0);
  const reduced = prefersReducedMotion();
  let raf = 0;

  function run(to: number) {
    cancelAnimationFrame(raf);
    if (reduced) {
      value.value = to;
      return;
    }
    const from = value.value;
    const start = performance.now();
    const tick = (now: number) => {
      value.value = countUpValue(from, to, now - start, durationMs);
      if (now - start < durationMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  onMounted(() => run(target.value));
  watch(target, (to) => run(to));
  onBeforeUnmount(() => cancelAnimationFrame(raf));

  return value;
}
