<template>
  <PerformanceButton
    variant="secondary"
    class="filter-button"
    :aria-label="label"
    @click="emit('click')"
  >
    <span class="filter-icon" aria-hidden="true"><FilterOutlinedIcon /></span>
    <span>{{ label }}</span>
  </PerformanceButton>
</template>

<script setup lang="ts">
import FilterOutlinedIcon from './FilterOutlinedIcon.vue'
import PerformanceButton from './PerformanceButton.vue'

withDefaults(defineProps<{ label?: string }>(), { label: '筛选' })
const emit = defineEmits<{ click: [] }>()
</script>

<style scoped>
.filter-button { min-width: var(--performance-button-min-width); }
.filter-button:hover { background: var(--performance-button-secondary-hover-background); }
.filter-button:active { background: var(--color-surface-disabled); }
.filter-icon { display: inline-flex; flex: 0 0 14px; align-items: flex-start; width: 14px; height: 14px; margin-right: var(--spacing-1); transform: translateY(-1px); }
.filter-icon svg { display: block; width: 100%; height: 100%; }
</style>
