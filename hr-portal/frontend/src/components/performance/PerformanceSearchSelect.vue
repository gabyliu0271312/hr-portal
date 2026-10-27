<template>
  <PerformanceSelectShell
    :model-value="selectedValues"
    :selected-items="selectedItems"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :popup-label="`${ariaLabel}选项`"
    :clear-label="`${ariaLabel}清空已选`"
    :selection-style="selectionStyle"
    :disabled-surface="disabledSurface"
    class="performance-search-select__trigger"
    :disabled="disabled"
    @open="$emit('open')"
    @update:model-value="updateValues"
  >
    <template #default="{ query, close, focus }">
      <div class="performance-flat-option-list performance-flat-option-list--checkmark">
        <button v-for="option in filteredOptions(query)" :key="option.value" class="performance-flat-option-list__option" :class="{ 'is-selected': selectedValues.includes(option.value), 'is-disabled': option.disabled }" type="button" role="option" :aria-selected="selectedValues.includes(option.value)" :disabled="option.disabled" @click="select(option.value, close, focus)">
          <span>{{ option.label }}</span>
          <svg v-if="selectedValues.includes(option.value)" class="performance-flat-option-list__checkmark" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <div v-if="!filteredOptions(query).length" class="performance-flat-option-list__empty">{{ emptyText }}</div>
      </div>
    </template>
  </PerformanceSelectShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceSelectShell, { type PerformanceSelectItem } from './PerformanceSelectShell.vue'

export type PerformanceSearchSelectOption = PerformanceSelectItem & { disabled?: boolean }
type SelectValue = string | string[] | null

const props = withDefaults(defineProps<{
  modelValue: SelectValue
  options?: PerformanceSearchSelectOption[]
  placeholder?: string
  emptyText?: string
  multiple?: boolean
  optionStyle?: 'checkmark'
  disabled?: boolean
  selectionStyle?: 'tags' | 'plain'
  disabledSurface?: 'muted' | 'white'
  ariaLabel?: string
}>(), {
  options: () => [],
  placeholder: '请选择',
  emptyText: '暂无可选项',
  multiple: false,
  optionStyle: 'checkmark',
  disabled: false,
  selectionStyle: 'tags',
  disabledSurface: 'muted',
  ariaLabel: '选择器',
})
const emit = defineEmits<{ 'update:modelValue': [value: SelectValue]; search: [value: string]; open: [] }>()
const selectedValues = computed(() => props.multiple ? (Array.isArray(props.modelValue) ? props.modelValue : []) : (typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : []))
const selectedItems = computed(() => selectedValues.value.map(value => props.options.find(option => option.value === value) || { value, label: value }))

function filteredOptions(query: string) {
  const keyword = query.trim().toLowerCase()
  const result = !keyword ? props.options : props.options.filter(option => option.label.toLowerCase().includes(keyword))
  if (keyword) emit('search', query)
  return result
}
function updateValues(values: string[]) {
  emit('update:modelValue', props.multiple ? values : (values[0] || null))
}
function select(value: string, close: () => void, focus: () => void) {
  if (props.multiple) {
    const values = new Set(selectedValues.value)
    if (values.has(value)) values.delete(value)
    else values.add(value)
    emit('update:modelValue', [...values])
    focus()
  } else {
    emit('update:modelValue', value)
    close()
  }
}
</script>

<style scoped>
.performance-flat-option-list { min-width: 0; max-height: var(--performance-select-popup-max-height); overflow: auto; padding: 0; }
.performance-flat-option-list__option { display: flex; align-items: center; gap: var(--spacing-2); width: 100%; min-height: var(--performance-select-option-height); padding: 0 var(--performance-select-option-padding-x); border: 0; background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); text-align: left; cursor: pointer; }
.performance-flat-option-list__option.is-selected { background: var(--performance-select-option-selected); color: var(--performance-select-check-color); }
.performance-flat-option-list__option:hover { background: var(--performance-select-option-hover); }
.performance-flat-option-list__option.is-disabled { color: var(--performance-field-disabled-text); cursor: not-allowed; }
.performance-flat-option-list__checkmark { flex: 0 0 var(--performance-select-check-size); width: var(--performance-select-check-size); height: var(--performance-select-check-size); margin-left: auto; color: var(--performance-select-check-color); }
.performance-flat-option-list__empty { padding: var(--spacing-2) var(--performance-select-option-padding-x); color: var(--color-text-placeholder); line-height: 22px; }
</style>
