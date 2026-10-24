<template>
  <div class="picker">
    <p :id="labelId" class="lbl">Level</p>
    <div class="buttons" role="radiogroup" :aria-labelledby="labelId">
      <button
        v-for="n in 5"
        :key="n"
        type="button"
        role="radio"
        class="lvl pressable"
        :class="{ on: modelValue === n }"
        :aria-checked="modelValue === n"
        :aria-label="`Level ${n}, ${LEVEL_LABELS[n]}`"
        @click="choose(n)"
      >
        {{ n }}
      </button>
    </div>
    <p class="caption" :class="{ danger: !!error }" :role="error ? 'alert' : undefined">
      {{ error || (modelValue ? `${modelValue} of 5: ${levelLabel(modelValue)}` : 'Choose how well you know it, from 1 to 5.') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { LEVEL_LABELS, levelLabel } from '@/services/profileLogic';
import { tapHaptic } from '@/services/haptics';

defineProps<{ modelValue: number | null; error?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

const labelId = `lvl-${Math.random().toString(36).slice(2, 8)}`;

function choose(n: number) {
  tapHaptic();
  emit('update:modelValue', n);
}
</script>

<style scoped>
.picker { margin-bottom: 16px; }
.lbl { margin: 0 0 8px; font-size: 0.85rem; color: var(--ion-color-step-600); }
.buttons { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.lvl {
  min-height: 48px;
  font: inherit;
  font-weight: 600;
  color: var(--ion-text-color);
  background: var(--ion-color-step-50);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 12px;
  cursor: pointer;
}
.lvl.on {
  background: var(--ui-gradient-cta);
  border-color: transparent;
  color: var(--color-primary-content);
  box-shadow: var(--ui-glow);
}
.caption { margin: 8px 0 0; font-size: 0.85rem; color: var(--ion-color-step-600); }
.caption.danger { color: var(--ui-error-ink); }
</style>
