<template>
  <div class="coming-soon fade-in-up">
    <EmptyState variant="generic" :title="title" :text="description">
      <span class="ui-pill">
        <ion-icon :icon="icon" aria-hidden="true" />
        Coming soon
      </span>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import EmptyState from '@/components/EmptyState.vue';

defineProps<{
  icon: string; // an ionicons icon, e.g. personOutline
  title: string;
  description: string;
}>();
</script>

<style scoped>
.coming-soon {
  min-height: 60%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}
.ui-pill ion-icon { font-size: 16px; }
</style>
