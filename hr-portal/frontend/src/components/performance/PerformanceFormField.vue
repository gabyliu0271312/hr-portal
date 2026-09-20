<template>
  <label :class="['performance-form-field', { 'performance-form-field--inside': inside }]">
    <span class="field-label"><PerformanceRequiredLabel :label="label" :required="required" /></span>
    <PerformanceTextField
      :model-value="modelValue"
      :type="textarea ? 'textarea' : 'input'"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :show-count="showCount"
      :input-id="inputId"
      :invalid="invalid"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <span v-if="invalid" class="field-error">此项为必填</span>
  </label>
</template>

<script setup lang="ts">
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceTextField from './PerformanceTextField.vue'

withDefaults(defineProps<{
  modelValue: string
  label: string
  required?: boolean
  placeholder?: string
  maxlength?: number
  showCount?: boolean
  inputId?: string
  textarea?: boolean
  inside?: boolean
  invalid?: boolean
}>(), {
  required: false,
  placeholder: '',
  maxlength: undefined,
  showCount: false,
  inputId: undefined,
  textarea: false,
  inside: false,
  invalid: false,
})

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<style scoped>
.performance-form-field{display:block;margin-bottom:var(--performance-input-field-gap)}.performance-form-field--inside{margin:var(--performance-input-field-gap) var(--spacing-5)}.field-label{display:block;margin-bottom:var(--performance-input-label-gap);font-weight:600}.field-error{display:block;margin-top:var(--spacing-1);color:var(--color-text-danger-strong);font-size:var(--font-size-sm)}
</style>

