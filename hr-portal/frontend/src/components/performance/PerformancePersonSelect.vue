<template>
  <PerformanceSearchSelect
    v-bind="$attrs"
    :model-value="modelValue"
    :options="personOptions"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :multiple="multiple"
    :disabled="disabled"
    :loading="loading"
    :loading-text="loadingText"
    :hide-arrow="hideArrow"
    :remote-search="remoteSearch"
    :option-style="optionStyle"
    @open="$emit('open')"
    @search="$emit('search', $event)"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

const props = withDefaults(defineProps<{
  modelValue: string | string[] | null
  options: PerformanceSearchSelectOption[]
  ariaLabel?: string
  placeholder?: string
  multiple?: boolean
  disabled?: boolean
  loading?: boolean
  loadingText?: string
  hideArrow?: boolean
  /** 员工搜索组件固有行为（REA 交互）：有搜索关键词才显示结果（输入→请求→列表）。
   *  默认开启，所有使用方一致；个别场景需点击即展开时传 false。 */
  remoteSearch?: boolean
  optionStyle?: 'checkmark' | 'none'
}>(), {
  options: () => [],
  placeholder: '请选择',
  multiple: false,
  disabled: false,
  loading: false,
  loadingText: undefined,
  hideArrow: false,
  remoteSearch: true,
  optionStyle: 'checkmark',
})
const selectedPeople = shallowRef<PerformanceSearchSelectOption[]>([])
const selectedValues = computed(() => Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : [])
const normalizedOptions = computed(() => props.options.map(person => {
  const suffix = `（${person.value}）`
  const asciiSuffix = `(${person.value})`
  const label = person.display_name || (person.label.endsWith(suffix) ? person.label.slice(0, -suffix.length) : person.label.endsWith(asciiSuffix) ? person.label.slice(0, -asciiSuffix.length).trimEnd() : person.label)
  return { ...person, label: label || '人员信息不可用', searchText: person.searchText || `${person.value} ${person.label} ${person.subLabel || ''}` }
}))
watch([normalizedOptions, selectedValues], () => {
  selectedPeople.value = selectedValues.value.map(value => normalizedOptions.value.find(person => person.value === value) || selectedPeople.value.find(person => person.value === value) || { value, label: '人员信息不可用', searchText: value })
}, { immediate: true })
const personOptions = computed(() => [...normalizedOptions.value, ...selectedPeople.value.filter(person => !normalizedOptions.value.some(option => option.value === person.value))])
defineEmits<{ 'update:modelValue': [value: string | string[] | null]; open: []; search: [value: string] }>()
</script>
