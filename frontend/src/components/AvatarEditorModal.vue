<template>
  <ion-modal
    class="editor-modal"
    :is-open="open"
    :backdrop-dismiss="!saving"
    :can-dismiss="!saving"
    @didDismiss="emit('close')"
  >
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button class="icon-btn" aria-label="Cancel" :disabled="saving" @click="emit('close')">
            <ion-icon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
          </ion-button>
        </ion-buttons>
        <ion-title>Adjust your photo</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="stage">
        <div v-if="decoding" class="center" role="status" aria-live="polite">
          <ion-spinner name="crescent" aria-label="Loading your photo" />
        </div>
        <p v-else-if="decodeError" class="ui-error-text center" role="alert">{{ decodeError }}</p>

        <template v-else-if="image">
          <AvatarCropper :image="image" :zoom="zoom" :offset="offset" @change="onCropperChange" />
          <p class="hint">Drag to move, pinch or use the slider to zoom</p>

          <div class="zoom">
            <button type="button" class="zoom-btn" aria-label="Zoom out" :disabled="saving || zoom <= MIN_ZOOM" @click="setZoom(zoom - 0.25)">
              <ion-icon :icon="removeOutline" aria-hidden="true" />
            </button>
            <ion-range
              class="zoom-range"
              aria-label="Zoom"
              :min="MIN_ZOOM"
              :max="MAX_ZOOM"
              :step="0.01"
              :value="zoom"
              :disabled="saving"
              @ionInput="onRange"
            />
            <button type="button" class="zoom-btn" aria-label="Zoom in" :disabled="saving || zoom >= MAX_ZOOM" @click="setZoom(zoom + 0.25)">
              <ion-icon :icon="addOutline" aria-hidden="true" />
            </button>
          </div>

          <div class="text-acts">
            <ion-button fill="clear" size="small" class="text-act" :disabled="saving" @click="resetView">Reset</ion-button>
            <ion-button fill="clear" size="small" class="text-act" :disabled="saving" @click="emit('choose-another')">
              <ion-icon slot="start" :icon="imagesOutline" aria-hidden="true" />
              Choose a different photo
            </ion-button>
          </div>
        </template>

        <ion-button v-else fill="clear" class="text-act" :disabled="saving" @click="emit('choose-another')">
          <ion-icon slot="start" :icon="imagesOutline" aria-hidden="true" />
          Choose a different photo
        </ion-button>
      </div>
    </ion-content>

    <!-- Always visible, above the keyboard and the home bar -->
    <ion-footer class="ion-no-border">
      <div class="bar-foot">
        <p v-if="error" class="ui-error-text msg" role="alert">{{ error }}</p>
        <ion-button
          class="save pressable ui-btn ui-btn-gradient"
          expand="block"
          :disabled="!image || saving"
          @click="save"
        >
          <ion-spinner v-if="saving" name="crescent" aria-label="Saving" />
          <template v-else>
            <ion-icon slot="start" :icon="checkmarkCircleOutline" aria-hidden="true" />
            Save photo
          </template>
        </ion-button>
        <ion-button class="cancel pressable" expand="block" fill="clear" :disabled="saving" @click="emit('close')">
          Cancel
        </ion-button>
      </div>
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonModal, IonRange, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue';
import { addOutline, checkmarkCircleOutline, closeOutline, imagesOutline, removeOutline } from 'ionicons/icons';
import AvatarCropper from '@/components/AvatarCropper.vue';
import { useAvatarStore } from '@/stores/avatar';
import { showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';
import {
  CROP_VIEW, MAX_ZOOM, MIN_ZOOM, clampZoom, cropRect, decodeImageFile, renderCropToBlob, rescaleOffset,
  type DecodedImage, type Offset,
} from '@/services/imageCrop';

const props = defineProps<{ open: boolean; file: File | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'choose-another'): void }>();

const avatar = useAvatarStore();

// The decoded photo lives only in memory here and is released when the editor closes.
// shallowRef: the browser's ImageBitmap must not be wrapped in a Vue proxy.
const image = shallowRef<DecodedImage | null>(null);
const zoom = ref(1);
const offset = ref<Offset>({ x: 0, y: 0 });
const decoding = ref(false);
const decodeError = ref('');
const saving = ref(false);
const error = ref('');

function release() {
  image.value?.close();
  image.value = null;
}

watch(
  () => [props.open, props.file] as const,
  async ([isOpen, file]) => {
    release();
    zoom.value = 1;
    offset.value = { x: 0, y: 0 };
    decodeError.value = '';
    error.value = '';
    if (!isOpen || !file) return;

    decoding.value = true;
    try {
      const decoded = await decodeImageFile(file);
      if (props.file !== file || !props.open) { decoded.close(); return; } // user already moved on
      image.value = decoded;
    } catch {
      decodeError.value = 'We could not read that photo. Please try another one.';
    } finally {
      decoding.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(release);

function onCropperChange(nextZoom: number, nextOffset: Offset) {
  zoom.value = nextZoom;
  offset.value = nextOffset;
}

function onRange(event: CustomEvent<{ value: number | { lower: number; upper: number } }>) {
  const img = image.value;
  const raw = event.detail.value;
  const next = typeof raw === 'number' ? raw : raw.upper;
  if (!img) return;
  offset.value = rescaleOffset(offset.value, zoom.value, next, img.width, img.height, CROP_VIEW);
  zoom.value = next;
}

function setZoom(next: number) {
  const img = image.value;
  if (!img) return;
  const z = clampZoom(next);
  offset.value = rescaleOffset(offset.value, zoom.value, z, img.width, img.height, CROP_VIEW);
  zoom.value = z;
}

function resetView() {
  tapHaptic();
  zoom.value = 1;
  offset.value = { x: 0, y: 0 };
}

async function save() {
  const img = image.value;
  if (saving.value || !img) return;
  saving.value = true;
  error.value = '';
  try {
    let blob: Blob;
    try {
      blob = await renderCropToBlob(img, cropRect(img.width, img.height, CROP_VIEW, zoom.value, offset.value));
    } catch {
      error.value = 'We could not prepare that photo. Please try another one.';
      return;
    }
    const message = await avatar.upload(blob);
    if (message) {
      error.value = message;
      return;
    }
    tapHaptic('medium');
    showToast('Profile photo updated.');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.icon-btn { min-width: 44px; min-height: 44px; }
.stage { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 14px 16px 16px; max-width: 520px; margin: 0 auto; }
.center { display: grid; place-items: center; min-height: 288px; text-align: center; margin: 0; }
.hint { margin: 2px 0 0; font-size: 0.88rem; text-align: center; color: var(--ui-text-soft); }
.zoom { display: flex; align-items: center; gap: 8px; width: min(340px, 100%); }
.zoom-btn {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  color: var(--ui-accent-ink);
  background: var(--ui-soft);
  border: 1px solid var(--ui-line);
  border-radius: 50%;
  cursor: pointer;
}
.zoom-btn ion-icon { font-size: 22px; }
.zoom-btn:active:not(:disabled) { transform: scale(0.92); }
.zoom-btn:disabled { opacity: 0.4; cursor: default; }
.zoom-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.zoom-range {
  flex: 1;
  padding: 0 16px;
  --bar-height: 6px;
  --bar-border-radius: 6px;
  --bar-background: color-mix(in oklab, var(--color-base-content) 16%, var(--color-base-100));
  --bar-background-active: var(--ui-gradient-cta);
  --knob-size: 30px;
  --knob-background: var(--ui-gradient-cta);
  --knob-box-shadow: 0 0 0 4px var(--color-base-100), var(--ui-shadow-md);
  --pin-background: var(--color-primary);
}
.text-acts { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
.text-act { margin: 0; min-height: 44px; --color: var(--ui-accent-ink); font-weight: 650; text-transform: none; letter-spacing: 0; }

.bar-foot {
  max-width: 520px;
  margin: 0 auto;
  padding: 12px 16px calc(var(--ion-safe-area-bottom, 0px) + 10px);
  background: var(--ion-background-color);
  border-top: 1px solid var(--ui-line);
  box-shadow: 0 -12px 24px -16px color-mix(in oklab, var(--color-base-content) 30%, transparent);
}
.msg { margin: 0 0 10px; text-align: center; }
.save { margin: 0; min-height: 56px; --border-radius: 16px; font-size: 1.05rem; }
.save[disabled] { opacity: 0.45; --box-shadow: none; }
.save ion-icon { font-size: 22px; }
.cancel { margin: 4px 0 0; min-height: 44px; --color: var(--ui-text-soft); font-weight: 600; text-transform: none; letter-spacing: 0; }
</style>
