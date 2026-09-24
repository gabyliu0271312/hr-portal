<template>
  <div class="performance-form-item" :class="{ 'performance-form-item--invalid': invalid }">
    <div class="performance-form-item__label"><PerformanceRequiredLabel :label="label" :required="required" /></div>
    <div v-if="$slots.description" class="performance-form-item__description"><slot name="description" /></div>
    <div class="performance-form-item__control" :aria-describedby="describedBy">
      <slot />
    </div>
    <span v-if="hint && !invalid" class="performance-form-item__hint">{{ hint }}</span>
    <span v-if="invalid" :id="errorId" class="performance-form-item__error" role="alert">{{ errorMessage }}</span>
  </div>
</template>

<script setup lang="ts">
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'

withDefaults(defineProps<{
  label: string
  required?: boolean
  invalid?: boolean
  errorMessage?: string
  hint?: string
  errorId?: string
  describedBy?: string
}>(), {
  required: false,
  invalid: false,
  errorMessage: '此项为必填',
  hint: '',
  errorId: undefined,
  describedBy: undefined,
})
</script>

<style scoped>
.performance-form-item { min-width: 0; margin-bottom: var(--performance-input-field-gap); }
.performance-form-item__label { display: flex; align-items: baseline; min-height: 22px; margin-bottom: var(--performance-field-label-gap); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-input-line-height); }
.performance-form-item__description { margin: 0 0 var(--spacing-2); color: var(--performance-field-help-color); font-size: var(--font-size-sm); line-height: var(--performance-field-error-line-height); }
.performance-form-item__control { min-width: 0; }
.performance-form-item__hint { display: block; margin-top: var(--performance-field-error-gap); color: var(--performance-field-help-color); font-size: var(--font-size-sm); line-height: var(--performance-field-error-line-height); }
.performance-form-item__error { display: block; margin-top: var(--performance-field-error-gap); color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.performance-form-item--invalid :deep(.performance-search-select__trigger) { border-color: var(--performance-field-border-invalid); }
</style>
