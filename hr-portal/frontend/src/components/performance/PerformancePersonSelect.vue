<template>
  <PerformanceSearchSelect
    v-bind="$attrs"
    :model-value="modelValue"
    :options="options"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :multiple="multiple"
    :disabled="disabled"
    :hide-arrow="hideArrow"
    :remote-search="remoteSearch"
    :option-style="optionStyle"
    @open="$emit('open')"
    @search="$emit('search', $event)"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

defineProps<{
  modelValue: string | string[] | null
  options: PerformanceSearchSelectOption[]
  ariaLabel?: string
  placeholder?: string
  multiple?: boolean
  disabled?: boolean
  hideArrow?: boolean
  /** 有搜索关键词后才显示结果（REA 员工选择器机制：输入→请求→列表） */
  remoteSearch?: boolean
  optionStyle?: 'checkmark' | 'none'
}>()
defineEmits<{ 'update:modelValue': [value: string | string[] | null]; open: []; search: [value: string] }>()
</script>
