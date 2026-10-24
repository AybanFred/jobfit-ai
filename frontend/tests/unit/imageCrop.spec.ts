import { describe, it, expect } from 'vitest';
import {
  MAX_INPUT_BYTES, MAX_ZOOM, MIN_ZOOM, baseScale, clamp, clampOffset, clampZoom, cropRect, pointDistance,
  rescaleOffset, validateImageFile,
} from '@/services/imageCrop';

describe('validateImageFile', () => {
  it('accepts jpeg, png and webp', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateImageFile({ type, size: 1000 })).toBe('');
    }
  });
  it('rejects other types with a friendly message', () => {
    for (const type of ['image/gif', 'image/heic', 'application/pdf', '']) {
      expect(validateImageFile({ type, size: 1000 })).toMatch(/JPEG, PNG or WebP/);
    }
  });
  it('rejects empty files and files over 10 MB', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(validateImageFile({ type: 'image/png', size: MAX_INPUT_BYTES })).toBe('');
    expect(validateImageFile({ type: 'image/png', size: MAX_INPUT_BYTES + 1 })).toMatch(/10 MB/);
  });
});

describe('zoom and offset limits', () => {
  it('clamps numbers and zoom', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
  });

  it('covers the window: the shorter side fits exactly at zoom 1', () => {
    expect(baseScale(2000, 1000, 260)).toBeCloseTo(0.26);
    expect(baseScale(800, 800, 260)).toBeCloseTo(0.325);
    expect(baseScale(0, 0, 260)).toBe(1); // broken size never divides by zero
  });

  it('a landscape photo can move sideways only, and only as far as its edges', () => {
    // 2000 x 1000 at zoom 1 is 520 x 260 in the window: 130 px of room on each side
    expect(clampOffset(500, 500, 2000, 1000, 260, 1)).toEqual({ x: 130, y: 0 });
    expect(clampOffset(-500, -500, 2000, 1000, 260, 1)).toEqual({ x: -130, y: 0 });
    expect(clampOffset(40, 0, 2000, 1000, 260, 1)).toEqual({ x: 40, y: 0 });
  });

  it('a square photo cannot move at zoom 1, but can when zoomed in', () => {
    expect(clampOffset(50, 50, 1000, 1000, 260, 1)).toEqual({ x: 0, y: 0 });
    // zoom 2: image is 520 px wide in a 260 px window, so 130 px each way
    expect(clampOffset(500, -500, 1000, 1000, 260, 2)).toEqual({ x: 130, y: -130 });
  });

  it('zooming out pulls the photo back inside the limits', () => {
    const zoomedAndMoved = { x: 130, y: 130 };
    expect(rescaleOffset(zoomedAndMoved, 2, 1, 1000, 1000, 260)).toEqual({ x: 0, y: 0 });
  });

  it('zooming in keeps looking at the same spot', () => {
    const next = rescaleOffset({ x: 20, y: -10 }, 1, 2, 1000, 1000, 260);
    expect(next).toEqual({ x: 40, y: -20 });
  });
});

describe('cropRect (which part of the photo is used)', () => {
  it('centred square photo at zoom 1 uses the whole photo', () => {
    expect(cropRect(1000, 1000, 260, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 0, size: 1000 });
  });

  it('centred landscape photo at zoom 1 uses the middle square', () => {
    const r = cropRect(2000, 1000, 260, 1, { x: 0, y: 0 });
    expect(r.size).toBeCloseTo(1000);
    expect(r.sx).toBeCloseTo(500);
    expect(r.sy).toBeCloseTo(0);
  });

  it('zoom 2 uses half the width and height', () => {
    const r = cropRect(1000, 1000, 260, 2, { x: 0, y: 0 });
    expect(r.size).toBeCloseTo(500);
    expect(r.sx).toBeCloseTo(250);
    expect(r.sy).toBeCloseTo(250);
  });

  it('dragging the photo right shows the left part of it', () => {
    const r = cropRect(1000, 1000, 260, 2, { x: 130, y: 0 }); // as far right as allowed
    expect(r.sx).toBeCloseTo(0);
    const l = cropRect(1000, 1000, 260, 2, { x: -130, y: 0 });
    expect(l.sx).toBeCloseTo(500);
  });

  it('never goes outside the photo, even with silly offsets or zoom', () => {
    for (const zoom of [0, 1, 1.7, 4, 99]) {
      for (const off of [{ x: 9999, y: -9999 }, { x: -9999, y: 9999 }, { x: 0, y: 0 }]) {
        const r = cropRect(3000, 1200, 260, zoom, off);
        expect(r.sx).toBeGreaterThanOrEqual(0);
        expect(r.sy).toBeGreaterThanOrEqual(0);
        expect(r.sx + r.size).toBeLessThanOrEqual(3000 + 1e-6);
        expect(r.sy + r.size).toBeLessThanOrEqual(1200 + 1e-6);
      }
    }
  });

  it('copes with a broken photo size', () => {
    expect(cropRect(0, 0, 260, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 0, size: 0 });
  });
});

describe('pointDistance', () => {
  it('is the straight line between two touches', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
