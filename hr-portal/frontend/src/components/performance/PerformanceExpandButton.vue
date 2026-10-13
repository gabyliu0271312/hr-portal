<template>
  <component
    :is="renderTag"
    class="performance-icon-button performance-expand-button"
    :class="{ 'is-active': expanded, 'is-navigation': variant === 'navigation' }"
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
  variant?: 'button' | 'navigation'
}>(), {
  disabled: false,
  iconVariant: 'bold',
  variant: 'button',
})

const emit = defineEmits<{ toggle: [] }>()
const renderTag = computed(() => props.variant === 'navigation' ? 'span' : 'button')
const iconName = computed(() => {
  if (props.variant === 'navigation') return 'DownOutlined'
  return props.iconVariant === 'regular' ? (props.expanded ? 'UpOutlined' : 'DownOutlined') : (props.expanded ? 'UpBoldOutlined' : 'DownBoldOutlined')
})
const collapsedPath = computed(() => props.iconVariant === 'regular'
  ? 'M2.293 7.707a1 1 0 0 1 1.414 0L12 16l8.293-8.293a1 1 0 1 1 1.414 1.414l-8.293 8.293a2 2 0 0 1-2.828 0L2.293 9.121a1 1 0 0 1 0-1.414Z'
  : 'm3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z')
const expandedPath = computed(() => props.iconVariant === 'regular'
  ? 'M2.293 16.293a1 1 0 0 1 1.414 0L12 8l8.293 8.293a1 1 0 1 1 1.414-1.414L13.414 6.586a2 2 0 0 0-2.828 0l-8.293 8.293a1 1 0 0 0 0 1.414Z'
  : 'm3.414 16.914-.707-.707a1 1 0 0 1 0-1.414l7.778-7.778a2 2 0 0 1 2.829 0l7.778 7.778a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.415 0l-7.07-7.07-7.072 7.07a1 1 0 0 1-1.414 0Z')
const iconPath = computed(() => props.variant === 'navigation' ? collapsedPath.value : (props.expanded ? expandedPath.value : collapsedPath.value))
const iconStyle = computed(() => props.variant === 'navigation' ? { transform: props.expanded ? 'rotate(180deg)' : 'none' } : undefined)

function handleClick() {
  if (!props.disabled) emit('toggle')
}
</script>

<style scoped>
.performance-expand-button { display:grid; place-items:center; width:var(--performance-button-icon-size); height:var(--performance-button-icon-size); padding:var(--spacing-1); border:0; border-radius:var(--performance-button-radius); background:transparent; color:var(--color-text-secondary); cursor:pointer; transition:color var(--duration-fast) var(--ease-standard),background-color var(--duration-fast) var(--ease-standard); }
.performance-expand-button:hover,.performance-expand-button:focus-visible,.performance-expand-button.is-active { background:var(--color-surface-disabled); color:var(--color-action-primary-hover); outline:0; box-shadow:var(--performance-button-focus-ring); }
.performance-expand-button:disabled { opacity:.5; cursor:default; }
.performance-expand-button.is-navigation { display:block; width:16px; height:16px; flex:0 0 16px; margin-left:auto; margin-top:3px; margin-right:20px; padding:0; border-radius:0; color:var(--color-text-placeholder); }
.performance-expand-button.is-navigation:hover,.performance-expand-button.is-navigation:focus-visible,.performance-expand-button.is-navigation.is-active { background:transparent; color:var(--color-text-placeholder); box-shadow:none; }
.performance-expand-button.is-navigation svg { display:block; width:16px; height:16px; transition:transform var(--duration-base) var(--ease-standard); }
</style>
