<template>
  <section class="other-settings-card">
    <h2 class="other-settings-card__title">{{ title }}</h2>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<style scoped>
.other-settings-card { box-sizing: border-box; width: 100%; margin-bottom: var(--spacing-4); padding: var(--spacing-5); border-radius: var(--radius-lg); background: var(--color-bg-card); box-shadow: var(--shadow-dialog); color: var(--color-text-primary); }
.other-settings-card:last-child { margin-bottom: 0; }
.other-settings-card__title { display: flex; align-items: center; min-width: 0; margin: 0 0 var(--spacing-4); color: var(--color-text-primary); font-size: var(--font-size-lg); font-weight: 600; line-height: 24px; }
@media (max-width: 640px) { .other-settings-card { padding-inline: var(--spacing-3); } }
</style>
