<template>
  <footer class="app-footer">
    <p>© {{ year }} JobFit AI · Built by <strong>VantixFlow</strong></p>
    <p>
      <a :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">View the source on GitHub</a>
    </p>
  </footer>
</template>

<script setup lang="ts">
const year = new Date().getFullYear();
const SOURCE_URL = 'https://github.com/AybanFred/jobfit-ai';
</script>

<style scoped>
.app-footer {
  padding: 20px 16px 28px;
  text-align: center;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--ui-text-soft);
}
.app-footer p { margin: 0; }
.app-footer strong { font-weight: 700; color: var(--color-base-content); }
.app-footer a {
  display: inline-block;
  padding: 4px 0;
  color: inherit;
  text-decoration: none;
}
.app-footer a:hover,
.app-footer a:focus-visible { text-decoration: underline; }
</style>
