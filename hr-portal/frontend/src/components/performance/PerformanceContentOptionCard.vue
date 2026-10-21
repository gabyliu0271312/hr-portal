<template>
  <component :is="tag" class="performance-content-option-card">
    <slot name="input" />
    <slot name="leading" />
    <span class="performance-content-option-card__content"><slot /></span>
    <slot name="actions" />
    <slot name="details" />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ tag?: string }>(), { tag: 'article' })
</script>

<style>
.performance-content-option-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  min-height: var(--performance-content-option-card-min-height);
  padding: 0 var(--performance-content-option-card-padding-inline);
  box-sizing: border-box;
  border: 1px solid var(--performance-content-option-card-border);
  border-radius: var(--performance-content-option-card-radius);
  background: var(--performance-content-option-card-background);
  gap: var(--performance-content-option-card-gap);
}

.performance-content-option-card__content {
  display: block;
  min-width: 0;
}

.performance-content-option-card__content > :first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performance-content-option-card__details {
  grid-column: 2 / -1;
}
</style>
