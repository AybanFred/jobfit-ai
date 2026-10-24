<template>
  <div
    ref="frame"
    class="frame"
    :class="{ dragging }"
    :style="{ width: `${VIEW}px`, height: `${VIEW}px` }"
    tabindex="0"
    role="group"
    aria-label="Photo position. Drag to move. Arrow keys move, plus and minus zoom."
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @wheel.prevent="onWheel"
    @keydown="onKey"
  >
    <canvas ref="canvas" class="canvas" :style="{ width: `${VIEW}px`, height: `${VIEW}px` }" aria-hidden="true" />
    <!-- dims everything outside the round avatar shape, and draws the glowing ring -->
    <span class="dimmer" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  CROP_VIEW, clampOffset, clampZoom, cropRect, drawCrop, pointDistance, rescaleOffset,
  type DecodedImage, type Offset,
} from '@/services/imageCrop';

// A round window onto the photo. The photo is drawn on a canvas with exactly the same maths that is
// used for the final upload, so what you see here is what you get. Parent owns zoom and offset.
const props = defineProps<{ image: DecodedImage; zoom: number; offset: Offset }>();
const emit = defineEmits<{ (e: 'change', zoom: number, offset: Offset): void }>();

const VIEW = CROP_VIEW; // preview size in CSS pixels
const frame = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const dragging = ref(false);

let raf = 0;
function draw() {
  const el = canvas.value;
  const ctx = el?.getContext('2d');
  if (!el || !ctx) return;
  const target = Math.round(VIEW * Math.min(window.devicePixelRatio || 1, 3));
  if (el.width !== target) { el.width = target; el.height = target; }
  const rect = cropRect(props.image.width, props.image.height, VIEW, props.zoom, props.offset);
  drawCrop(ctx, props.image, rect, target);
}
function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}
watch(() => [props.image, props.zoom, props.offset.x, props.offset.y], schedule);
onMounted(draw);
onBeforeUnmount(() => cancelAnimationFrame(raf));

function setZoom(next: number) {
  const z = clampZoom(next);
  const { width, height } = props.image;
  emit('change', z, rescaleOffset(props.offset, props.zoom, z, width, height, VIEW));
}
function setOffset(x: number, y: number) {
  const { width, height } = props.image;
  emit('change', props.zoom, clampOffset(x, y, width, height, VIEW, props.zoom));
}

// ----- pointer: one finger or mouse drags, two fingers pinch -----
const pointers = new Map<number, Offset>();
let dragFrom: Offset = { x: 0, y: 0 };
let offsetFrom: Offset = { x: 0, y: 0 };
let pinchFrom = { distance: 0, zoom: 1 };

function twoPoints(): [Offset, Offset] | null {
  const pts = [...pointers.values()];
  return pts.length >= 2 ? [pts[0] as Offset, pts[1] as Offset] : null;
}

function onDown(e: PointerEvent) {
  frame.value?.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragging.value = true;
  if (pointers.size === 1) {
    dragFrom = { x: e.clientX, y: e.clientY };
    offsetFrom = { ...props.offset };
  } else if (pointers.size === 2) {
    const pair = twoPoints();
    if (pair) pinchFrom = { distance: pointDistance(pair[0], pair[1]) || 1, zoom: props.zoom };
  }
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pair = twoPoints();
  if (pair) {
    setZoom(pinchFrom.zoom * (pointDistance(pair[0], pair[1]) / pinchFrom.distance));
  } else {
    setOffset(offsetFrom.x + (e.clientX - dragFrom.x), offsetFrom.y + (e.clientY - dragFrom.y));
  }
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  const rest = [...pointers.values()][0];
  if (rest) {
    // one finger stays: carry on dragging from where it is now
    dragFrom = { ...rest };
    offsetFrom = { ...props.offset };
  } else {
    dragging.value = false;
  }
}

function onWheel(e: WheelEvent) {
  setZoom(props.zoom - e.deltaY * 0.002);
}

// ----- keyboard -----
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 30 : 12;
  const { x, y } = props.offset;
  switch (e.key) {
    case 'ArrowLeft': setOffset(x + step, y); break;
    case 'ArrowRight': setOffset(x - step, y); break;
    case 'ArrowUp': setOffset(x, y + step); break;
    case 'ArrowDown': setOffset(x, y - step); break;
    case '+': case '=': setZoom(props.zoom + 0.1); break;
    case '-': case '_': setZoom(props.zoom - 0.1); break;
    default: return;
  }
  e.preventDefault();
}
</script>

<style scoped>
.frame {
  position: relative;
  margin: 0 auto;
  max-width: 100%;
  border-radius: 28px;
  overflow: hidden;
  background: var(--ui-soft);
  touch-action: none; /* we handle dragging ourselves */
  cursor: grab;
  box-shadow: 0 0 0 1px var(--ui-line), 0 24px 48px -20px color-mix(in oklab, var(--color-primary) 55%, transparent), var(--ui-shadow-md);
  user-select: none;
}
.frame.dragging { cursor: grabbing; }
.frame:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 6px; }
.canvas { display: block; }
.dimmer {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  box-shadow:
    0 0 0 3px var(--color-base-100),
    0 0 0 5px color-mix(in oklab, var(--color-primary) 80%, transparent),
    0 0 26px 4px color-mix(in oklab, var(--color-primary) 45%, transparent),
    0 0 0 400px color-mix(in oklab, var(--color-base-100) 62%, transparent);
}
</style>
