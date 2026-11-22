<template>
  <component
    :is="renderTag"
    class="performance-icon-button performance-expand-button"
    :class="{ 'is-active': expanded, 'is-navigation': variant === 'navigation', 'is-hover-only': hoverOnly, 'is-table': variant === 'table' }"
    :type="renderTag === 'button' ? 'button' : undefined"
    :aria-label="label"
    :aria-expanded="expanded"
    :aria-disabled="disabled || undefined"
    :tabindex="renderTag === 'span' ? (disabled ? -1 : 0) : undefined"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" :data-icon="iconName" :style="iconStyle"><path :d="iconPath" fill="currentColor" /></svg>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  expanded: boolean
  label: string
  disabled?: boolean
  iconVariant?: 'bold' | 'regular'
  variant?: 'button' | 'navigation' | 'table'
  hoverOnly?: boolean
}>(), {
  disabled: false,
  iconVariant: 'bold',
  variant: 'button',
  hoverOnly: false,
})

const emit = defineEmits<{ toggle: [] }>()
const renderTag = computed(() => props.variant === 'navigation' ? 'span' : 'button')
const iconName = computed(() => {
  if (props.variant === 'table') return 'ExpandDownFilled'
  if (props.variant === 'navigation') return 'DownOutlined'
  return props.iconVariant === 'regular' ? (props.expanded ? 'UpOutlined' : 'DownOutlined') : (props.expanded ? 'UpBoldOutlined' : 'DownBoldOutlined')
})
const collapsedPath = computed(() => props.iconVariant === 'regular'
  ? 'M2.293 7.707a1 1 0 0 1 1.414 0L12 16l8.293-8.293a1 1 0 1 1 1.414 1.414l-8.293 8.293a2 2 0 0 1-2.828 0L2.293 9.121a1 1 0 0 1 0-1.414Z'
  : 'm3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z')
const expandedPath = computed(() => props.iconVariant === 'regular'
  ? 'M2.293 16.293a1 1 0 0 1 1.414 0L12 8l8.293 8.293a1 1 0 1 1 1.414-1.414L13.414 6.586a2 2 0 0 0-2.828 0l-8.293 8.293a1 1 0 0 0 0 1.414Z'
  : 'm3.414 16.914-.707-.707a1 1 0 0 1 0-1.414l7.778-7.778a2 2 0 0 1 2.829 0l7.778 7.778a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.415 0l-7.07-7.07-7.072 7.07a1 1 0 0 1-1.414 0Z')
const iconPath = computed(() => props.variant === 'table' ? 'M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z' : props.variant === 'navigation' ? collapsedPath.value : (props.expanded ? expandedPath.value : collapsedPath.value))
const iconStyle = computed(() => props.variant === 'table' ? { transform: props.expanded ? 'none' : 'rotate(-90deg)' } : props.variant === 'navigation' ? { transform: props.expanded ? 'rotate(180deg)' : 'none' } : undefined)

function handleClick() {
  if (!props.disabled) emit('toggle')
}
</script>

<style scoped>
.performance-expand-button { display:grid; place-items:center; width:24px; height:24px; padding:4px; border:0; border-radius:6px; background:transparent; color:#646a73; cursor:pointer; transition:color .1s ease-in,background-color .1s ease-in,border-color .1s ease-in,width .2s ease-in; }
.performance-expand-button:hover,.performance-expand-button:focus-visible,.performance-expand-button.is-active { background:var(--color-surface-disabled); color:var(--color-action-primary-hover); outline:0; box-shadow:var(--performance-button-focus-ring); }
.performance-expand-button.is-hover-only { background:transparent; color:#646a73; box-shadow:none; }
.performance-expand-button.is-hover-only:hover,.performance-expand-button.is-hover-only:focus-visible { background:rgba(31,35,41,.2); color:#646a73; box-shadow:none; }
.performance-expand-button:disabled { opacity:.5; cursor:default; }
.performance-expand-button.is-navigation { display:block; width:16px; height:16px; flex:0 0 16px; margin-left:auto; margin-top:3px; margin-right:20px; padding:0; border-radius:0; color:var(--color-text-placeholder); }
.performance-expand-button.is-navigation:hover,.performance-expand-button.is-navigation:focus-visible,.performance-expand-button.is-navigation.is-active { background:transparent; color:var(--color-text-placeholder); box-shadow:none; }
.performance-expand-button.is-navigation svg { display:block; width:16px; height:16px; transition:transform var(--duration-base) var(--ease-standard); }
.performance-expand-button.is-table { width: var(--performance-calibration-expand-size); height: var(--performance-calibration-expand-size); padding: var(--performance-calibration-expand-padding); margin: var(--performance-calibration-expand-padding) var(--spacing-1) 0 0; border-radius: var(--radius-sm); background: transparent; color: var(--performance-icon-button-color); box-shadow: none; }
.performance-expand-button.is-table svg { width: var(--performance-calibration-expand-icon-size); height: var(--performance-calibration-expand-icon-size); }
.performance-expand-button.is-table:hover, .performance-expand-button.is-table:focus-visible { background: var(--performance-icon-button-hover-background); color: var(--performance-icon-button-color); }
</style>
