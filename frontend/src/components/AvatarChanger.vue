<template>
  <div class="changer">
    <!-- Hidden file picker. On Android, "image/*" types let the phone offer its gallery or camera. -->
    <input
      ref="inputRef"
      class="file"
      type="file"
      :accept="IMAGE_ACCEPT"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />

    <button
      type="button"
      class="trigger pressable"
      aria-label="Change profile photo"
      aria-haspopup="dialog"
      :disabled="avatar.busy"
      @click="openMenu"
    >
      <UserAvatar :name="displayName" :src="avatarUrl" :size="size" @error="onAvatarError" />
      <span v-if="avatar.busy" class="busy" role="status"><ion-spinner name="crescent" aria-label="Updating photo" /></span>
      <span class="cam" aria-hidden="true"><ion-icon :icon="cameraOutline" /></span>
    </button>

    <!-- Second picker: on a phone, "capture" asks for the camera. In a browser it just opens the file picker. -->
    <input
      ref="cameraRef"
      class="file"
      type="file"
      accept="image/*"
      capture="user"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />

    <ion-modal
      class="photo-sheet"
      :is-open="menuOpen"
      :initial-breakpoint="sheetStop"
      :breakpoints="[0, sheetStop, 0.92]"
      @didDismiss="menuOpen = false"
    >
      <ion-content>
        <div class="sheet" role="dialog" aria-labelledby="photo-sheet-title">
          <header class="sheet-head">
            <UserAvatar :name="displayName" :src="avatarUrl" size="md" />
            <div>
              <h2 id="photo-sheet-title">Profile photo</h2>
              <p>Pick a clear, friendly photo of your face.</p>
            </div>
          </header>

          <ul class="opts">
            <li class="fade-in-up" style="--i: 1">
              <button type="button" class="sheet-row" @click="onChoose">
                <IconChip :icon="imagesOutline" tone="primary" size="lg" />
                <span class="txt"><span class="t">Choose from gallery</span><span class="s">Pick a photo from your phone</span></span>
                <ion-icon class="chev" :icon="chevronForwardOutline" aria-hidden="true" />
              </button>
            </li>
            <li class="fade-in-up" style="--i: 2">
              <button type="button" class="sheet-row" @click="onTake">
                <IconChip :icon="cameraOutline" tone="secondary" size="lg" />
                <span class="txt"><span class="t">Take a photo</span><span class="s">Use your camera</span></span>
                <ion-icon class="chev" :icon="chevronForwardOutline" aria-hidden="true" />
              </button>
            </li>
            <li v-if="avatar.hasPhoto" class="fade-in-up" style="--i: 3">
              <button type="button" class="sheet-row danger" @click="onRemove">
                <IconChip :icon="trashOutline" tone="error" size="lg" />
                <span class="txt"><span class="t">Remove photo</span><span class="s">Show your initials instead</span></span>
              </button>
            </li>
          </ul>

          <button type="button" class="sheet-cancel" @click="closeMenu">Cancel</button>
        </div>
      </ion-content>
    </ion-modal>

    <AvatarEditorModal
      :open="editorOpen"
      :file="pickedFile"
      @close="closeEditor"
      @choose-another="chooseFile"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonContent, IonIcon, IonModal, IonSpinner } from '@ionic/vue';
import { cameraOutline, chevronForwardOutline, imagesOutline, trashOutline } from 'ionicons/icons';
import IconChip from '@/components/IconChip.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import AvatarEditorModal from '@/components/AvatarEditorModal.vue';
import { useAvatarStore } from '@/stores/avatar';
import { useIdentity } from '@/composables/useIdentity';
import { IMAGE_ACCEPT, validateImageFile } from '@/services/imageCrop';
import { NOT_SET_UP_MESSAGE } from '@/services/avatarLogic';
import { confirmAction, showToast } from '@/services/feedback';
import { tapHaptic } from '@/services/haptics';

withDefaults(defineProps<{ size?: number }>(), { size: 104 });

const avatar = useAvatarStore();
const { displayName, avatarUrl, onAvatarError } = useIdentity();

const inputRef = ref<HTMLInputElement | null>(null);
const cameraRef = ref<HTMLInputElement | null>(null);
const menuOpen = ref(false);
// the sheet is a little taller when there is a third row (Remove photo)
const sheetStop = computed(() => (avatar.hasPhoto ? 0.6 : 0.5));
const editorOpen = ref(false);
const pickedFile = ref<File | null>(null);

async function openMenu() {
  tapHaptic();
  if (avatar.setup === 'missing') {
    await avatar.recheck(); // maybe the developer ran the database update since the app opened
    if (avatar.setup === 'missing') {
      showToast(NOT_SET_UP_MESSAGE, 'error');
      return;
    }
  }
  menuOpen.value = true;
}

function chooseFile() {
  inputRef.value?.click();
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = ''; // so choosing the same photo again still triggers a change
  if (!file) return;
  const problem = validateImageFile(file);
  if (problem) {
    showToast(problem, 'error');
    return;
  }
  pickedFile.value = file;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  pickedFile.value = null; // lets go of the photo
}

function closeMenu() {
  tapHaptic();
  menuOpen.value = false;
}

// These two must open the picker right inside the tap: browsers only allow it after a real user action.
function onChoose() {
  tapHaptic();
  chooseFile();
  menuOpen.value = false;
}

function onTake() {
  tapHaptic();
  cameraRef.value?.click();
  menuOpen.value = false;
}

async function onRemove() {
  tapHaptic();
  menuOpen.value = false;
  const ok = await confirmAction('Remove your photo?', 'Your initials will be shown instead.', 'Remove');
  if (!ok) return;
  const message = await avatar.remove();
  if (message) {
    showToast(message, 'error');
  } else {
    tapHaptic('medium');
    showToast('Profile photo removed.');
  }
}
</script>

<style scoped>
.changer { position: relative; display: inline-block; }
.file { display: none; }
.trigger {
  position: relative;
  display: block;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  /* ring that separates the avatar from the colored banner behind it */
  box-shadow: 0 0 0 4px var(--color-base-100), var(--ui-shadow-md);
}
.trigger:disabled { cursor: progress; }
.busy {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in oklab, var(--color-base-100) 70%, transparent);
  color: var(--color-primary);
}
.cam {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--ui-gradient-cta);
  color: var(--color-primary-content);
  box-shadow: 0 0 0 3px var(--color-base-100), var(--ui-shadow-sm);
  transition: transform 0.2s var(--ui-ease);
}
.cam ion-icon { font-size: 18px; }
@media (hover: hover) {
  .trigger:hover .cam { transform: scale(1.1); }
}

/* ---------- Bottom sheet ---------- */
.photo-sheet {
  --background: var(--ion-background-color);
  --border-radius: 28px;
  --box-shadow: var(--ui-shadow-lg);
}
.photo-sheet::part(handle) { background: color-mix(in oklab, var(--color-base-content) 30%, transparent); width: 44px; height: 5px; }
.sheet { max-width: 520px; margin: 0 auto; padding: 22px 16px calc(var(--ion-safe-area-bottom, 0px) + 18px); }
.sheet-head { display: flex; align-items: center; gap: 14px; padding: 0 4px 16px; }
.sheet-head h2 { margin: 0; font-size: 1.2rem; font-weight: 800; letter-spacing: -0.02em; }
.sheet-head p { margin: 2px 0 0; font-size: 0.85rem; color: var(--ui-text-soft); line-height: 1.35; }
.opts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.sheet-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 68px;
  padding: 10px 14px 10px 10px;
  font: inherit;
  text-align: left;
  color: var(--color-base-content);
  background: var(--ui-card-bg);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  cursor: pointer;
  transition: transform 0.2s var(--ui-ease), box-shadow 0.2s var(--ui-ease);
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) { .sheet-row:hover { transform: translateY(-1px); box-shadow: var(--ui-shadow-md); } }
.sheet-row:active { transform: scale(0.98); }
.sheet-row:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.t { font-weight: 700; font-size: 1rem; }
.s { font-size: 0.82rem; color: var(--ui-text-soft); }
.chev { flex: none; font-size: 18px; color: var(--ui-text-faint); }
.sheet-row.danger .t { color: var(--ui-error-ink); }
.sheet-row.danger { border-color: color-mix(in oklab, var(--color-error) 28%, transparent); }
.sheet-cancel {
  display: block;
  width: 100%;
  min-height: 52px;
  margin-top: 14px;
  font: inherit;
  font-weight: 650;
  color: var(--color-base-content);
  background: var(--ui-soft);
  border: 0;
  border-radius: var(--ui-radius-md);
  cursor: pointer;
}
.sheet-cancel:active { transform: scale(0.98); }
.sheet-cancel:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .sheet-row { transition: none; }
}
</style>
