// Picking, checking, cropping and shrinking a profile photo, all inside the browser.
// The first half is pure maths (tested). The second half talks to canvas and is only used by the editor.
// Photo data is never logged or stored anywhere: it only goes to the one upload.

// ---------- Rules ----------

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Value for <input accept="...">. On Android this lets the phone offer its camera or gallery. */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',');
export const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB picked from the phone
export const MAX_OUTPUT_BYTES = 1_800_000; // the bucket allows 2 MB; stay safely below
export const OUTPUT_SIZE = 512;
export const OUTPUT_QUALITY = 0.85;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** Size of the round preview window in CSS pixels (the editor and the maths must agree). */
export const CROP_VIEW = 288;

/** '' when the file is fine, otherwise a short friendly sentence. */
export function validateImageFile(file: { type: string; size: number }): string {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Please choose a JPEG, PNG or WebP photo.';
  }
  if (file.size <= 0) return 'That file looks empty. Please choose another photo.';
  if (file.size > MAX_INPUT_BYTES) return 'That photo is larger than 10 MB. Please choose a smaller one.';
  return '';
}

// ---------- Crop maths ----------
// The preview is a square "window" (viewport) in pixels. The photo is scaled so it always covers the
// window (zoom 1), then zoomed up to MAX_ZOOM. (x, y) is how far the middle of the photo has been
// dragged from the middle of the window, in window pixels.

export interface Offset { x: number; y: number }
export interface CropRect { sx: number; sy: number; size: number }

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, MIN_ZOOM, MAX_ZOOM) : MIN_ZOOM;
}

/** Scale at which the shorter side of the photo exactly fills the window. */
export function baseScale(imgW: number, imgH: number, viewport: number): number {
  const shorter = Math.min(imgW, imgH);
  return shorter > 0 ? viewport / shorter : 1;
}

/** Keeps the dragged photo from leaving gaps at the window edges. */
export function clampOffset(x: number, y: number, imgW: number, imgH: number, viewport: number, zoom: number): Offset {
  const scale = baseScale(imgW, imgH, viewport) * clampZoom(zoom);
  const maxX = Math.max(0, (imgW * scale - viewport) / 2);
  const maxY = Math.max(0, (imgH * scale - viewport) / 2);
  return { x: clamp(x, -maxX, maxX) + 0, y: clamp(y, -maxY, maxY) + 0 }; // + 0 turns -0 into 0
}

/** After zooming, keep looking at the same spot: scale the drag with the zoom, then clamp. */
export function rescaleOffset(
  offset: Offset, oldZoom: number, newZoom: number, imgW: number, imgH: number, viewport: number,
): Offset {
  const ratio = clampZoom(newZoom) / clampZoom(oldZoom);
  return clampOffset(offset.x * ratio, offset.y * ratio, imgW, imgH, viewport, newZoom);
}

/** Which square of the original photo is visible in the window (in photo pixels). */
export function cropRect(imgW: number, imgH: number, viewport: number, zoom: number, offset: Offset): CropRect {
  if (imgW <= 0 || imgH <= 0 || viewport <= 0) return { sx: 0, sy: 0, size: Math.max(0, Math.min(imgW, imgH)) };
  const z = clampZoom(zoom);
  const scale = baseScale(imgW, imgH, viewport) * z;
  const size = viewport / scale;
  const o = clampOffset(offset.x, offset.y, imgW, imgH, viewport, z);
  const cx = imgW / 2 - o.x / scale;
  const cy = imgH / 2 - o.y / scale;
  return {
    sx: clamp(cx - size / 2, 0, Math.max(0, imgW - size)),
    sy: clamp(cy - size / 2, 0, Math.max(0, imgH - size)),
    size,
  };
}

/** Distance between two touch points (for pinch to zoom). */
export function pointDistance(a: Offset, b: Offset): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------- Browser part: decode, draw, export ----------

export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees the memory of the decoded photo. */
  close: () => void;
}

async function decodeWithImageElement(file: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode(); // browsers apply the photo's rotation (EXIF) when drawing an <img>
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decodes the picked photo. Phone photos are often stored sideways with a rotation flag: we honour it. */
export async function decodeImageFile(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // older browsers: fall back to an <img> element below
    }
  }
  return decodeWithImageElement(file);
}

/** Draws the visible square into a preview canvas of `px` x `px` pixels. */
export function drawCrop(ctx: CanvasRenderingContext2D, image: DecodedImage, rect: CropRect, px: number): void {
  ctx.clearRect(0, 0, px, px);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, rect.sx, rect.sy, rect.size, rect.size, 0, 0, px, px);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Makes the final 512 x 512 JPEG. Tries lower quality only if the file would be too big (rare). */
export async function renderCropToBlob(image: DecodedImage, rect: CropRect, outSize = OUTPUT_SIZE): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency: transparent PNG areas become white
  ctx.fillRect(0, 0, outSize, outSize);
  drawCrop(ctx, image, rect, outSize);
  for (const quality of [OUTPUT_QUALITY, 0.7, 0.55]) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= MAX_OUTPUT_BYTES) return blob;
  }
  throw new Error('Could not shrink the photo enough');
}
