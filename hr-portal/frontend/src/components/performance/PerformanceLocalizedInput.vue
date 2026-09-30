<template>
  <PerformanceFormItem :label="label" :required="required" :invalid="invalid" :error-message="errorMessage" :error-id="`${inputId}-error`">
    <div class="localized-input-field">
      <div class="localized-input-shell" :class="{ 'is-invalid': invalid }">
        <label class="localized-input-control">
          <span class="sr-only">{{ label }}</span>
          <input
            :id="inputId"
            :value="modelValue"
            :placeholder="placeholder"
            :disabled="disabled"
            :maxlength="maxlength"
            :aria-required="required || undefined"
            :aria-invalid="invalid || undefined"
            :aria-describedby="invalid ? `${inputId}-error` : undefined"
            @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
          />
          <span class="localized-input-language">中文</span>
        </label>
      </div>
      <PerformanceTextButton class="localized-input-add" :label="addLanguageLabel" aria-label="添加英文" :disabled="disabled" @click="emit('add-language')">
        <template #icon><AddOutlinedIcon /></template>
      </PerformanceTextButton>
    </div>
  </PerformanceFormItem>
</template>

<script setup lang="ts">
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'

withDefaults(defineProps<{
  modelValue: string
  label: string
  inputId: string
  placeholder: string
  required?: boolean
  invalid?: boolean
  errorMessage?: string
  disabled?: boolean
  maxlength?: number
  addLanguageLabel?: string
}>(), { addLanguageLabel: '添加英文' })
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'add-language': []
}>()
</script>

<style scoped>
.localized-input-field { width: 100%; }
.localized-input-shell { width: 100%; height: var(--performance-control-height); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); }
.localized-input-shell:hover { border-color: var(--performance-field-border-hover); }
.localized-input-shell:focus-within { border-color: var(--performance-field-border-focus); box-shadow: var(--performance-field-focus-ring); }
.localized-input-shell.is-invalid { border-color: var(--performance-field-border-invalid); box-shadow: none; }
.localized-input-control { display: flex; align-items: center; width: 100%; min-width: 0; height: var(--performance-input-compact-height); padding: 4px 8px 4px var(--performance-input-padding-x); box-sizing: border-box; }
.localized-input-control input { flex: 1; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); }
.localized-input-control input::placeholder { color: var(--color-text-placeholder); }
.localized-input-language { flex: none; margin-left: var(--spacing-2); padding: 0 6px; border-radius: var(--radius-sm); background: var(--color-surface-disabled); color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 20px; }
.localized-input-add { margin-top: var(--spacing-2); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
</style>
