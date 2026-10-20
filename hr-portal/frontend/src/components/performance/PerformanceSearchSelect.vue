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
      <div class="performance-flat-option-list" :class="{ 'performance-flat-option-list--checkmark': optionStyle === 'checkmark' }">
        <button v-for="option in filteredOptions(query)" :key="option.value" class="performance-flat-option-list__option" :class="{ 'is-selected': selectedValues.includes(option.value), 'is-disabled': option.disabled }" type="button" role="option" :aria-selected="selectedValues.includes(option.value)" :disabled="option.disabled" @click="select(option.value, close, focus)">
          <span v-if="multiple && optionStyle === 'checkbox'" class="performance-flat-option-list__checkbox" :class="{ 'is-checked': selectedValues.includes(option.value) }">{{ selectedValues.includes(option.value) ? '✓' : '' }}</span>
          <span>{{ option.label }}</span>
          <svg v-if="optionStyle === 'checkmark' && selectedValues.includes(option.value)" class="performance-flat-option-list__checkmark" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
  optionStyle?: 'checkbox' | 'checkmark'
  disabled?: boolean
  selectionStyle?: 'tags' | 'plain'
  disabledSurface?: 'muted' | 'white'
  ariaLabel?: string
}>(), {
  options: () => [],
  placeholder: '请选择',
  emptyText: '暂无可选项',
  multiple: false,
  optionStyle: 'checkbox',
  disabled: false,
  selectionStyle: 'tags',
  disabledSurface: 'muted',
  ariaLabel: '选择器',
})
const emit = defineEmits<{ 'update:modelValue': [value: SelectValue]; search: [value: string]; open: [] }>()
const selectedValues = computed(() => props.multiple ? (Array.isArray(props.modelValue) ? props.modelValue : []) : (typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : []))
const selectedItems = computed(() => props.options.filter(option => selectedValues.value.includes(option.value)))

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
.performance-flat-option-list { min-width: 0; max-height: 224px; overflow: auto; padding: 5px 0; }
.performance-flat-option-list__option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 5px 10px; border: 0; background: transparent; color: #1f2329; font: 400 14px/22px var(--font-sans); text-align: left; cursor: pointer; }
.performance-flat-option-list__option:hover, .performance-flat-option-list__option.is-selected { background: #f5f6f7; }
.performance-flat-option-list__option.is-disabled { color: #bbbfc4; cursor: not-allowed; }
.performance-flat-option-list__checkbox { display: grid; place-items: center; width: 16px; height: 16px; box-sizing: border-box; border: 1px solid #bbbfc4; border-radius: 3px; color: #fff; font-size: 12px; }
.performance-flat-option-list__checkbox.is-checked { border-color: #3370ff; background: #3370ff; }
.performance-flat-option-list--checkmark { max-height: calc(var(--performance-control-height) * 7.5); padding: 0; }
.performance-flat-option-list--checkmark .performance-flat-option-list__option { height: var(--performance-control-height); min-height: var(--performance-control-height); padding: 0 var(--spacing-3); color: var(--color-text-primary); }
.performance-flat-option-list--checkmark .performance-flat-option-list__option.is-selected { background: var(--color-primary-subtle); color: var(--color-primary-hover); }
.performance-flat-option-list--checkmark .performance-flat-option-list__option:hover { background: var(--color-bg-hover); }
.performance-flat-option-list--checkmark .performance-flat-option-list__option.is-disabled { color: var(--performance-field-disabled-text); }
.performance-flat-option-list__checkmark { flex: 0 0 var(--spacing-4); margin-left: auto; }
.performance-flat-option-list__empty { padding: 8px 10px; color: #8f959e; line-height: 22px; }
</style>
