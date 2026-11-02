<template>
  <PerformanceButton
    variant="secondary"
    class="filter-button"
    :class="{ 'is-icon-only': variant === 'icon-only' }"
    :aria-label="label"
    :disabled="disabled"
    :title="disabled ? '筛选暂不可用' : undefined"
    @click="emit('click')"
  >
    <span class="filter-icon" aria-hidden="true"><FilterOutlinedIcon /></span>
    <span v-if="variant !== 'icon-only'">{{ label }}</span>
  </PerformanceButton>
</template>

<script setup lang="ts">
import FilterOutlinedIcon from './FilterOutlinedIcon.vue'
import PerformanceButton from './PerformanceButton.vue'

withDefaults(defineProps<{ label?: string; variant?: 'default' | 'icon-only'; disabled?: boolean }>(), { label: '筛选', variant: 'default', disabled: false })
const emit = defineEmits<{ click: [] }>()
</script>

<style scoped>
.filter-button { min-width: var(--performance-button-min-width); }
.filter-button.is-icon-only { width: var(--performance-button-min-width); min-width: var(--performance-button-min-width); padding-inline: 0; }
.filter-button.is-icon-only .filter-icon { margin-right: 0; }
.filter-button:hover { background: var(--performance-button-secondary-hover-background); }
.filter-button:active { background: var(--color-surface-disabled); }
.filter-icon { display: inline-flex; flex: 0 0 14px; align-items: flex-start; width: 14px; height: 14px; margin-right: var(--spacing-1); transform: translateY(-1px); }
.filter-icon svg { display: block; width: 100%; height: 100%; }
</style>
