<script setup lang="ts">
import PerformanceColumnVisibilityDrawer, { type PerformanceColumnOption } from './PerformanceColumnVisibilityDrawer.vue'

export type MemberColumnOption = PerformanceColumnOption

const props = defineProps<{
  modelValue: boolean
  columns: MemberColumnOption[]
  selectedKeys: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [keys: string[]]
}>()
</script>

<template>
  <PerformanceColumnVisibilityDrawer
    :model-value="props.modelValue"
    :columns="props.columns"
    :selected-keys="props.selectedKeys"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="emit('confirm', $event)"
  />
</template>
