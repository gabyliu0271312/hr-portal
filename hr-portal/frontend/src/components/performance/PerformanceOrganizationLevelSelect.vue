<template>
  <PerformanceSearchSelect
    :model-value="modelValue"
    :options="options"
    multiple
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @open="emit('open')"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

withDefaults(defineProps<{
  modelValue: string[]
  options?: PerformanceSearchSelectOption[]
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
}>(), {
  options: () => [
    { value: 'company_org', label: '公司级组织' },
    { value: 'department', label: '一级部门' },
    { value: 'department_2', label: '二级部门' },
    { value: 'department_3', label: '三级部门' },
    { value: 'department_4', label: '四级部门' },
    { value: 'department_5', label: '五级部门' },
  ],
  placeholder: '请选择',
  ariaLabel: '部门等级',
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | null]; open: [] }>()
</script>
