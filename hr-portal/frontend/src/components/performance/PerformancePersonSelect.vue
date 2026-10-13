<template>
  <PerformanceSearchSelect v-bind="$attrs" :model-value="modelValue" :options="options" :aria-label="ariaLabel" :placeholder="placeholder" :multiple="multiple" @update:model-value="$emit('update:modelValue', $event)" />
</template>

<script setup lang="ts">
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

defineProps<{ modelValue: string | string[] | null; options: PerformanceSearchSelectOption[]; ariaLabel?: string; placeholder?: string; multiple?: boolean }>()
defineEmits<{ 'update:modelValue': [value: string | string[] | null] }>()
</script>
