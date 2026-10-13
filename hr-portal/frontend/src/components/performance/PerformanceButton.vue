<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'outline-primary' | 'text' | 'link' | 'danger' | 'continue'
  size?: 'default' | 'small'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  ariaLabel?: string
}>(), {
  variant: 'secondary',
  size: 'default',
  type: 'button',
  disabled: false,
  loading: false,
  ariaLabel: undefined,
})

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    class="performance-button"
    :class="[`performance-button--${variant}`, { 'is-small': size === 'small', 'is-loading': loading }]"
    :type="type"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="performance-button__spinner" aria-hidden="true" />
    <span class="performance-button__content"><slot /></span>
  </button>
</template>

<style scoped>
.performance-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--performance-button-min-width);
  height: var(--performance-button-height);
  padding: 4px var(--performance-button-padding-x);
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: var(--performance-button-radius);
  font: var(--performance-button-font-weight) var(--performance-button-font-size)/var(--performance-button-line-height) var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}
.performance-button__content { display: inline-flex; align-items: center; min-width: 0; }
.performance-button:focus-visible { outline: 0; box-shadow: var(--performance-button-focus-ring); }
.performance-button:disabled { cursor: not-allowed; opacity: .6; }
.performance-button--primary { border-color: var(--performance-button-primary-background); background: var(--performance-button-primary-background); color: var(--performance-button-primary-text); font-weight: 600; }
.performance-button--primary:hover:not(:disabled) { border-color: var(--performance-button-primary-hover-background); background: var(--performance-button-primary-hover-background); }
.performance-button--primary:active:not(:disabled) { border-color: var(--performance-button-primary-active-background); background: var(--performance-button-primary-active-background); }
.performance-button--primary:disabled { border-color: var(--performance-button-primary-disabled-background); background: var(--performance-button-primary-disabled-background); color: var(--color-text-disabled); }
.performance-button--secondary { border-color: var(--performance-button-secondary-border); background: var(--performance-button-secondary-background); color: var(--performance-button-secondary-text); }
.performance-button--outline-primary { border-color: var(--performance-button-outline-primary-border); background: var(--performance-button-outline-primary-background); color: var(--performance-button-outline-primary-text); }
.performance-button--outline-primary:hover:not(:disabled) { background: var(--performance-button-outline-primary-hover-background); }
.performance-button--secondary:hover:not(:disabled) { background: var(--performance-button-secondary-hover-background); }
.performance-button--continue { border-color: var(--performance-button-continue-border); background: var(--performance-button-continue-background); color: var(--performance-button-continue-text); }
.performance-button--continue:hover:not(:disabled) { border-color: var(--performance-button-continue-hover-border); background: var(--performance-button-continue-hover-background); }
.performance-button--text { min-width: 0; padding-inline: var(--spacing-1); border-color: transparent; background: transparent; color: var(--performance-button-text-color); }
.performance-button--text:hover:not(:disabled) { background: var(--performance-button-text-hover-background); }
.performance-button--text:active:not(:disabled) { background: var(--performance-button-text-active-background); }
.performance-button--link { min-width: 0; height: var(--performance-button-line-height); padding: 0; border: 0; background: transparent; color: var(--performance-button-text-color); }
.performance-button--link:disabled { color: var(--performance-button-link-disabled-color); opacity: 1; }
.performance-button--danger { border-color: var(--performance-button-danger-background); background: var(--performance-button-danger-background); color: var(--performance-button-danger-text); }
.performance-button--danger:hover:not(:disabled) { border-color: var(--performance-button-danger-hover-background); background: var(--performance-button-danger-hover-background); }
.performance-button__spinner { width: 12px; height: 12px; margin-right: var(--spacing-2); border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: performance-button-spin .7s linear infinite; }
@keyframes performance-button-spin { to { transform: rotate(360deg); } }
</style>
