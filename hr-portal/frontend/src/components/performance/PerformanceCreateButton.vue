<script setup lang="ts">
import AddOutlinedIcon from './AddOutlinedIcon.vue'

withDefaults(defineProps<{
  variant?: 'icon' | 'text'
  label?: string
  disabled?: boolean
}>(), {
  variant: 'text',
  label: '新建',
  disabled: false,
})

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="performance-create-button"
    :class="`is-${variant}`"
    type="button"
    :aria-label="variant === 'icon' ? `新建${label}` : undefined"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <AddOutlinedIcon class="create-icon" />
    <span v-if="variant === 'text'">{{ label }}</span>
  </button>
</template>

<style scoped>
.performance-create-button { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; height: var(--performance-button-height); padding: 4px var(--performance-button-padding-x); border: 1px solid var(--performance-button-primary-background); border-radius: var(--performance-button-radius); background: var(--performance-button-primary-background); color: var(--performance-button-primary-text); font: inherit; font-size: var(--performance-button-font-size); line-height: var(--performance-button-line-height); cursor: pointer; transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard); }
.performance-create-button:hover { background: var(--performance-button-primary-hover-background); border-color: var(--performance-button-primary-hover-background); }
.performance-create-button:active { background: var(--performance-button-primary-active-background); border-color: var(--performance-button-primary-active-background); }
.performance-create-button:focus-visible { outline: 0; box-shadow: var(--performance-button-focus-ring); }
.performance-create-button:disabled { background: var(--performance-button-primary-disabled-background); border-color: var(--performance-button-primary-disabled-background); color: var(--color-text-disabled); cursor: not-allowed; }
.performance-create-button.is-icon { width: var(--performance-button-height); padding: 0; border-color: var(--performance-button-secondary-border); background: var(--performance-button-secondary-background); color: var(--color-text-primary); }
.performance-create-button.is-icon:hover { background: var(--performance-button-secondary-hover-background); border-color: var(--performance-field-border-hover); }
.create-icon { width: 14px; height: 14px; }
</style>
