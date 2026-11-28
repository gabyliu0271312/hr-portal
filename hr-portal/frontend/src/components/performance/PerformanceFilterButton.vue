<template>
  <UiButton
    :variant="active ? 'outline-primary' : 'secondary'"
    class="filter-button"
    :class="{ 'is-icon-only': variant === 'icon-only', 'is-active': active }"
    :style="activeStyle"
    :aria-label="displayLabel"
    :aria-pressed="active"
    :disabled="disabled"
    :title="disabled ? '筛选暂不可用' : undefined"
    @click="emit('click')"
  >
    <span class="filter-icon" aria-hidden="true"><FilterOutlinedIcon /></span>
    <span v-if="variant !== 'icon-only'">{{ displayLabel }}</span>
  </UiButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FilterOutlinedIcon from './FilterOutlinedIcon.vue'
import UiButton from '../ui/UiButton.vue'

const props = withDefaults(defineProps<{ label?: string; variant?: 'default' | 'icon-only'; disabled?: boolean; active?: boolean; count?: number }>(), { label: '筛选', variant: 'default', disabled: false, active: false, count: 0 })
const emit = defineEmits<{ click: [] }>()
const displayLabel = computed(() => props.count > 0 ? `${props.label} (${props.count})` : props.label)
const activeStyle = computed(() => props.active ? { backgroundColor: 'var(--performance-filter-active-background)' } : undefined)
</script>

<style scoped>
.filter-button { min-width: var(--performance-button-min-width); }
.filter-button.is-icon-only { width: var(--performance-button-min-width); min-width: var(--performance-button-min-width); padding-inline: 0; }
.filter-button.is-icon-only .filter-icon { margin-right: 0; }
.filter-button:hover { background: var(--performance-button-secondary-hover-background); }
.filter-button:active { background: var(--color-surface-disabled); }
.filter-icon { display: inline-flex; flex: 0 0 var(--performance-filter-icon-size); align-items: flex-start; width: var(--performance-filter-icon-size); height: var(--performance-filter-icon-size); margin-right: var(--spacing-1); transform: translateY(-1px); }
.filter-icon svg { display: block; width: 100%; height: 100%; }
</style>
