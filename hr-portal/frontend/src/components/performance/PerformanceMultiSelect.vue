<template>
  <PerformanceSearchSelect :model-value="modelValue" :options="options" :placeholder="placeholder" :disabled="disabled" multiple @update:model-value="emit('update:modelValue', Array.isArray($event) ? $event : [])" />
</template>

<script setup lang="ts">
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
withDefaults(defineProps<{ modelValue: string[]; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean }>(), { placeholder: '请选择', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
</script>
