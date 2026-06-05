<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  lede?: string
}>()
</script>

<template>
  <header class="page-head">
    <div class="page-head__main">
      <div class="hp-eyebrow">{{ eyebrow }}</div>
      <h1 class="page-head__title">{{ title }}</h1>
      <p v-if="lede" class="page-head__lede">{{ lede }}</p>
    </div>
    <div v-if="$slots.actions" class="page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-9);
  flex-wrap: wrap;
}
.page-head__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  flex: 1 1 auto;
}
.page-head__title {
  font-size: var(--fs-2xl);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  margin: 0;
}
.page-head__lede {
  max-width: 60ch;
  color: var(--ink-600);
  font-size: var(--fs-md);
  line-height: var(--lh-loose);
  margin: 0;
}
.page-head__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}
</style>