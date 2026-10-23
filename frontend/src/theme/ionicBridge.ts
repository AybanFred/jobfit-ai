// Ionic also needs each color as "r, g, b" (for transparent tints and ripples), but daisyUI
// colors are oklch(). The canvas turns any CSS color into plain RGB numbers for us.
const PAIRS: Record<string, string> = {
  '--ion-color-primary-rgb': '--color-primary',
  '--ion-color-secondary-rgb': '--color-secondary',
  '--ion-color-tertiary-rgb': '--color-accent',
  '--ion-color-success-rgb': '--color-success',
  '--ion-color-warning-rgb': '--color-warning',
  '--ion-color-danger-rgb': '--color-error',
  '--ion-color-medium-rgb': '--color-neutral',
  '--ion-background-color-rgb': '--color-base-100',
  '--ion-text-color-rgb': '--color-base-content',
};

function toRgb(ctx: CanvasRenderingContext2D, color: string): string | null {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = color; // ignored by the browser if it is not a valid color
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 0 ? null : `${r}, ${g}, ${b}`;
}

/** Call after data-theme changes. Safe to call anywhere: it does nothing if canvas is missing. */
export function syncIonicRgb(): void {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const root = document.documentElement;
    const styles = getComputedStyle(root);
    for (const [ionVar, daisyVar] of Object.entries(PAIRS)) {
      const value = styles.getPropertyValue(daisyVar).trim();
      const rgb = value ? toRgb(ctx, value) : null;
      if (rgb) root.style.setProperty(ionVar, rgb);
    }
  } catch {
    // Not fatal: Ionic still uses the main colors, only soft tints may look slightly off.
  }
}
