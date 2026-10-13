<template>
  <button class="text-button" :class="{ 'icon-only': !label }" type="button" :aria-label="label || ariaLabel" :aria-expanded="ariaExpanded" :disabled="disabled" @click="emit('click')">
    <span v-if="$slots.icon" class="text-button-icon"><slot name="icon" /></span>
    <span v-if="label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  ariaLabel?: string
  ariaExpanded?: boolean
  disabled?: boolean
}>(), {
  label: '',
  ariaLabel: '',
  ariaExpanded: undefined,
  disabled: false,
})

const emit = defineEmits<{
  click: []
}>()
</script>

<style scoped>
.text-button { display: inline-flex; position: relative; justify-content: center; align-items: center; gap: var(--spacing-1); min-width: 0; min-height: 0; margin-top: -2px; padding: 2px var(--spacing-1); box-sizing: border-box; border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--performance-button-text-color); cursor: pointer; font-family: inherit; font-size: var(--performance-button-font-size); font-weight: var(--performance-button-font-weight); line-height: 18px; text-align: center; white-space: nowrap; transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
.text-button:disabled { cursor: not-allowed; opacity: .6; }
.text-button:hover { background: var(--performance-button-text-hover-background); }
.text-button:disabled:hover { background: transparent; }
.text-button:active { background: var(--performance-button-text-active-background); }
.text-button:disabled:active { background: transparent; }
.text-button:focus-visible { outline: 0; box-shadow: var(--performance-button-focus-ring); }
.text-button-icon { display: block; width: 14px; height: 14px; }
.text-button-icon :deep(svg) { width: 100%; height: 100%; }
</style>
