/** True when the user asked their device to reduce animations. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

// ---------- Small pure helpers for the count-up number and the progress ring ----------

/** 0..1 in, 0..1 out. Starts fast, settles gently. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/** A number that has been counting from `from` to `to` for `elapsedMs` out of `durationMs`. */
export function countUpValue(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  return from + (to - from) * easeOutCubic(elapsedMs / durationMs);
}

export function clampPercent(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** SVG stroke-dashoffset that draws `percent` of a circle with the given circumference. */
export function ringDashOffset(percent: number, circumference: number): number {
  return circumference * (1 - clampPercent(percent) / 100);
}

/** True only on the moment the profile becomes complete (from below 100 to 100). */
export function justReachedFull(previous: number | null, next: number): boolean {
  return next >= 100 && previous !== null && previous < 100;
}
