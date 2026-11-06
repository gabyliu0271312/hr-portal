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

const props = withDefaults(defineProps<{
  modelValue: string | string[] | null
  options: PerformanceSearchSelectOption[]
  ariaLabel?: string
  placeholder?: string
  multiple?: boolean
  disabled?: boolean
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
  hideArrow: false,
  remoteSearch: true,
  optionStyle: 'checkmark',
})
defineEmits<{ 'update:modelValue': [value: string | string[] | null]; open: []; search: [value: string] }>()
</script>
