<template>
  <article class="item" :class="{ off: !checked }">
    <div class="top">
      <ion-checkbox
        class="check"
        :checked="checked"
        :disabled="disabled"
        :aria-label="`Import ${title || 'this item'}`"
        @ionChange="emit('update:checked', !!$event.detail.checked)"
      />
      <div class="text">
        <p class="title" :class="{ placeholder: !title }">{{ title || placeholder }}</p>
        <p v-if="subtitle" class="sub">{{ subtitle }}</p>
        <p v-for="f in flags" :key="f.text" class="flag" :class="f.kind">{{ f.text }}</p>
      </div>
      <ion-button
        fill="clear"
        size="small"
        class="edit pressable"
        :aria-expanded="open"
        :aria-label="`${open ? 'Hide details of' : 'Edit'} ${title || 'this item'}`"
        @click="open = !open"
      >
        {{ open ? 'Done' : 'Edit' }}
      </ion-button>
    </div>
    <div v-if="open" class="body">
      <slot />
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { IonCheckbox, IonButton } from '@ionic/vue';

export interface ItemFlag {
  text: string;
  /** info = neutral note, warn = needs the user's attention */
  kind: 'info' | 'warn';
}

const props = withDefaults(defineProps<{
  title: string;
  /** Shown when the title is empty, e.g. "Role not found". */
  placeholder?: string;
  subtitle?: string;
  checked: boolean;
  disabled?: boolean;
  flags?: ItemFlag[];
  /** Start with the fields open (used when something required is missing). */
  startOpen?: boolean;
  /** Opens the fields so the user can see the error that needs fixing. */
  hasError?: boolean;
}>(), { placeholder: 'Not found', subtitle: '', disabled: false, flags: () => [], startOpen: false, hasError: false });

const emit = defineEmits<{ (e: 'update:checked', value: boolean): void }>();
const open = ref(props.startOpen || props.hasError);
watch(() => props.hasError, (bad) => { if (bad) open.value = true; });
</script>

<style scoped>
.item {
  padding: 8px 8px 8px 12px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-soft);
  border: 1px solid var(--ui-line);
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.item.off { background: transparent; }
.item.off .title, .item.off .sub { color: var(--ion-color-step-500); }
.top { display: flex; align-items: flex-start; gap: 12px; }
.check {
  flex: none;
  margin-top: 10px;
  min-width: 24px;
  min-height: 24px;
  --size: 24px;
  /* a larger invisible tap area around the 24px box */
  padding: 10px;
  margin-left: -10px;
  box-sizing: content-box;
}
.text { flex: 1; min-width: 0; padding: 10px 0; }
p { margin: 0; }
.title { font-weight: 600; font-size: 0.95rem; overflow-wrap: anywhere; }
.title.placeholder { color: var(--ion-color-step-500); font-weight: 500; }
.sub { margin-top: 2px; font-size: 0.8rem; color: var(--ion-color-step-600); overflow-wrap: anywhere; }
.flag { margin-top: 4px; font-size: 0.8rem; font-weight: 500; }
.flag.info { color: var(--ion-color-step-600); }
.flag.warn { color: var(--ion-color-step-800); }
.flag.warn::before { content: '\25CF\00a0'; color: var(--ion-color-warning-shade, var(--ion-color-warning)); }
.edit { flex: none; margin: 0; min-height: 44px; min-width: 56px; }
.body { padding: 4px 4px 8px 0; }
</style>
